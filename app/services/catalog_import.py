import json
from pathlib import Path

from app.models import CatalogImportRequest, CatalogImportResponse, CatalogService, CloudProvider
from app.services.catalog import CATALOG_PATH, reload_catalog


def import_catalog_snapshot(
    request: CatalogImportRequest,
) -> CatalogImportResponse:
    snapshot_path = Path(request.snapshot_path).expanduser().resolve()
    raw = json.loads(snapshot_path.read_text(encoding="utf-8"))

    imported_services = 0
    validated: dict[str, list[dict]] = {}
    for provider_value, services in raw.items():
        provider = CloudProvider(provider_value)
        validated[provider.value] = []
        for service in services:
            catalog_service = CatalogService.model_validate(service)
            validated[provider.value].append(catalog_service.model_dump(mode="json"))
            imported_services += 1

    CATALOG_PATH.write_text(json.dumps(validated, indent=2), encoding="utf-8")
    reload_catalog()

    return CatalogImportResponse(
        status="imported",
        imported_services=imported_services,
        snapshot_path=str(snapshot_path),
    )
