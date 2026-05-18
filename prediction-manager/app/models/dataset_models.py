from typing import Literal
from pydantic import BaseModel, Field


DatasetType = Literal["csv", "json", "jsonl", "parquet", "image"]
DatasetTask = Literal["regression", "classification", "labeling", "unknown"]
DatasetSourceKind = Literal["raw", "preprocessed", "image_standardized", "labeling_export", "nifi_output", "external_uri"]
DatasetVersionStatus = Literal["registered", "ready", "published", "deprecated", "archived"]


class DatasetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = ""
    data_type: DatasetType = "csv"
    task: DatasetTask = "unknown"
    target_column: str = ""


class DatasetVersionCreateRequest(BaseModel):
    source_uri: str = Field(..., min_length=1)
    source_kind: DatasetSourceKind = "external_uri"
    file_name: str = ""
    pipeline_ready: bool = False
    notes: str = ""
    metadata: dict = Field(default_factory=dict)


class PreprocessRequest(BaseModel):
    source_versions: list[int] | None = None
    clean_columns: bool = True
    fill_missing: bool = True
    normalize_numeric: bool = False
    sample_rows: int | None = Field(default=None, ge=1, le=1_000_000)
    output_name: str = "preprocessed.csv"
    pipeline_ready: bool = True
    notes: str = ""


class ImageStandardizeRequest(BaseModel):
    target_format: Literal["jpeg", "png"] = "jpeg"
    max_width: int | None = Field(default=None, ge=1, le=10000)
    max_height: int | None = Field(default=None, ge=1, le=10000)
    keep_aspect_ratio: bool = True
    background_color: str = "#ffffff"
    quality: int = Field(default=95, ge=1, le=100)
    output_name: str = "standardized-images.zip"
    pipeline_ready: bool = True
    notes: str = ""


class DatasetVersionUpdateRequest(BaseModel):
    status: DatasetVersionStatus | None = None
    pipeline_ready: bool | None = None
    target_column: str | None = None
    notes: str | None = None
    metadata: dict = Field(default_factory=dict)


class PipelineInputsRequest(BaseModel):
    registered_name: str = ""
    target_column: str = ""
    threshold: float = 0.90
    max_attempts: int = 10
