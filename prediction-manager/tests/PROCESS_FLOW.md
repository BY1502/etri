# 예측매니저 프로세스 흐름도 + 시스템 매핑

회의 시연 / 운영 매뉴얼용. 각 사용자 동작이 어떤 시스템들을 거쳐가는지, 어떤 데이터가 어디에 저장되는지 시각적으로 정리.

---

# 1. 시스템 컴포넌트 맵

```
                    [브라우저 - 사용자]
                          │
                          ▼ HTTPS:30443
                  [Istio Ingress Gateway]
                          │
                ┌─────────┴──────────────────────────┐
                ▼                                    ▼
        [oauth2-proxy]                          [/auth/* — Keycloak]
                │ (인증 후 Bearer + 헤더 주입)         (사용자/realm)
                ▼
   ┌────────────┴───────────────┬──────────────┬──────────────┐
   ▼                            ▼              ▼              ▼
[FeDIT frontend]      [예측매니저 (PM)]    [centraldashboard]  [/_/pipeline/]
 (/fedit/)            (/prediction-manager/) (/_/)              [KFP UI]
 React + nginx           FastAPI                                ml-pipeline-ui

                              │
   ┌──────────────────────────┼──────────────────────────────────────┐
   ▼                          ▼                                      ▼
[K8s API]            [외부 시스템들 (in-cluster)]                 [데이터 저장소]
 - Notebook CR        - Ray Cluster (head svc :10001 / :8265)     - MinIO (mlflow-artifacts)
 - PVC                - MLflow (svc :5000 + PostgreSQL)           - PostgreSQL (Keycloak / MLflow / Katib / KFP)
 - Pod / StatefulSet  - KServe (Knative Serving)                  - Local Registry (192.168.0.166:5000)
 - InferenceService   - DCGM-exporter (GPU 메트릭)                 - PVC (host /opt/local-path-provisioner)
 - ResourceQuota      - kube-state-metrics                         - Argo Workflow Archive (MySQL)
 - Profile (Kubeflow) - Prometheus + Grafana

                                  │
                                  ▼
                            [공유 자원]
                            - GPU (RTX 3090, time-slicing 8 슬롯)
                            - 노드 메모리 62.5 GiB
                            - 디스크 348 GiB
```

---

# 2. 주요 워크플로우 — 사용자 동작 → 시스템 흐름

각 워크플로우의 트리거·경로·결과·저장 위치를 따라가는 형식.

---

## 2.1 사용자 추가

**트리거**: ADMIN 페이지에서 `+ 사용자 추가`

```
[사용자 admin]
     │ POST /api/admin/users
     ▼
[예측매니저 백엔드]
     ├─→ Keycloak Admin API ─→ user 생성 ─→ Keycloak PostgreSQL 에 저장
     │   POST /auth/admin/realms/kubeflow/users
     │
     └─→ K8s API ─→ Profile (kubeflow.org/v1) 생성
                     │
                     ▼
              [Kubeflow Profile Controller]
                     │ (자동 reconcile)
                     ▼
              ─→ Namespace `kubeflow-{user}` 생성
              ─→ ResourceQuota `kf-resource-quota` 생성
              ─→ RoleBinding `default-editor` → ClusterRole `kubeflow-edit`
              ─→ ServiceAccount `default-editor` 생성
              ─→ (kubeflow-pipelines-profile-controller) ml-pipeline-ui-artifact + visualization-server Deployment 자동 생성
```

**최종 저장 위치**:
- 사용자 정보 → Keycloak PostgreSQL
- Profile + Namespace → K8s etcd
- RoleBinding/SA/Quota → K8s etcd

---

## 2.2 노트북 생성 + Ray + MLflow 사용

**트리거**: CONTAINERS 탭에서 노트북 생성 → 사용자가 안에서 Ray + MLflow 코드 실행

