from __future__ import annotations

import csv
import importlib
import io
import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

from app.noodle.schemas import NoodleDesignerConnectionRef, NoodleDesignerNode

FORMAT_PARAM_KEYS = ("format", "dump_format", "output_format")
QUERY_PARAM_KEYS = ("query", "sql")
TABLE_PARAM_KEYS = ("table", "source_table")
LIMIT_PARAM_KEYS = ("limit", "row_limit")
RDBMS_KIND_PARAM_KEYS = ("db_kind", "database_kind", "dialect", "engine", "source_type")
S3_BUCKET_PARAM_KEYS = ("bucket", "s3_bucket")
S3_KEY_PARAM_KEYS = ("key", "object_key", "path", "object_path")
AZURE_CONTAINER_PARAM_KEYS = ("container", "azure_container")
AZURE_BLOB_PARAM_KEYS = ("blob", "blob_name", "path", "blob_path")
GCS_BUCKET_PARAM_KEYS = ("bucket", "gcs_bucket")
GCS_BLOB_PARAM_KEYS = ("blob", "blob_name", "path", "object_path")


@dataclass(frozen=True)
class NoodleConnectorAdapterContext:
    connection: NoodleDesignerConnectionRef
    source_node: NoodleDesignerNode


@dataclass(frozen=True)
class NoodleConnectorReadResult:
    adapter_name: str
    source_format: str
    records: list[dict[str, object]]
    location: str


class NoodleConnectorAdapter:
    plugin_names: frozenset[str] = frozenset()

    def supports(self, context: NoodleConnectorAdapterContext) -> bool:
        plugin_name = context.connection.plugin.strip().lower()
        return plugin_name in self.plugin_names

    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
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

    def _coerce_record(self, value: object) -> dict[str, object]:
        if isinstance(value, dict):
            return dict(value)
        return {"value": value}

    def _source_format(
        self,
        context: NoodleConnectorAdapterContext,
        source_path: Path | None = None,
        location: str | None = None,
    ) -> str:
        params = self._param_map(context.source_node)
        configured = next((params[key].lower() for key in FORMAT_PARAM_KEYS if key in params), None)
        if configured in {"jsonl", "json", "csv", "text"}:
            return configured
        inferred_path = source_path or Path(location or "")
        suffix = inferred_path.suffix.lower().lstrip(".")
        if suffix in {"jsonl", "json", "csv", "txt", "text"}:
            return "text" if suffix in {"txt", "text"} else suffix
        return "jsonl"

    def _resolve_auth_ref_path(self, auth_ref: str) -> Path | None:
        value = auth_ref.strip()
        if not value:
            return None
        if value.startswith("file://"):
            parsed = urlparse(value)
            path = unquote(parsed.path or "")
            if path.startswith("/") and len(path) > 2 and path[2] == ":":
                path = path[1:]
            return Path(path)
        return Path(value)

    def _load_json_config(self, auth_ref: str) -> dict[str, object] | None:
        value = auth_ref.strip()
        if not value:
            return None
        if value.startswith("{"):
            parsed = json.loads(value)
            if not isinstance(parsed, dict):
                raise ValueError("Connector auth_ref JSON must be an object.")
            return dict(parsed)
        path = self._resolve_auth_ref_path(value)
        if path is not None and path.exists():
            parsed = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(parsed, dict):
                raise ValueError("Connector auth_ref file must contain a JSON object.")
            return dict(parsed)
        return None

    def _records_from_text(self, raw_text: str, source_format: str) -> list[dict[str, object]]:
        if source_format == "json":
            raw = json.loads(raw_text or "null")
            if isinstance(raw, list):
                return [self._coerce_record(item) for item in raw]
            if raw is None:
                return []
            return [self._coerce_record(raw)]
        if source_format == "csv":
            reader = csv.DictReader(io.StringIO(raw_text))
            return [dict(row) for row in reader]
        if source_format == "text":
            return [
                {"line_number": index + 1, "value": line}
                for index, line in enumerate(raw_text.splitlines())
                if line.strip()
            ]

        records: list[dict[str, object]] = []
        for line in raw_text.splitlines():
            if not line.strip():
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                parsed = {"value": line}
            records.append(self._coerce_record(parsed))
        return records

    def _required_param(self, params: dict[str, str], keys: tuple[str, ...], message: str) -> str:
        value = next((params[key] for key in keys if key in params and params[key]), None)
        if value:
            return value
        raise ValueError(message)

    def _merged_connection_config(self, connection: NoodleDesignerConnectionRef) -> dict[str, object]:
        config = self._load_json_config(connection.auth_ref) or {}
        config.update(self._connection_param_map(connection))
        return config

    def _config_value(self, config: dict[str, object], *keys: str) -> object | None:
        for key in keys:
            if key in config and config[key] not in {"", None}:
                return config[key]
        return None

    def _config_text(self, config: dict[str, object], *keys: str) -> str | None:
        value = self._config_value(config, *keys)
        if value is None:
            return None
        return str(value)

    def _config_int(self, config: dict[str, object], *keys: str) -> int | None:
        value = self._config_value(config, *keys)
        if value in {"", None}:
            return None
        return int(value)

    def _config_bool(self, config: dict[str, object], *keys: str, default: bool = False) -> bool:
        value = self._config_value(config, *keys)
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}


