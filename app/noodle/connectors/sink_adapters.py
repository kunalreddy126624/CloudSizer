from __future__ import annotations

import csv
import importlib
import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

from app.noodle.schemas import NoodleDesignerConnectionRef, NoodleDesignerNode

PREVIEW_BYTE_LIMIT = 256 * 1024
DEFAULT_DUMP_ROOT = Path("app/data/noodle_dumps")
PATH_PARAM_KEYS = ("dump_path", "output_path", "target_path")
FORMAT_PARAM_KEYS = ("format", "dump_format", "output_format")
TARGET_TABLE_PARAM_KEYS = ("snowflake_table", "target_table", "table")
TARGET_DATABASE_PARAM_KEYS = ("snowflake_database", "target_database", "database")
TARGET_SCHEMA_PARAM_KEYS = ("snowflake_schema", "target_schema", "schema")
TRUNCATE_PARAM_KEYS = ("truncate_before_load", "replace", "overwrite")


@dataclass(frozen=True)
class NoodleSinkAdapterContext:
    connection: NoodleDesignerConnectionRef | None
    dump_node: NoodleDesignerNode
    pipeline_id: str
    run_id: str


@dataclass(frozen=True)
class NoodleSinkWriteResult:
    adapter_name: str
    location: str
    bytes_written: int
    preview_text: str
    approx_records: int
    content_type: str
    output_format: str


class NoodleSinkAdapter:
    plugin_names: frozenset[str] = frozenset()

    def supports(self, context: NoodleSinkAdapterContext) -> bool:
        if context.connection is None:
            return not self.plugin_names
        return context.connection.plugin.strip().lower() in self.plugin_names

    def write(self, context: NoodleSinkAdapterContext, records: list[dict[str, object]]) -> NoodleSinkWriteResult:
        raise NotImplementedError

    def _param_map(self, node: NoodleDesignerNode) -> dict[str, str]:
        return {
            param.key.strip().lower(): param.value.strip()
            for param in node.params
            if param.key.strip() and param.value is not None
        }

    def _connection_param_map(self, connection: NoodleDesignerConnectionRef) -> dict[str, object]:
        values: dict[str, object] = {}
        for param in connection.params:
            key = param.key.strip().lower()
            value = param.value.strip() if param.value is not None else ""
            if not key or not value:
                continue
            values[key] = value
        return values


