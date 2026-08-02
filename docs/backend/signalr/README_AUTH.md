# Authentication

Authentication is no longer hosted in the realtime service.
It lives in `livesync-api`, the Java Spring Boot service.

## What to use

- Sign in through `POST /api/auth/login`
- Send the returned JWT as a Bearer token
- The realtime service reads that token when joining documents

## Relevant API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`

## Development flow

1. Start `livesync-api`
2. Start `livesync-realtime`
3. Log in through the API
4. Use the token with the realtime service

## Notes

- JWT settings are configured in the API service
- CORS allow-lists should include the frontend origin
