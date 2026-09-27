# Stage 1: Build & Dependencies
FROM python:3.13-slim as base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application directories
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/ ./data/

# Run database initial seed during image build so cold starts are instant
RUN python -m backend.seed_data

# Create non-root user for security best practices
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

# Cloud Run dynamic port exposure
EXPOSE 8080

# Run Uvicorn ASGI server binding to Cloud Run dynamic $PORT
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
