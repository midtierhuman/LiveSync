import logging
from typing import Any
import jwt
from jwt import InvalidTokenError
from app.config import settings


logger = logging.getLogger(__name__)


class SandboxAuthService:
    def _secret(self) -> str:
        secret = settings.jwt_secret or ""
        if len(secret.encode("utf-8")) < 32:
            raise ValueError("LIVESYNC_JWT_SECRET must be configured and at least 32 bytes.")
        return secret

    def validate_token(self, token: str) -> bool:
        trimmed = (token or "").strip()
        if not trimmed:
            return False

        try:
            jwt.decode(
                trimmed,
                self._secret(),
                algorithms=["HS256"],
                audience=settings.jwt_audience,
                issuer=settings.jwt_issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
            return True
        except ValueError:
            raise
        except InvalidTokenError:
            return False
        except Exception:
            logger.exception("Unexpected token validation failure")
            return False

    def get_bearer_token(self, authorization_header: str | None) -> str:
        header = (authorization_header or "").strip()
        if not header.lower().startswith("bearer "):
            return ""
        return header[7:].strip()

    def get_websocket_token(self, init_payload: dict[str, Any]) -> str:
        token = (init_payload.get("token") or init_payload.get("accessToken") or "").strip()
        return token


auth_service = SandboxAuthService()