```
[사용자] CONTAINERS 페이지 → 이미지·CPU·메모리 입력 → 생성
     │
     ▼
[PM 백엔드] POST /api/containers
     │ Notebook CR 생성 (kubeflow.org/v1)
     ▼
[Kubeflow Notebook Controller]
     │ StatefulSet 생성
     ▼
[K8s] Pod (jupyter + istio-proxy) Running
     │ Workspace PVC (local-path) 마운트
     ▼
[브라우저] 노트북 열기 → JupyterLab 접속 (URL: /notebook/{ns}/{name}/lab)
     │
     ▼ (사용자가 노트북 셀 실행)
     │
     ├─→ ray.init('ray://ray-optuna-mlflow-cluster-head-svc.ray-system:10001')
     │     │
     │     ▼
     │   [Ray Cluster head] ─→ trial 분산 실행 ─→ Ray dashboard (8265) 에 표시
     │
     └─→ mlflow.set_tracking_uri('http://mlflow-service.ray-system:5000')
         mlflow.start_run() / log_metric / log_param
           │
           ▼
        [MLflow Tracking Server]
           ├─→ run metadata → MLflow PostgreSQL
           └─→ artifact (model.pkl 등) → MinIO (mlflow-artifacts bucket)
```

**최종 저장 위치**:
- 노트북 코드·결과물 → Workspace PVC (`/opt/local-path-provisioner/`)
- Ray 임시 데이터 → ray-system 의 head/worker pod 메모리 + spill volume
- MLflow run metadata → ray-system PostgreSQL
- MLflow artifact → MinIO

---

## 2.3 AutoML Job 제출 → 학습 → 결과

**트리거**: AutoML 탭에서 Job 제출

```
[사용자] AutoML → + 새 Job → 데이터셋·모델·메트릭 입력 → 제출
     │
     ▼
[PM 백엔드] POST /api/automl/jobs
     │
     ├─ in-memory 큐에 등록 (status=QUEUED, priority 부여)
     │
     ▼ (큐 정책 MAX_CONCURRENT_PER_NS=2 통과 시)
     │
     ▼
[PM 백엔드] Ray submission API 호출
     │
     ▼
[Ray Cluster head]
     │ submit job (ray-mlflow 이미지 + 사용자 입력 args)
     │
     ▼
[Ray worker pod] (자동 스케일)
     │
     ├─→ Optuna 가 N 개 trial 의 hyperparam 제안
     │
     ├─→ 각 trial 실행
     │     │
     │     ├─ MLflow start_run (experiment: automl-{ns}-{name})
     │     ├─ 학습 + 검증 score 계산
     │     ├─ MLflow log_metric / log_param / log_model
     │     │     └─→ artifact → MinIO
     │     └─ tune.report(score) → Optuna 다음 trial 결정
     │
     ├─→ Top-N 모델 선별 (메트릭 기준)
     │
     └─→ stdout 에 PROGRESS / RESULT 마커 + 일반 로그
              │
              ▼
       [PM SSE endpoint] /api/automl/jobs/{id}/logs
              │ (PROGRESS 마커는 progress event, 그 외 chunk 단위로 묶어 한번에 전송)
              ▼
       [브라우저] 진행률 바 + 로그 패널 실시간 업데이트
```

**최종 저장 위치**:
- Job 메타데이터 → PM 백엔드 in-memory `_jobs` dict (worker 1개 전제)
- 매 trial 의 metric/param → MLflow PostgreSQL
- 모델 artifact (.pkl) → MinIO
- Top-N 결과 → MLflow Run 의 tag/artifact

**주의**: PM 재시작 시 in-memory `_jobs` 잃음. RUNNING 상태도 Ray 가 살아있으면 다음 reload 때 status 동기화 가능.

---

## 2.4 AutoML 결과 → 서빙 (Registry 등록 + KServe 배포 통합)

**트리거**: AutoML 결과 모달에서 Top-N 모델의 `서빙` 버튼