class LocalFileSinkAdapter(NoodleSinkAdapter):
    plugin_names = frozenset()

    def write(self, context: NoodleSinkAdapterContext, records: list[dict[str, object]]) -> NoodleSinkWriteResult:
        dump_path = self._resolve_dump_path(context)
        output_format = self._output_format(context.dump_node, dump_path)
        bytes_written, preview_text, approx_records, content_type = self._write_records(
            dump_path,
            records,
            output_format,
        )
        return NoodleSinkWriteResult(
            adapter_name=self.__class__.__name__,
            location=dump_path.as_posix(),
            bytes_written=bytes_written,
            preview_text=preview_text,
            approx_records=approx_records,
            content_type=content_type,
            output_format=output_format,
        )

    def _resolve_dump_path(self, context: NoodleSinkAdapterContext) -> Path:
        params = self._param_map(context.dump_node)
        configured = next((params[key] for key in PATH_PARAM_KEYS if key in params), None)
        if configured:
            return Path(configured)
        output_format = self._output_format(context.dump_node, None)
        return DEFAULT_DUMP_ROOT / context.pipeline_id / context.run_id / f"{context.dump_node.id}.{output_format}"

    def _output_format(self, dump_node: NoodleDesignerNode, dump_path: Path | None) -> str:
        params = self._param_map(dump_node)
        configured = next((params[key].lower() for key in FORMAT_PARAM_KEYS if key in params), None)
        if configured in {"jsonl", "json", "csv", "text"}:
            return configured
        if dump_path is not None:
            suffix = dump_path.suffix.lower().lstrip(".")
            if suffix in {"jsonl", "json", "csv", "txt", "text"}:
                return "text" if suffix in {"txt", "text"} else suffix
        return "jsonl"

    def _write_records(
        self,
        dump_path: Path,
        records: list[dict[str, object]],
        output_format: str,
    ) -> tuple[int, str, int, str]:
        dump_path.parent.mkdir(parents=True, exist_ok=True)
        if output_format == "json":
            payload = json.dumps(records, indent=2, ensure_ascii=True)
            dump_path.write_text(payload, encoding="utf-8")
            return dump_path.stat().st_size, payload[:PREVIEW_BYTE_LIMIT], len(records), "application/json"
        if output_format == "csv":
            fieldnames = self._csv_fieldnames(records)
            with dump_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames)
                writer.writeheader()
                for record in records:
                    writer.writerow({field: self._stringify_csv_value(record.get(field)) for field in fieldnames})
            preview_text = dump_path.read_text(encoding="utf-8")[:PREVIEW_BYTE_LIMIT]
            return dump_path.stat().st_size, preview_text, len(records), "text/csv"
        if output_format == "text":
            payload = "\n".join(self._stringify_text_record(record) for record in records)
            dump_path.write_text(payload, encoding="utf-8")
            return dump_path.stat().st_size, payload[:PREVIEW_BYTE_LIMIT], len(records), "text/plain"

        payload_lines = [json.dumps(record, ensure_ascii=True) for record in records]
        payload = "\n".join(payload_lines)
        if payload:
            payload += "\n"
        dump_path.write_text(payload, encoding="utf-8")
        return dump_path.stat().st_size, payload[:PREVIEW_BYTE_LIMIT], len(records), "application/x-ndjson"

    def _csv_fieldnames(self, records: list[dict[str, object]]) -> list[str]:
        fieldnames: list[str] = []
        for record in records:
            for key in record.keys():
                if key not in fieldnames:
                    fieldnames.append(key)
        return fieldnames

    def _stringify_csv_value(self, value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=True)
        return str(value)

    def _stringify_text_record(self, record: dict[str, object]) -> str:
        if set(record.keys()) == {"value"}:
            return str(record["value"])
        return json.dumps(record, ensure_ascii=True)


