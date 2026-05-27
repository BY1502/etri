from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    registry_url: str = "http://192.168.0.166:5000"
    registry_host: str = "localhost:5000"
    default_namespace: str = "kubeflow-user-example-com"
    kubeflow_url: str = "https://121.183.206.41:30443"
    docker_socket: str = "unix:///var/run/docker.sock"
    app_title: str = "예측매니저"
    prometheus_url: str = ""
    mlflow_url: str = ""
    mlflow_uri: str = ""
    automl_db_path: str = ""
    alarms_db_path: str = ""
    allow_unauthenticated: str = ""
    dev_user_email: str = ""
    pm_tenant_resources_enabled: str = ""

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

import os
for _k, _v in settings.model_dump().items():
    if _v:
        os.environ.setdefault(_k.upper(), str(_v))