```
[사용자] AutoML 결과 → 모델 카드 → 서빙 → 이름 입력 (예: housing-lgbm)
     │
     ▼
[PM 백엔드 / 프론트] 두 단계 순차 호출
     │
     ├─[1] POST /api/automl/jobs/{id}/register
     │      │
     │      ▼
     │  [MLflow Registry API]
     │      ├─ POST registered-models/create  (name=housing-lgbm)
     │      └─ POST model-versions/create
     │           │ source: runs:/{run_id}/model
     │           │ tags: { automl.job_id, automl.model, automl.rank }
     │           ▼
     │      MLflow PostgreSQL 에 모델 메타데이터
     │      (artifact 는 그대로 MinIO 의 원본 위치 사용)
     │
     └─[2] POST /api/automl/jobs/{id}/deploy  (serving_name=housing-lgbm)
            │
            ▼
        [PM 백엔드]
            ├─→ K8s PVC 생성 (housing-lgbm-pvc, 1Gi)
            │
            ├─→ Helper Pod (housing-lgbm-copy) 생성 + 이미지 ghcr.io/mlflow/mlflow:v3.0.0
            │     │
            │     ▼
            │  [Helper Pod 실행]
            │     │ python: mlflow.artifacts.download_artifacts(runs:/{run_id}/model)
            │     │ → MinIO 에서 artifact 다운로드
            │     │ → /target/model 로 복사 (PVC mount)
            │     │ ─→ 성공 시 자동 삭제 / 실패 시 디버깅용 보존
            │
            └─→ KServe InferenceService 생성
                  │ name: housing-lgbm
                  │ annotations: automl.job_id=..., scale-to-zero
                  │ predictor: { storageUri: pvc://housing-lgbm-pvc/model, mlflow runtime, v2 protocol }
                  ▼
            [Knative Serving]
                  ├─ Configuration / Revision 생성
                  ├─ Service (Knative svc) 생성
                  └─ Pod (kserve-container) Running
                       │
                       ▼ (idle 30s 후 scale-to-zero)
```

**최종 저장 위치**:
- Registered Model → MLflow PostgreSQL (Registry 테이블)
- 모델 artifact → MinIO (재참조, 복사 X)
- ISVC 추론용 모델 사본 → PVC (helper pod 가 복사한 것)
- Pod scale-to-zero 시 PVC 만 보존, Pod 는 사라짐

---

## 2.5 모델 운영 배포 (Production)

**트리거**: MODELS 탭 → 모델 상세 → `운영 배포`

```
[사용자] 운영 배포 클릭 → scale-to-zero 토글 (ON/OFF)
     │
     ▼
[PM 백엔드] POST /api/models/{name}/deploy
     │
     ▼
[프로덕션 ISVC 정책]
     │ name: prod-{model_name}
     │ 같은 이름 ISVC 가 이미 있으면 (재배포):
     │   ├─ PVC 재사용
     │   └─ Helper Pod 가 새 버전 artifact 로 PVC 내용 덮어쓰기
     │      (Knative new revision 생성, 트래픽 자동 전환)
     ▼
[K8s + Knative + KServe]
     │ ISVC prod-{name} 생성 / 갱신
     │ scale-to-zero ON: minReplicas=0, retention 30s
     │ OFF: minReplicas=1 (always-on)
     ▼
[모델 상세 화면]
     │ 상단 "운영 서빙 중" 녹색 배너 + URL 표시
     ▼
[사용자가 추론 호출]
     │ POST {URL}/v2/models/{name}/infer
     ▼
[Knative]
     │ scale-from-zero 활성화 → kserve-container Pod 시작
     │ cold start ~3~5초
     ▼
[mlserver runtime] 모델 로드 + 추론 + 응답
```

**최종 저장 위치**:
- ISVC 정의 → K8s etcd
- Pod (running 시) → K8s + 메모리 (모델 로드)
- 모델 파일 → PVC (prod-{name}-pvc)

---

## 2.6 KFP 파이프라인 실행 (weekly-retrain 예시)

**트리거**: KFP UI 에서 Run create