class LocalPathConnectorAdapter(NoodleConnectorAdapter):
    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
        source_path = self._resolve_auth_ref_path(context.connection.auth_ref)
        if source_path is None or not source_path.exists():
            raise FileNotFoundError(f"Connector auth_ref path was not found: {context.connection.auth_ref}")

        source_format = self._source_format(context, source_path=source_path)
        records = self._records_from_text(source_path.read_text(encoding="utf-8"), source_format)
        return NoodleConnectorReadResult(
            adapter_name=self.__class__.__name__,
            source_format=source_format,
            records=records,
            location=source_path.as_posix(),
        )


class BaseRelationalConnectorAdapter(NoodleConnectorAdapter):
    driver_module_name = ""
    display_name = "Database"

    def supports(self, context: NoodleConnectorAdapterContext) -> bool:
        if not super().supports(context):
            return False
        params = self._param_map(context.source_node)
        config = self._merged_connection_config(context.connection)
        return bool(
            any(key in params for key in QUERY_PARAM_KEYS + TABLE_PARAM_KEYS)
            or config
            or context.connection.auth_ref.strip()
        )

    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
        module = importlib.import_module(self.driver_module_name)
        connection = self._connect(module, context.connection)
        cursor = connection.cursor()
        try:
            query = self._query_text(context.source_node)
            cursor.execute(query)
            rows = cursor.fetchall()
            columns = [column[0] for column in (cursor.description or [])]
        finally:
            cursor.close()
            connection.close()

        records = [self._coerce_row(row, columns) for row in rows]
        return NoodleConnectorReadResult(
            adapter_name=self.__class__.__name__,
            source_format="json",
            records=records,
            location=query,
        )

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        raise NotImplementedError

    def _query_text(self, source_node: NoodleDesignerNode) -> str:
        params = self._param_map(source_node)
        query = next((params[key] for key in QUERY_PARAM_KEYS if key in params and params[key]), None)
        if query:
            return query
        table = next((params[key] for key in TABLE_PARAM_KEYS if key in params and params[key]), None)
        if not table:
            raise ValueError(f"{self.display_name} source requires a query/sql or table/source_table param.")
        limit = next((params[key] for key in LIMIT_PARAM_KEYS if key in params and params[key]), None)
        return self._select_query_for_table(table, limit)

    def _select_query_for_table(self, table: str, limit: str | None) -> str:
        query_text = f"SELECT * FROM {self._quote_qualified_identifier(table)}"
        if limit:
            query_text += f" LIMIT {int(limit)}"
        return query_text

    def _quote_qualified_identifier(self, value: str) -> str:
        parts = [part.strip() for part in value.split(".") if part.strip()]
        if not parts:
            raise ValueError(f"{self.display_name} table param must not be empty.")
        return ".".join(self._quote_identifier(part) for part in parts)

    def _quote_identifier(self, value: str) -> str:
        return '"' + value.replace('"', '""') + '"'

    def _coerce_row(self, row: object, columns: list[str]) -> dict[str, object]:
        if isinstance(row, dict):
            return dict(row)
        if hasattr(row, "keys"):
            return {key: row[key] for key in row.keys()}
        if isinstance(row, tuple) and columns:
            return dict(zip(columns, row, strict=False))
        return self._coerce_record(row)


