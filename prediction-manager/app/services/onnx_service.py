"""MLflow에 등록된 모델(sklearn/XGBoost/LightGBM/MLP)을 ONNX로 변환.

변환된 모델은 MLflow에 새 run으로 업로드하고 `{원본명}-onnx` 이름으로 레지스트리 등록.
"""
import json
import os
import tempfile

import joblib
import mlflow

from app.services import tenant_resources

MLFLOW_URI = os.environ.get("MLFLOW_URI", "http://mlflow-service.ray-system:5000")


def _detect_model_type(model) -> str:
    cls_name = type(model).__name__
    module = (type(model).__module__ or "").lower()
    if module.startswith("xgboost") or "xgb" in cls_name.lower():
        return "xgboost"
    if module.startswith("lightgbm") or "lgbm" in cls_name.lower() or cls_name.startswith("LGBM"):
        return "lightgbm"
    if module.startswith("sklearn"):
        return "sklearn"
    return "sklearn"  # fallback


def _convert_model(model, n_features: int, model_type: str):
    from skl2onnx.common.data_types import FloatTensorType
    initial_types = [("float_input", FloatTensorType([None, n_features]))]
    if model_type == "sklearn":
        from skl2onnx import convert_sklearn
        return convert_sklearn(model, initial_types=initial_types, target_opset=15)
    if model_type == "xgboost":
        from onnxmltools import convert_xgboost
        return convert_xgboost(model, initial_types=initial_types, target_opset=15)
    if model_type == "lightgbm":
        from onnxmltools import convert_lightgbm
        return convert_lightgbm(model, initial_types=initial_types, target_opset=15)
    raise ValueError(f"unsupported model type: {model_type}")


