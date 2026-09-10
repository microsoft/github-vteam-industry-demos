FROM node:22-alpine AS frontend-build

WORKDIR /build
COPY app/frontend/package*.json ./
RUN npm ci
COPY app/frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /workspace

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/__init__.py app/__init__.py
COPY app/backend app/backend
COPY data data
COPY scripts/app scripts/app
COPY --from=frontend-build /build/dist app/backend/static

EXPOSE 8000

CMD ["uvicorn", "app.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
