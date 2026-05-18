"""MLflow Model Registry wrapper for 상태 태깅 / 롤백 UI."""
import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from app.services import tenant_resources
from app.services import model_repository_service as model_repo

MLFLOW_URI = os.environ.get("MLFLOW_URI", "http://mlflow-service.ray-system:5000")
OPERATION_TAG_KEY = "ops.tags"
OPERATION_TAG_UPDATED_AT_KEY = "ops.updated_at"
OPERATION_TAG_UPDATED_BY_KEY = "ops.updated_by"
LIFECYCLE_STATUS_OPTIONS = [
    {"value": "none", "label": "미지정"},
    {"value": "candidate", "label": "후보"},
    {"value": "staging", "label": "검증"},
    {"value": "best", "label": "최적"},
    {"value": "production", "label": "운영"},
    {"value": "archived", "label": "보관"},
    {"value": "deprecated", "label": "폐기 예정"},
]
OPERATION_TAG_OPTIONS = [
    {"value": "candidate", "label": "후보"},
    {"value": "best", "label": "최적"},
    {"value": "stable", "label": "안정"},
    {"value": "shadow", "label": "섀도우"},
    {"value": "deprecated", "label": "폐기 예정"},
]
EXCLUSIVE_OPERATION_TAGS = {"best"}
RESERVED_OPERATION_TAGS = {
    "none",
    "staging",
    "stage",
    "production",
    "prod",
    "archived",
    "archive",
    "미지정",
    "검증",
    "운영",
    "보관",
}
_OPERATION_TAG_ALIASES = {
    "best": "best",
    "최적": "best",
    "candidate": "candidate",
    "후보": "candidate",
    "stable": "stable",
    "안정": "stable",
    "shadow": "shadow",
    "섀도우": "shadow",
    "deprecated": "deprecated",
    "폐기": "deprecated",
}
_OPERATION_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,39}$")
_STATUS_ALIASES = {
    "": "none",
    "none": "none",
    "unassigned": "none",
    "미지정": "none",
    "candidate": "candidate",
    "후보": "candidate",
    "staging": "staging",
    "stage": "staging",
    "검증": "staging",
    "best": "best",
    "최적": "best",
    "production": "production",
    "prod": "production",
    "운영": "production",
    "archived": "archived",
    "archive": "archived",
    "보관": "archived",
    "deprecated": "deprecated",
    "폐기": "deprecated",
    "폐기 예정": "deprecated",
}
_STATUS_TO_STAGE = {
    "none": "None",
    "staging": "Staging",
    "production": "Production",
    "archived": "Archived",
}
_STATUS_TO_OPERATION_TAG = {
    "candidate": "candidate",
    "best": "best",
    "deprecated": "deprecated",
}


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
_MODEL_SCHEMA_CACHE: dict[tuple[str | None, str], dict | None] = {}


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
    """'{source}-{namespace}-{anything}' 형식이면 namespace 추출."""
    if not name:
        return None
    rest = ""
    for prefix in ("automl-", "pipeline-", "models-"):
        if name.startswith(prefix):
            rest = name[len(prefix):]
            break
    if not rest:
        return None
    for ns in _known_namespaces():
        if rest == ns or rest.startswith(ns + "-"):
            return ns
    return None


def _tags_from_list(raw_tags: list[dict] | None) -> dict[str, str]:
    return {
        str(t.get("key")): "" if t.get("value") is None else str(t.get("value"))
        for t in (raw_tags or [])
        if t.get("key")
    }


def _run_summary(run_id: str | None, namespace: str | None = None) -> dict:
    if not run_id:
        return {"tags": {}, "metrics": {}}
    try:
        run = _get("/api/2.0/mlflow/runs/get", {"run_id": run_id}, namespace=namespace)
        data = run.get("run", {}).get("data", {})
        tags = {
            t.get("key"): t.get("value")
            for t in data.get("tags", [])
            if t.get("key") and not str(t.get("key")).startswith("mlflow.")
        }
        metrics = {
            m.get("key"): m.get("value")
            for m in data.get("metrics", [])
            if m.get("key")
        }
        return {"tags": tags, "metrics": metrics}
    except Exception:
        return {"tags": {}, "metrics": {}}


