FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TIKTOKEN_CACHE_DIR=/app/tokenizer-cache \
    SQLITE_PATH=/app/data/manufacturing.db \
    PORT=8000
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && \
    python -c "from azure.ai.projects import AIProjectClient; from azure.identity import ManagedIdentityCredential; import tiktoken; tiktoken.get_encoding('o200k_base')" && \
    useradd --uid 10001 --create-home appuser && \
    mkdir -p /app/data && chown 10001:10001 /app/data
COPY backend/ ./backend/
COPY infra/agents.json infra/phase1-config.json ./infra/
COPY --from=frontend /build/dist ./frontend/dist
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=20s --start-period=60s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=18)"
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*", "--timeout-graceful-shutdown", "120"]
