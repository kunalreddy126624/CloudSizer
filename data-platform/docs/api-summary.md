# API Summary

Base URL: `/`

## Health

- `GET /health`

## Repositories

- `GET /repos`
- `POST /repos`
- `GET /repos/{repo_id}/tree`
- `POST /repos/{repo_id}/artifacts`
- `GET /artifacts/{artifact_id}`
- `PUT /artifacts/{artifact_id}`
- `GET /artifacts/{artifact_id}/versions`
- `POST /artifacts/{artifact_id}/publish`

## Pipelines

- `GET /pipelines`
- `POST /pipelines`
- `GET /pipelines/{id}`
- `PUT /pipelines/{id}`
- `POST /pipelines/{id}/validate`
- `POST /pipelines/{id}/publish`
- `POST /pipelines/{id}/run`
- `GET /pipelines/{id}/runs`

## Runs

- `GET /runs/{run_id}`
- `GET /runs/{run_id}/tasks`
- `GET /runs/{run_id}/logs`
- `POST /runs/{run_id}/cancel`
- `POST /tasks/{task_run_id}/retry`
