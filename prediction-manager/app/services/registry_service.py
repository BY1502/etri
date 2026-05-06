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


async def list_repositories(namespace: str = None) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.registry_url}/v2/_catalog")
        repos = resp.json().get("repositories", [])
        result = []
        for repo in repos:
            # namespace prefix 필터링: "kubeflow-researcher1/my-image"
            if namespace and "/" in repo:
                repo_ns = repo.split("/")[0]
                if repo_ns != namespace:
                    continue
            elif namespace and "/" not in repo:
                # prefix 없는 기존 이미지는 관리자만 볼 수 있음
                continue
            tags_resp = await client.get(
                f"{settings.registry_url}/v2/{repo}/tags/list"
            )
            tags = tags_resp.json().get("tags", []) or []
            result.append({"name": repo, "tags": tags, **_classify(repo)})
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
            result.append({"name": repo, "tags": tags, **_classify(repo)})
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
