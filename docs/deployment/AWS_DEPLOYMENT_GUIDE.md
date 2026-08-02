# LiveSync AWS Deployment Guide

## Overview

LiveSync currently deploys as three services:

- Angular frontend
- Java Spring Boot API
- Node.js realtime service
- Optional Python sandbox

## Recommended AWS layout

- Frontend: S3 + CloudFront
- API: ECS, Elastic Beanstalk, or EC2
- Realtime service: ECS or EC2
- Sandbox: ECS or EC2
- Database: PostgreSQL on RDS
- Redis: ElastiCache or a managed Redis service

## Environment variables

### API

- `LIVESYNC_DATABASE_URL`
- `LIVESYNC_DATABASE_USERNAME`
- `LIVESYNC_DATABASE_PASSWORD`
- `LIVESYNC_JWT_SECRET`
- `LIVESYNC_JWT_ISSUER`
- `LIVESYNC_JWT_AUDIENCE`
- `LIVESYNC_CORS_ALLOWED_ORIGINS`
- `LIVESYNC_SANDBOX_BASE_URL`

### Realtime service

- `PORT`
- `API_BASE_URL`
- `REDIS_URL`

### Sandbox

- `APP_NAME`
- `CORS_ALLOWED_ORIGINS`

## Deployment notes

1. Deploy the API first so the realtime service can validate access.
2. Point the realtime service at the API and Redis.
3. Point the API at the sandbox if code execution is enabled.
4. Keep all secrets in AWS Secrets Manager or environment variables.

## Health checks

- API: `GET /health` if enabled in your deployment
- Realtime: `GET /health`
- Sandbox: `GET /health`

## Checklist

- [ ] PostgreSQL reachable from the API
- [ ] Redis reachable from the realtime service
- [ ] Frontend origin allowed in CORS
- [ ] JWT secret configured
- [ ] Services deployed with matching URLs
