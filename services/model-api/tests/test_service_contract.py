import pytest
from fastapi import HTTPException, status

from pitch_model_api.main import app, require_service_auth
from pitch_model_api.config import Settings, settings_from_env
from pitch_model_api.lambda_handler import configure_writable_runtime_dirs


def test_prediction_route_is_registered() -> None:
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/health" in paths
    assert "/ready" in paths
    assert "/v1/pitch/predict" in paths


def test_model_api_key_is_required_when_auth_is_enabled(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_API_AUTH_REQUIRED", "true")
    monkeypatch.delenv("MODEL_API_KEY", raising=False)

    try:
        settings_from_env()
    except RuntimeError as exc:
        assert "MODEL_API_KEY is required" in str(exc)
    else:
        raise AssertionError("settings_from_env should reject missing production model API key")


def test_model_api_auth_can_be_disabled_for_iam_lambda_backend(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("MODEL_API_AUTH_REQUIRED", "false")
    monkeypatch.delenv("MODEL_API_KEY", raising=False)

    settings = settings_from_env()

    assert settings.api_auth_required is False


def test_ready_auth_uses_prediction_credentials() -> None:
    settings = Settings(
        algorithm="xlstm",
        sample_size=12,
        warm_on_startup=False,
        api_key="secret",
        api_auth_required=True,
        cache_dir=".cache",
        log_dir=".logs",
    )

    require_service_auth("Bearer secret", settings)
    with pytest.raises(HTTPException) as exc_info:
        require_service_auth("Bearer wrong", settings)
    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_lambda_runtime_dirs_are_writable(monkeypatch, tmp_path) -> None:
    pybaseball_cache = tmp_path / "pybaseball-cache"
    model_dir = tmp_path / "pitchpredict-model"
    cache_dir = tmp_path / "pitchpredict-cache"
    log_dir = tmp_path / "pitchpredict-logs"
    monkeypatch.setenv("PYBASEBALL_CACHE", str(pybaseball_cache))
    monkeypatch.setenv("PITCHPREDICT_MODEL_DIR", str(model_dir))
    monkeypatch.setenv("PITCHPREDICT_CACHE_DIR", str(cache_dir))
    monkeypatch.setenv("PITCHPREDICT_LOG_DIR", str(log_dir))

    configure_writable_runtime_dirs()

    for path in (pybaseball_cache, model_dir, cache_dir, log_dir):
        assert path.is_dir()
