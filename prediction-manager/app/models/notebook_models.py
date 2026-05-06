from pydantic import BaseModel, Field


class VolumeSpec(BaseModel):
    source: str = "new"                  # "new" | "existing"
    name: str = ""                       # for existing: PVC name; for new: auto-generated
    size: str = "5Gi"                    # for new
    storage_class: str = "local-path"    # for new
    access_mode: str = "ReadWriteOnce"   # for new
    mount_path: str


class EnvVar(BaseModel):
    name: str
    value: str = ""


class NotebookCreateRequest(BaseModel):
    name: str

    # Image section (Kubeflow JWA match)
    notebook_type: str = "jupyter"        # "jupyter" | "vscode" | "rstudio"
    image: str                            # preset image — ignored if custom_image set
    custom_image: str | None = None       # full image URL; takes precedence
    image_pull_policy: str = "IfNotPresent"  # "Always" | "IfNotPresent" | "Never"

    # Resources
    cpu_request: str = "2"
    cpu_limit: str = "4"
    memory_request: str = "4Gi"
    memory_limit: str = "8Gi"

    # GPU
    gpu_count: int = 0
    gpu_vendor: str = "nvidia.com/gpu"    # "nvidia.com/gpu" | "amd.com/gpu" | "habana.ai/gaudi"

    # Workspace volume
    workspace_source: str = "new"
    workspace_name: str = ""
    workspace_size: str = "10Gi"
    workspace_storage_class: str = "local-path"
    workspace_access_mode: str = "ReadWriteOnce"
    workspace_mount_path: str = "/home/jovyan"

    # Data volumes
    data_volumes: list[VolumeSpec] = Field(default_factory=list)

    # Affinity / Tolerations (Kubeflow: dropdown config key, empty = none)
    affinity_config: str = ""
    toleration_group: str = ""

    # Miscellaneous
    enable_shared_memory: bool = True
    pod_defaults: list[str] = Field(default_factory=list)   # PodDefault 이름 리스트
    env_vars: list[EnvVar] = Field(default_factory=list)


class NotebookInfo(BaseModel):
    name: str
    namespace: str
    image: str
    status: str
    cpu: str = ""
    memory: str = ""
    gpu: int = 0
    created: str = ""
    url: str = ""
