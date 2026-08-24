FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root runtime user early to prevent file layer duplication
RUN useradd --create-home --uid 10001 livesync

# Install Python requirements with pip cache mount
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# Copy application source code with user ownership directly
COPY --chown=livesync:livesync . .

USER livesync

EXPOSE 50051

CMD ["python", "-m", "app.main"]
