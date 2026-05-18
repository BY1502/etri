"""
주간 재학습 파이프라인 예제.

원칙:
  1) KFP Run 이 실행되는 namespace 를 자동 감지한다.
  2) 해당 namespace 의 pm-mlflow 로만 학습 기록과 모델을 등록한다.
  3) 예제 코드에서는 scikit-learn/pandas 같은 BSD 계열 직접 의존을 쓰지 않는다.
  4) 파일 업로드 방식으로 KFP UI 에 등록한다. URL import 는 KFP UI 2.2.0 버그로 피한다.

사용 방법:
  # 1. 노트북에서 컴파일
  pip install "kfp>=2.0,<3"
  python weekly_retrain_pipeline.py
  # -> weekly_retrain_pipeline.yaml 생성됨

  # 2. 예측기 생성/연동 도구 -> 파이프라인
  #    -> Upload pipeline -> Upload a file -> .yaml 업로드
  #    -> Create Run 또는 Recurring Run 생성
"""
from kfp import compiler, dsl


@dsl.component(
    base_image="python:3.10-slim",
    packages_to_install=[
        "mlflow>=3.0",
        "requests",
    ],
)
def train_until_threshold(
    dataset_url: str = "",
    target_column: str = "target",
    threshold: float = 0.90,
    max_attempts: int = 10,
    registered_name: str = "weekly-auto-demo",
    namespace: str = "",
    mlflow_uri: str = "",
) -> dict:
    """임계값 달성까지 반복 학습하고, 성공 시 namespace 전용 MLflow Registry 에 등록."""
    import csv
    import io
    import os
    import random
    import urllib.request

    import mlflow
    import mlflow.pyfunc
    import requests

    def current_namespace() -> str:
        if namespace:
            return namespace
        for key in ("POD_NAMESPACE", "NAMESPACE", "KFP_NAMESPACE"):
            value = os.environ.get(key)
            if value:
                return value
        try:
            with open("/var/run/secrets/kubernetes.io/serviceaccount/namespace") as f:
                return f.read().strip()
        except OSError:
            return "kubeflow-admin"

    run_namespace = current_namespace()
    tracking_uri = mlflow_uri or f"http://pm-mlflow.{run_namespace}.svc.cluster.local:5000"
    experiment_name = f"pipeline-{run_namespace}-{registered_name}"

    class ThresholdClassifier(mlflow.pyfunc.PythonModel):
        def __init__(self, feature_names, weights, bias, positive_label, negative_label):
            self.feature_names = feature_names
            self.weights = weights
            self.bias = bias
            self.positive_label = positive_label
            self.negative_label = negative_label

        def _records(self, model_input):
            if hasattr(model_input, "to_dict"):
                return model_input.to_dict(orient="records")
            if isinstance(model_input, list):
                if not model_input:
                    return []
                if isinstance(model_input[0], dict):
                    return model_input
                return [
                    {name: value for name, value in zip(self.feature_names, row)}
                    for row in model_input
                ]
            return []

        def predict(self, context, model_input):
            preds = []
            for row in self._records(model_input):
                score = self.bias
                for name, weight in zip(self.feature_names, self.weights):
                    try:
                        score += float(row.get(name, 0) or 0) * weight
                    except Exception:
                        pass
                preds.append(self.positive_label if score >= 0 else self.negative_label)
            return preds

    def synthetic_rows():
        rows = []
        rng = random.Random(42)
        for _ in range(240):
            x1 = rng.uniform(-3, 3)
            x2 = rng.uniform(-3, 3)
            x3 = rng.uniform(-3, 3)
            signal = 0.7 * x1 + 0.35 * x2 - 0.55 * x3 + rng.uniform(-0.25, 0.25)
            rows.append({"x1": x1, "x2": x2, "x3": x3, target_column: "ok" if signal >= 0 else "ng"})
        return rows

    def load_rows():
        if not dataset_url:
            return synthetic_rows()
        with urllib.request.urlopen(dataset_url, timeout=20) as resp:
            text = resp.read().decode("utf-8")
        return list(csv.DictReader(io.StringIO(text)))

    def to_float(value):
        try:
            if value is None or value == "":
                return 0.0
            return float(value)
        except Exception:
            return None

    raw_rows = load_rows()
    if not raw_rows:
        raise ValueError("dataset is empty")
    if target_column not in raw_rows[0]:
        raise ValueError(f"target column not found: {target_column}")

    feature_names = [
        key for key in raw_rows[0].keys()
        if key != target_column and to_float(raw_rows[0].get(key)) is not None
    ]
    if not feature_names:
        raise ValueError("no numeric feature columns found")

    rows = []
    for row in raw_rows:
        label = str(row.get(target_column, ""))
        features = {name: to_float(row.get(name)) or 0.0 for name in feature_names}
        rows.append((features, label))

    labels = sorted({label for _, label in rows})
    if len(labels) != 2:
        raise ValueError("this example supports binary classification only")
    negative_label, positive_label = labels[0], labels[1]

    rng = random.Random(20260511)
    rng.shuffle(rows)
    split = max(1, int(len(rows) * 0.8))
    train_rows = rows[:split]
    test_rows = rows[split:] or rows[:]

    def train_candidate(attempt):
        grouped = {positive_label: [], negative_label: []}
        for features, label in train_rows:
            grouped[label].append(features)

        weights = []
        for name in feature_names:
            pos_mean = sum(r[name] for r in grouped[positive_label]) / max(1, len(grouped[positive_label]))
            neg_mean = sum(r[name] for r in grouped[negative_label]) / max(1, len(grouped[negative_label]))
            noise = random.Random(attempt * 1009 + len(name)).uniform(-0.05, 0.05)
            weights.append(pos_mean - neg_mean + noise)

        midpoint = []
        for name in feature_names:
            pos_mean = sum(r[name] for r in grouped[positive_label]) / max(1, len(grouped[positive_label]))
            neg_mean = sum(r[name] for r in grouped[negative_label]) / max(1, len(grouped[negative_label]))
            midpoint.append((pos_mean + neg_mean) / 2.0)
        bias = -sum(w * m for w, m in zip(weights, midpoint))
        bias += random.Random(attempt * 917).uniform(-0.02, 0.02)
        return weights, bias

    def evaluate(weights, bias):
        ok = 0
        for features, label in test_rows:
            score = bias + sum((features[name] * weight) for name, weight in zip(feature_names, weights))
            pred = positive_label if score >= 0 else negative_label
            ok += int(pred == label)
        return ok / max(1, len(test_rows))

    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(experiment_name)

    best_score = -1.0
    best_run_id = ""
    attempts_used = 0

    for attempt in range(max_attempts):
        attempts_used = attempt + 1
        weights, bias = train_candidate(attempt)
        score = evaluate(weights, bias)

        with mlflow.start_run(run_name=f"attempt-{attempts_used}") as run:
            mlflow.set_tag("pm.source", "pipeline")
            mlflow.set_tag("pm.namespace", run_namespace)
            mlflow.set_tag("pipeline.registered_name", registered_name)
            mlflow.log_param("features", ",".join(feature_names))
            mlflow.log_param("attempt", attempts_used)
            mlflow.log_metric("score", score)
            mlflow.log_metric("threshold", threshold)

            if score > best_score:
                best_score = score
                best_run_id = run.info.run_id
                model = ThresholdClassifier(
                    feature_names=feature_names,
                    weights=weights,
                    bias=bias,
                    positive_label=positive_label,
                    negative_label=negative_label,
                )
                mlflow.pyfunc.log_model(
                    name="model",
                    python_model=model,
                )

        print(f"[attempt {attempts_used}] score={score:.4f} threshold={threshold}")
        if score >= threshold:
            print("threshold reached; stop retraining")
            break

    status = "ok" if best_score >= threshold else "below_threshold"
    version = ""
    if status == "ok" and best_run_id:
        requests.post(
            f"{tracking_uri}/api/2.0/mlflow/registered-models/create",
            json={"name": registered_name},
            timeout=10,
        )
        created = requests.post(
            f"{tracking_uri}/api/2.0/mlflow/model-versions/create",
            json={
                "name": registered_name,
                "source": f"runs:/{best_run_id}/model",
                "run_id": best_run_id,
            },
            timeout=10,
        )
        created.raise_for_status()
        version = created.json().get("model_version", {}).get("version", "")
        if version:
            requests.post(
                f"{tracking_uri}/api/2.0/mlflow/model-versions/transition-stage",
                json={
                    "name": registered_name,
                    "version": version,
                    "stage": "Production",
                    "archive_existing_versions": True,
                },
                timeout=10,
            )
        print(f"registry updated: {registered_name} v{version}")

    return {
        "status": status,
        "namespace": run_namespace,
        "mlflow_uri": tracking_uri,
        "experiment_name": experiment_name,
        "best_score": float(best_score),
        "attempts_used": attempts_used,
        "best_run_id": best_run_id,
        "registered_version": version,
    }


@dsl.pipeline(
    name="weekly-retrain",
    description="사용자 namespace 전용 MLflow 에 기록하는 주간 재학습 예제.",
)
def weekly_retrain_pipeline(
    dataset_url: str = "",
    target_column: str = "target",
    threshold: float = 0.90,
    max_attempts: int = 10,
    registered_name: str = "weekly-auto-demo",
    namespace: str = "",
    mlflow_uri: str = "",
):
    train_until_threshold(
        dataset_url=dataset_url,
        target_column=target_column,
        threshold=threshold,
        max_attempts=max_attempts,
        registered_name=registered_name,
        namespace=namespace,
        mlflow_uri=mlflow_uri,
    ).set_caching_options(False)


if __name__ == "__main__":
    compiler.Compiler().compile(
        pipeline_func=weekly_retrain_pipeline,
        package_path="weekly_retrain_pipeline.yaml",
    )
    print("weekly_retrain_pipeline.yaml 생성 완료")