```
[사용자] KFP UI → Pipelines → weekly-retrain → Create Run
     │ (Experiment, 파라미터 입력)
     ▼
[ml-pipeline-api-server]
     │ Run record DB 저장 (ml-pipeline-mysql)
     │
     ├─[One-off] Argo Workflow CR 생성 (`Workflow`)
     │
     └─[Recurring] ScheduledWorkflow CR 생성
            │ (kubeflow.org/v1beta1)
            ▼ (cron 트리거마다)
       Argo Workflow CR 생성
            ▼
[Argo Workflow Controller]
     │ DAG 의 각 task = Pod 생성
     ▼
[task Pod] (예: train-until-threshold)
     │ 이미지 python:3.10-slim + pip install (sklearn, mlflow, ...)
     │
     ▼
[학습 코드 실행]
     │ (사용자가 작성한 KFP component 의 Python 함수)
     │
     ├─→ pd.read_csv(dataset_url)
     │
     ├─→ 학습 + 검증 (sklearn)
     │
     ├─→ MLflow start_run / log_metric (experiment: weekly-retrain-{name})
     │     └─→ MLflow PostgreSQL + MinIO
     │
     ├─→ threshold 통과 시:
     │     ├─ MLflow registered-models/create (name)
     │     ├─ MLflow model-versions/create (source: runs:/{id}/model)
     │     └─ MLflow model-versions/transition-stage (Production)
     │
     └─→ KFP output: dict { status, best_score, attempts_used, best_run_id }
            │
            ▼
       [KFP UI] DAG 시각화 + Logs + Output 표시
```

**최종 저장 위치**:
- Run / Workflow → ml-pipeline-mysql + Argo Workflow Archive
- 학습 결과 → MLflow PostgreSQL + MinIO (위와 동일)
- Registered Model (조건부) → MLflow Registry

**주의**: KFP 파이프라인 삭제 시 Workflow CR 은 cascade 되지만 **MLflow experiment·run 은 별도 정리 필요** (분리 시스템)

---

## 2.7 모델 다운로드

**트리거**: MODELS 탭 → 버전 카드 → `다운로드`

```
[사용자] 다운로드 클릭
     │
     ▼
[PM 백엔드] GET /api/models/{name}/versions/{version}/download
     │ (asyncio.to_thread 로 sync I/O 를 별도 스레드에서 실행 — 이벤트 루프 블록 방지)
     │
     ├─→ MLflow API: model-versions/get → source URI 조회
     │
     ├─→ MLflow API: artifacts/download (또는 직접 MinIO 에서 가져오기)
     │     │ 임시 디렉토리 (/tmp/...) 에 모델 파일 다운로드
     │     ▼
     │   다운로드된 파일들: MLmodel, model.pkl, conda.yaml, requirements.txt, ...
     │
     ├─→ zipfile 로 압축 (디스크 기반, 메모리 스파이크 없음)
     │
     └─→ FileResponse + BackgroundTask
            │ HTTP 응답 후 임시 디렉토리 자동 삭제
            ▼
       [브라우저] zip 파일 다운로드 시작
```

**최종 결과**: 사용자 PC 에 zip 파일

---

## 2.8 모델 완전 삭제 (cascade)

**트리거**: MODELS 탭 → 모델 상세 → `삭제`

