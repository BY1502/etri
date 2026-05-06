"""MLflow Model Registry wrapper for 상태 태깅 / 롤백 UI."""
import os
from typing import Any

import httpx

from app.services import tenant_resources

MLFLOW_URI = os.environ.get("MLFLOW_URI", "http://mlflow-service.ray-system:5000")


def _mlflow_uri(namespace: str | None = None) -> str:
    return tenant_resources.mlflow_tracking_uri(namespace) if namespace else MLFLOW_URI


def _get(path: str, params: dict | None = None, namespace: str | None = None) -> dict:
    r = httpx.get(f"{_mlflow_uri(namespace)}{path}", params=params or {}, timeout=15)
    r.raise_for_status()
    return r.json()


def _post(path: str, json: dict, namespace: str | None = None) -> dict:
    r = httpx.post(f"{_mlflow_uri(namespace)}{path}", json=json, timeout=15)
    r.raise_for_status()
    return r.json() if r.content else {}


def _delete(path: str, params: dict, namespace: str | None = None) -> dict:
    r = httpx.request("DELETE", f"{_mlflow_uri(namespace)}{path}", json=params, timeout=15)
    r.raise_for_status()
    return r.json() if r.content else {}


_NS_CACHE = {"list": None, "ts": 0.0}


def _known_namespaces() -> list[str]:
    """실제 존재하는 Kubeflow Profile namespace 목록 (60초 캐시)"""
    import time as _t
    from kubernetes import client, config as kconfig
    now = _t.time()
    if _NS_CACHE["list"] is not None and now - _NS_CACHE["ts"] < 60:
        return _NS_CACHE["list"]
    try:
        kconfig.load_incluster_config()
    except Exception:
        try:
            kconfig.load_kube_config()
        except Exception:
            return []
    try:
        api = client.CustomObjectsApi()
        resp = api.list_cluster_custom_object("kubeflow.org", "v1", "profiles")
        ns_list = [p["metadata"]["name"] for p in resp.get("items", [])]
    except Exception:
        ns_list = []
    # 긴 namespace가 먼저 매칭되도록 정렬 (e.g. kubeflow-user-example-com > kubeflow-user)
    ns_list.sort(key=len, reverse=True)
    _NS_CACHE["list"] = ns_list
    _NS_CACHE["ts"] = now
    return ns_list


def _experiment_name_to_namespace(name: str) -> str | None:
    """'automl-{namespace}-{anything}' 형식이면 namespace 추출. 실제 namespace 목록과 prefix 매칭."""
    if not name or not name.startswith("automl-"):
        return None
    rest = name[len("automl-"):]
    for ns in _known_namespaces():
        if rest == ns or rest.startswith(ns + "-"):
            return ns
    return None


def list_registered_models(namespace_filter: str | list[str] | None = None) -> list[dict]:
    """등록된 모델 목록 + 최신 버전 요약.

    namespace_filter:
      - None: 전체 (admin)
      - str: 해당 ns 소유 모델
      - list[str]: 여러 ns 중 하나라도 소유하면 포함
    """
    if isinstance(namespace_filter, str):
        ns_list = [namespace_filter]
    elif isinstance(namespace_filter, list):
        ns_list = namespace_filter
    else:
        ns_list = tenant_resources.known_profile_namespaces() if tenant_resources.TENANT_RESOURCES_ENABLED else [None]

    out = []
    for target_ns in ns_list:
        try:
            resp = _get(
                "/api/2.0/mlflow/registered-models/search",
                {"max_results": 1000},
                namespace=target_ns,
            )
        except Exception:
            continue
        models = resp.get("registered_models", [])
        for m in models:
            name = m["name"]
            try:
                versions_resp = _get(
                    "/api/2.0/mlflow/model-versions/search",
                    {"filter": f"name='{name}'", "max_results": 100},
                    namespace=target_ns,
                )
            except Exception:
                continue
            versions = versions_resp.get("model_versions", [])

            by_stage: dict[str, list[str]] = {"Production": [], "Staging": [], "Archived": [], "None": []}
            for v in versions:
                stage = v.get("current_stage", "None") or "None"
                by_stage.setdefault(stage, []).append(v["version"])

            owner_ns = target_ns
            if owner_ns is None:
                ns_counter: dict[str, int] = {}
                for v in versions:
                    run_id = v.get("run_id")
                    if not run_id:
                        continue
                    try:
                        run = _get("/api/2.0/mlflow/runs/get", {"run_id": run_id})
                        exp_id = run.get("run", {}).get("info", {}).get("experiment_id")
                        if exp_id:
                            exp = _get("/api/2.0/mlflow/experiments/get", {"experiment_id": exp_id})
                            exp_name = exp.get("experiment", {}).get("name", "")
                            ns = _experiment_name_to_namespace(exp_name)
                            if ns:
                                ns_counter[ns] = ns_counter.get(ns, 0) + 1
                    except Exception:
                        pass
                owner_ns = max(ns_counter, key=ns_counter.get) if ns_counter else None

            out.append({
                "name": name,
                "total_versions": len(versions),
                "latest_version": max((int(v["version"]) for v in versions), default=0),
                "stage_summary": {k: v for k, v in by_stage.items() if v},
                "owner_namespace": owner_ns,
                "creation_timestamp": m.get("creation_timestamp"),
                "last_updated_timestamp": m.get("last_updated_timestamp"),
            })
    out.sort(key=lambda x: (x.get("owner_namespace") or "", x["name"]))
    return out


