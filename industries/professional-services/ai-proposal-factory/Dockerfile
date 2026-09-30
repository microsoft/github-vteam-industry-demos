FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY app/frontend/package*.json ./
RUN npm ci
COPY app/frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000
WORKDIR /app
COPY app/backend/pyproject.toml ./app/backend/pyproject.toml
COPY app/backend/proposal_factory ./app/backend/proposal_factory
RUN pip install --no-cache-dir ./app/backend
COPY data ./data
COPY --from=frontend-build /build/frontend/dist ./app/frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn proposal_factory.main:app --app-dir app/backend --host 0.0.0.0 --port ${PORT}"]