```
[사용자] 삭제 → cascade 4종 확인 모달 → 진행
     │
     ▼
[PM 백엔드] DELETE /api/models/{name}
     │
     ▼ (registry_model_service.delete_model)
     │
     ├─[1] Production ISVC 정리 (있을 때)
     │      │ undeploy_production
     │      ├─→ K8s: ISVC `prod-{name}` 삭제
     │      ├─→ K8s: PVC `prod-{name}-pvc` 삭제
     │      └─→ K8s: helper pod (`prod-{name}-copy`) 삭제
     │
     ├─[2] AutoML 서빙 ISVC 정리 (모든 kubeflow-* ns 스캔)
     │      │ Version tag 의 automl.job_id 들과 ISVC annotation 매칭
     │      ├─→ K8s: 매칭된 ISVC 삭제
     │      ├─→ K8s: 그 ISVC 의 PVC `{isvc_name}-pvc` 삭제
     │      └─→ K8s: 그 ISVC 의 helper pod `{isvc_name}-copy` 삭제
     │
     ├─[3] MLflow Model Versions 삭제
     │      └─→ MLflow API: 각 version 마다 model-versions/delete
     │
     ├─[4] Registered Model 삭제
     │      └─→ MLflow API: registered-models/delete
     │
     ├─[5] MLflow Run 삭제 (각 version 의 source run)
     │      ├─→ MLflow API: runs/delete (soft delete, lifecycle_stage="deleted")
     │      └─→ MLflow gc --older-than 0d --run-ids ... (hard delete)
     │
     └─[6] Artifact 디렉토리 정리
            │ MLflow Pod 에 exec → rm -rf /mnt/mlflow-artifacts/{exp}/{run}/
```

**최종 결과**:
- MLflow 의 모든 흔적 사라짐
- KServe 의 모든 ISVC + PVC + helper pod 정리
- artifact (MinIO) 디렉토리 삭제

---

## 2.9 사용자 삭제 (cascade)

**트리거**: ADMIN 탭 → 사용자 행 → `삭제`

```
[admin] 삭제 클릭
     │
     ▼
[PM 백엔드] DELETE /api/admin/users/{email}
     │
     ├─[1] 다른 namespace 의 contributor RoleBinding 정리
     │      │ kubectl get rolebinding -A | grep user-{email}-...
     │      └─→ 하나씩 K8s API delete
     │
     ├─[2] Profile 삭제 (Kubeflow Profile Controller 가 cascade)
     │      │ kubectl delete profile kubeflow-{user}
     │      ▼
     │  [Profile Controller]
     │      └─→ Namespace `kubeflow-{user}` 삭제 트리거
     │            │ namespace finalizer 수행
     │            ▼
     │       [K8s] namespace 안의 모든 리소스 cascade:
     │            ├─ Notebook CR → StatefulSet → Pod → PVC
     │            ├─ InferenceService → Knative resources → Pod
     │            ├─ AutoML helper pod 잔여
     │            ├─ ResourceQuota / RoleBinding / ServiceAccount
     │            ├─ ConfigMap / Secret
     │            └─ ml-pipeline-ui-artifact / visualizationserver Deployment
     │
     └─[3] Keycloak 사용자 삭제
            └─→ Keycloak Admin API: DELETE /users/{id}
                  └─→ Keycloak PostgreSQL 에서 사용자 삭제
```

**한계**:
- MLflow 의 experiment · run · artifact 는 namespace cascade 와 무관 → 별도 정리 필요
- Local Registry 의 사용자 이미지 (`kubeflow-{user}/...`) 도 별도 정리 필요

---

# 3. 데이터 저장 위치 매핑

각 시스템이 어떤 데이터를 보관하는지 정리.

