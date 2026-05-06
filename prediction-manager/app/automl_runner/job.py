"""Ray Job entrypoint for AutoML runs.

Executed inside the Ray cluster. Reads configuration from CLI args (JSON),
loads the dataset, runs HPO per selected model using Ray Tune + Optuna, and
logs everything to MLflow.
"""
import argparse
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

import mlflow
import numpy as np
import pandas as pd
import joblib
import shutil
from ray import tune
from ray.tune.search.optuna import OptunaSearch
from ray.air.integrations.mlflow import MLflowLoggerCallback
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split


SEARCH_SPACE = {
    "rf": lambda task: {
        "n_estimators": tune.choice([50, 100, 200, 400]),
        "max_depth": tune.choice([None, 5, 10, 20, 40]),
        "min_samples_split": tune.choice([2, 5, 10]),
    },
    "xgb": lambda task: {
        "n_estimators": tune.choice([100, 200, 400]),
        "max_depth": tune.choice([3, 6, 10]),
        "learning_rate": tune.loguniform(1e-3, 3e-1),
        "subsample": tune.uniform(0.6, 1.0),
    },
    "lgbm": lambda task: {
        "n_estimators": tune.choice([100, 200, 400]),
        "num_leaves": tune.choice([15, 31, 63, 127]),
        "learning_rate": tune.loguniform(1e-3, 3e-1),
        "min_child_samples": tune.choice([5, 10, 20]),
    },
    "mlp": lambda task: {
        "hidden_layer_sizes": tune.choice([(64,), (128,), (64, 32), (128, 64), (256, 128, 64)]),
        "alpha": tune.loguniform(1e-5, 1e-2),
        "learning_rate_init": tune.loguniform(1e-4, 1e-2),
    },
    "tabnet": lambda task: {
        "n_d": tune.choice([8, 16, 32]),
        "n_a": tune.choice([8, 16, 32]),
        "n_steps": tune.choice([3, 5, 7]),
        "gamma": tune.uniform(1.0, 2.0),
        "lr": tune.loguniform(1e-3, 5e-2),
    },
}


# metric name → sklearn function, mode, task applicability
METRICS = {
    "mse": (lambda y, p, **kw: mean_squared_error(y, p), "min", {"regression"}),
    "rmse": (lambda y, p, **kw: float(np.sqrt(mean_squared_error(y, p))), "min", {"regression"}),
    "mae": (lambda y, p, **kw: mean_absolute_error(y, p), "min", {"regression"}),
    "r2": (lambda y, p, **kw: r2_score(y, p), "max", {"regression"}),
    "accuracy": (lambda y, p, **kw: accuracy_score(y, p), "max", {"classification"}),
    "f1": (lambda y, p, **kw: f1_score(y, p, average="weighted"), "max", {"classification"}),
    "precision": (lambda y, p, **kw: precision_score(y, p, average="weighted", zero_division=0), "max", {"classification"}),
    "recall": (lambda y, p, **kw: recall_score(y, p, average="weighted", zero_division=0), "max", {"classification"}),
    "roc_auc": (
        lambda y, p, proba=None, **kw: roc_auc_score(y, proba if proba is not None else p, multi_class="ovr"),
        "max",
        {"classification"},
    ),
}


_DATASET_HARD_BYTES = int(os.environ.get("DATASET_HARD_BYTES", 10 * 1024**3))  # 10 GB


