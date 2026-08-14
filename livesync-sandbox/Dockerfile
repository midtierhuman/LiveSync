FROM python:3.14-slim

# Install lightweight Node.js runtime for JavaScript execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .
RUN useradd --create-home --uid 10001 sandbox && chown -R sandbox:sandbox /app
USER sandbox

EXPOSE 50051

CMD ["python", "-m", "app.main"]
