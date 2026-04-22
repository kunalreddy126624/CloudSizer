from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any


TOON_MAGIC = "TOON1"
ROOT_PATH: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Node:
    kind: str
    value: Any
    line_number: int


def to_toon(value: Any) -> str:
    _validate_json_compatible(value)
    lines = [TOON_MAGIC]
    _write_rows(value, ROOT_PATH, lines)
    return "\n".join(lines)


def from_toon(text: str) -> Any:
    rows = text.splitlines()
    if not rows or rows[0].strip() != TOON_MAGIC:
        raise ValueError("Invalid TOON payload: missing TOON1 header.")

    nodes: dict[tuple[str, ...], _Node] = {}
    for line_number, row in enumerate(rows[1:], start=2):
        if not row.strip():
            continue

        parts = row.split("\t", 2)
        if len(parts) != 3:
            raise ValueError(f"Invalid TOON row at line {line_number}: expected 3 tab-separated columns.")

        path_text, kind, payload = parts
        path = _parse_path(path_text, line_number)
        if path in nodes:
            raise ValueError(f"Invalid TOON row at line {line_number}: duplicate path '{path_text}'.")

        nodes[path] = _Node(
            kind=kind,
            value=_parse_payload(kind, payload, line_number),
            line_number=line_number,
        )

    if ROOT_PATH not in nodes:
        raise ValueError("Invalid TOON payload: missing root row.")

    children: dict[tuple[str, ...], list[tuple[str, tuple[str, ...], int]]] = {}
    for path, node in nodes.items():
        if path == ROOT_PATH:
            continue
        parent = path[:-1]
        if parent not in nodes:
            raise ValueError(
                f"Invalid TOON payload: path '{_format_path(path)}' references missing parent '{_format_path(parent)}'."
            )
        children.setdefault(parent, []).append((path[-1], path, node.line_number))

    return _build_tree(ROOT_PATH, nodes, children)


def _write_rows(value: Any, path: tuple[str, ...], lines: list[str]) -> None:
    if isinstance(value, dict):
        lines.append(f"{_format_path(path)}\to\t")
        for key, child in value.items():
            if not isinstance(key, str):
                raise TypeError("TOON only supports JSON object keys of type str.")
            _write_rows(child, (*path, key), lines)
        return

    if isinstance(value, list):
        lines.append(f"{_format_path(path)}\ta\t")
        for index, child in enumerate(value):
            _write_rows(child, (*path, str(index)), lines)
        return

    if isinstance(value, str):
        lines.append(f"{_format_path(path)}\ts\t{json.dumps(value, separators=(',', ':'))}")
        return

    if value is None:
        lines.append(f"{_format_path(path)}\tz\t")
        return

    if isinstance(value, bool):
        lines.append(f"{_format_path(path)}\tb\t{1 if value else 0}")
        return

    if isinstance(value, int):
        lines.append(f"{_format_path(path)}\tn\t{value}")
        return

    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("TOON does not support NaN or infinite numbers.")
        lines.append(f"{_format_path(path)}\tn\t{json.dumps(value, separators=(',', ':'))}")
        return

    raise TypeError(f"Unsupported JSON value type for TOON: {type(value).__name__}.")