def _load_dataset(path: str) -> pd.DataFrame:
    # Remote URL → download to temp (크기 상한 적용)
    if path.startswith("http://") or path.startswith("https://"):
        suffix = Path(path).suffix.lower() or ".csv"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        # HEAD로 사전 크기 확인
        try:
            head_req = urllib.request.Request(path, method="HEAD")
            with urllib.request.urlopen(head_req, timeout=10) as hr:
                cl = hr.headers.get("Content-Length")
                if cl and int(cl) > _DATASET_HARD_BYTES:
                    raise ValueError(
                        f"데이터셋 크기 초과: {int(cl) / 1024**3:.2f} GB "
                        f"(최대 {_DATASET_HARD_BYTES / 1024**3:.0f} GB)"
                    )
        except ValueError:
            raise
        except Exception:
            pass  # HEAD 실패는 무시 (스트림 시 재검증)
        # 스트리밍 다운로드 + 크기 누적 체크
        with urllib.request.urlopen(path, timeout=60) as resp, open(tmp.name, "wb") as f:
            total = 0
            while True:
                chunk = resp.read(1024 * 1024)  # 1 MB
                if not chunk:
                    break
                total += len(chunk)
                if total > _DATASET_HARD_BYTES:
                    f.close()
                    os.unlink(tmp.name)
                    raise ValueError(
                        f"데이터셋 다운로드 중 크기 초과: "
                        f"{total / 1024**3:.2f} GB (최대 {_DATASET_HARD_BYTES / 1024**3:.0f} GB)"
                    )
                f.write(chunk)
        local_path = tmp.name
    else:
        local_path = path

    ext = Path(local_path).suffix.lower()
    if ext == ".parquet":
        return pd.read_parquet(local_path)
    return pd.read_csv(local_path)


def _build_model(model_id: str, task: str, params: dict):
    if model_id == "rf":
        from sklearn.ensemble import (
            RandomForestClassifier,
            RandomForestRegressor,
        )
        cls = RandomForestClassifier if task == "classification" else RandomForestRegressor
        return cls(random_state=42, n_jobs=-1, **params)
    if model_id == "xgb":
        from xgboost import XGBClassifier, XGBRegressor
        cls = XGBClassifier if task == "classification" else XGBRegressor
        return cls(random_state=42, tree_method="hist", n_jobs=-1, **params)
    if model_id == "lgbm":
        from lightgbm import LGBMClassifier, LGBMRegressor
        cls = LGBMClassifier if task == "classification" else LGBMRegressor
        return cls(random_state=42, n_jobs=-1, verbose=-1, **params)
    if model_id == "mlp":
        from sklearn.neural_network import MLPClassifier, MLPRegressor
        cls = MLPClassifier if task == "classification" else MLPRegressor
        return cls(random_state=42, max_iter=300, early_stopping=True, **params)
    if model_id == "tabnet":
        # pytorch-tabnet wrapper
        from pytorch_tabnet.tab_model import TabNetClassifier, TabNetRegressor
        import torch
        tabnet_params = {k: v for k, v in params.items() if k != "lr"}
        optimizer_params = {"lr": params.get("lr", 2e-2)}
        cls = TabNetClassifier if task == "classification" else TabNetRegressor
        return cls(optimizer_params=optimizer_params, verbose=0, **tabnet_params)
    raise ValueError(f"Unknown model: {model_id}")


def _fit_predict(model_id: str, model, X_train, y_train, X_test, task: str):
    if model_id == "tabnet":
        import numpy as np
        X_tr = np.array(X_train, dtype=np.float32)
        y_tr = np.array(y_train)
        if task == "regression":
            y_tr = y_tr.astype(np.float32).reshape(-1, 1)
        else:
            y_tr = y_tr.astype(np.int64)
        X_te = np.array(X_test, dtype=np.float32)
        model.fit(X_tr, y_tr, max_epochs=30, patience=10, batch_size=256)
        preds = model.predict(X_te)
        proba = None
        if task == "classification" and hasattr(model, "predict_proba"):
            proba = model.predict_proba(X_te)
        return preds.ravel(), proba
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    proba = None
    if task == "classification" and hasattr(model, "predict_proba"):
        try:
            proba = model.predict_proba(X_test)
            if proba.shape[1] == 2:
                proba = proba[:, 1]
        except Exception:
            proba = None
    return preds, proba


def _score_all(y_true, y_pred, task: str, proba=None) -> dict:
    out = {}
    for name, (fn, _, tasks) in METRICS.items():
        if task not in tasks:
            continue
        try:
            out[name] = float(fn(y_true, y_pred, proba=proba))
        except Exception:
            pass
    return out


