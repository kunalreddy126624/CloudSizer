import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import api_router
from app.services.toon import from_toon, to_toon


class ToonCodecTest(unittest.TestCase):
    def test_round_trip_preserves_nested_structure(self) -> None:
        payload = {
            "id": 42,
            "name": "toon",
            "enabled": True,
            "cost": 12.75,
            "notes": None,
            "tags": ["ai", "compact"],
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

    def test_round_trip_preserves_escaped_string_content(self) -> None:
        payload = {"text": "line1\nline2\tquoted:\"yes\""}
        self.assertEqual(from_toon(to_toon(payload)), payload)

    def test_encode_rejects_non_finite_numbers(self) -> None:
        with self.assertRaises(ValueError):
            to_toon({"bad": float("nan")})

    def test_decode_rejects_missing_parent(self) -> None:
        broken = "TOON1\n\to\t\n/a/b\ts\t\"x\""
        with self.assertRaises(ValueError):
            from_toon(broken)

    def test_decode_rejects_sparse_array_indexes(self) -> None:
        broken = "TOON1\n\ta\t\n/1\ts\t\"x\""
        with self.assertRaises(ValueError):
            from_toon(broken)


class ToonApiTest(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(api_router)
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
