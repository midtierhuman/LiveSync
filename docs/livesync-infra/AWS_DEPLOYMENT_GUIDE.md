# AWS Deployment Guide (`livesync-infra`)

## Overview

This guide outlines deploying the LiveSync polyglot microservice stack to Amazon Web Services (AWS) using ECS (Elastic Container Service) or EC2 with Docker Compose.

## Microservices Stack

- `livesync-ui` (Angular 22 static assets served via Nginx)
- `livesync-api` (Java 21 / Spring Boot 3 container)
- `livesync-realtime` (Node.js 24 Socket.IO container)
- `livesync-sandbox` (Python 3.14 FastAPI code runner container)
- `livesync-postgres` (Amazon RDS PostgreSQL 18 or container)
- `livesync-redis` (Amazon ElastiCache Redis 7 or container with AOF)
- `livesync-infra` (Prometheus & Grafana observability containers)

## Deployment Steps

1. Build images and push to Amazon ECR (Elastic Container Registry).
2. Configure environment variables in AWS Systems Manager Parameter Store or Secrets Manager.
3. Deploy services to AWS ECS Fargate or EC2 using Docker Compose / ECS CLI.
