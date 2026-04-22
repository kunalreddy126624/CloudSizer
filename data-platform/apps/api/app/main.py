from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import artifact_router, health_router, pipelines_router, repos_router, runs_router, toon_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.seed import seed

Base.metadata.create_all(bind=engine)
seed()

app = FastAPI(title="Data Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(repos_router)
app.include_router(artifact_router)
app.include_router(pipelines_router)
app.include_router(runs_router)
app.include_router(toon_router)
