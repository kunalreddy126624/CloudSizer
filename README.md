# CloudSizer

## TOON (Token-Oriented Object Notation)

This project now includes a TOON codec for compact, lossless conversion between JSON-compatible values and TOON text.

### TOON v1 row format

- Header: `TOON1`
- One tab-separated row per node: `path<TAB>kind<TAB>payload`
- `kind` values:
  - `o` object
  - `a` array
  - `s` string (JSON-encoded string payload)
  - `n` number
  - `b` boolean (`1` or `0`)
  - `z` null (empty payload)

Paths are JSON-Pointer-style, with `~` escaped as `~0` and `/` escaped as `~1`.

### API endpoints

- `POST /toon/encode`
  - Request: `{"value": <json-compatible-value>}`
  - Response: `{"toon": "<TOON text>"}`
- `POST /toon/decode`
  - Request: `{"toon": "<TOON text>"}`
  - Response: `{"value": <decoded-json-compatible-value>}`

### Python usage

```python
from app.services.toon import to_toon, from_toon

payload = {"name": "demo", "items": [1, True, None]}
toon_text = to_toon(payload)
round_trip = from_toon(toon_text)
```
