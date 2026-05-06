from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.services import tenant_resources

router = APIRouter()


def _waiting_page(title: str, namespace: str, refresh_url: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="8;url={refresh_url}">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f8fafc; color: #111827; }}
    .wrap {{ min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
    .box {{ width: min(460px, calc(100vw - 32px)); background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; box-shadow: 0 8px 20px rgba(15, 23, 42, .08); }}
    .title {{ font-size: 18px; font-weight: 700; margin-bottom: 8px; }}
    .meta {{ font-size: 13px; color: #4b5563; line-height: 1.6; }}
    .spin {{ width: 22px; height: 22px; border: 3px solid #dbeafe; border-top-color: #2563eb; border-radius: 999px; animation: r 1s linear infinite; margin-bottom: 14px; }}
    @keyframes r {{ to {{ transform: rotate(360deg); }} }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="box">
      <div class="spin"></div>
      <div class="title">{title} 준비 중</div>
      <div class="meta">namespace: <b>{namespace}</b><br />사용자별 리소스가 생성되면 자동으로 다시 연결합니다.</div>
    </div>
  </div>
</body>
</html>""")


@router.get("/mlflow/launch")
async def launch_mlflow(request: Request):
    namespace = tenant_resources.resolve_private_namespace(request)
    status = tenant_resources.mlflow_status(namespace)
    if not status.ready:
        return _waiting_page(
            "MLflow",
            namespace,
            f"/prediction-manager/api/dashboards/mlflow/launch?ns={namespace}",
        )
    return RedirectResponse(status.path)


@router.get("/ray/launch")
async def launch_ray(request: Request):
    namespace = tenant_resources.resolve_private_namespace(request)
    status = tenant_resources.ray_status(namespace)
    if not status.ready:
        return _waiting_page(
            "Ray Dashboard",
            namespace,
            f"/prediction-manager/api/dashboards/ray/launch?ns={namespace}",
        )
    return RedirectResponse(status.path)


@router.get("/status")
async def dashboard_status(request: Request):
    namespace = tenant_resources.resolve_private_namespace(request)
    return {
        "namespace": namespace,
        "mlflow": tenant_resources.mlflow_status(namespace).__dict__,
        "ray": tenant_resources.ray_status(namespace).__dict__,
        "nifi": tenant_resources.nifi_status(namespace).__dict__,
    }
