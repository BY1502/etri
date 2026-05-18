import httpx
from app.config import settings


# ============================================================
# 시스템 이미지 카탈로그 — 삭제 보호 대상 + UI 설명
# ============================================================
SYSTEM_IMAGES = {
    "prediction-manager-app": {
        "category": "예측매니저",
        "description": "예측매니저 백엔드 (FastAPI). 이 이미지 삭제 시 웹 UI 자체가 동작 불가.",
        "protected": True,
    },
    "fedit-frontend": {
        "category": "FeDIT",
        "description": "FeDIT 메인 화면 React 앱. /fedit/ 경로에서 제공.",
        "protected": True,
    },
    "ray-mlflow": {
        "category": "Ray · MLflow",
        "description": "Ray Tune + MLflow 통합 이미지. AutoML 학습 실행 기반.",
        "protected": True,
    },
    "mlserver-onnx": {
        "category": "KServe",
        "description": "ONNX 변환 모델 서빙용 MLServer. KServe ClusterServingRuntime `kserve-mlserver-onnx` 에서 참조.",
        "protected": True,
    },
    "label-studio": {
        "category": "Label Studio",
        "description": "Label Studio 라벨링 도구. /label-studio/ 경로와 Kubeflow SSO 연동에서 사용.",
        "protected": True,
    },
}


def _classify(repo_name: str) -> dict:
    """이미지 분류: system | user | orphan"""
    # 시스템 이미지
    if repo_name in SYSTEM_IMAGES:
        return {
            "type": "system",
            **SYSTEM_IMAGES[repo_name],
        }
    # 사용자 이미지 (namespace prefix 규칙)
    if "/" in repo_name:
        ns = repo_name.split("/", 1)[0]
        if ns.startswith("kubeflow-"):
            return {
                "type": "user",
                "category": "사용자",
                "description": f"{ns} 사용자가 빌드한 이미지",
                "protected": False,
            }
    # 그 외 = 고아 (prefix 없고 시스템 목록에도 없음)
    return {
        "type": "orphan",
        "category": "미분류",
        "description": "소유자·용도 불명. 어떤 Pod/ISVC도 참조하지 않는 것으로 추정. 삭제 전 `kubectl get pods -A | grep` 로 확인 권장.",
        "protected": False,
    }


def owner_namespace(repo_name: str) -> str | None:
    """사용자 이미지 repo prefix 에서 소유 namespace를 추출."""
    if "/" not in repo_name:
        return None
    ns = repo_name.split("/", 1)[0]
    return ns if ns.startswith("kubeflow-") else None


def _repository_info(repo: str, tags: list[str]) -> dict:
    cls = _classify(repo)
    compatible_types: list[str] = []
    if cls.get("type") == "user":
        # 현재 Prediction Manager 이미지 빌더는 JupyterLab 실행 엔트리포인트를 넣는다.
        # VSCode/RStudio는 별도 런타임 서버가 필요한 이미지라 자동 호환으로 보지 않는다.
        compatible_types = ["jupyter"]
    return {
        "name": repo,
        "tags": tags,
        "owner_namespace": owner_namespace(repo),
        "compatible_types": compatible_types,
        **cls,
    }


async def list_repositories(namespace: str = None, include_system: bool = False) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.registry_url}/v2/_catalog")
        repos = resp.json().get("repositories", [])
        result = []
        for repo in repos:
            cls = _classify(repo)
            # namespace prefix 필터링: "kubeflow-researcher1/my-image"
            if namespace:
                if include_system and cls.get("type") == "system":
                    pass
                elif "/" in repo:
                    repo_ns = repo.split("/")[0]
                    if repo_ns != namespace:
                        continue
                else:
                    # prefix 없는 기존 이미지는 관리자 전체 보기에서만 볼 수 있음.
                    # 단, include_system=True이면 위에서 시스템 이미지만 허용.
                    continue
            tags_resp = await client.get(
                f"{settings.registry_url}/v2/{repo}/tags/list"
            )
            tags = tags_resp.json().get("tags", []) or []
            result.append(_repository_info(repo, tags))
        return result


async def list_all_repositories() -> list[dict]:
    """관리자용: 모든 이미지 + 분류(system / user / orphan)"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.registry_url}/v2/_catalog")
        repos = resp.json().get("repositories", [])
        result = []
        for repo in repos:
            tags_resp = await client.get(
                f"{settings.registry_url}/v2/{repo}/tags/list"
            )
            tags = tags_resp.json().get("tags", []) or []
            if not tags:
                continue
            result.append(_repository_info(repo, tags))
        return result


async def list_shared_repositories() -> list[dict]:
    """일반 사용자용: 시스템 이미지 + 모든 사용자 이미지.

    사용자 이미지는 컨테이너 생성에서 공유 사용 가능하지만, 삭제 권한은
    라우터에서 owner namespace 기준으로 별도 계산한다. 미분류 orphan 이미지는
    일반 사용자에게 노출하지 않는다.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.registry_url}/v2/_catalog")
        repos = resp.json().get("repositories", [])
        result = []
        for repo in repos:
            cls = _classify(repo)
            if cls.get("type") not in ("system", "user"):
                continue
            tags_resp = await client.get(
                f"{settings.registry_url}/v2/{repo}/tags/list"
            )
            tags = tags_resp.json().get("tags", []) or []
            if not tags:
                continue
            result.append(_repository_info(repo, tags))
        return result


async def get_tags(name: str) -> list[str]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.registry_url}/v2/{name}/tags/list")
        return resp.json().get("tags", []) or []


async def delete_image(name: str, tag: str) -> bool:
    async with httpx.AsyncClient() as client:
        manifest_resp = await client.get(
            f"{settings.registry_url}/v2/{name}/manifests/{tag}",
            headers={
                "Accept": ", ".join([
                    "application/vnd.docker.distribution.manifest.v2+json",
                    "application/vnd.oci.image.manifest.v1+json",
                    "application/vnd.docker.distribution.manifest.list.v2+json",
                    "application/vnd.oci.image.index.v1+json",
                ])
            },
        )
        if manifest_resp.status_code != 200:
            return False
        digest = manifest_resp.headers.get("Docker-Content-Digest")
        if not digest:
            return False
        del_resp = await client.delete(
            f"{settings.registry_url}/v2/{name}/manifests/{digest}"
        )
        return del_resp.status_code == 202
