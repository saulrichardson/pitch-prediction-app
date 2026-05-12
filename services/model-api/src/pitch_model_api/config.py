from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    algorithm: str
    sample_size: int
    warm_on_startup: bool
    api_key: str | None
    api_auth_required: bool
    cache_dir: str
    log_dir: str


def settings_from_env() -> Settings:
    api_key = os.getenv("MODEL_API_KEY") or None
    auth_required_raw = os.getenv("MODEL_API_AUTH_REQUIRED")
    api_auth_required = (
        bool_from_env("MODEL_API_AUTH_REQUIRED", False)
        if auth_required_raw is not None
        else os.getenv("ENVIRONMENT") == "production"
    )
    if api_auth_required and not api_key:
        raise RuntimeError("MODEL_API_KEY is required when model API authentication is enabled.")

    return Settings(
        algorithm=os.getenv("PITCHPREDICT_ALGORITHM", "xlstm"),
        sample_size=positive_int_from_env("PITCHPREDICT_SAMPLE_SIZE", 12),
        warm_on_startup=bool_from_env("PITCHPREDICT_WARM_ON_STARTUP", False),
        api_key=api_key,
        api_auth_required=api_auth_required,
        cache_dir=os.getenv("PITCHPREDICT_CACHE_DIR", ".pitchpredict_cache"),
        log_dir=os.getenv("PITCHPREDICT_LOG_DIR", ".pitchpredict_logs"),
    )


def positive_int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return fallback
    try:
        parsed = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive integer.") from exc
    if parsed <= 0:
        raise RuntimeError(f"{name} must be a positive integer.")
    return parsed


def bool_from_env(name: str, fallback: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return fallback
    return raw.lower() in {"1", "true", "yes", "on"}
