# Data Platform Monorepo

Production-style monorepo for a workspace-driven data platform with repository browsing, artifact management, a visual pipeline designer, validation, versioning, and mock execution.

## What is included

- `apps/web`: Next.js app with workspace explorer, editor tabs, pipeline designer, runs view, connections/settings scaffolds.
- `apps/api`: FastAPI control plane with SQLAlchemy models, repositories, services, validation, publish/run flow, and seed script.
- `packages/types`: shared TypeScript models and JSON schema artifacts.
- `packages/designer-core`: graph helpers, serializer, validation engine, and tests.
- `packages/sdk`: typed frontend API client.
- `packages/ui`: reusable UI primitives and workspace/designer components.
- `packages/config`: shared TypeScript, ESLint, and Prettier config.
- `infra`: Docker, docker-compose, MinIO, PostgreSQL, Redis, Kubernetes/Terraform placeholders.
- `docs`: architecture and API overview.

## Local setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.12
- Docker Desktop

### Install

```bash
pnpm install
python -m venv .venv
.venv\\Scripts\\activate
pip install -e apps/api[dev]
```

### Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### Seed the backend

```bash
python apps/api/app/seed.py
```

### Run the apps

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`

## Monorepo commands

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Environment variables

Backend:

- `DP_DATABASE_URL`
- `DP_REDIS_URL`
- `DP_STORAGE_ENDPOINT`
- `DP_STORAGE_BUCKET`
- `DP_CORS_ORIGINS`

Frontend:

- `NEXT_PUBLIC_API_BASE_URL`

## Example curl

```bash
curl http://localhost:8000/health
curl http://localhost:8000/repos
curl http://localhost:8000/pipelines
curl -X POST http://localhost:8000/pipelines \
  -H "Content-Type: application/json" \
  -d "{\"artifact_id\":\"art_daily_sales\",\"name\":\"Daily Sales Pipeline\",\"description\":\"Extract and load daily sales\",\"publish_state\":\"draft\",\"current_version\":1,\"spec\":$(cat packages/types/schemas/example-pipeline.json)}"
curl -X POST http://localhost:8000/pipelines/pl_daily_sales/validate
curl -X POST http://localhost:8000/pipelines/pl_daily_sales/publish
curl -X POST http://localhost:8000/pipelines/pl_daily_sales/run
```

## Roadmap

- Replace the mock runner with Airflow or Prefect adapters.
- Persist execution logs to object storage and stream through WebSocket/SSE.
- Add auth, multi-tenancy, RBAC, audit trails, and secrets management.
- Add notebook execution and SQL lineage extraction.