| 시스템 | 데이터 종류 | 저장소 | 백업 가능성 |
|--------|-------------|--------|-------------|
| **Keycloak** | 사용자, realm, client, role | Keycloak PostgreSQL | DB dump |
| **K8s etcd** | Profile, Namespace, ResourceQuota, Notebook CR, ISVC, ScheduledWorkflow 등 모든 K8s 리소스 | etcd (kube-system) | etcd snapshot |
| **MLflow Tracking** | Experiment, Run, metric, param, tag | MLflow PostgreSQL (`ray-system`) | DB dump |
| **MLflow Registry** | Registered Model, Model Version (메타데이터만) | MLflow PostgreSQL (위와 동일) | DB dump |
| **MLflow Artifact** | model.pkl, MLmodel, conda.yaml, 그 외 학습 산출물 | MinIO (`mlflow-artifacts` bucket, kubeflow ns) | MinIO mc 또는 s3 sync |
| **MinIO** (전반) | 위 + KFP artifact + 사용자 임의 업로드 | PVC `minio-pvc` (kubeflow) | PVC backup |
| **Local Registry** | Docker 이미지 (시스템 + 사용자 빌드) | 호스트 docker volume (registry container) | docker tar / sync |
| **KFP** | Pipeline 메타데이터, Run history, Argo Workflow archive | ml-pipeline-mysql + minio (artifact) | DB + MinIO |
| **Argo Workflow** | Workflow CR, ScheduledWorkflow CR | K8s etcd (CR) + ml-pipeline-mysql (archive) | etcd + DB |
| **Katib** | Hyperparameter trials | katib-mysql | DB dump |
| **PVC (사용자 데이터)** | 노트북 workspace, 모델 PVC, data volumes | local-path provisioner (`/opt/local-path-provisioner/`) | rsync 또는 Velero |
| **Prometheus** | 시계열 메트릭 (GPU/CPU/MLflow/KServe 등) | Prometheus PVC (`monitoring`) | snapshot |
| **Grafana 대시보드** | mlops-overview ConfigMap | K8s ConfigMap | yaml export |
| **PM 백엔드 in-memory** | AutoML `_jobs` dict, build status | RAM (단일 worker) | **백업 불가 → 재시작 시 일부 잃음** |

---

# 4. 의존 관계 요약

각 동작이 의존하는 시스템들 (사라지면 동작 안 함).

| 사용자 동작 | 의존 시스템 (있어야 동작) |
|-------------|---------------------------|
| 로그인 | Keycloak + Keycloak DB + oauth2-proxy |
| 노트북 생성 | Kubeflow Notebook Controller + K8s API |
| 이미지 빌드 | Docker daemon + Local Registry |
| Ray + MLflow 사용 (노트북 안) | Ray Cluster + MLflow + MinIO |
| AutoML 제출 | PM + Ray + MLflow + MinIO |
| AutoML 서빙 | PM + MLflow + MinIO + KServe + Knative |
| 모델 운영 배포 | MLflow + MinIO + KServe + Knative + helper image |
| 추론 호출 | KServe + Knative + 노드 GPU/CPU |
| 모델 다운로드 | PM + MLflow + MinIO |
| 모델 삭제 cascade | PM + MLflow + MinIO + K8s API |
| KFP 파이프라인 실행 | KFP API server + Argo + (코드 안의 외부 라이브러리) |
| Grafana 대시보드 | Prometheus + DCGM-exporter + kube-state-metrics + mlflow-exporter |

---

# 5. 운영 시 주의사항 (요약)

| 위험 영역 | 위험 내용 | 영향 | 회피 |
|-----------|-----------|------|------|
| MLflow run 삭제 | 모델·노트북에서 사용 중인 run 삭제 시 artifact 못 찾음 | 운영 배포 / 다운로드 / ONNX 변환 실패 | run 삭제 전에 모델 등록 해제 또는 모델 삭제 |
| KFP 파이프라인 삭제 | MLflow experiment 자동 정리 안 됨 | 잔여 데이터 | 수동 정리 필요 (또는 추후 cascade 연동) |
| 사용자 삭제 | namespace cascade 로 모든 자산 사라짐, 복구 불가 | 데이터 손실 | 삭제 전 백업 권장 |
| 호스트 변경 | 9곳 동기화 안 하면 인증 깨짐 | 시스템 접근 불가 | 체크리스트 사용 |
| PM 재시작 | in-memory `_jobs` 잃음 | RUNNING AutoML 의 진행 상태 일시 손실 (Ray 자체는 그대로) | scheduler 가 재기동 후 status 동기화 |
| 단일 노드 SPOF | 노드 다운 시 전체 시스템 정지 | 운영 영향 | Phase 2 운영 배포 시 다중 노드 검토 |
| 메모리 오버커밋 | limits 합 127% (현재) | 사용자 증가 시 OOM 위험 | 신규 사용자 추가 시 재검토 |
