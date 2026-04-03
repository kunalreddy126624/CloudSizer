# Architecture Overview

The platform is split into a control plane and a future execution plane.

## Control plane

- FastAPI API for repositories, artifacts, pipelines, versions, runs, connections, and environments
- PostgreSQL for metadata and versions
- Redis reserved for run coordination and background dispatch
- Next.js frontend for workspace browsing and pipeline design
- Shared pipeline model across TypeScript and Pydantic

## Execution abstraction

- Compiler converts pipeline JSON into an execution plan
- Scheduler abstraction decides runnable tasks
- Dispatcher abstraction submits work
- Mock runner simulates transitions for production-style UX
- Future adapters can compile to Airflow DAGs or Prefect flows

## Frontend experience

- Left workspace explorer
- Center editor tabs
- Visual pipeline designer with React Flow
- Right inspector for node configuration
- Validation panel and run history

## Domain boundaries

- Repositories own artifact trees
- Pipelines are first-class artifacts with versions
- Runs and task runs are immutable execution records
- Connections and environments are reusable runtime references