def get_model_detail(name: str, namespace: str | None = None) -> dict:
    """모델의 모든 버전 + run 메트릭 포함."""
    if tenant_resources.TENANT_RESOURCES_ENABLED and namespace is None:
        namespace = get_model_owner_namespace(name)
    versions_resp = _get(
        "/api/2.0/mlflow/model-versions/search",
        {
            "filter": f"name='{name}'",
            "max_results": 1000,
        },
        namespace=namespace,
    )
    versions = versions_resp.get("model_versions", [])
    result_versions = []
    for v in versions:
        run_id = v.get("run_id")
        metrics = {}
        params = {}
        tags = {}
        exp_name = ""
        # Version tags (MLflow Model Version 자체의 태그 — register 시 심은 automl.job_id 등)
        for t in v.get("tags", []) or []:
            k = t.get("key", "")
            if k:
                tags[k] = t.get("value", "")
        if run_id:
            try:
                run = _get("/api/2.0/mlflow/runs/get", {"run_id": run_id}, namespace=namespace)
                run_data = run.get("run", {}).get("data", {})
                for m in run_data.get("metrics", []):
                    metrics[m["key"]] = m["value"]
                for p in run_data.get("params", []):
                    params[p["key"]] = p["value"]
                # Run tags (Version tags 에 없는 것만 보강)
                for t in run_data.get("tags", []):
                    k = t.get("key", "")
                    if k and not k.startswith("mlflow.") and k not in tags:
                        tags[k] = t.get("value", "")
                exp_id = run.get("run", {}).get("info", {}).get("experiment_id")
                if exp_id:
                    exp = _get("/api/2.0/mlflow/experiments/get", {"experiment_id": exp_id}, namespace=namespace)
                    exp_name = exp.get("experiment", {}).get("name", "")
            except Exception:
                pass
        result_versions.append({
            "version": v["version"],
            "current_stage": v.get("current_stage", "None") or "None",
            "creation_timestamp": v.get("creation_timestamp"),
            "last_updated_timestamp": v.get("last_updated_timestamp"),
            "run_id": run_id,
            "source": v.get("source"),
            "description": v.get("description", ""),
            "metrics": metrics,
            "params": params,
            "tags": tags,
            "experiment_name": exp_name,
        })
    result_versions.sort(key=lambda x: int(x["version"]), reverse=True)
    # owner namespace (가장 빈번한 ns)
    ns_counter: dict[str, int] = {}
    if namespace:
        owner_ns = namespace
    else:
        for v in result_versions:
            ns = _experiment_name_to_namespace(v.get("experiment_name", ""))
            if ns:
                ns_counter[ns] = ns_counter.get(ns, 0) + 1
        owner_ns = max(ns_counter, key=ns_counter.get) if ns_counter else None
    return {
        "name": name,
        "versions": result_versions,
        "owner_namespace": owner_ns,
    }


def set_stage(name: str, version: str, stage: str, archive_existing: bool = True, namespace: str | None = None) -> dict:
    """버전의 stage 변경. stage가 Production이면 기존 Production은 자동 Archived."""
    valid = {"None", "Staging", "Production", "Archived"}
    if stage not in valid:
        raise ValueError(f"invalid stage: {stage}, must be one of {valid}")
    return _post("/api/2.0/mlflow/model-versions/transition-stage", {
        "name": name,
        "version": version,
        "stage": stage,
        "archive_existing_versions": archive_existing,
    }, namespace=namespace)