def _resolve_metric(task: str, requested: str) -> tuple[str, str]:
    if requested and requested != "auto":
        if requested not in METRICS:
            raise ValueError(f"unknown metric: {requested}")
        _, mode, tasks = METRICS[requested]
        if task not in tasks:
            raise ValueError(f"metric '{requested}' not applicable for task '{task}'")
        return requested, mode
    # auto
    return ("mse", "min") if task == "regression" else ("accuracy", "max")


def _train_fn_builder(model_id: str, task: str, data_path: str, target: str, test_size: float, random_state: int):
    def train_fn(config):
        df = _load_dataset(data_path)
        if target not in df.columns:
            raise ValueError(f"target column '{target}' not in dataset")
        y = df[target]
        X = df.drop(columns=[target])
        X = X.select_dtypes(include=[np.number])
        X = X.fillna(0)
        if task == "classification" and y.dtype == "object":
            y = y.astype("category").cat.codes
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state
        )
        model = _build_model(model_id, task, config)
        preds, proba = _fit_predict(model_id, model, X_train, y_train, X_test, task)
        metrics = _score_all(y_test, preds, task, proba=proba)
        metrics["model_id"] = model_id
        # 모델 pickle을 tempfile에 저장 (head가 접근 가능한 /tmp 공유)
        try:
            tmp_dir = tempfile.mkdtemp(prefix=f"automl_{model_id}_")
            joblib.dump(model, os.path.join(tmp_dir, "model.joblib"))
            with open(os.path.join(tmp_dir, "features.json"), "w") as f:
                json.dump({"columns": list(X.columns), "target": target}, f)
            metrics["_model_dir"] = tmp_dir
        except Exception as e:
            print(f"[AutoML] model save warning: {e}", flush=True)
        tune.report(metrics)

    return train_fn


class ProgressCallback(tune.Callback):
    """각 trial 종료 시 stdout에 `[AutoML] PROGRESS={...}` JSON 출력."""

    def __init__(self, primary: str, mode: str, total_trials: int, model_id: str, model_idx: int, model_total: int):
        self.primary = primary
        self.mode = mode
        self.total = total_trials
        self.done = 0
        self.best = None
        self.model_id = model_id
        self.model_idx = model_idx
        self.model_total = model_total

    def _is_better(self, score: float) -> bool:
        if self.best is None:
            return True
        return (self.mode == "min" and score < self.best) or (self.mode == "max" and score > self.best)

    def on_trial_complete(self, iteration, trials, trial, **info):
        self.done += 1
        score = None
        try:
            lr = trial.last_result or {}
            v = lr.get(self.primary)
            if v is not None:
                score = float(v)
        except Exception:
            pass
        if score is not None and self._is_better(score):
            self.best = score
        payload = {
            "model_id": self.model_id,
            "model_idx": self.model_idx,
            "model_total": self.model_total,
            "trial_done": self.done,
            "trial_total": self.total,
            "metric": self.primary,
            "mode": self.mode,
            "last_score": score,
            "best_score": self.best,
        }
        print(f"[AutoML] PROGRESS={json.dumps(payload)}", flush=True)


_FRAMEWORK_VERSIONS: dict[str, str] = {}


def _get_framework_version(model_id: str) -> str:
    """모델 id별 프레임워크 버전을 반환 (캐시)."""
    if model_id in _FRAMEWORK_VERSIONS:
        return _FRAMEWORK_VERSIONS[model_id]
    v = ""
    try:
        if model_id == "rf":
            import sklearn
            v = sklearn.__version__
        elif model_id == "xgb":
            import xgboost
            v = xgboost.__version__
        elif model_id == "lgbm":
            import lightgbm
            v = lightgbm.__version__
        elif model_id == "mlp":
            import sklearn
            v = sklearn.__version__
        elif model_id == "tabnet":
            import pytorch_tabnet
            v = getattr(pytorch_tabnet, "__version__", "unknown")
    except Exception:
        pass
    _FRAMEWORK_VERSIONS[model_id] = v
    return v


