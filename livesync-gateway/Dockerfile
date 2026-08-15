# Multi-stage Dockerfile for LiveSync Go Gateway
FROM golang:alpine AS builder

WORKDIR /app

# Download dependencies
COPY go.mod go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Copy source code
COPY . .

# Build lightweight static binary with cache mounts
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o livesync-gateway .

# Final minimal runtime image (~15MB)
FROM alpine:latest

RUN apk --no-cache add ca-certificates bash

WORKDIR /root/

COPY --from=builder /app/livesync-gateway .

EXPOSE 8081

CMD ["./livesync-gateway"]
