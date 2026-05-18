from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from urllib.parse import unquote

from app.auth import get_user_email, get_user_namespace, require_authenticated
from app.models.dataset_models import (
    DatasetCreateRequest,
    DatasetVersionCreateRequest,
    DatasetVersionUpdateRequest,
    ImageStandardizeRequest,
    PipelineInputsRequest,
    PreprocessRequest,
)
from app.services import dataset_service

router = APIRouter()


def _bool_header(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "y", "on")


@router.get("")
async def list_datasets(request: Request):
    require_authenticated(request)
    namespace = get_user_namespace(request)
    return {"namespace": namespace, "datasets": dataset_service.list_datasets(namespace)}


@router.post("")
async def create_dataset(req: DatasetCreateRequest, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.create_dataset(namespace, email, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str, request: Request):
    require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.get_dataset(namespace, dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.delete_dataset(namespace, dataset_id, email)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{dataset_id}/versions")
async def create_dataset_version(dataset_id: str, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    try:
        if content_type == "application/json":
            payload = DatasetVersionCreateRequest(**(await request.json()))
            return dataset_service.create_version_from_uri(namespace, dataset_id, email, payload)

        content = await request.body()
        file_name = unquote(request.headers.get("x-dataset-filename") or "dataset.csv")
        source_kind = request.headers.get("x-dataset-source-kind") or "raw"
        pipeline_ready = _bool_header(request.headers.get("x-pipeline-ready"), False)
        notes = request.headers.get("x-dataset-notes") or ""
        return dataset_service.create_version_from_bytes(
            namespace,
            dataset_id,
            email,
            file_name=file_name,
            content=content,
            source_kind=source_kind,
            pipeline_ready=pipeline_ready,
            notes=notes,
            metadata={"upload_content_type": content_type or "application/octet-stream"},
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{dataset_id}/versions/{version}/preprocess")
async def preprocess_dataset_version(dataset_id: str, version: int, req: PreprocessRequest, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.preprocess_version(namespace, dataset_id, version, email, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{dataset_id}/versions/{version}")
async def update_dataset_version(dataset_id: str, version: int, req: DatasetVersionUpdateRequest, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.update_version(namespace, dataset_id, version, email, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{dataset_id}/versions/{version}/publish")
async def publish_dataset_version(dataset_id: str, version: int, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.publish_version(namespace, dataset_id, version, email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{dataset_id}/versions/{version}/standardize-images")
async def standardize_dataset_images(dataset_id: str, version: int, req: ImageStandardizeRequest, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.standardize_image_version(namespace, dataset_id, version, email, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{dataset_id}/versions/{version}/label-studio-export")
async def register_label_studio_export(dataset_id: str, version: int, request: Request):
    email = require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        content = await request.body()
        file_name = unquote(request.headers.get("x-dataset-filename") or "label-studio-export.json")
        pipeline_ready = _bool_header(request.headers.get("x-pipeline-ready"), True)
        notes = request.headers.get("x-dataset-notes") or ""
        output_name = unquote(request.headers.get("x-output-name") or "label-studio-export.csv")
        return dataset_service.create_label_studio_export_version(
            namespace,
            dataset_id,
            version,
            email,
            file_name=file_name,
            content=content,
            output_name=output_name,
            pipeline_ready=pipeline_ready,
            notes=notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{dataset_id}/versions/{version}/download")
async def download_dataset_version(dataset_id: str, version: int, token: str = ""):
    try:
        return dataset_service.download_response(dataset_id, version, token)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{dataset_id}/versions/{version}/pipeline-inputs")
async def dataset_pipeline_inputs(dataset_id: str, version: int, req: PipelineInputsRequest, request: Request):
    require_authenticated(request)
    namespace = get_user_namespace(request)
    try:
        return dataset_service.build_pipeline_inputs(namespace, dataset_id, version, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
