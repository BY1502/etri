from typing import Literal
from pydantic import BaseModel, Field


ModelId = Literal["rf", "xgb", "lgbm", "mlp", "tabnet"]
TaskType = Literal["regression", "classification"]
MetricName = Literal[
    "auto",
    "mse", "rmse", "mae", "r2",
    "accuracy", "f1", "precision", "recall", "roc_auc",
]


class AutoMLJobRequest(BaseModel):
    name: str = Field(..., description="Experiment name (MLflow)")
    task: TaskType = "regression"
    dataset_path: str = Field(..., description="PVC path (/home/jovyan/...) or http(s) URL, CSV/Parquet")
    target_column: str
    models: list[ModelId] = ["rf", "xgb", "lgbm"]
    num_trials: int = Field(10, ge=1, le=200)
    timeout_minutes: int = Field(60, ge=1, le=720, description="전체 학습 제한 시간 (분)")
    metric: MetricName = Field("auto", description="평가 메트릭. 'auto'면 task에 따라 자동 선택")
    test_size: float = Field(0.2, ge=0.05, le=0.5)
    random_state: int = 42
    cpu_per_trial: float = Field(1.0, ge=0.1, le=16, description="Trial당 CPU core 할당")
    gpu_per_trial: float = Field(0.0, ge=0.0, le=4, description="Trial당 GPU 할당 (0.25 = 1/4 GPU)")
    memory_per_trial_gb: float = Field(2.0, ge=0.5, le=128, description="Trial당 메모리 (GB)")
    top_n: int = Field(3, ge=1, le=10, description="Job당 저장할 상위 N개 모델")


class AutoMLJobInfo(BaseModel):
    job_id: str
    ray_job_id: str | None = None
    submitted_by: str
    namespace: str
    status: str  # PENDING, RUNNING, SUCCEEDED, FAILED, STOPPED
    experiment_name: str
    mlflow_experiment_id: str | None = None
    task: TaskType
    dataset_path: str
    target_column: str
    models: list[ModelId]
    num_trials: int
    submitted_at: str
    finished_at: str | None = None
    best_run: dict | None = None
    message: str | None = None
