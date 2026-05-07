from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    registry_url: str = "http://192.168.0.166:5000"  # in-cluster registry, hairpin OK
    registry_host: str = "localhost:5000"
    default_namespace: str = "kubeflow-user-example-com"
    kubeflow_url: str = "https://121.183.206.41:30443"  # 외부 접근용, 노트북 link 등
    docker_socket: str = "unix:///var/run/docker.sock"
    app_title: str = "예측매니저"
    prometheus_url: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
