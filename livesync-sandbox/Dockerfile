FROM python:3.14-slim

# Install system dependencies (Node.js runtime, OpenJDK)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    libicu76 \
    nodejs \
    default-jdk-headless \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install .NET SDK without apt repository dependency (avoids upstream repo signature failures)
RUN wget https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm /tmp/dotnet-install.sh

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
