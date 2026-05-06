from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.auth import (
    get_user_email,
    get_user_namespace,
    is_admin,
    get_user_accessible_namespaces,
)
from app.routers import images, containers, dashboard, admin, automl, models, nifi, tenant_dashboards

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prediction-manager")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    from app.services import automl_service
    try:
        automl_service.start_scheduler()
        logger.info("[lifespan] AutoML scheduler started")
    except Exception as e:
        logger.exception(f"[lifespan] scheduler start failed: {e}")
    yield
    # shutdown - 필요 시 cleanup 추가


app = FastAPI(
    title=settings.app_title,
    root_path="/prediction-manager",
    lifespan=lifespan,
)

app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(containers.router, prefix="/api/containers", tags=["containers"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(automl.router, prefix="/api/automl", tags=["automl"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(nifi.router, prefix="/api/nifi", tags=["nifi"])
app.include_router(tenant_dashboards.router, prefix="/api/dashboards", tags=["dashboards"])


@app.get("/api/user-info")
async def user_info(request: Request):
    email = get_user_email(request)
    ns = get_user_namespace(request)
    admin = is_admin(request)
    accessible = get_user_accessible_namespaces(request)
    logger.info(f"[AUTH] user-info: email={email} ns={ns} admin={admin}")
    return {
        "email": email,
        "namespace": ns,
        "is_admin": admin,
        "accessible_namespaces": accessible,
    }


static_dir = Path(__file__).parent.parent / "static"

import re as _re
import time as _time
from fastapi.responses import HTMLResponse as _HTMLResponse

_APP_VERSION = str(int(_time.time()))


@app.get("/", include_in_schema=False)
async def root():
    html = (static_dir / "index.html").read_text(encoding="utf-8")
    html = _re.sub(r'(\.(?:js|css))(")', rf'\1?v={_APP_VERSION}\2', html)
    return _HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