_MODEL_FRAMEWORK_MAP = {
    "rf": "scikit-learn",
    "xgb": "xgboost",
    "lgbm": "lightgbm",
    "mlp": "scikit-learn",
    "tabnet": "pytorch-tabnet",
}


def _compute_dataset_id(dataset_path: str) -> tuple[str, int]:
    """데이터셋 파일 해시 + row 수. 실패 시 ('', 0)."""
    import hashlib
    try:
        df = _load_dataset(dataset_path)
        sample = df.head(100).to_csv(index=False).encode()
        meta = f"{len(df)}:{','.join(str(c) for c in df.columns)}".encode()
        digest = hashlib.sha256(sample + meta).hexdigest()[:16]
        return digest, len(df)
    except Exception:
        return "", 0


def run(cfg: dict) -> dict:
    mlflow_uri = cfg.get("mlflow_uri", "http://mlflow-service.ray-system:5000")
    mlflow.set_tracking_uri(mlflow_uri)

    # 같은 이름의 deleted experiment 있으면 restore
    try:
        import urllib.request, urllib.parse
        url = f"{mlflow_uri}/api/2.0/mlflow/experiments/get-by-name?experiment_name={urllib.parse.quote(cfg['experiment_name'])}"
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
            print(f"[AutoML] restored deleted experiment: {cfg['experiment_name']}", flush=True)
    except Exception as e:
        # experiment 없으면 404 → 무시, set_experiment에서 생성됨
        pass

    mlflow.set_experiment(cfg["experiment_name"])

    # 데이터셋 메타데이터 한 번만 계산
    dataset_id, dataset_rows = _compute_dataset_id(cfg["dataset_path"])
    print(f"[AutoML] dataset_id={dataset_id} rows={dataset_rows}", flush=True)

    primary, mode = _resolve_metric(cfg["task"], cfg.get("metric", "auto"))
    timeout_minutes = cfg.get("timeout_minutes", 60)
    # 모델 수로 나눠서 각 모델에 시간 예산 할당 (단순화)
    per_model_budget = max(30, int((timeout_minutes * 60) / max(1, len(cfg["models"]))))

    # 시작 이벤트
    print(f"[AutoML] PROGRESS={json.dumps({'event': 'start', 'models': cfg['models'], 'num_trials': cfg['num_trials'], 'metric': primary, 'mode': mode})}", flush=True)

    cpu_per_trial = float(cfg.get("cpu_per_trial", 1.0))
    gpu_per_trial = float(cfg.get("gpu_per_trial", 0.0))
    mem_per_trial_bytes = int(float(cfg.get("memory_per_trial_gb", 2.0)) * 1024 * 1024 * 1024)

    all_results = []
    for idx, model_id in enumerate(cfg["models"]):
        print(f"[AutoML] Starting HPO for {model_id} (metric={primary}, mode={mode}, budget={per_model_budget}s, cpu={cpu_per_trial}, gpu={gpu_per_trial})", flush=True)
        print(f"[AutoML] PROGRESS={json.dumps({'event': 'model_start', 'model_id': model_id, 'model_idx': idx + 1, 'model_total': len(cfg['models'])})}", flush=True)
        search_space = SEARCH_SPACE[model_id](cfg["task"])
        train_fn = _train_fn_builder(
            model_id,
            cfg["task"],
            cfg["dataset_path"],
            cfg["target_column"],
            cfg.get("test_size", 0.2),
            cfg.get("random_state", 42),
        )
        # 모델별 기본 GPU 사용 - tabnet은 GPU 있으면 자동 사용
        resources = {"cpu": cpu_per_trial, "memory": mem_per_trial_bytes}
        if gpu_per_trial > 0:
            resources["gpu"] = gpu_per_trial
        trainable = tune.with_resources(train_fn, resources)
        tuner = tune.Tuner(
            trainable,
            param_space=search_space,
            tune_config=tune.TuneConfig(
                search_alg=OptunaSearch(metric=primary, mode=mode),
                num_samples=cfg["num_trials"],
                metric=primary,
                mode=mode,
                time_budget_s=per_model_budget,
            ),
            run_config=tune.RunConfig(
                name=f"{cfg['experiment_name']}-{model_id}",
                storage_path="/tmp/ray_automl",
                callbacks=[
                    MLflowLoggerCallback(
                        tracking_uri=mlflow_uri,
                        experiment_name=cfg["experiment_name"],
                        save_artifact=False,
                        tags={
                            "automl.model": model_id,
                            "automl.task": cfg["task"],
                            "automl.metric": primary,
                            "automl.job_id": cfg.get("job_id", ""),
                            "framework": _MODEL_FRAMEWORK_MAP.get(model_id, "unknown"),
                            "framework.version": _get_framework_version(model_id),
                            "dataset.id": dataset_id,
                            "dataset.rows": str(dataset_rows),
                            "dataset.path": cfg["dataset_path"],
                            "dataset.target": cfg["target_column"],
                            "created_by": cfg.get("submitted_by", ""),
                        },
                    ),
                    ProgressCallback(primary, mode, cfg["num_trials"], model_id, idx + 1, len(cfg["models"])),
                ],
            ),
        )
        results = tuner.fit()
        try:
            best = results.get_best_result(metric=primary, mode=mode)
            # trial 전체 히스토리 수집 (DataFrame)
            top_n = int(cfg.get("top_n", 3))
            trials_info = []
            for r in results:
                if r.metrics is None:
                    continue
                trials_info.append({
                    "trial_id": r.metrics.get("trial_id") or r.path or "",
                    "config": r.config,
                    "score": r.metrics.get(primary),
                    "all_metrics": {k: float(v) for k, v in r.metrics.items() if isinstance(v, (int, float))},
                    "trial_path": str(r.path) if r.path else None,
                    "model_dir": r.metrics.get("_model_dir"),
                })
            # Top-N sort
            valid_trials = [t for t in trials_info if t["score"] is not None]
            valid_trials.sort(key=lambda t: t["score"], reverse=(mode == "max"))
            top_trials = valid_trials[:top_n]
            # 각 top-N 모델을 MLflow artifact로 업로드 (job-level run)
            saved_models = []
            for rank, t in enumerate(top_trials, 1):
                artifact_rel = f"automl/{cfg['job_id']}/{model_id}/rank{rank}"
                try:
                    with mlflow.start_run(run_name=f"top-{model_id}-rank{rank}", nested=False) as mrun:
                        mlflow.set_tag("automl.job_id", cfg["job_id"])
                        mlflow.set_tag("automl.model", model_id)
                        mlflow.set_tag("automl.rank", rank)
                        mlflow.set_tag("automl.task", cfg["task"])
                        mlflow.set_tag("automl.metric", primary)
                        mlflow.set_tag("framework", _MODEL_FRAMEWORK_MAP.get(model_id, "unknown"))
                        mlflow.set_tag("framework.version", _get_framework_version(model_id))
                        mlflow.set_tag("dataset.id", dataset_id)
                        mlflow.set_tag("dataset.rows", str(dataset_rows))
                        mlflow.set_tag("dataset.path", cfg["dataset_path"])
                        mlflow.set_tag("dataset.target", cfg["target_column"])
                        mlflow.set_tag("created_by", cfg.get("submitted_by", ""))
                        mlflow.log_params(t["config"])
                        for k, v in t["all_metrics"].items():
                            try:
                                mlflow.log_metric(k, v)
                            except Exception:
                                pass
                        # 모델 파일 업로드 (tempfile 경로 우선, fallback: trial_path)
                        # 표준 MLflow flavor (sklearn)로 log_model → MLmodel, conda.yaml,
                        # python_env.yaml, requirements.txt, model.pkl 자동 생성.
                        # XGBoost/LightGBM도 sklearn 호환 래퍼(XGBClassifier, LGBMClassifier)라
                        # sklearn flavor로 저장하면 MLServer sklearn runtime과 그대로 호환.
                        model_dir = t.get("model_dir") or t.get("trial_path")
                        if model_dir and os.path.isdir(model_dir):
                            mj = os.path.join(model_dir, "model.joblib")
                            fj = os.path.join(model_dir, "features.json")

                            # features.json → input_example 구성 (signature 포함)
                            input_example = None
                            try:
                                if os.path.isfile(fj):
                                    import json as _json
                                    import pandas as _pd
                                    with open(fj) as _f:
                                        _spec = _json.load(_f)
                                    _cols = _spec.get("columns") or []
                                    if _cols:
                                        input_example = _pd.DataFrame([{c: 0.0 for c in _cols}])
                            except Exception as _e:
                                print(f"[AutoML] input_example build failed: {_e}", flush=True)

                            if os.path.isfile(mj):
                                try:
                                    import joblib as _joblib
                                    import mlflow.sklearn as _mls
                                    _model_obj = _joblib.load(mj)
                                    _mls.log_model(
                                        _model_obj,
                                        artifact_path="model",
                                        input_example=input_example,
                                    )
                                    print(f"[AutoML] log_model(sklearn) OK for {model_id} rank{rank}", flush=True)
                                except Exception as _e:
                                    # 실패 시 기존 방식(파일 업로드)으로 폴백 → 최소한 재현은 가능
                                    print(f"[AutoML] log_model failed, fallback log_artifact: {_e}", flush=True)
                                    mlflow.log_artifact(mj, artifact_path="model")
                            else:
                                print(f"[AutoML] no model.joblib at {mj}", flush=True)
                            # features.json은 별도 artifact로 유지 (serving 단계에서 참조)
                            if os.path.isfile(fj):
                                mlflow.log_artifact(fj, artifact_path="model")
                        saved_models.append({
                            "rank": rank,
                            "model_id": model_id,
                            "score": t["score"],
                            "metric": primary,
                            "params": t["config"],
                            "run_id": mrun.info.run_id,
                            "artifact_path": f"runs:/{mrun.info.run_id}/model",
                            "virtual_path": f"/workspace/models/automl/{cfg['job_id']}/{model_id}_rank{rank}",
                        })
                except Exception as e:
                    print(f"[AutoML] save rank{rank} {model_id} failed: {e}", flush=True)

            all_results.append({
                "model_id": model_id,
                "best_metric": best.metrics.get(primary),
                "best_config": best.config,
                "top_models": saved_models,
                "trials": [
                    {"score": t["score"], "config": t["config"], "metrics": t["all_metrics"]}
                    for t in valid_trials
                ],
            })
            print(f"[AutoML] {model_id} best {primary}={best.metrics.get(primary)}, top-{len(saved_models)} saved", flush=True)
        except Exception as e:
            print(f"[AutoML] {model_id} failed: {e}", flush=True)
            all_results.append({"model_id": model_id, "best_metric": None, "best_config": None, "error": str(e), "top_models": [], "trials": []})

    # Overall best (best_metric이 None인 항목 제외)
    valid = [r for r in all_results if r.get("best_metric") is not None]
    reverse = mode == "max"
    valid.sort(key=lambda r: r["best_metric"], reverse=reverse)
    overall_best = valid[0] if valid else None
    print(f"[AutoML] Overall best: {overall_best}", flush=True)
    return {"per_model": all_results, "best": overall_best, "metric": primary, "mode": mode}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="JSON file path or inline JSON string")
    args = parser.parse_args()

    if Path(args.config).exists():
        with open(args.config) as f:
            cfg = json.load(f)
    else:
        cfg = json.loads(args.config)

    result = run(cfg)
    print("[AutoML] RESULT_JSON=" + json.dumps(result), flush=True)
