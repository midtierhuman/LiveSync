# ==============================================================================
# LiveSync REST API & Redis Persistence Engine (Go 1.26 Multi-Stage Build)
# ==============================================================================
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install build dependencies & git
RUN apk add --no-cache git ca-certificates tzdata

# Cache Go modules
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Copy source code
COPY . .

# Build statically linked standalone binary with compiler cache mount
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/livesync-api .

# ==============================================================================
# Final Minimal Runtime Image
# ==============================================================================
FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/livesync-api /app/livesync-api

EXPOSE 8080

ENTRYPOINT ["/app/livesync-api"]