def _norm_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _sort_unique(values) -> list[str]:
    return sorted({str(v) for v in values if v not in (None, "")}, key=lambda x: x.lower())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_operation_tags(tags: list[str] | str | None) -> list[str]:
    if isinstance(tags, str):
        raw = tags.split(",")
    else:
        raw = tags or []
    out = []
    for value in raw:
        text = str(value or "").strip().lower()
        if not text:
            continue
        text = _OPERATION_TAG_ALIASES.get(text, text)
        if text in RESERVED_OPERATION_TAGS:
            raise ValueError(f"stage와 겹치는 운영 태그는 사용할 수 없습니다: {value}")
        if not _OPERATION_TAG_RE.match(text):
            raise ValueError(f"invalid operation tag: {value}")
        if text not in out:
            out.append(text)
    return sorted(out)


def operation_tags_from_tags(tags: dict[str, Any] | None) -> list[str]:
    if not tags:
        return []
    out = []
    for value in str(tags.get(OPERATION_TAG_KEY) or "").split(","):
        try:
            normalized = normalize_operation_tags([value])
        except ValueError:
            continue
        for tag in normalized:
            if tag not in out:
                out.append(tag)
    return sorted(out)


def operation_tag_options() -> list[dict]:
    return [
        {**item, "exclusive": item["value"] in EXCLUSIVE_OPERATION_TAGS}
        for item in OPERATION_TAG_OPTIONS
    ]


def lifecycle_status_options() -> list[dict]:
    return list(LIFECYCLE_STATUS_OPTIONS)


def normalize_lifecycle_status(status: str | None) -> str:
    normalized = _STATUS_ALIASES.get(_norm_text(status), _norm_text(status))
    valid = {item["value"] for item in LIFECYCLE_STATUS_OPTIONS}
    if normalized not in valid:
        raise ValueError(f"invalid lifecycle status: {status}")
    return normalized


def lifecycle_status_from_parts(stage: str | None, operation_tags: list[str] | None = None) -> str:
    stage = stage or "None"
    if stage == "Production":
        return "production"
    if stage == "Staging":
        return "staging"
    if stage == "Archived":
        return "archived"
    tags = set(operation_tags or [])
    for status in ("deprecated", "best", "candidate"):
        if status in tags:
            return status
    return "none"


def lifecycle_status_from_version(version: dict) -> str:
    return lifecycle_status_from_parts(
        version.get("current_stage"),
        version.get("operation_tags") or operation_tags_from_tags(version.get("tags") or {}),
    )


def model_status_from_statuses(statuses: set[str], latest_status: str | None = None) -> str:
    """Return the model-level summary status for list views.

    A registered model can have multiple version statuses. For the model list,
    active operational states should be visible even when the newest version is
    still unassigned.
    """
    for status in ("production", "staging", "best"):
        if status in statuses:
            return status
    latest = normalize_lifecycle_status(latest_status or "none")
    if latest != "none":
        return latest
    for status in ("candidate", "deprecated", "archived"):
        if status in statuses:
            return status
    return "none"


def _schema_datatype(mlflow_type: str | None) -> str:
    t = _norm_text(mlflow_type)
    if t in {"double", "float64"}:
        return "FP64"
    if t in {"float", "float32"}:
        return "FP32"
    if t in {"integer", "int", "int32"}:
        return "INT32"
    if t in {"long", "int64"}:
        return "INT64"
    if t in {"boolean", "bool"}:
        return "BOOL"
    if t in {"string", "str"}:
        return "BYTES"
    return "FP64"


def _schema_default_value(datatype: str) -> Any:
    if datatype in {"FP64", "FP32"}:
        return 0.0
    if datatype in {"INT64", "INT32"}:
        return 0
    if datatype == "BOOL":
        return False
    if datatype == "BYTES":
        return ""
    return 0.0