class SnowflakeSinkAdapter(NoodleSinkAdapter):
    plugin_names = frozenset({"snowflake-plugin", "snowflake-sink-plugin", "snowflake"})

    def write(self, context: NoodleSinkAdapterContext, records: list[dict[str, object]]) -> NoodleSinkWriteResult:
        if context.connection is None:
            raise ValueError("Snowflake sink requires a target connection.")

        connector = importlib.import_module("snowflake.connector")
        connect_kwargs = self._load_auth_config(context.connection.auth_ref)
        connect_kwargs.update(self._connection_param_map(context.connection))
        if not connect_kwargs:
            raise ValueError("Snowflake sink requires structured connection params or JSON credentials.")
        table_ref = self._table_ref(context)
        rows = [self._normalize_record(record) for record in records]
        columns = self._collect_columns(rows)

        connection = connector.connect(**connect_kwargs)
        cursor = connection.cursor()
        try:
            cursor.execute(self._create_table_sql(table_ref, columns, rows))
            if self._truncate_before_load(context.dump_node):
                cursor.execute(f"TRUNCATE TABLE {table_ref}")
            if rows and columns:
                placeholders = ", ".join(["%s"] * len(columns))
                insert_sql = f"INSERT INTO {table_ref} ({', '.join(self._quote_ident(column) for column in columns)}) VALUES ({placeholders})"
                cursor.executemany(insert_sql, [tuple(row.get(column) for column in columns) for row in rows])
            connection.commit()
        finally:
            cursor.close()
            connection.close()

        payload = json.dumps(rows, ensure_ascii=True)
        return NoodleSinkWriteResult(
            adapter_name=self.__class__.__name__,
            location=table_ref,
            bytes_written=len(payload.encode("utf-8")),
            preview_text=payload[:PREVIEW_BYTE_LIMIT],
            approx_records=len(rows),
            content_type="application/json",
            output_format="json",
        )

    def _load_auth_config(self, auth_ref: str) -> dict[str, object]:
        value = auth_ref.strip()
        if value.startswith("{"):
            config = json.loads(value)
            if not isinstance(config, dict):
                raise ValueError("Snowflake auth_ref JSON must be an object.")
            return dict(config)
        if value:
            path = self._resolve_auth_ref_path(value)
            if path.exists():
                config = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(config, dict):
                    raise ValueError("Snowflake auth_ref file must contain a JSON object.")
                return dict(config)
            raise ValueError("Snowflake auth_ref must be inline JSON or a file path to JSON credentials.")
        return {}

    def _resolve_auth_ref_path(self, auth_ref: str) -> Path:
        if auth_ref.startswith("file://"):
            parsed = urlparse(auth_ref)
            path = unquote(parsed.path or "")
            if path.startswith("/") and len(path) > 2 and path[2] == ":":
                path = path[1:]
            return Path(path)
        return Path(auth_ref)

    def _table_ref(self, context: NoodleSinkAdapterContext) -> str:
        params = self._param_map(context.dump_node)
        table = next((params[key] for key in TARGET_TABLE_PARAM_KEYS if key in params), None)
        if not table:
            table = f"{context.pipeline_id}_{context.dump_node.id}_{context.run_id}".replace("-", "_")
        database = next((params[key] for key in TARGET_DATABASE_PARAM_KEYS if key in params), None)
        schema = next((params[key] for key in TARGET_SCHEMA_PARAM_KEYS if key in params), None)
        parts = [part for part in [database, schema, table] if part]
        return ".".join(self._quote_ident(part) for part in parts)

    def _truncate_before_load(self, dump_node: NoodleDesignerNode) -> bool:
        params = self._param_map(dump_node)
        value = next((params[key] for key in TRUNCATE_PARAM_KEYS if key in params), "false")
        return value.strip().lower() in {"1", "true", "yes", "on"}

    def _normalize_record(self, record: dict[str, object]) -> dict[str, object]:
        normalized: dict[str, object] = {}
        for key, value in record.items():
            if isinstance(value, (dict, list)):
                normalized[key] = json.dumps(value, ensure_ascii=True)
            else:
                normalized[key] = value
        return normalized

    def _collect_columns(self, rows: list[dict[str, object]]) -> list[str]:
        columns: list[str] = []
        for row in rows:
            for key in row.keys():
                if key not in columns:
                    columns.append(key)
        return columns

    def _create_table_sql(self, table_ref: str, columns: list[str], rows: list[dict[str, object]]) -> str:
        if not columns:
            return f"CREATE TABLE IF NOT EXISTS {table_ref} (INGESTED_AT TIMESTAMP_NTZ)"
        sample = rows[0] if rows else {}
        column_defs = ", ".join(
            f"{self._quote_ident(column)} {self._snowflake_type(sample.get(column))}"
            for column in columns
        )
        return f"CREATE TABLE IF NOT EXISTS {table_ref} ({column_defs})"

    def _snowflake_type(self, value: object) -> str:
        if isinstance(value, bool):
            return "BOOLEAN"
        if isinstance(value, int):
            return "NUMBER"
        if isinstance(value, float):
            return "FLOAT"
        return "TEXT"

    def _quote_ident(self, value: str) -> str:
        return '"' + value.replace('"', '""') + '"'


class NoodleSinkAdapterRegistry:
    def __init__(self, adapters: list[NoodleSinkAdapter] | None = None) -> None:
        self.adapters = adapters or [
            SnowflakeSinkAdapter(),
            LocalFileSinkAdapter(),
        ]

    def resolve(self, context: NoodleSinkAdapterContext) -> NoodleSinkAdapter | None:
        for adapter in self.adapters:
            if adapter.supports(context):
                return adapter
        return None
