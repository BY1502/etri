from pydantic import BaseModel


class ImageBuildRequest(BaseModel):
    base_image: str = "pytorch"  # pytorch | tensorflow | cuda | python | custom
    base_tag: str = "2.1.0-cuda12.1-cudnn8-runtime"
    custom_from: str | None = None
    workdir: str = "/home/jovyan"
    run_commands: list[str] = []
    pip_packages: list[str] = []
    apt_packages: list[str] = []
    image_name: str
    image_tag: str = "latest"
    include_jupyter: bool = True
    dockerfile_override: str | None = None  # 직접 편집한 Dockerfile (있으면 이것이 우선)


class ImageInfo(BaseModel):
    name: str
    tags: list[str] = []


class BuildStatus(BaseModel):
    build_id: str
    status: str  # building | success | error
    message: str = ""