def find_production_version(name: str, namespace: str | None = None) -> str | None:
    data = get_model_detail(name, namespace=namespace)
    prod = [v for v in data["versions"] if v["current_stage"] == "Production"]
    if not prod:
        return None
    # 여러 개면 가장 최근
    return max(prod, key=lambda v: int(v["version"]))["version"]


def find_previous_production(name: str, namespace: str | None = None) -> str | None:
    """현재 Production을 제외한, Archived 중 가장 최근 버전 (이전 prod)."""
    data = get_model_detail(name, namespace=namespace)
    cur = find_production_version(name, namespace=namespace)
    archived = [v for v in data["versions"] if v["current_stage"] == "Archived"]
    if not archived:
        return None
    archived.sort(key=lambda v: int(v["last_updated_timestamp"] or 0), reverse=True)
    for v in archived:
        if v["version"] != cur:
            return v["version"]
    return None


def rollback(name: str, namespace: str | None = None) -> dict:
    """가장 최근 Archived 버전을 Production으로 복원."""
    prev = find_previous_production(name, namespace=namespace)
    if not prev:
        raise ValueError("롤백할 이전 Production 버전(Archived)이 없습니다")
    return set_stage(name, prev, "Production", archive_existing=True, namespace=namespace)


def update_description(name: str, version: str, description: str, namespace: str | None = None) -> dict:
    return _post("/api/2.0/mlflow/model-versions/update", {
        "name": name,
        "version": version,
        "description": description,
    }, namespace=namespace)


