from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.db import init_db
from app.services.auth import ensure_default_user


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

init_db()
ensure_default_user()

app.include_router(router)
