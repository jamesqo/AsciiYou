from __future__ import annotations

import os
from pathlib import Path
from typing import List

import yaml
from pydantic import AnyUrl
from pydantic_settings import BaseSettings, SettingsConfigDict  # type: ignore[import-not-found]


def yaml_config_settings_source(_: type[BaseSettings]):
    def _source() -> dict:
        path = Path(os.getenv("APP_CONFIG_FILE", "backend/config.yaml"))
        if not path.exists():
            return {}
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        return data
    return _source


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_",
        env_file=".env",
        case_sensitive=False,
    )

    # Core app settings
    cors_origin_regex: str | None = None

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_ttl_seconds: int = 300

    # Persistence
    redis_url: str = "redis://localhost:6379/0"
    huddle_ttl_seconds: int = 3600

    @classmethod
    def settings_customise_sources(cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings):
        # Order = highest priority first. Env should override YAML.
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            file_secret_settings,
            yaml_config_settings_source(cls),
        )


settings = AppSettings()