def delete_model(name: str, namespace: str | None = None) -> dict:
    """Registered Model을 완전 삭제.

    제거 범위:
      1. KServe Production ISVC + PVC (`prod-<name>`)
      2. 이 모델의 run_id 로 만들어진 AutoML-style ISVC + PVC
      3. MLflow Model Versions + Registered Model
      4. 연관된 MLflow Run (soft delete)

    returns 요약 dict
    """
    # 0) 사전 정보 수집 (삭제 전에 run_id/namespace 수집)
    data = get_model_detail(name, namespace=namespace)
    versions = data.get("versions", [])
    run_ids = [v.get("run_id") for v in versions if v.get("run_id")]
    owner_ns = None
    ns_counter: dict[str, int] = {}
    for v in versions:
        ns = _experiment_name_to_namespace(v.get("experiment_name", ""))
        if ns:
            ns_counter[ns] = ns_counter.get(ns, 0) + 1
    if namespace:
        owner_ns = namespace
    elif ns_counter:
        owner_ns = max(ns_counter, key=ns_counter.get)

    isvc_deleted: list[str] = []
    pvc_deleted: list[str] = []
    runs_deleted: list[str] = []

    # 1) Production ISVC + PVC 제거
    if owner_ns:
        try:
            from app.services import production_deploy_service as prod
            r = prod.undeploy_production(name, owner_ns)
            if r.get("isvc_deleted"):
                isvc_deleted.append(f"{owner_ns}/{r.get('isvc_name')}")
            if r.get("pvc_deleted"):
                pvc_deleted.append(f"{owner_ns}/{r.get('pvc_name')}")
        except Exception as e:
            print(f"[registry] undeploy_production failed: {e}", flush=True)

    # 2) AutoML-style ISVC 제거 (모든 kubeflow-* namespace 스캔)
    # 이유: 서빙을 다른 사용자(예: admin)가 트리거하면 ISVC 가 트리거한 사용자 ns 에 생성되어
    # owner_ns(= experiment ns) 와 달라질 수 있음. 따라서 전역 스캔 필요.
    model_job_ids = {
        (v.get("tags") or {}).get("automl.job_id")
        for v in versions
        if (v.get("tags") or {}).get("automl.job_id")
    }
    if model_job_ids:
        try:
            from kubernetes import client, config as kconfig
            try:
                kconfig.load_incluster_config()
            except Exception:
                kconfig.load_kube_config()
            core_v1 = client.CoreV1Api()
            custom_api = client.CustomObjectsApi()
            # kubeflow-* namespace 전체 스캔
            ns_list = [
                ns.metadata.name
                for ns in core_v1.list_namespace().items
                if ns.metadata.name.startswith("kubeflow-")
            ]
            for scan_ns in ns_list:
                try:
                    isvcs = custom_api.list_namespaced_custom_object(
                        "serving.kserve.io", "v1beta1", scan_ns, "inferenceservices"
                    )
                except Exception:
                    continue
                for isvc in isvcs.get("items", []):
                    annos = (isvc.get("metadata", {}).get("annotations") or {})
                    isvc_name = isvc["metadata"]["name"]
                    # automl.job_id annotation 매칭만으로 판단 (이름은 사용자 입력일 수 있음)
                    if annos.get("automl.job_id") not in model_job_ids:
                        continue
                    try:
                        custom_api.delete_namespaced_custom_object(
                            "serving.kserve.io", "v1beta1", scan_ns, "inferenceservices", isvc_name
                        )
                        isvc_deleted.append(f"{scan_ns}/{isvc_name}")
                    except Exception:
                        pass
                    # 관련 helper pod 제거 (성공/실패 무관 — 모델 삭제 시점에는 필요 없음, PVC unmount 위해 필수)
                    helper_name = f"{isvc_name}-copy"[:63]
                    try:
                        core_v1.delete_namespaced_pod(
                            helper_name, scan_ns,
                            body=client.V1DeleteOptions(grace_period_seconds=0),
                        )
                    except Exception:
                        pass
                    # 관련 PVC 제거
                    pvc_candidate = f"{isvc_name}-pvc"[:60]
                    try:
                        core_v1.delete_namespaced_persistent_volume_claim(pvc_candidate, scan_ns)
                        pvc_deleted.append(f"{scan_ns}/{pvc_candidate}")
                    except Exception:
                        pass
        except Exception as e:
            print(f"[registry] automl isvc cleanup failed: {e}", flush=True)

    # 3) MLflow Model Versions 삭제
    for v in versions:
        try:
            _delete("/api/2.0/mlflow/model-versions/delete", {
                "name": name, "version": v["version"]
            }, namespace=owner_ns)
        except Exception as e:
            print(f"[registry] delete version {v['version']} failed: {e}", flush=True)

    # 4) Registered Model 삭제
    try:
        _delete("/api/2.0/mlflow/registered-models/delete", {"name": name}, namespace=owner_ns)
    except Exception as e:
        print(f"[registry] delete registered model failed: {e}", flush=True)

    # 5) 연관 Run 삭제 (soft + hard)
    # 5-1) Artifact 디렉토리 path 사전 수집 (soft delete 후엔 artifact_uri 조회 가능하나
    #      안전하게 삭제 전에 모아둠)
    run_artifact_paths: list[str] = []
    for rid in run_ids:
        try:
            r = _get("/api/2.0/mlflow/runs/get", {"run_id": rid}, namespace=owner_ns)
            uri = r.get("run", {}).get("info", {}).get("artifact_uri", "")
            if uri.startswith("mlflow-artifacts:/"):
                rel = uri.replace("mlflow-artifacts:/", "")
                # 실제 파일시스템 경로 = MLflow PVC의 /mlflow/mlartifacts/<rel>
                run_artifact_paths.append(rel)
        except Exception:
            pass

    # 5-2) MLflow Soft delete
    for rid in run_ids:
        try:
            _post("/api/2.0/mlflow/runs/delete", {"run_id": rid}, namespace=owner_ns)
            runs_deleted.append(rid)
        except Exception as e:
            print(f"[registry] delete run {rid} failed: {e}", flush=True)

    # 5-3) Artifact 파일 실제 제거 (MLflow pod exec)
    artifacts_purged: list[str] = []
    if run_artifact_paths:
        try:
            from kubernetes import client, config as kconfig
            from kubernetes.stream import stream
            try:
                kconfig.load_incluster_config()
            except Exception:
                kconfig.load_kube_config()
            core_v1 = client.CoreV1Api()
            mlflow_ref = tenant_resources.find_mlflow_pod(core_v1, owner_ns)
            if mlflow_ref:
                mlflow_ns, mlflow_pod = mlflow_ref
                # 각 artifact 경로 rm -rf
                for rel in run_artifact_paths:
                    # path traversal 방지: 단순화된 경로만 허용
                    if ".." in rel or rel.startswith("/"):
                        continue
                    target = f"/mlflow/mlartifacts/{rel}"
                    try:
                        stream(
                            core_v1.connect_get_namespaced_pod_exec,
                            mlflow_pod, mlflow_ns,
                            command=["sh", "-c", f"rm -rf {target}"],
                            stderr=True, stdin=False, stdout=True, tty=False,
                        )
                        artifacts_purged.append(rel)
                    except Exception as e:
                        print(f"[registry] rm {target} failed: {e}", flush=True)
                # 5-4) mlflow gc 로 DB tombstone 레코드까지 제거 (older_than 0 일)
                try:
                    run_args = " ".join(run_ids)
                    stream(
                        core_v1.connect_get_namespaced_pod_exec,
                        mlflow_pod, mlflow_ns,
                        command=["sh", "-c",
                                 "mlflow gc "
                                 "--backend-store-uri sqlite:////mlflow/mlflow.db "
                                 "--artifacts-destination file:///mlflow/mlartifacts "
                                 "--older-than 0d0h0m0s "
                                 f"--run-ids {run_args} || true"],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    )
                except Exception as e:
                    print(f"[registry] mlflow gc failed: {e}", flush=True)
        except Exception as e:
            print(f"[registry] artifact hard-delete failed: {e}", flush=True)

    return {
        "name": name,
        "versions_deleted": len(versions),
        "isvc_deleted": isvc_deleted,
        "pvc_deleted": pvc_deleted,
        "runs_deleted": runs_deleted,
        "artifacts_purged": artifacts_purged,
    }


