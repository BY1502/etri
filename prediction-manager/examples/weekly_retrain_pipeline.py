"""
주간 재학습 파이프라인 (옵션 A: 단일 컴포넌트 내부 루프)

동작:
  1) 최신 데이터 로드
  2) 정확도 >= threshold 될 때까지 최대 max_attempts 회 재학습
  3) 달성 시 MLflow Registry 에 등록 + Stage=Production 전환
  4) 달성 실패 시 Registry 등록 안 하고 실패로 종료

Recurring Run 으로 "매주 월요일 03:00" 스케줄 지정.

사용 방법:
  # 1. 노트북에서 컴파일
  pip install kfp>=2.0
  python weekly_retrain_pipeline.py
  # → weekly_retrain_pipeline.yaml 생성됨

  # 2. Kubeflow Central Dashboard
  #    → Experiments (KFP) → Pipelines → Upload pipeline → .yaml 업로드
  #    → Create Run → Recurring Run → Cron "0 3 * * 1"
"""
from kfp import dsl, compiler


@dsl.component(
    base_image="python:3.10-slim",
    packages_to_install=[
        "scikit-learn>=1.7,<1.8",
        "pandas",
        "mlflow>=3.0",
        "requests",
    ],
)
def train_until_threshold(
    dataset_url: str,
    target_column: str,
    threshold: float = 0.90,
    max_attempts: int = 10,
    registered_name: str = "weekly-auto",
    mlflow_uri: str = "http://mlflow-service.ray-system:5000",
) -> dict:
    """임계값 달성까지 재학습. 달성 시 MLflow Registry 등록."""
    import mlflow, mlflow.sklearn, pandas as pd, random
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import r2_score, accuracy_score

    mlflow.set_tracking_uri(mlflow_uri)
    mlflow.set_experiment(f"weekly-retrain-{registered_name}")

    df = pd.read_csv(dataset_url)
    y = df[target_column]
    X = df.drop(columns=[target_column]).select_dtypes(include="number").fillna(0)
    is_classification = y.dtype == "object" or y.nunique() < 10

    best_acc = -1.0
    best_run_id = None
    attempts_used = 0

    for attempt in range(max_attempts):
        attempts_used = attempt + 1
        random.seed(attempt * 7 + 42)
        n_est = random.choice([50, 100, 200, 400])
        max_depth = random.choice([None, 5, 10, 20])

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=attempt)
        if is_classification:
            m = RandomForestClassifier(n_estimators=n_est, max_depth=max_depth, random_state=42)
        else:
            m = RandomForestRegressor(n_estimators=n_est, max_depth=max_depth, random_state=42)
        m.fit(X_tr, y_tr)
        pred = m.predict(X_te)
        score = accuracy_score(y_te, pred) if is_classification else r2_score(y_te, pred)

        with mlflow.start_run(run_name=f"attempt-{attempt+1}") as run:
            mlflow.log_param("n_estimators", n_est)
            mlflow.log_param("max_depth", str(max_depth))
            mlflow.log_param("attempt", attempt + 1)
            mlflow.log_metric("score", score)
            mlflow.log_metric("threshold", threshold)
            if score > best_acc:
                best_acc = score
                best_run_id = run.info.run_id
                mlflow.sklearn.log_model(m, name="model")

        print(f"[attempt {attempt+1}] score={score:.4f} (threshold {threshold})")
        if score >= threshold:
            print(f"→ Threshold 달성, 재학습 중단")
            break

    status = "ok" if best_acc >= threshold else "below_threshold"
    if status == "ok" and best_run_id:
        # Registry 등록 + Production 전환
        import requests
        requests.post(
            f"{mlflow_uri}/api/2.0/mlflow/registered-models/create",
            json={"name": registered_name}, timeout=10,
        )
        r = requests.post(
            f"{mlflow_uri}/api/2.0/mlflow/model-versions/create",
            json={"name": registered_name,
                  "source": f"runs:/{best_run_id}/model",
                  "run_id": best_run_id},
            timeout=10,
        )
        version = r.json().get("model_version", {}).get("version")
        if version:
            requests.post(
                f"{mlflow_uri}/api/2.0/mlflow/model-versions/transition-stage",
                json={"name": registered_name, "version": version,
                      "stage": "Production", "archive_existing_versions": True},
                timeout=10,
            )
        print(f"→ Registry 등록 완료: {registered_name} v{version}")

    return {
        "status": status,
        "best_score": float(best_acc),
        "attempts_used": attempts_used,
        "best_run_id": best_run_id or "",
    }


@dsl.pipeline(
    name="weekly-retrain",
    description="매주 월요일 03:00 재학습. 정확도 임계값 달성까지 반복.",
)
def weekly_retrain_pipeline(
    dataset_url: str = "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
    target_column: str = "Survived",
    threshold: float = 0.80,
    max_attempts: int = 10,
    registered_name: str = "weekly-auto-titanic",
):
    train_until_threshold(
        dataset_url=dataset_url,
        target_column=target_column,
        threshold=threshold,
        max_attempts=max_attempts,
        registered_name=registered_name,
    ).set_caching_options(False)  # 매 실행 새로 학습


if __name__ == "__main__":
    compiler.Compiler().compile(
        pipeline_func=weekly_retrain_pipeline,
        package_path="weekly_retrain_pipeline.yaml",
    )
    print("→ weekly_retrain_pipeline.yaml 생성 완료")
