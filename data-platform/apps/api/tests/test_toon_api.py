from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

_APP_ROOT = Path(__file__).resolve().parents[1] / "app"
_TOON_SERVICE_PATH = _APP_ROOT / "services" / "toon.py"
_TOON_ROUTER_PATH = _APP_ROOT / "api" / "routers" / "toon.py"
_TOON_SCHEMA_PATH = _APP_ROOT / "schemas" / "toon.py"
_COMMON_SCHEMA_PATH = _APP_ROOT / "schemas" / "common.py"

app_package = types.ModuleType("app")
app_package.__path__ = [str(_APP_ROOT)]
sys.modules["app"] = app_package

schemas_package = types.ModuleType("app.schemas")
schemas_package.__path__ = [str(_APP_ROOT / "schemas")]
sys.modules["app.schemas"] = schemas_package

services_package = types.ModuleType("app.services")
services_package.__path__ = [str(_APP_ROOT / "services")]
sys.modules["app.services"] = services_package

_COMMON_SCHEMA_SPEC = importlib.util.spec_from_file_location("app.schemas.common", _COMMON_SCHEMA_PATH)
if _COMMON_SCHEMA_SPEC is None or _COMMON_SCHEMA_SPEC.loader is None:
    raise RuntimeError("Unable to load common schema module for TOON tests.")
_COMMON_SCHEMA_MODULE = importlib.util.module_from_spec(_COMMON_SCHEMA_SPEC)
sys.modules[_COMMON_SCHEMA_SPEC.name] = _COMMON_SCHEMA_MODULE
_COMMON_SCHEMA_SPEC.loader.exec_module(_COMMON_SCHEMA_MODULE)

_TOON_SCHEMA_SPEC = importlib.util.spec_from_file_location("app.schemas.toon", _TOON_SCHEMA_PATH)
if _TOON_SCHEMA_SPEC is None or _TOON_SCHEMA_SPEC.loader is None:
    raise RuntimeError("Unable to load TOON schema module for tests.")
_TOON_SCHEMA_MODULE = importlib.util.module_from_spec(_TOON_SCHEMA_SPEC)
sys.modules[_TOON_SCHEMA_SPEC.name] = _TOON_SCHEMA_MODULE
_TOON_SCHEMA_SPEC.loader.exec_module(_TOON_SCHEMA_MODULE)

_TOON_SERVICE_SPEC = importlib.util.spec_from_file_location("app.services.toon", _TOON_SERVICE_PATH)
if _TOON_SERVICE_SPEC is None or _TOON_SERVICE_SPEC.loader is None:
    raise RuntimeError("Unable to load TOON service module for tests.")
_TOON_SERVICE_MODULE = importlib.util.module_from_spec(_TOON_SERVICE_SPEC)
sys.modules[_TOON_SERVICE_SPEC.name] = _TOON_SERVICE_MODULE
_TOON_SERVICE_SPEC.loader.exec_module(_TOON_SERVICE_MODULE)
from_toon = _TOON_SERVICE_MODULE.from_toon
to_toon = _TOON_SERVICE_MODULE.to_toon

_TOON_ROUTER_SPEC = importlib.util.spec_from_file_location("app.api.routers.toon", _TOON_ROUTER_PATH)
if _TOON_ROUTER_SPEC is None or _TOON_ROUTER_SPEC.loader is None:
    raise RuntimeError("Unable to load TOON router module for tests.")
_TOON_ROUTER_MODULE = importlib.util.module_from_spec(_TOON_ROUTER_SPEC)
sys.modules[_TOON_ROUTER_SPEC.name] = _TOON_ROUTER_MODULE
_TOON_ROUTER_SPEC.loader.exec_module(_TOON_ROUTER_MODULE)
toon_router = _TOON_ROUTER_MODULE.router


class ToonCodecTest(unittest.TestCase):
    def test_round_trip_preserves_nested_structure(self) -> None:
        payload = {
            "id": 42,
            "name": "toon",
            "enabled": True,
            "cost": 12.75,
            "notes": None,
            "tags": ["api", "compact"],
            "nested": {
                "empty_obj": {},
                "empty_list": [],
                "slash/key": "ok",
                "tilde~key": "ok",
            },
        }

        encoded = to_toon(payload)
        decoded = from_toon(encoded)

        self.assertTrue(encoded.startswith("TOON1\n"))
        self.assertEqual(decoded, payload)

    def test_decode_rejects_sparse_array_indexes(self) -> None:
        with self.assertRaises(ValueError):
            from_toon("TOON1\n\ta\t\n/1\ts\t\"x\"")


class ToonApiTest(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(toon_router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_encode_and_decode_endpoints(self) -> None:
        payload = {"a": 1, "b": [True, None, "x"]}

        encode_response = self.client.post("/toon/encode", json={"value": payload})
        self.assertEqual(encode_response.status_code, 200)
        toon_payload = encode_response.json()["toon"]
        self.assertTrue(toon_payload.startswith("TOON1"))

        decode_response = self.client.post("/toon/decode", json={"toon": toon_payload})
        self.assertEqual(decode_response.status_code, 200)
        self.assertEqual(decode_response.json()["value"], payload)

    def test_decode_returns_400_for_invalid_toon(self) -> None:
        response = self.client.post("/toon/decode", json={"toon": "TOON1\n/not-valid"})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
