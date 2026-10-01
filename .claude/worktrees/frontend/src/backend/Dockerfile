FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_CACHE_DIR=/tmp/uv-cache \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"
ARG APP_UID=1000
ARG APP_GID=1000
WORKDIR /app
RUN groupadd --gid "$APP_GID" app && useradd --uid "$APP_UID" --gid app --home /app app \
    && mkdir -p /data/media && chown -R app:app /data/media /app

FROM base AS dev
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen && rm -rf "$UV_CACHE_DIR" && chown -R app:app /opt/venv
USER app
EXPOSE 8000

FROM base AS prod
ENV UV_NO_SYNC=1 \
    UV_FROZEN=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev && rm -rf "$UV_CACHE_DIR" && chown -R app:app /opt/venv
COPY --chown=app:app app ./app
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app alembic.ini ./
USER app
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-access-log"]
