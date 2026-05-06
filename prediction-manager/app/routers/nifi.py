from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.auth import require_authenticated
from app.services import tenant_resources

router = APIRouter()


@router.get("/launch")
async def launch_nifi(request: Request):
    """사용자 namespace 전용 NiFi UI로 이동."""
    require_authenticated(request)
    namespace = tenant_resources.resolve_private_namespace(request)
    inst = tenant_resources.nifi_status(namespace)

    if inst.ready:
        return RedirectResponse(inst.path, status_code=302)

    # 사용자별 NiFi는 설치/프로비저닝 매니페스트가 만든다. 기동 중이면 자동 재확인.
    return HTMLResponse(
        f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="8;url=/prediction-manager/api/nifi/launch?ns={namespace}">
  <style>
    body {{
      margin:0; display:flex; min-height:100vh; align-items:center; justify-content:center;
      background:#f5f7fa; color:#5f6368; font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }}
    .box {{ background:#fff; border:1px solid #e0e4ea; border-radius:8px; padding:18px 22px; }}
    .title {{ color:#202124; font-weight:600; margin-bottom:6px; }}
    .ns {{ font-family:monospace; font-size:12px; }}
  </style>
</head>
<body>
  <div class="box">
    <div class="title">NiFi 준비 중</div>
    <div class="ns">{namespace}</div>
  </div>
</body>
</html>""",
        status_code=202,
    )


@router.get("/status")
async def nifi_status(request: Request):
    require_authenticated(request)
    namespace = tenant_resources.resolve_private_namespace(request)
    inst = tenant_resources.nifi_status(namespace)
    return {
        "namespace": inst.namespace,
        "owner_email": inst.owner_email,
        "path": inst.path,
        "ready": inst.ready,
        "provisioned": inst.provisioned,
    }
