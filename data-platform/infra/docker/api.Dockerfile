FROM python:3.12-slim

WORKDIR /workspace

COPY apps/api /workspace/apps/api
COPY packages /workspace/packages

RUN pip install --upgrade pip && pip install -e /workspace/apps/api

WORKDIR /workspace/apps/api

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