class PostgresConnectorAdapter(BaseRelationalConnectorAdapter):
    plugin_names = frozenset({"postgres-plugin", "postgresql-plugin"})
    driver_module_name = "psycopg"
    display_name = "PostgreSQL"

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        config = self._merged_connection_config(connection)
        dsn = self._config_text(config, "dsn", "connection_string", "url", "uri")
        if dsn:
            return module.connect(dsn)
        raw = connection.auth_ref.strip()
        if raw and not raw.startswith("{"):
            return module.connect(raw)

        kwargs: dict[str, object] = {}
        for source_key, target_key in (
            ("host", "host"),
            ("port", "port"),
            ("password", "password"),
            ("sslmode", "sslmode"),
            ("options", "options"),
        ):
            value = self._config_value(config, source_key)
            if value is not None:
                kwargs[target_key] = value
        user = self._config_value(config, "user", "username")
        if user is not None:
            kwargs["user"] = user
        database = self._config_value(config, "dbname", "database")
        if database is not None:
            kwargs["dbname"] = database
        if not kwargs:
            raise ValueError("PostgreSQL connection requires a DSN or structured connection params.")
        return module.connect(**kwargs)


class MySqlConnectorAdapter(BaseRelationalConnectorAdapter):
    plugin_names = frozenset({"mysql-plugin", "mariadb-plugin"})
    driver_module_name = "pymysql"
    display_name = "MySQL"

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        config = self._merged_connection_config(connection)
        auth_ref = connection.auth_ref.strip()
        if auth_ref and "://" in auth_ref and not auth_ref.startswith("{"):
            parsed = urlparse(auth_ref)
            if parsed.scheme in {"mysql", "mariadb"}:
                config.setdefault("host", parsed.hostname or "")
                if parsed.port is not None:
                    config.setdefault("port", parsed.port)
                if parsed.username:
                    config.setdefault("username", parsed.username)
                if parsed.password:
                    config.setdefault("password", parsed.password)
                if parsed.path and parsed.path != "/":
                    config.setdefault("database", parsed.path.lstrip("/"))
        kwargs: dict[str, object] = {}
        for source_key, target_key in (
            ("host", "host"),
            ("password", "password"),
            ("charset", "charset"),
        ):
            value = self._config_value(config, source_key)
            if value is not None:
                kwargs[target_key] = value
        port = self._config_int(config, "port")
        if port is not None:
            kwargs["port"] = port
        user = self._config_value(config, "user", "username")
        if user is not None:
            kwargs["user"] = user
        database = self._config_value(config, "database", "dbname")
        if database is not None:
            kwargs["database"] = database
        if not kwargs:
            raise ValueError("MySQL connection requires structured connection params or a mysql:// URI.")
        return module.connect(**kwargs)

    def _quote_identifier(self, value: str) -> str:
        return "`" + value.replace("`", "``") + "`"


class SqlServerConnectorAdapter(BaseRelationalConnectorAdapter):
    plugin_names = frozenset({"sqlserver-plugin", "sql-server-plugin", "mssql-plugin"})
    driver_module_name = "pyodbc"
    display_name = "SQL Server"

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        connection_string = self._odbc_connection_string(connection, default_encrypt=False)
        return module.connect(connection_string)

    def _odbc_connection_string(
        self,
        connection: NoodleDesignerConnectionRef,
        *,
        default_encrypt: bool,
    ) -> str:
        config = self._merged_connection_config(connection)
        explicit = self._config_text(config, "connection_string", "odbc_connection_string", "dsn")
        raw = connection.auth_ref.strip()
        if explicit:
            return explicit
        if raw and not raw.startswith("{"):
            return raw

        host = self._config_text(config, "host", "server")
        if not host:
            raise ValueError("SQL Server connection requires host/server information.")
        instance_name = self._config_text(config, "instance_name")
        port = self._config_int(config, "port")
        server = host
        if instance_name:
            server = f"{server}\\{instance_name}"
        elif port is not None:
            server = f"{server},{port}"

        driver = self._config_text(config, "driver") or "ODBC Driver 18 for SQL Server"
        parts = [f"DRIVER={{{driver}}}", f"SERVER={server}"]
        database = self._config_text(config, "database", "dbname")
        if database:
            parts.append(f"DATABASE={database}")
        user = self._config_text(config, "user", "username")
        password = self._config_text(config, "password")
        if user:
            parts.append(f"UID={user}")
        if password:
            parts.append(f"PWD={password}")
        authentication = self._config_text(config, "authentication")
        if authentication:
            parts.append(f"Authentication={authentication}")
        encrypt = self._config_bool(config, "encrypt", default=default_encrypt)
        parts.append(f"Encrypt={'yes' if encrypt else 'no'}")
        trust_server_certificate = self._config_bool(config, "trust_server_certificate", "trustservercertificate")
        parts.append(f"TrustServerCertificate={'yes' if trust_server_certificate else 'no'}")
        return ";".join(parts)

    def _quote_identifier(self, value: str) -> str:
        return "[" + value.replace("]", "]]") + "]"

    def _select_query_for_table(self, table: str, limit: str | None) -> str:
        if limit:
            return f"SELECT TOP {int(limit)} * FROM {self._quote_qualified_identifier(table)}"
        return f"SELECT * FROM {self._quote_qualified_identifier(table)}"