def get_model_owner_namespace(name: str, namespace: str | None = None) -> str | None:
    """해당 모델의 소유 namespace 반환."""
    if namespace:
        try:
            resp = _get(
                "/api/2.0/mlflow/model-versions/search",
                {"filter": f"name='{name}'", "max_results": 1},
                namespace=namespace,
            )
            if resp.get("model_versions"):
                return namespace
        except Exception:
            return None
    if tenant_resources.TENANT_RESOURCES_ENABLED:
        for ns in tenant_resources.known_profile_namespaces():
            found = get_model_owner_namespace(name, namespace=ns)
            if found:
                return found
        return None
    data = get_model_detail(name)
    ns_counter: dict[str, int] = {}
    for v in data.get("versions", []):
        exp_name = v.get("experiment_name", "")
        ns = _experiment_name_to_namespace(exp_name)
        if ns:
            ns_counter[ns] = ns_counter.get(ns, 0) + 1
    return max(ns_counter, key=ns_counter.get) if ns_counter else None


def get_version_info(name: str, version: str, namespace: str | None = None) -> dict:
    """특정 버전 상세 (run_id, source, experiment 포함)"""
    data = get_model_detail(name, namespace=namespace)
    for v in data["versions"]:
        if v["version"] == str(version):
            return v
    raise ValueError(f"version {version} not found for {name}")


def download_version_zip(name: str, version: str, namespace: str | None = None) -> tuple[str, str, str]:
    """모델 버전의 artifact 전체를 디스크에 zip으로 생성.

    메모리 스파이크 방지를 위해 디스크 기반. 호출자가 스트리밍으로 내려준 뒤
    반환된 `cleanup_dir`을 삭제해야 함 (FileResponse + BackgroundTask 권장).

    Returns:
        (zip_path, filename, cleanup_dir)
    """
    import os as _os
    import shutil
    import tempfile
    import zipfile

    import mlflow

    # MLflow의 artifact URI 조회
    v_resp = _get("/api/2.0/mlflow/model-versions/get", {
        "name": name,
        "version": str(version),
    }, namespace=namespace)
    source = v_resp.get("model_version", {}).get("source", "")
    if not source:
        raise ValueError(f"model version source 조회 실패: {name} v{version}")

    mlflow.set_tracking_uri(_mlflow_uri(namespace))
    tmp_dir = tempfile.mkdtemp(prefix="mdl-dl-")
    try:
        local_path = mlflow.artifacts.download_artifacts(
            artifact_uri=source,
            dst_path=tmp_dir,
        )
        safe_name = name.replace("/", "_")
        filename = f"{safe_name}-v{version}.zip"
        zip_path = _os.path.join(tmp_dir, f"__{filename}")  # artifact 폴더와 충돌 피함
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            if _os.path.isdir(local_path):
                for root, _dirs, files in _os.walk(local_path):
                    for f in files:
                        abs_p = _os.path.join(root, f)
                        rel_p = _os.path.relpath(abs_p, local_path)
                        zf.write(abs_p, rel_p)
            else:
                zf.write(local_path, _os.path.basename(local_path))
        return zip_path, filename, tmp_dir
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