def _input_schema_from_source(source: str | None, namespace: str | None = None) -> dict | None:
    """Read MLflow model signature and build a KServe v2 sample payload."""
    if not source:
        return None
    cache_key = (namespace, source)
    if cache_key in _MODEL_SCHEMA_CACHE:
        return _MODEL_SCHEMA_CACHE[cache_key]
    try:
        import json as _json
        import os as _os
        import mlflow as _mlflow
        import yaml as _yaml

        _mlflow.set_tracking_uri(_mlflow_uri(namespace))
        local = _mlflow.artifacts.download_artifacts(artifact_uri=source)
        mlmodel_path = _os.path.join(local, "MLmodel")
        if not _os.path.isfile(mlmodel_path):
            _MODEL_SCHEMA_CACHE[cache_key] = None
            return None
        with open(mlmodel_path, encoding="utf-8") as f:
            spec = _yaml.safe_load(f) or {}
        raw_inputs = (spec.get("signature") or {}).get("inputs")
        if isinstance(raw_inputs, str):
            inputs = _json.loads(raw_inputs)
        elif isinstance(raw_inputs, list):
            inputs = raw_inputs
        else:
            inputs = []
        columns = []
        kserve_inputs = []
        for item in inputs:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not name:
                continue
            datatype = _schema_datatype(item.get("type"))
            columns.append({
                "name": name,
                "type": item.get("type") or "",
                "required": item.get("required", True),
                "datatype": datatype,
            })
            kserve_inputs.append({
                "name": name,
                "shape": [1],
                "datatype": datatype,
                "data": [_schema_default_value(datatype)],
            })
        result = {
            "columns": columns,
            "serving_payload": {"inputs": kserve_inputs} if kserve_inputs else None,
        } if columns else None
    except Exception as e:
        print(f"[registry] input schema read failed for {source}: {e}", flush=True)
        result = None
    _MODEL_SCHEMA_CACHE[cache_key] = result
    return result


def _set_model_version_tags(
    name: str,
    version: str | int,
    tags: dict[str, Any],
    namespace: str | None = None,
) -> None:
    for key, value in tags.items():
        _post(
            "/api/2.0/mlflow/model-versions/set-tag",
            {
                "name": name,
                "version": str(version),
                "key": key,
                "value": "" if value is None else str(value),
            },
            namespace=namespace,
        )


def _version_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _stage_filter_value(value: str | None) -> str:
    text = _norm_text(value)
    aliases = {
        "production": "Production",
        "prod": "Production",
        "운영": "Production",
        "staging": "Staging",
        "stage": "Staging",
        "검증": "Staging",
        "archived": "Archived",
        "archive": "Archived",
        "보관": "Archived",
        "none": "None",
        "unassigned": "None",
        "미지정": "None",
    }
    return aliases.get(text, value or "")


def _tag_summary_matches(
    tag_summary: dict[str, list[str]],
    *,
    tag: str | None = None,
    tag_key: str | None = None,
    tag_value: str | None = None,
) -> bool:
    if tag_key:
        key_l = _norm_text(tag_key)
        matched_keys = [k for k in tag_summary if _norm_text(k) == key_l]
        if not matched_keys:
            return False
        if tag_value:
            val_l = _norm_text(tag_value)
            return any(
                val_l in _norm_text(v)
                for k in matched_keys
                for v in tag_summary.get(k, [])
            )
        return True
    if tag_value:
        val_l = _norm_text(tag_value)
        return any(
            val_l in _norm_text(v)
            for values in tag_summary.values()
            for v in values
        )
    if not tag:
        return True
    tokens = [t.strip() for t in str(tag).split(",") if t.strip()]
    for token in tokens:
        if "=" in token:
            key, val = [p.strip() for p in token.split("=", 1)]
            if not _tag_summary_matches(tag_summary, tag_key=key, tag_value=val):
                return False
            continue
        token_l = _norm_text(token)
        if not any(
            token_l in _norm_text(k) or any(token_l in _norm_text(v) for v in values)
            for k, values in tag_summary.items()
        ):
            return False
    return True


