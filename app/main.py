from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.allocator.api import router as allocator_router
from app.allocator.control_plane import get_allocator_control_plane
from app.api.routes import router
from app.db import init_db
from app.noodle.api import router as noodle_router
from app.rbac.api import router as rbac_router
from app.rbac.middleware import AuditLoggingMiddleware, RbacContextMiddleware
from app.rbac.service import get_rbac_service
from app.services.auth import ensure_default_user
from app.settings import get_app_settings


app = FastAPI(
    title="CloudSizer",
    description=(
        "API for collecting workload requirements, recommending multi-cloud "
        "setups, and estimating monthly resource costs."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuditLoggingMiddleware)
app.add_middleware(RbacContextMiddleware)

init_db()
if get_app_settings().bootstrap_legacy_demo_user:
    ensure_default_user()
get_allocator_control_plane()
get_rbac_service().init_database()

app.include_router(router)
app.include_router(allocator_router)
app.include_router(noodle_router)
app.include_router(rbac_router)
