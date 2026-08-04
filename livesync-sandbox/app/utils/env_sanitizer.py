import os

SENSITIVE_ENV_KEYS = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "DATABASE",
    "PASSWORD",
    "SECRET",
    "KEY",
    "TOKEN",
    "AUTH",
    "CREDENTIALS",
    "JWT",
]


def get_sanitized_env() -> dict[str, str]:
    """
    Returns a copy of os.environ with all API keys, secrets, passwords, and tokens purged,
    preventing user code from reading container secrets via os.environ / process.env / System.getenv.
    """
    clean_env = {}
    for key, value in os.environ.items():
        key_upper = key.upper()
        if not any(sensitive in key_upper for sensitive in SENSITIVE_ENV_KEYS):
            clean_env[key] = value

    # Enforce unbuffered, UTF-8 encoded standard stream I/O for Python subprocesses
    clean_env["PYTHONUNBUFFERED"] = "1"
    clean_env["PYTHONIOENCODING"] = "utf-8"
    clean_env["PYTHONUTF8"] = "1"
    return clean_env

