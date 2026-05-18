from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse

from app.models.image_models import ImageBuildRequest, BuildStatus
from app.services import registry_service, docker_service
from app.auth import get_owner_namespace, is_admin

import asyncio
import json

router = APIRouter()


def _attach_image_permissions(items: list[dict], request: Request) -> list[dict]:
    """목록 응답에 현재 사용자의 삭제 가능 여부를 추가."""
    admin = is_admin(request)
    owner_ns = get_owner_namespace(request)
    for item in items:
        image_owner_ns = item.get("owner_namespace")
        compatible_types = item.get("compatible_types") or []
        item["can_delete"] = (
            not item.get("protected")
            and (
                admin
                or (item.get("type") == "user" and image_owner_ns == owner_ns)
            )
        )
        item["can_use"] = bool(compatible_types)
    return items


@router.get("")
async def list_images(request: Request):
    if is_admin(request):
        selected_ns = request.query_params.get("ns") or request.headers.get("x-pm-namespace")
        admin_ns = get_owner_namespace(request)
        if selected_ns and selected_ns != admin_ns:
            items = await registry_service.list_repositories(namespace=selected_ns, include_system=True)
            return _attach_image_permissions(items, request)
        items = await registry_service.list_all_repositories()
        return _attach_image_permissions(items, request)
    items = await registry_service.list_shared_repositories()
    return _attach_image_permissions(items, request)


@router.get("/{name:path}/tags")
async def get_tags(name: str):
    tags = await registry_service.get_tags(name)
    return {"name": name, "tags": tags}


@router.post("/preview-dockerfile")
async def preview_dockerfile(req: ImageBuildRequest):
    """현재 폼 상태로 생성될 Dockerfile 텍스트를 반환"""
    return {"dockerfile": docker_service.render_dockerfile(req)}


@router.post("/build")
async def build_image(req: ImageBuildRequest, request: Request):
    ns = get_owner_namespace(request)
    # 이미지 이름에 생성자 owner namespace prefix 추가
    req.image_name = f"{ns}/{req.image_name}"
    build_id = await docker_service.build_and_push(req)
    return {"build_id": build_id, "status": "building"}


@router.get("/build-log/{build_id}")
async def build_log(build_id: str):
    async def event_stream():
        last_idx = 0
        while True:
            info = docker_service.get_build_status(build_id)
            if not info:
                yield f"data: {json.dumps({'error': 'not found'})}\n\n"
                return

            logs = info["logs"]
            if last_idx < len(logs):
                for line in logs[last_idx:]:
                    yield f"data: {json.dumps({'log': line})}\n\n"
                last_idx = len(logs)

            if info["status"] in ("success", "error"):
                yield f"data: {json.dumps({'status': info['status'], 'message': info['message']})}\n\n"
                return

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/{name:path}")
async def delete_image(name: str, request: Request, tag: str = "latest", force: bool = False):
    """이미지 삭제. 시스템 이미지는 삭제 불가. 사용자 이미지는 해당 namespace 소유자만."""
    cls = registry_service._classify(name)
    admin = is_admin(request)

    if cls.get("protected"):
        # 시스템 이미지는 누구도 삭제 불가 (admin 도 X). 시스템 망가지는 위험 차단.
        # 정말 필요하면 kubectl/docker 로 직접 처리.
        raise HTTPException(
            status_code=403,
            detail=f"시스템 이미지({cls.get('category')})는 삭제할 수 없습니다. 설명: {cls.get('description')}",
        )
    else:
        # 사용자 이미지: 생성자 owner namespace 소유자만 삭제 가능.
        # contributor/namespace override 로 남의 namespace를 보고 있어도 삭제는 차단한다.
        user_owner_ns = get_owner_namespace(request)
        image_owner_ns = registry_service.owner_namespace(name)
        if not admin and image_owner_ns != user_owner_ns:
            raise HTTPException(
                status_code=403,
                detail="이미지는 생성한 사용자만 삭제할 수 있습니다.",
            )

    ok = await registry_service.delete_image(name, tag)
    if ok:
        docker_service.unregister_image_from_kubeflow(name, tag)
    return {"deleted": ok, "name": name, "tag": tag}


@router.get("/base-options")
async def base_options():
    return [
        {
            "value": "pytorch",
            "label": "PyTorch",
            "tags": [
                "2.1.0-cuda12.1-cudnn8-runtime",
                "2.2.0-cuda12.1-cudnn8-runtime",
                "2.3.0-cuda12.1-cudnn8-runtime",
                "latest",
            ],
        },
        {
            "value": "tensorflow",
            "label": "TensorFlow",
            "tags": ["2.15.0-gpu", "2.16.1-gpu", "latest-gpu", "latest"],
        },
        {
            "value": "cuda",
            "label": "NVIDIA CUDA",
            "tags": [
                "12.1.0-runtime-ubuntu22.04",
                "12.2.0-runtime-ubuntu22.04",
                "12.4.0-runtime-ubuntu22.04",
            ],
        },
        {
            "value": "python",
            "label": "Python (CPU)",
            "tags": ["3.10-slim", "3.11-slim", "3.12-slim"],
        },
        {"value": "custom", "label": "Custom (직접 입력)", "tags": []},
    ]