def _model_matches_filters(model: dict, filters: dict[str, str | None]) -> bool:
    query = filters.get("query")
    if query:
        q = _norm_text(query)
        searchable = [
            model.get("name"),
            model.get("owner_namespace"),
            model.get("project"),
            model.get("latest_framework"),
            model.get("latest_dataset_id"),
            model.get("latest_task"),
            *(model.get("frameworks") or []),
            *(model.get("datasets") or []),
            *(model.get("tasks") or []),
            *(model.get("operation_tags") or []),
            *(model.get("latest_operation_tags") or []),
            *(model.get("lifecycle_statuses") or []),
            model.get("latest_status"),
            model.get("latest_lifecycle_status"),
        ]
        for key, values in (model.get("tag_summary") or {}).items():
            searchable.append(key)
            searchable.extend(values)
        if not any(q in _norm_text(v) for v in searchable):
            return False

    project = filters.get("project")
    if project:
        p = _norm_text(project)
        if p not in {_norm_text(model.get("project")), _norm_text(model.get("owner_namespace"))}:
            return False

    stage = _stage_filter_value(filters.get("stage"))
    if stage and _norm_text(stage) not in {"all", "전체"}:
        if not (model.get("stage_summary") or {}).get(stage):
            return False

    status = filters.get("status")
    if status:
        try:
            normalized_status = normalize_lifecycle_status(status)
        except ValueError:
            return False
        if normalized_status not in set(model.get("lifecycle_statuses") or []):
            return False

    framework = filters.get("framework")
    if framework:
        fw = _norm_text(framework)
        if fw not in {_norm_text(v) for v in (model.get("frameworks") or [])}:
            return False

    dataset = filters.get("dataset")
    if dataset:
        ds = _norm_text(dataset)
        if not any(ds in _norm_text(v) for v in (model.get("datasets") or [])):
            return False

    task = filters.get("task")
    if task:
        tk = _norm_text(task)
        if tk not in {_norm_text(v) for v in (model.get("tasks") or [])}:
            return False

    if not _tag_summary_matches(
        model.get("tag_summary") or {},
        tag=filters.get("tag"),
        tag_key=filters.get("tag_key"),
        tag_value=filters.get("tag_value"),
    ):
        return False

    return True


def _sort_models(models: list[dict], sort: str | None, order: str | None) -> list[dict]:
    reverse = _norm_text(order) == "desc"
    sort_key = _norm_text(sort or "name")
    if sort_key in {"latest_version", "version"}:
        key_fn = lambda x: _version_int(x.get("latest_version"))
    elif sort_key in {"updated", "last_updated", "last_updated_timestamp"}:
        key_fn = lambda x: _version_int(x.get("last_updated_timestamp"))
    elif sort_key in {"created", "creation_timestamp"}:
        key_fn = lambda x: _version_int(x.get("creation_timestamp"))
    elif sort_key in {"project", "namespace"}:
        key_fn = lambda x: (_norm_text(x.get("project")), _norm_text(x.get("name")))
    else:
        key_fn = lambda x: (_norm_text(x.get("owner_namespace")), _norm_text(x.get("name")))
    return sorted(models, key=key_fn, reverse=reverse)