def _build_tree(
    path: tuple[str, ...],
    nodes: dict[tuple[str, ...], _Node],
    children: dict[tuple[str, ...], list[tuple[str, tuple[str, ...], int]]],
) -> Any:
    node = nodes[path]
    child_rows = sorted(children.get(path, []), key=lambda row: row[2])

    if node.kind in {"s", "n", "b", "z"}:
        if child_rows:
            raise ValueError(f"Invalid TOON payload: scalar node '{_format_path(path)}' cannot have children.")
        return node.value

    if node.kind == "o":
        result: dict[str, Any] = {}
        for segment, child_path, _ in child_rows:
            if segment in result:
                raise ValueError(f"Invalid TOON payload: duplicate object key '{segment}' at '{_format_path(path)}'.")
            result[segment] = _build_tree(child_path, nodes, children)
        return result

    if node.kind == "a":
        indexed_rows: list[tuple[int, tuple[str, ...]]] = []
        seen_indexes: set[int] = set()
        for segment, child_path, _ in child_rows:
            if not segment.isdigit():
                raise ValueError(f"Invalid TOON payload: array child '{segment}' is not a non-negative index.")
            index = int(segment)
            if index in seen_indexes:
                raise ValueError(f"Invalid TOON payload: duplicate array index {index} at '{_format_path(path)}'.")
            seen_indexes.add(index)
            indexed_rows.append((index, child_path))

        indexed_rows.sort(key=lambda item: item[0])
        for expected, (actual, _) in enumerate(indexed_rows):
            if actual != expected:
                raise ValueError(
                    f"Invalid TOON payload: non-contiguous array indexes at '{_format_path(path)}' (missing {expected})."
                )
        return [_build_tree(child_path, nodes, children) for _, child_path in indexed_rows]

    raise ValueError(f"Invalid TOON payload: unknown kind '{node.kind}' at '{_format_path(path)}'.")


def _validate_json_compatible(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise TypeError("TOON only supports JSON object keys of type str.")
            _validate_json_compatible(child)
        return

    if isinstance(value, list):
        for child in value:
            _validate_json_compatible(child)
        return

    if value is None or isinstance(value, (str, bool, int)):
        return

    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("TOON does not support NaN or infinite numbers.")
        return

    raise TypeError(f"Unsupported JSON value type for TOON: {type(value).__name__}.")


def _parse_payload(kind: str, payload: str, line_number: int) -> Any:
    if kind in {"o", "a"}:
        if payload != "":
            raise ValueError(f"Invalid TOON row at line {line_number}: container rows must have an empty payload.")
        return None

    if kind == "z":
        if payload != "":
            raise ValueError(f"Invalid TOON row at line {line_number}: null rows must have an empty payload.")
        return None

    if kind == "b":
        if payload == "1":
            return True
        if payload == "0":
            return False
        raise ValueError(f"Invalid TOON row at line {line_number}: boolean payload must be 1 or 0.")

    if kind == "s":
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid TOON row at line {line_number}: invalid string payload ({exc.msg}).") from exc
        if not isinstance(parsed, str):
            raise ValueError(f"Invalid TOON row at line {line_number}: string payload must decode to str.")
        return parsed

    if kind == "n":
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid TOON row at line {line_number}: invalid number payload ({exc.msg}).") from exc
        if isinstance(parsed, bool) or not isinstance(parsed, (int, float)):
            raise ValueError(f"Invalid TOON row at line {line_number}: number payload must decode to int or float.")
        if isinstance(parsed, float) and not math.isfinite(parsed):
            raise ValueError(f"Invalid TOON row at line {line_number}: NaN or infinite numbers are not supported.")
        return parsed

    raise ValueError(f"Invalid TOON row at line {line_number}: unknown kind '{kind}'.")


def _format_path(path: tuple[str, ...]) -> str:
    if not path:
        return ""
    escaped = [segment.replace("~", "~0").replace("/", "~1") for segment in path]
    return "/" + "/".join(escaped)


def _parse_path(path_text: str, line_number: int) -> tuple[str, ...]:
    if path_text == "":
        return ROOT_PATH
    if not path_text.startswith("/"):
        raise ValueError(f"Invalid TOON row at line {line_number}: path must be empty or start with '/'.")
    return tuple(_decode_path_segment(part, line_number) for part in path_text[1:].split("/"))


def _decode_path_segment(segment: str, line_number: int) -> str:
    if "~" not in segment:
        return segment

    output: list[str] = []
    index = 0
    while index < len(segment):
        char = segment[index]
        if char != "~":
            output.append(char)
            index += 1
            continue

        if index + 1 >= len(segment):
            raise ValueError(f"Invalid TOON row at line {line_number}: invalid '~' escape in path.")
        escape = segment[index + 1]
        if escape == "0":
            output.append("~")
        elif escape == "1":
            output.append("/")
        else:
            raise ValueError(f"Invalid TOON row at line {line_number}: invalid '~' escape in path.")
        index += 2

    return "".join(output)