class AzureSqlConnectorAdapter(SqlServerConnectorAdapter):
    plugin_names = frozenset({"azure-sql-plugin", "azure_sql-plugin", "azuresql-plugin"})
    display_name = "Azure SQL"

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        connection_string = self._odbc_connection_string(connection, default_encrypt=True)
        return module.connect(connection_string)


class OracleConnectorAdapter(BaseRelationalConnectorAdapter):
    plugin_names = frozenset({"oracle-plugin", "oracle-db-plugin"})
    driver_module_name = "oracledb"
    display_name = "Oracle"

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        config = self._merged_connection_config(connection)
        raw = connection.auth_ref.strip()
        if raw and not raw.startswith("{"):
            return module.connect(raw)

        kwargs: dict[str, object] = {}
        user = self._config_value(config, "user", "username")
        if user is not None:
            kwargs["user"] = user
        password = self._config_value(config, "password")
        if password is not None:
            kwargs["password"] = password
        dsn = self._config_text(config, "dsn")
        if not dsn:
            host = self._config_text(config, "host")
            if not host:
                raise ValueError("Oracle connection requires host or dsn.")
            port = self._config_int(config, "port") or 1521
            service_name = self._config_text(config, "service_name")
            sid = self._config_text(config, "sid")
            if service_name:
                dsn = f"{host}:{port}/{service_name}"
            elif sid:
                dsn = f"{host}:{port}/{sid}"
            else:
                raise ValueError("Oracle connection requires service_name or sid when dsn is not provided.")
        kwargs["dsn"] = dsn
        return module.connect(**kwargs)

    def _select_query_for_table(self, table: str, limit: str | None) -> str:
        query_text = f"SELECT * FROM {self._quote_qualified_identifier(table)}"
        if limit:
            query_text += f" FETCH FIRST {int(limit)} ROWS ONLY"
        return query_text


class SnowflakeSourceConnectorAdapter(BaseRelationalConnectorAdapter):
    plugin_names = frozenset({"snowflake-plugin", "snowflake-source-plugin"})
    driver_module_name = "snowflake.connector"
    display_name = "Snowflake"

    def _connect(self, module, connection: NoodleDesignerConnectionRef):
        config = self._merged_connection_config(connection)
        raw = connection.auth_ref.strip()
        if raw.startswith("{"):
            config.update(self._load_json_config(raw) or {})
        if not config:
            raise ValueError("Snowflake connection requires structured connection params or JSON credentials.")
        kwargs: dict[str, object] = {}
        for key in ("account", "user", "password", "warehouse", "database", "schema", "role", "host"):
            value = self._config_value(config, key)
            if value is not None:
                kwargs[key] = value
        port = self._config_int(config, "port")
        if port is not None:
            kwargs["port"] = port
        authenticator = self._config_value(config, "authenticator")
        if authenticator is not None:
            kwargs["authenticator"] = authenticator
        private_key_path = self._config_text(config, "private_key_path")
        if private_key_path:
            kwargs["private_key_file"] = private_key_path
        if not kwargs:
            raise ValueError("Snowflake connection requires account and authentication details.")
        return module.connect(**kwargs)


