import asyncio
import uuid
import tempfile
import shutil
from pathlib import Path

import docker
from jinja2 import Environment, FileSystemLoader

from app.config import settings
from app.models.image_models import ImageBuildRequest

client = docker.from_env()

template_dir = Path(__file__).parent.parent / "templates"
jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

# In-memory build log storage
build_logs: dict[str, dict] = {}

BASE_IMAGE_MAP = {
    "pytorch": "pytorch/pytorch",
    "tensorflow": "tensorflow/tensorflow",
    "cuda": "nvidia/cuda",
    "python": "python",
}


def render_dockerfile(req: ImageBuildRequest) -> str:
    if req.base_image == "custom" and req.custom_from:
        from_line = req.custom_from
    else:
        base = BASE_IMAGE_MAP.get(req.base_image, "python")
        from_line = f"{base}:{req.base_tag}"

    lines = [f"FROM {from_line}", ""]
    lines.append("ENV DEBIAN_FRONTEND=noninteractive")
    lines.append(f"WORKDIR {req.workdir}")
    lines.append("")

    if req.apt_packages:
        pkgs = " ".join(req.apt_packages)
        lines.append(
            f"RUN apt-get update && apt-get install -y --no-install-recommends {pkgs} && rm -rf /var/lib/apt/lists/*"
        )
        lines.append("")

    if req.include_jupyter:
        lines.append("# Kubeflow Notebook compatibility")
        lines.append(
            "RUN useradd -m -s /bin/bash -N -u 1000 -g 100 jovyan || true"
        )
        lines.append("")

    if req.pip_packages:
        pkgs = " ".join(f'"{p}"' if any(c in p for c in '<>=!') else p for p in req.pip_packages)
        lines.append(f"RUN pip install --no-cache-dir {pkgs}")
        lines.append("")

    if req.include_jupyter:
        lines.append(
            "RUN pip install --no-cache-dir jupyterlab>=4.0 notebook ipykernel"
        )
        lines.append("")

    for cmd in req.run_commands:
        lines.append(f"RUN {cmd}")

    if req.include_jupyter:
        lines.append("")
        lines.append(f"RUN chown -R 1000:100 {req.workdir}")
        lines.append("USER 1000")
        lines.append("EXPOSE 8888")
        lines.append(
            'CMD ["/bin/sh", "-c", '
            '"jupyter lab --ip=0.0.0.0 --no-browser --port=8888 '
            "--ServerApp.token='' --ServerApp.password='' "
            "--ServerApp.allow_origin='*' "
            '--ServerApp.base_url=${NB_PREFIX:-/}"]'
        )

    return "\n".join(lines)


async def build_and_push(req: ImageBuildRequest) -> str:
    build_id = str(uuid.uuid4())[:8]
    build_logs[build_id] = {"status": "building", "logs": [], "message": ""}

    asyncio.get_event_loop().run_in_executor(None, _do_build, build_id, req)
    return build_id