def convert_to_onnx(model_name: str, version: str, requester_email: str, namespace: str | None = None) -> dict:
    """모델 버전을 ONNX로 변환해 새 MLflow 레지스트리 모델로 등록."""
    from app.services import registry_model_service as rg

    v = rg.get_version_info(model_name, version, namespace=namespace)
    run_id = v.get("run_id")
    if not run_id:
        raise ValueError(f"v{version}에 run_id가 없습니다")

    mlflow_uri = tenant_resources.mlflow_tracking_uri(namespace) if namespace else MLFLOW_URI
    mlflow.set_tracking_uri(mlflow_uri)

    # 1) Artifact 다운로드
    # MLflow 3.x (LoggedModels) 호환: artifact_path 인자는 LoggedModels 매핑이 안 되므로
    # artifact_uri='runs:/<run>/model' 형태로 호출 (legacy + LoggedModels 자동 해석)
    local_dir = mlflow.artifacts.download_artifacts(artifact_uri=f"runs:/{run_id}/model")
    joblib_path = os.path.join(local_dir, "model.joblib")
    pkl_path = os.path.join(local_dir, "model.pkl")
    features_path = os.path.join(local_dir, "features.json")

    # MLflow sklearn flavor로 저장된 신규 모델은 MLmodel + model.pkl 형태
    # 기존 방식(log_artifact)으로 저장된 구 모델은 model.joblib 형태
    mlmodel_path = os.path.join(local_dir, "MLmodel")
    if os.path.isfile(mlmodel_path):
        import mlflow.sklearn as _mls
        model = _mls.load_model(local_dir)
    elif os.path.isfile(joblib_path):
        model = joblib.load(joblib_path)
    elif os.path.isfile(pkl_path):
        model = joblib.load(pkl_path)
    else:
        raise ValueError(f"모델 파일 없음 (MLmodel / model.joblib / model.pkl 모두 부재): {local_dir}")
    features = {"columns": []}
    if os.path.isfile(features_path):
        with open(features_path) as f:
            features = json.load(f)
    n_features = len(features.get("columns", []))
    if n_features == 0:
        raise ValueError("features.json에 columns가 비어있음")

    # 2) 변환
    model_type = _detect_model_type(model)
    onnx_model = _convert_model(model, n_features, model_type)

    # 3) ONNX 파일 저장 + MLflow 새 run으로 업로드
    import onnx
    new_run_id = None
    with tempfile.TemporaryDirectory() as tmp:
        onnx_path = os.path.join(tmp, "model.onnx")
        onnx.save(onnx_model, onnx_path)

        # 원본 모델의 owner namespace를 가져와 experiment 이름에 포함 (필터 매칭용)
        from app.services import registry_model_service as rg2
        owner_ns = namespace or rg2.get_model_owner_namespace(model_name) or "kubeflow-default"
        new_name = f"{model_name}-onnx"
        exp_name = f"automl-{owner_ns}-onnx-{model_name}"

        # 삭제된 experiment 있으면 restore
        try:
            import urllib.request
            import urllib.parse
            url = f"{mlflow_uri}/api/2.0/mlflow/experiments/get-by-name?experiment_name={urllib.parse.quote(exp_name)}"
            with urllib.request.urlopen(url, timeout=10) as r:
                resp = json.loads(r.read().decode())
            exp = resp.get("experiment", {})
            if exp.get("lifecycle_stage") == "deleted":
                req = urllib.request.Request(
                    f"{mlflow_uri}/api/2.0/mlflow/experiments/restore",
                    data=json.dumps({"experiment_id": exp["experiment_id"]}).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=10).read()
        except Exception:
            pass

        # 원본 run의 메타데이터 태그 복사
        source_tags = {}
        try:
            import httpx
            r = httpx.get(f"{mlflow_uri}/api/2.0/mlflow/runs/get", params={"run_id": run_id}, timeout=10)
            for t in r.json().get("run", {}).get("data", {}).get("tags", []):
                k = t.get("key", "")
                if k.startswith("mlflow."):
                    continue
                source_tags[k] = t.get("value", "")
        except Exception:
            pass

        import onnx as _onnx_mod
        onnx_ver = getattr(_onnx_mod, "__version__", "unknown")

        mlflow.set_experiment(exp_name)
        with mlflow.start_run(run_name=f"from-v{version}") as run:
            # 원본 메타데이터 복사 (dataset.*, automl.task 등 그대로 유지)
            for k, v in source_tags.items():
                if k in ("automl.rank",):
                    continue
                mlflow.set_tag(k, v)
            # 변환 관련 태그
            mlflow.set_tag("source.model", model_name)
            mlflow.set_tag("source.version", version)
            mlflow.set_tag("source.run_id", run_id)
            mlflow.set_tag("source.model_type", model_type)
            mlflow.set_tag("framework", "onnx")
            mlflow.set_tag("framework.version", onnx_ver)
            mlflow.set_tag("onnx.opset", "15")
            mlflow.set_tag("converted_by", requester_email)
            mlflow.log_artifact(onnx_path, artifact_path="model")
            if os.path.isfile(features_path):
                mlflow.log_artifact(features_path, artifact_path="model")
            new_run_id = run.info.run_id

        # 4) Registry 등록 (MLflow 3.x에서 log_artifact로만 올린 경우 register_model() 실패하므로 HTTP API 직접 사용)
        try:
            import httpx
            # registered model 생성 (없으면)
            try:
                httpx.post(
                    f"{mlflow_uri}/api/2.0/mlflow/registered-models/create",
                    json={"name": new_name},
                    timeout=15,
                )
            except Exception:
                pass
            vr = httpx.post(
                f"{mlflow_uri}/api/2.0/mlflow/model-versions/create",
                json={
                    "name": new_name,
                    "source": f"runs:/{new_run_id}/model",
                    "run_id": new_run_id,
                    "tags": [
                        {"key": "source.model", "value": model_name},
                        {"key": "source.version", "value": str(version)},
                        {"key": "model_type", "value": model_type},
                    ],
                },
                timeout=20,
            )
            vr.raise_for_status()
            print(f"[onnx] registered: {new_name} v{vr.json().get('model_version',{}).get('version')}", flush=True)
        except Exception as e:
            print(f"[onnx] register failed: {e}", flush=True)

    return {
        "new_name": new_name,
        "new_run_id": new_run_id,
        "model_type": model_type,
        "n_features": n_features,
    }
