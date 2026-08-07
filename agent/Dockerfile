FROM python:3.13-slim@sha256:bf503bb2243c5aad0aa951544dd60d165f992646441d35dea90893703fc26251 AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system tide \
    && adduser --system --ingroup tide --home /app tide

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=tide:tide . .

USER tide

EXPOSE 8000

FROM base AS development

ENV RUFF_CACHE_DIR=/tmp/ruff-cache

USER root

COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt \
    && mkdir -p /tmp/ruff-cache \
    && chown tide:tide /tmp/ruff-cache

USER tide

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS production

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