class GenericDatabaseConnectorAdapter(NoodleConnectorAdapter):
    plugin_names = frozenset({"database-plugin", "rdbms-plugin", "cdc-connector"})

    def __init__(self) -> None:
        self._delegates = {
            "postgres": PostgresConnectorAdapter(),
            "postgresql": PostgresConnectorAdapter(),
            "mysql": MySqlConnectorAdapter(),
            "mariadb": MySqlConnectorAdapter(),
            "sqlserver": SqlServerConnectorAdapter(),
            "sql_server": SqlServerConnectorAdapter(),
            "mssql": SqlServerConnectorAdapter(),
            "azure_sql": AzureSqlConnectorAdapter(),
            "azure-sql": AzureSqlConnectorAdapter(),
            "azuresql": AzureSqlConnectorAdapter(),
            "oracle": OracleConnectorAdapter(),
            "snowflake": SnowflakeSourceConnectorAdapter(),
        }

    def supports(self, context: NoodleConnectorAdapterContext) -> bool:
        if not super().supports(context):
            return False
        return self._delegate(context) is not None

    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
        delegate = self._delegate(context)
        if delegate is None:
            raise ValueError("Database connection requires a recognized db_kind or source-specific plugin.")
        return delegate.read(context)

    def _delegate(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorAdapter | None:
        config = self._merged_connection_config(context.connection)
        kind = self._config_text(config, *RDBMS_KIND_PARAM_KEYS)
        if kind:
            return self._delegates.get(kind.strip().lower())
        auth_ref = context.connection.auth_ref.strip().lower()
        if auth_ref.startswith(("postgres://", "postgresql://")):
            return self._delegates["postgresql"]
        if auth_ref.startswith(("mysql://", "mariadb://")):
            return self._delegates["mysql"]
        if auth_ref.startswith("oracle://"):
            return self._delegates["oracle"]
        if "snowflakecomputing.com" in auth_ref:
            return self._delegates["snowflake"]
        return None

    def _merged_connection_config(self, connection: NoodleDesignerConnectionRef) -> dict[str, object]:
        config: dict[str, object] = {}
        for param in connection.params:
            key = param.key.strip().lower()
            value = param.value.strip() if param.value is not None else ""
            if key and value:
                config[key] = value
        json_config = self._load_json_config(connection.auth_ref)
        if json_config is not None:
            config.update(json_config)
        return config

    def _config_text(self, config: dict[str, object], *keys: str) -> str | None:
        for key in keys:
            if key in config and config[key] not in {"", None}:
                return str(config[key])
        return None


class GenericFileConnectorAdapter(LocalPathConnectorAdapter):
    plugin_names = frozenset(
        {
            "file-plugin",
            "api-plugin",
            "stream-plugin",
            "iot-plugin",
            "saas-plugin",
            "custom-plugin",
            "fastapi-pull-connector",
            "stream-subscriber",
            "batch-file-loader",
            "edge-telemetry-gateway",
            "saas-sync-connector",
        }
    )


class GitHubConnectorAdapter(LocalPathConnectorAdapter):
    plugin_names = frozenset({"github-plugin", "github-sync-connector"})

    def _source_format(
        self,
        context: NoodleConnectorAdapterContext,
        source_path: Path | None = None,
        location: str | None = None,
    ) -> str:
        source_format = super()._source_format(context, source_path=source_path, location=location)
        return source_format if source_format in {"jsonl", "json", "csv", "text"} else "jsonl"


class S3ConnectorAdapter(NoodleConnectorAdapter):
    plugin_names = frozenset({"s3-plugin", "aws-s3-plugin"})

    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
        boto3 = importlib.import_module("boto3")
        params = self._param_map(context.source_node)
        bucket = self._required_param(params, S3_BUCKET_PARAM_KEYS, "S3 source requires a bucket param.")
        key = self._required_param(params, S3_KEY_PARAM_KEYS, "S3 source requires a key/path param.")
        client_kwargs = self._merged_connection_config(context.connection)
        client = boto3.client("s3", **client_kwargs)
        response = client.get_object(Bucket=bucket, Key=key)
        body = response["Body"].read()
        raw_text = body.decode("utf-8") if isinstance(body, bytes) else str(body)
        source_format = self._source_format(context, location=key)
        return NoodleConnectorReadResult(
            adapter_name=self.__class__.__name__,
            source_format=source_format,
            records=self._records_from_text(raw_text, source_format),
            location=f"s3://{bucket}/{key}",
        )


class AzureBlobConnectorAdapter(NoodleConnectorAdapter):
    plugin_names = frozenset({"azure-blob-plugin", "azureblob-plugin"})

    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
        blob_module = importlib.import_module("azure.storage.blob")
        params = self._param_map(context.source_node)
        container = self._required_param(
            params,
            AZURE_CONTAINER_PARAM_KEYS,
            "Azure Blob source requires a container param.",
        )
        blob_name = self._required_param(params, AZURE_BLOB_PARAM_KEYS, "Azure Blob source requires a blob param.")
        service = self._blob_service_client(blob_module, context.connection)
        downloader = service.get_blob_client(container=container, blob=blob_name).download_blob()
        body = downloader.readall()
        raw_text = body.decode("utf-8") if isinstance(body, bytes) else str(body)
        source_format = self._source_format(context, location=blob_name)
        return NoodleConnectorReadResult(
            adapter_name=self.__class__.__name__,
            source_format=source_format,
            records=self._records_from_text(raw_text, source_format),
            location=f"azure://{container}/{blob_name}",
        )

    def _blob_service_client(self, blob_module, connection: NoodleDesignerConnectionRef):
        config = self._merged_connection_config(connection)
        connection_string = self._config_text(config, "connection_string")
        if connection_string:
            return blob_module.BlobServiceClient.from_connection_string(connection_string)
        raw = connection.auth_ref.strip()
        if raw and not raw.startswith("{"):
            return blob_module.BlobServiceClient.from_connection_string(raw)
        if config:
            return blob_module.BlobServiceClient(**config)
        raise ValueError("Azure Blob connection requires a connection string or structured client config.")


class GcsConnectorAdapter(NoodleConnectorAdapter):
    plugin_names = frozenset({"gcs-plugin", "google-cloud-storage-plugin"})

    def read(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorReadResult:
        storage_module = importlib.import_module("google.cloud.storage")
        params = self._param_map(context.source_node)
        bucket_name = self._required_param(params, GCS_BUCKET_PARAM_KEYS, "GCS source requires a bucket param.")
        blob_name = self._required_param(params, GCS_BLOB_PARAM_KEYS, "GCS source requires a blob/path param.")
        client = self._storage_client(storage_module, context.connection)
        raw_text = client.bucket(bucket_name).blob(blob_name).download_as_text()
        source_format = self._source_format(context, location=blob_name)
        return NoodleConnectorReadResult(
            adapter_name=self.__class__.__name__,
            source_format=source_format,
            records=self._records_from_text(raw_text, source_format),
            location=f"gs://{bucket_name}/{blob_name}",
        )

    def _storage_client(self, storage_module, connection: NoodleDesignerConnectionRef):
        auth_ref = connection.auth_ref.strip()
        path = self._resolve_auth_ref_path(auth_ref) if auth_ref else None
        if path is not None and path.exists():
            return storage_module.Client.from_service_account_json(path.as_posix())
        config = self._merged_connection_config(connection)
        if config:
            if config.get("type") == "service_account":
                return storage_module.Client.from_service_account_info(config)
            return storage_module.Client(**config)
        return storage_module.Client()


class NoodleConnectorAdapterRegistry:
    def __init__(self, adapters: list[NoodleConnectorAdapter] | None = None) -> None:
        self.adapters = adapters or [
            PostgresConnectorAdapter(),
            MySqlConnectorAdapter(),
            SqlServerConnectorAdapter(),
            AzureSqlConnectorAdapter(),
            OracleConnectorAdapter(),
            SnowflakeSourceConnectorAdapter(),
            GenericDatabaseConnectorAdapter(),
            S3ConnectorAdapter(),
            AzureBlobConnectorAdapter(),
            GcsConnectorAdapter(),
            GitHubConnectorAdapter(),
            GenericFileConnectorAdapter(),
        ]

    def resolve(self, context: NoodleConnectorAdapterContext) -> NoodleConnectorAdapter | None:
        for adapter in self.adapters:
            if adapter.supports(context):
                return adapter
        return None