def list_registered_models(
    namespace_filter: str | list[str] | None = None,
    *,
    query: str | None = None,
    project: str | None = None,
    stage: str | None = None,
    status: str | None = None,
    framework: str | None = None,
    dataset: str | None = None,
    task: str | None = None,
    tag: str | None = None,
    tag_key: str | None = None,
    tag_value: str | None = None,
    sort: str | None = "name",
    order: str | None = "asc",
) -> list[dict]:
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

    filters = {
        "query": query,
        "project": project,
        "stage": stage,
        "status": status,
        "framework": framework,
        "dataset": dataset,
        "task": task,
        "tag": tag,
        "tag_key": tag_key,
        "tag_value": tag_value,
    }
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
            tag_values: dict[str, set[str]] = {}
            frameworks: set[str] = set()
            datasets: set[str] = set()
            tasks: set[str] = set()
            operation_tags: set[str] = set()
            lifecycle_statuses: set[str] = set()
            latest_tags: dict[str, str] = {}
            latest_metrics: dict[str, Any] = {}
            latest_operation_tags: list[str] = []
            latest_status = "none"
            latest_version_num = -1
            model_tags = _tags_from_list(m.get("tags") or [])
            for k, val in model_tags.items():
                if val not in (None, ""):
                    tag_values.setdefault(k, set()).add(str(val))
            for v in versions:
                stage = v.get("current_stage", "None") or "None"
                by_stage.setdefault(stage, []).append(v["version"])
                version_tags = _tags_from_list(v.get("tags") or [])
                run_summary = _run_summary(v.get("run_id"), namespace=target_ns)
                tags = dict(version_tags)
                for key, val in run_summary.get("tags", {}).items():
                    if key and key not in tags:
                        tags[key] = val

                for k, val in tags.items():
                    if val not in (None, ""):
                        tag_values.setdefault(k, set()).add(str(val))
                if tags.get("framework"):
                    frameworks.add(str(tags["framework"]))
                if tags.get("dataset.id"):
                    datasets.add(str(tags["dataset.id"]))
                if tags.get("dataset.target"):
                    datasets.add(str(tags["dataset.target"]))
                if tags.get("automl.task"):
                    tasks.add(str(tags["automl.task"]))
                op_tags = operation_tags_from_tags(tags)
                lifecycle_statuses.add(lifecycle_status_from_parts(stage, op_tags))
                for op_tag in op_tags:
                    operation_tags.add(op_tag)

                version_num = _version_int(v.get("version"))
                if version_num > latest_version_num:
                    latest_version_num = version_num
                    latest_tags = tags
                    latest_metrics = run_summary.get("metrics", {}) or {}
                    latest_operation_tags = op_tags
                    latest_status = lifecycle_status_from_parts(stage, op_tags)

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

            tag_summary = {k: _sort_unique(vals) for k, vals in tag_values.items()}
            model_status = model_status_from_statuses(lifecycle_statuses, latest_status)
            model = {
                "name": name,
                "total_versions": len(versions),
                "latest_version": max((_version_int(v.get("version")) for v in versions), default=0),
                "stage_summary": {k: v for k, v in by_stage.items() if v},
                "owner_namespace": owner_ns,
                "project": owner_ns,
                "frameworks": _sort_unique(frameworks),
                "datasets": _sort_unique(datasets),
                "tasks": _sort_unique(tasks),
                "operation_tags": _sort_unique(operation_tags),
                "latest_operation_tags": latest_operation_tags,
                "lifecycle_statuses": _sort_unique(lifecycle_statuses),
                "model_status": model_status,
                "status": model_status,
                "latest_status": latest_status,
                "latest_lifecycle_status": latest_status,
                "latest_framework": latest_tags.get("framework", ""),
                "latest_dataset_id": latest_tags.get("dataset.id", ""),
                "latest_task": latest_tags.get("automl.task", ""),
                "created_by": latest_tags.get("created_by") or latest_tags.get("converted_by") or "",
                "tags": latest_tags,
                "tag_summary": tag_summary,
                "latest_metrics": latest_metrics,
                "creation_timestamp": m.get("creation_timestamp"),
                "last_updated_timestamp": m.get("last_updated_timestamp"),
            }
            if _model_matches_filters(model, filters):
                out.append(model)
    return _sort_models(out, sort, order)


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
            "operation_tags": operation_tags_from_tags(tags),
            "repository": model_repo.repository_info_from_tags(tags),
            "input_schema": _input_schema_from_source(v.get("source"), namespace=namespace),
            "experiment_name": exp_name,
        })
        result_versions[-1]["status"] = lifecycle_status_from_version(result_versions[-1])
        result_versions[-1]["lifecycle_status"] = result_versions[-1]["status"]
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
    archive_active_existing = bool(archive_existing and stage in {"Staging", "Production"})
    return _post("/api/2.0/mlflow/model-versions/transition-stage", {
        "name": name,
        "version": version,
        "stage": stage,
        "archive_existing_versions": archive_active_existing,
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


def set_operation_tags(
    name: str,
    version: str,
    tags: list[str] | str | None,
    *,
    updated_by: str = "",
    namespace: str | None = None,
) -> dict:
    """Set operational tags on one model version.

    Tags are stored as MLflow model version tags under `ops.*`. `best` and
    `production` are exclusive within the same registered model.
    """
    target_tags = normalize_operation_tags(tags)
    detail = get_model_detail(name, namespace=namespace)
    target = None
    for v in detail.get("versions", []):
        if str(v.get("version")) == str(version):
            target = v
            break
    if not target:
        raise ValueError(f"version {version} not found for {name}")

    touched = []
    now = _now_iso()
    exclusive_to_move = set(target_tags).intersection(EXCLUSIVE_OPERATION_TAGS)
    if exclusive_to_move:
        for v in detail.get("versions", []):
            other_version = str(v.get("version"))
            if other_version == str(version):
                continue
            other_tags = operation_tags_from_tags(v.get("tags") or {})
            next_other = [t for t in other_tags if t not in exclusive_to_move]
            if next_other == other_tags:
                continue
            _set_model_version_tags(
                name,
                other_version,
                {
                    OPERATION_TAG_KEY: ",".join(next_other),
                    OPERATION_TAG_UPDATED_AT_KEY: now,
                    OPERATION_TAG_UPDATED_BY_KEY: updated_by,
                },
                namespace=namespace,
            )
            touched.append({"version": other_version, "operation_tags": next_other})

    _set_model_version_tags(
        name,
        version,
        {
            OPERATION_TAG_KEY: ",".join(target_tags),
            OPERATION_TAG_UPDATED_AT_KEY: now,
            OPERATION_TAG_UPDATED_BY_KEY: updated_by,
        },
        namespace=namespace,
    )
    return {
        "name": name,
        "version": str(version),
        "operation_tags": target_tags,
        "exclusive_tags": sorted(exclusive_to_move),
        "updated_by": updated_by,
        "updated_at": now,
        "touched_versions": touched,
    }


def set_lifecycle_status(
    name: str,
    version: str,
    status: str,
    *,
    updated_by: str = "",
    namespace: str | None = None,
) -> dict:
    """Set one user-facing lifecycle status.

    The public status is single-valued. Internally, MLflow stages are still used
    for Staging/Production/Archived compatibility, while candidate/best/
    deprecated are stored as operation tags.
    """
    normalized = normalize_lifecycle_status(status)
    if normalized == "production":
        raise ValueError("production status must be applied through deployment")

    if normalized in _STATUS_TO_STAGE:
        stage = _STATUS_TO_STAGE[normalized]
        set_stage(name, version, stage, archive_existing=True, namespace=namespace)
        tags_result = set_operation_tags(
            name,
            version,
            [],
            updated_by=updated_by,
            namespace=namespace,
        )
    else:
        set_stage(name, version, "None", archive_existing=False, namespace=namespace)
        tags_result = set_operation_tags(
            name,
            version,
            [_STATUS_TO_OPERATION_TAG[normalized]],
            updated_by=updated_by,
            namespace=namespace,
        )

    return {
        "name": name,
        "version": str(version),
        "lifecycle_status": normalized,
        "status": normalized,
        "operation_tags": tags_result.get("operation_tags", []),
        "touched_versions": tags_result.get("touched_versions", []),
    }


def delete_model_version(name: str, version: str, namespace: str | None = None, *, force: bool = False) -> dict:
    """모델의 특정 버전만 삭제.

    기본 동작: Version 자체 및 연결된 저장소 경로만 제거.
    운영 상태(Production) 버전은 기본 삭제를 거부하며, force=true 일 때만
    운영 배포 ISVC/PVC를 선제 제거하고 MLflow Registry 버전을 삭제한다.
    """
    data = get_model_detail(name, namespace=namespace)
    versions = data.get("versions", [])
    target = None
    for v in versions:
        if str(v.get("version")) == str(version):
            target = v
            break
    if target is None:
        raise ValueError(f"version {version} not found for {name}")

    current_stage = target.get("current_stage") or "None"
    if current_stage == "Production" and not force:
        raise ValueError(
            "현재 운영(Production) 버전은 삭제할 수 없습니다. "
            "운영 중단 후 다시 시도하거나 force=true로 호출하세요."
        )

    if current_stage == "Production" and force:
        if not namespace:
            raise ValueError("운영(Production) 버전 삭제를 위해 namespace가 필요합니다.")
        try:
            from app.services import production_deploy_service as prod

            prod.undeploy_production(name, namespace)
        except Exception as e:
            raise RuntimeError(f"운영 배포 제거 후 삭제할 수 없습니다: {e}")

    repository_purged = model_repo.delete_repository_paths([target])

    _delete(
        "/api/2.0/mlflow/model-versions/delete",
        {"name": name, "version": str(version)},
        namespace=namespace,
    )

    return {
        "name": name,
        "version": str(version),
        "deleted": 1,
        "status": "ok",
        "repository_purged": repository_purged,
    }


def delete_model(name: str, namespace: str | None = None) -> dict:
    """Registered Model을 완전 삭제.

    제거 범위:
      1. KServe Production ISVC + PVC (`prod-<name>`)
      2. 이 모델의 run_id 로 만들어진 AutoML-style ISVC + PVC
      3. MLflow Model Versions + Registered Model
      4. 연관된 MLflow Run (AutoML 원본 run은 AutoML Job이 소유하므로 제외)

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
    repository_purged = model_repo.delete_repository_paths(versions)

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
    run_ids_to_purge: list[str] = []
    runs_preserved: list[str] = []
    for rid in run_ids:
        try:
            r = _get("/api/2.0/mlflow/runs/get", {"run_id": rid}, namespace=owner_ns)
            tags = {
                t.get("key"): t.get("value")
                for t in (r.get("run", {}).get("data", {}).get("tags") or [])
                if t.get("key")
            }
            if tags.get("automl.job_id"):
                runs_preserved.append(rid)
                continue
            run_ids_to_purge.append(rid)
            uri = r.get("run", {}).get("info", {}).get("artifact_uri", "")
            if uri.startswith("mlflow-artifacts:/"):
                rel = uri.replace("mlflow-artifacts:/", "")
                # 실제 파일시스템 경로 = MLflow PVC의 /mlflow/mlartifacts/<rel>
                run_artifact_paths.append(rel)
        except Exception:
            pass

    # 5-2) MLflow Soft delete
    for rid in run_ids_to_purge:
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
                    run_args = " ".join(run_ids_to_purge)
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
        "runs_preserved": runs_preserved,
        "artifacts_purged": artifacts_purged,
        "repository_purged": repository_purged,
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
    from pathlib import Path as _Path

    import mlflow

    info = get_version_info(name, version, namespace=namespace)
    repo = info.get("repository") or {}
    repo_path_text = repo.get("path")
    if repo.get("exists") and repo_path_text:
        repo_path = _Path(repo_path_text)
        tmp_dir = tempfile.mkdtemp(prefix="mdl-repo-dl-")
        try:
            safe_name = name.replace("/", "_")
            filename = f"{safe_name}-v{version}.zip"
            zip_path = _os.path.join(tmp_dir, f"__{filename}")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _dirs, files in _os.walk(repo_path):
                    for f in files:
                        abs_p = _os.path.join(root, f)
                        rel_p = _os.path.relpath(abs_p, repo_path)
                        zf.write(abs_p, rel_p)
            return zip_path, filename, tmp_dir
        except Exception:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise

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