def _do_build(build_id: str, req: ImageBuildRequest):
    tag = f"{settings.registry_host}/{req.image_name}:{req.image_tag}"
    tmpdir = tempfile.mkdtemp()
    try:
        if req.dockerfile_override and req.dockerfile_override.strip():
            dockerfile_content = req.dockerfile_override
        else:
            dockerfile_content = render_dockerfile(req)
        dockerfile_path = Path(tmpdir) / "Dockerfile"
        dockerfile_path.write_text(dockerfile_content)

        build_logs[build_id]["logs"].append(f"=== Dockerfile ===\n{dockerfile_content}\n")
        build_logs[build_id]["logs"].append(f"Building {tag}...\n")

        api_client = docker.APIClient(base_url=settings.docker_socket)
        for chunk in api_client.build(path=tmpdir, tag=tag, rm=True, decode=True):
            if "stream" in chunk:
                build_logs[build_id]["logs"].append(chunk["stream"])
            if "error" in chunk:
                build_logs[build_id]["status"] = "error"
                build_logs[build_id]["message"] = chunk["error"]
                return

        build_logs[build_id]["logs"].append(f"\nPushing {tag}...\n")
        for chunk in api_client.push(tag, stream=True, decode=True):
            if "status" in chunk:
                msg = chunk["status"]
                if "progress" in chunk:
                    msg += f" {chunk['progress']}"
                build_logs[build_id]["logs"].append(msg + "\n")
            if "error" in chunk:
                build_logs[build_id]["status"] = "error"
                build_logs[build_id]["message"] = chunk["error"]
                return

        # Kubeflow Notebook 이미지 드롭다운에 자동 등록
        _register_image_to_kubeflow(tag)

        build_logs[build_id]["status"] = "success"
        build_logs[build_id]["message"] = f"Image {tag} built and pushed successfully"
    except Exception as e:
        build_logs[build_id]["status"] = "error"
        build_logs[build_id]["message"] = str(e)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


CM_NAME = "jupyter-web-app-config-b7fd9k5c4d"
CM_NAMESPACE = "kubeflow"


def _get_k8s_clients():
    from kubernetes import client as k8s_client, config as k8s_config
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    return k8s_client.CoreV1Api(), k8s_client.AppsV1Api()


def _restart_jupyter_web_app(apps_v1):
    import datetime
    from kubernetes import client as k8s_client
    apps_v1.patch_namespaced_deployment(
        name="jupyter-web-app-deployment",
        namespace=CM_NAMESPACE,
        body={
            "spec": {"template": {"metadata": {"annotations": {
                "kubectl.kubernetes.io/restartedAt": datetime.datetime.now().isoformat()
            }}}}
        },
    )


def _register_image_to_kubeflow(image_tag: str):
    """빌드된 이미지를 Kubeflow Notebook UI 드롭다운에 자동 등록"""
    try:
        import re
        v1, apps_v1 = _get_k8s_clients()
        cm = v1.read_namespaced_config_map(name=CM_NAME, namespace=CM_NAMESPACE)
        content = cm.data["spawner_ui_config.yaml"]

        if image_tag in content:
            return

        pattern = r"(# the list of available container images in the dropdown\n    options:\n)"
        replacement = rf"\g<1>    - {image_tag}\n"
        new_content = re.sub(pattern, replacement, content)

        if new_content != content:
            cm.data["spawner_ui_config.yaml"] = new_content
            v1.replace_namespaced_config_map(name=CM_NAME, namespace=CM_NAMESPACE, body=cm)
            _restart_jupyter_web_app(apps_v1)
            print(f"[INFO] Registered {image_tag} to Kubeflow Notebook image list")
    except Exception as e:
        print(f"[WARN] Failed to register image to Kubeflow: {e}")


def unregister_image_from_kubeflow(image_name: str, image_tag: str):
    """삭제된 이미지를 Kubeflow Notebook UI 드롭다운에서 제거"""
    try:
        v1, apps_v1 = _get_k8s_clients()
        cm = v1.read_namespaced_config_map(name=CM_NAME, namespace=CM_NAMESPACE)
        content = cm.data["spawner_ui_config.yaml"]

        full_tag = f"{settings.registry_host}/{image_name}:{image_tag}"
        line_to_remove = f"    - {full_tag}\n"

        if line_to_remove in content:
            new_content = content.replace(line_to_remove, "")
            cm.data["spawner_ui_config.yaml"] = new_content
            v1.replace_namespaced_config_map(name=CM_NAME, namespace=CM_NAMESPACE, body=cm)
            _restart_jupyter_web_app(apps_v1)
            print(f"[INFO] Unregistered {full_tag} from Kubeflow Notebook image list")
    except Exception as e:
        print(f"[WARN] Failed to unregister image from Kubeflow: {e}")


def get_build_status(build_id: str) -> dict | None:
    return build_logs.get(build_id)
