# 예측매니저 테스트 시나리오 (E2E · 시연·운영 매뉴얼용)

## 환경
- 베이스 URL: `https://121.183.206.41:30443/`
- 계정: `admin-user/admin1234`, `researcher1/research1234`, `researcher2/research1234`
- 시연 진입: FeDIT (`/fedit/`) 또는 예측매니저 직접 (`/prediction-manager/`)

## 표기 약속
- **참조**: 시나리오가 사용하는 외부 시스템 / K8s 리소스
- **cascade (삭제 영향)**: 시나리오의 삭제 동작이 트리거하는 리소스 정리
  - 직접: 동일 컴포넌트 내부 정리
  - 간접: 다른 namespace · 다른 컴포넌트로 전파되는 정리

---

# 1. 사용자 관리 (ADMIN)

## 1.1 사용자 추가
**전제**: admin 로그인 / Keycloak·Kubeflow profile-controller·KFAM 정상

**동작**:
1. ADMIN 탭 → `+ 사용자 추가`
2. email · password · 쿼터 (CPU·Memory·GPU·PVC·Storage) 입력
3. 저장

**참조**:
- 외부: Keycloak (`/auth/admin/realms/kubeflow/users`), Kubeflow Profile controller (KFAM), K8s API
- K8s 리소스: `Profile (kubeflow.org/v1)`, `Namespace`, `ResourceQuota`, `RoleBinding`(default-editor → kubeflow-edit), `ServiceAccount`(default-editor 자동 생성)

**검증**:
- Keycloak user 생성됨 (Admin Console 또는 `kubectl exec keycloak ...`)
- `kubectl get profile kubeflow-{user}` 존재
- `kubectl get ns kubeflow-{user}` 존재 + ResourceQuota 적용
- 새 사용자로 로그인 → 자기 namespace 만 접근 가능

**종료**: 새 namespace `kubeflow-{user}` 생성, default-editor SA 가 kubeflow-edit ClusterRole 부여 (Notebook 생성 가능)

---

## 1.2 컨트리뷰터 부여 (다른 사용자에게 자기 ns 접근 권한)
**전제**: 두 사용자 존재 (예: researcher1 + researcher2)

**동작**: ADMIN 탭 → 본인 행 → `권한` → 다른 사용자 email + role(`view`/`edit`/`admin`) 입력

**참조**:
- 외부: KFAM (Kubeflow Access Management)
- K8s 리소스: `RoleBinding`(`user-{email}-clusterrole-{role}`), Profile annotation `role.kubeflow.org/contributor` (해당 user 의)

**검증**:
- `kubectl get rolebinding -n {target_ns}` 에 `user-{email}-clusterrole-edit` 존재
- 부여받은 사용자 로그인 → namespace 드롭다운에 두 ns 보임
- 부여받은 사용자가 target ns 의 노트북·모델 조회 가능 (edit 권한이면 변경도 가능)

**종료**: 양방향 조회 가능. 부여한 사용자는 그대로, 부여받은 사용자만 추가 ns 접근 가능

---

## 1.3 비밀번호 재설정
**전제**: 대상 사용자 존재

**동작**: ADMIN 탭 → 사용자 행 → `비밀번호` → 새 비번 입력

**참조**: Keycloak Admin API (`reset-password`, `temporary=false`)

**검증**: 해당 사용자가 새 비번으로 로그인 OK / 옛 비번으로 거부

**종료**: 비번만 변경. 다른 모든 데이터(Profile·노트북·모델) 보존

---

## 1.4 쿼터 변경
**전제**: 대상 사용자 존재 + 현재 사용량이 새 쿼터 이내

**동작**: ADMIN 탭 → 사용자 행 → `할당량` → CPU/Memory/GPU/PVC/Storage 수정

**참조**: K8s `ResourceQuota` (`kf-resource-quota` in target namespace)

**검증**:
- `kubectl describe resourcequota kf-resource-quota -n {ns}` 에 새 hard limit 반영
- 새 노트북·AutoML 제출 시 새 쿼터 기준으로 검사

**종료**: 쿼터만 변경. 기존 워크로드는 그대로 (단, 신규 생성만 새 한도 적용)

---

## 1.5 사용자 삭제 (cascade)
**전제**: 대상 사용자 존재 + (선택) 노트북·모델·이미지 등 자산 보유

**동작**: ADMIN 탭 → 사용자 행 → `삭제` → 확인 모달에서 cascade 대상 확인

**참조**:
- 외부: Keycloak (사용자 삭제), Kubeflow profile controller (Profile 삭제 → namespace cascade)
- K8s 리소스: Profile, Namespace, 그 안의 모든 리소스

**검증** (kubectl):
- `kubectl get profile kubeflow-{user}` → not found
- `kubectl get ns kubeflow-{user}` → Terminating → 사라짐
- 다른 namespace 의 contributor RoleBinding 도 정리됨 (`user-{email}-...`)
- Keycloak 에 사용자 없음

**종료 / cascade**:
- **직접**: Profile / Namespace / ResourceQuota / RoleBinding / SA / Keycloak user
- **간접 (namespace 삭제로 인해 cascade)**:
  - `Notebook` CR (사용자가 만든 노트북) → 그 안의 Pod·PVC
  - `RayCluster` / `RayJob` (사용자 ns 에 있다면)
  - `InferenceService`(KServe) → KServe webhook 이 정리하는 PVC
  - PodDefault, PoddDefault, ConfigMap, Secret
  - AutoML 서빙 helper pod 잔여
- **간접 (다른 namespace)**:
  - 이 사용자가 contributor 였던 다른 ns 의 RoleBinding 도 PM 이 별도 검색 후 삭제

**주의 사항**:
- 사용자 데이터(노트북·모델·실험)는 모두 사라짐
- MLflow 의 experiment·run 은 namespace 삭제로 자동 정리되지 **않음** → MLflow 에 잔존 (현재 분리 운영, 추후 cascade 연동 협의)

---

# 2. 이미지 (IMAGES)

## 2.1 사용자 이미지 빌드
**전제**: 사용자 로그인 / 베이스 이미지·패키지 선택

**동작**:
1. IMAGES 탭 → `+ 새 이미지 빌드`
2. 베이스 이미지 (PyTorch/TensorFlow/Python/Custom) + 패키지 + 명령어 입력
3. (선택) `Dockerfile 편집` 토글 → 직접 수정 (수동 편집됨 뱃지)
4. 빌드 시작 → SSE 실시간 로그
5. 완료 후 자동으로 Kubeflow JWA spawner config 에 추가됨

**참조**:
- 외부: Docker daemon (호스트 socket via `/var/run/docker.sock`), Local Registry (`192.168.0.166:5000`)
- 백엔드 endpoint: `POST /api/images/build` (build_id 반환), `GET /api/images/build-log/{build_id}` (SSE)

**검증**:
- Build log 에 "Successfully tagged" 메시지
- `localhost:5000/v2/{user_ns}/{image}/tags/list` 에 새 태그
- IMAGES 탭에서 본인 이미지로 표시 (사용자/protected=false)
- CONTAINERS 탭의 이미지 드롭다운에 자동 등록

**종료**: 이미지 이름 패턴 `kubeflow-{user_ns}/{name}:{tag}` 로 Registry 저장

---

## 2.2 이미지 분류 (자동)
**전제**: Registry 에 이미지 존재

**동작**: IMAGES 탭 → 자동으로 분류 표시
- **시스템**: `prediction-manager-app`, `fedit-frontend`, `ray-mlflow`, `mlserver-onnx` (protected=true)
- **사용자**: `kubeflow-{ns}/...` (protected=false)
- **미분류**: 위 두 패턴에 안 맞는 것 (orphan/legacy)

**참조**: `registry_service._classify(name)` (백엔드 dict 기반 화이트리스트)

**검증**:
- IMAGES 탭의 "구분" 컬럼에 배지
- API: `GET /api/images` 응답의 `type`, `category`, `protected`, `description` 필드

---

## 2.3 사용자 이미지 삭제
**전제**: 본인 이미지 1개 이상

**동작**: IMAGES 탭 → 본인 이미지 행 → `삭제`

**참조**:
- 외부: Local Registry (`DELETE /v2/{name}/manifests/{digest}`)
- 백엔드 endpoint: `DELETE /api/images/{name}?tag={tag}`

**검증**: Registry tags list 에서 사라짐, IMAGES 탭에서 보이지 않음

**종료 / cascade**:
- **직접**: Registry 의 manifest 만 삭제 (blob 은 GC 가 별도 정리)
- **간접**:
  - JWA spawner config 의 이미지 옵션에서 자동 제외 (사용자 ns 동적 매핑)
  - 이미 그 이미지로 만들어진 노트북 Pod 는 영향 없음 (이미 다운로드됨), 단 재시작·재생성 시 ImagePullBackOff

**주의**: 다른 사용자의 이미지 삭제 시도 → **403** (소유자만 가능)

---

## 2.4 시스템 이미지 삭제 차단
**전제**: 시스템 이미지(`prediction-manager-app` 등) 존재

**동작**: IMAGES 탭의 시스템 이미지 행 → 삭제 버튼이 **렌더되지 않음** (UI에서 "시스템" 텍스트만 표시)

**검증**:
- UI: 삭제 버튼 안 보임
- API 우회 호출도 거부: `DELETE /api/images/prediction-manager-app` → **403** ("시스템 이미지는 삭제할 수 없습니다")

**종료**: 시스템 무결성 보호. 정말 필요한 경우 운영자가 docker/registry CLI 로 직접 처리

---

# 3. 컨테이너 (CONTAINERS · 노트북)

## 3.1 노트북 생성
**전제**: 사용자 로그인 / 사용 가능한 이미지·쿼터

**동작**:
1. CONTAINERS 탭 → `+ 새 컨테이너` (전체 페이지로 전환)
2. 유형 (JupyterLab / VSCode / RStudio) 선택
3. 이미지 (드롭다운: 자기 ns 이미지 + Kubeflow 공식 base) 또는 커스텀 URL
4. CPU Min/Max, Memory Min/Max, GPU 슬롯 (0~8)
5. Workspace volume (신규 PVC 또는 기존 PVC 연결)
6. (선택) Data Volumes 추가, ImagePullPolicy, Env vars
7. `생성`

**참조**:
- 외부: Kubeflow Notebook Controller (kubeflow.org/v1 Notebook CR), JWA spawner config (이미지 옵션)
- K8s 리소스: `Notebook` (CR), `StatefulSet`(controller 가 생성), `Pod`, `PVC`(workspace + data volumes), `Service`, `VirtualService`(istio)

**검증**:
- `kubectl get notebook -n {ns}` 에 새 노트북
- `kubectl get pod -n {ns} -l notebook-name={name}` Pod Running (2/2 with istio-proxy)
- CONTAINERS 탭에 Running 표시
- 노트북 링크 클릭 → JupyterLab/VSCode 새 탭 열림

**종료**: 노트북 작동. URL 형식 `https://121.183.206.41:30443/notebook/{ns}/{name}/lab` (PM `config.py:kubeflow_url` 사용)

---

## 3.2 노트북 중지 / 재시작
**전제**: Running 노트북

**동작**: CONTAINERS 탭 → `중지` (또는 시작)

**참조**:
- 외부: Kubeflow Notebook Controller
- 동작: Notebook CR 의 `metadata.annotations.kubeflow-resource-stopped="true"` 추가/제거 → controller 가 StatefulSet replicas 0/1

**검증**:
- 중지: Pod 사라짐, PVC 보존, 상태 Stopped
- 시작: Pod 다시 Running (~30초)

**종료**: 워크스페이스 데이터 보존

---

## 3.3 노트북 안에서 Ray + MLflow 사용
**전제**: 노트북 Running, ML 라이브러리 (`ray[client]`, `mlflow`) 설치됨 (이미지 빌드 시 추가)

**동작**: 노트북 셀 실행
```python
import ray
ray.init(address='ray://ray-optuna-mlflow-cluster-head-svc.ray-system:10001', ignore_reinit_error=True)

import mlflow
mlflow.set_tracking_uri('http://mlflow-service.ray-system:5000')
mlflow.set_experiment('manual-test')
with mlflow.start_run():
    mlflow.log_metric('score', 0.95)
```

**참조**:
- 외부: Ray Cluster (head svc 10001 — gRPC), MLflow Tracking Server (5000)
- 네트워크: 같은 K8s cluster 내 svc DNS

**검증**:
- Ray dashboard (Grafana 또는 head svc 8265) 에 새 job
- MLflow UI (또는 Grafana MLOps 패널) 에 `manual-test` experiment 의 새 run

**종료**: Ray 자원 사용 후 자동 해제. MLflow run 은 사용자가 명시적으로 삭제 안 하면 영구 보존

---

## 3.4 노트북 삭제 (cascade)
**전제**: 노트북 존재

**동작**: CONTAINERS 탭 → `삭제`

**참조**:
- 외부: Kubeflow Notebook Controller
- 동작: Notebook CR 삭제 → controller 가 StatefulSet 정리

**검증**:
- `kubectl get notebook -n {ns}` 에서 사라짐
- `kubectl get pod -n {ns} -l notebook-name={name}` 빈 결과
- 워크스페이스 PVC 도 cascade 삭제 (Notebook 의 ownerReference 통해)

**종료 / cascade**:
- **직접**: Notebook CR
- **간접**: StatefulSet, Pod, Workspace PVC, 옵션으로 추가한 Data Volume PVC, Service, VirtualService

**주의**: 워크스페이스의 데이터(코드·결과물) 도 함께 삭제됨

---

# 4. AutoML

## 4.1 AutoML Job 제출
**전제**: 사용자 로그인 / Ray Cluster Ready / MLflow Ready / 데이터셋 URL 또는 PVC 경로

**동작**:
1. AutoML 탭 → `+ 새 AutoML Job`
2. 실험명 / Task(분류/회귀) / 데이터셋 / 타깃 컬럼 / 모델(rf/xgb/lgbm/mlp/tabnet) / 시도 횟수 / 메트릭 / 리소스 / Top-N 입력
3. 제출

**참조**:
- 외부:
  - Ray (`ray.io/v1` RayJob 또는 Ray submission API)
  - MLflow (experiment `automl-{ns}-{name}` 자동 생성)
  - Optuna (Ray Tune 내부 sampler — 별도 service 없음)
- K8s 리소스: 백엔드 in-memory `_jobs` dict, Ray submission

**검증**:
- 즉시 QUEUED 상태 → 큐 정책 (per-namespace MAX 2) 에 따라 PENDING → RUNNING
- AutoML 탭에 Job 표시
- Ray dashboard 에 submission, MLflow 에 새 experiment

**종료**: 학습 진행. 메트릭은 MLflow Run 에 매 trial 기록

---

## 4.2 큐 정책 동작 (동시 실행 제한)
**전제**: 같은 namespace 에 Job 여러 개 빠르게 제출

**동작**: 4~5개 연속 제출

**참조**: 백엔드 `MAX_CONCURRENT_PER_NS=2` (기본값)

**검증**:
- 처음 2개 = RUNNING, 나머지 = QUEUED
- 앞 2개 SUCCEEDED 시 자동으로 다음 2개 진입
- AutoML 탭의 큐 위치 (`#1`, `#2` 등) 표시

**종료**: 모든 Job 완료까지 순차 처리

---

## 4.3 우선순위 상향 (admin 전용)
**전제**: QUEUED Job 1개 이상 / admin 로그인

**동작**: AutoML 탭 → QUEUED Job 행 → `우선순위↑`

**참조**: 백엔드 `_jobs[id].priority` 값 = 현재 최소값 - 1, 큐 정렬 키: `(priority, submitted_at)`

**검증**: 새로고침 → 해당 Job 이 QUEUED 맨 앞으로 이동, RUNNING slot 비면 가장 먼저 진입

**종료**: 일반 사용자에겐 버튼 없음 (`is_admin` 체크)

---

## 4.4 진행률 + 베스트 스코어 실시간
**전제**: RUNNING Job

**동작**: AutoML 탭 → Job 행 → `로그`

**참조**:
- 외부: Ray submission logs (SSE 스트리밍)
- 백엔드: `GET /api/automl/jobs/{id}/logs` (SSE)

**검증**: 모달 상단 패널에 진행률 (X / total trials), 베스트 스코어, 모델별 trial bar chart

**종료**: SSE 종료 (Job SUCCEEDED/FAILED/STOPPED 시)

---

## 4.5 Job 중지 / 취소
**전제**: RUNNING (중지) 또는 QUEUED (취소) Job

**동작**: AutoML 탭 → Job 행 → `중지` / `취소`

**참조**:
- 중지: Ray cancel API (`ray job stop {submission_id}`)
- 취소: 큐에서만 제거 (Ray submit 안 했음)

**검증**: 상태 STOPPED / CANCELED. RUNNING 이었다면 Ray 의 trial pod 들 정리

**종료**: MLflow run 은 그 시점까지 기록된 채 보존

---

## 4.6 Top-N 결과 + 노트북 import
**전제**: SUCCEEDED Job

**동작**:
1. AutoML 탭 → Job 행 → `로그` → 결과 패널
2. Top-N 모델 카드 중 하나 → `노트북` 버튼 → 노트북 선택 모달
3. 자동으로 `.ipynb` 파일이 선택한 노트북의 PVC 에 생성됨

**참조**:
- 외부: Kubeflow Notebook (`kubectl exec` 으로 PVC 에 파일 작성)
- 백엔드: `POST /api/automl/jobs/{id}/notebook`

**검증**: 노트북 새로고침 → `automl_*.ipynb` 파일 자동 생성 + 실행 가능

**종료**: 노트북에서 직접 추론 코드 실행 가능 (KServe 호출 또는 model.pkl 로컬 사용)

---

## 4.7 서빙 (Registry 등록 + KServe 배포 통합)
**전제**: SUCCEEDED Job + Top-N 모델 중 하나 선택

**동작**:
1. AutoML 결과 → 모델 카드 → `서빙` 버튼
2. 모델 이름 입력 (예: `housing-lgbm`) — 이 이름이 **Registry 등록명 + ISVC 이름** 모두로 사용됨
3. 자동 처리:
   - MLflow Registry 에 모델 등록 (Version tag 에 `automl.job_id` 저장)
   - PVC 생성 (`{name}-pvc`)
   - Helper Pod (`{name}-copy`) 가 MLflow artifact → PVC 복사
   - KServe ISVC 생성 (scale-to-zero, minReplicas=0, retention 30s)

**참조**:
- 외부: MLflow Registry, KServe (serving.kserve.io/v1beta1), MinIO (mlflow artifacts) → PVC
- K8s 리소스: `PersistentVolumeClaim`, `Pod`(helper), `InferenceService`, Knative `Configuration`/`Revision`/`Service`

**검증**:
- MODELS 탭에 새 모델 + version 1 (Production stage)
- `kubectl get isvc {name} -n {ns}` Ready=True
- Helper pod 자동 삭제 (Succeeded 시)
- 노트북에서 추론 호출 (cold start 3~5초)

**종료**: 30초 idle 시 ISVC pod = 0 (scale-to-zero)

---

## 4.8 AutoML Job 삭제 (cascade)
**전제**: Job 존재 (SUCCEEDED / FAILED 권장)

**동작**: AutoML 탭 → Job 행 → `삭제`

**참조**:
- 외부: MLflow (experiment + runs hard delete), MinIO (artifact rm -rf), KServe ISVC, helper pod
- 백엔드: `DELETE /api/automl/jobs/{id}` (`automl_service.delete()`)

**검증**:
- AutoML 탭에서 Job 사라짐
- MLflow 의 `automl-{ns}-{name}` experiment + 모든 runs 삭제됨
- 이 Job 으로 만든 ISVC + PVC 정리

**종료 / cascade**:
- **직접**: in-memory job state, MLflow experiment + runs (hard delete via `mlflow gc --older-than 0d`), 그 run 들의 artifact 디렉토리
- **간접**:
  - 이 Job 의 "서빙" 으로 만든 ISVC + PVC + helper pod (annotation `automl.job_id` 매칭)
  - 이 Job 이 등록한 Registered Model (있다면 별도 cascade — 모델 삭제 흐름 참고)

**주의**:
- 노트북 안에 import 한 `.ipynb` 파일은 사용자 데이터로 간주, 별도 정리 안 됨

---

# 5. 모델 (MODELS)

## 5.1 모델 목록 조회
**전제**: 사용자 로그인 / Registered Model 1개 이상

**동작**: MODELS 탭

**참조**:
- 외부: MLflow Registered Models API (`/api/2.0/mlflow/registered-models/search`)
- 백엔드: `GET /api/models?ns={filter}`

**검증**:
- admin: 전체 모델
- 일반: 자기 ns 또는 contributor 권한 ns 의 모델만 (experiment 이름의 ns 추출 + accessible namespaces 매칭)
- 각 모델: 버전 수, 최신 stage, 소유 namespace

**주의**: KFP 파이프라인이 만든 모델은 experiment 이름이 `automl-` 패턴이 아니라 owner ns 추론 안 됨 → admin 만 보임 (한계)

---

## 5.2 모델 상세 + 버전 관리
**전제**: 모델 존재

**동작**: MODELS 탭 → 모델 클릭 → 버전 카드 리스트

**참조**: MLflow `model-versions/search` + 각 버전의 run metadata

**검증**:
- 버전별: 메트릭, 파라미터, tag, source, stage, 생성 시각
- Stage 드롭다운: None / Staging / Production / Archived

---

## 5.3 Stage 변경
**전제**: 모델 존재 + 본인 소유 또는 admin

**동작**: 버전 카드의 Stage 드롭다운 → 변경

**참조**: MLflow `model-versions/transition-stage`

**검증**: 새 stage 반영, Production 으로 옮길 시 기존 Production 자동 Archived

**종료**: Stage 만 변경. ISVC 등 외부 리소스는 별도 동작

---

## 5.4 운영 배포 (Production)
**전제**: 모델 + 버전 존재 (Production stage)

**동작**: 모델 상세 → `운영 배포` → scale-to-zero 토글 (ON/OFF)

**참조**:
- 외부: KServe, MLflow artifact, MinIO, Knative
- K8s 리소스: ISVC `prod-{name}`, PVC `prod-{name}-pvc`, helper pod (`prod-{name}-copy`)

**검증**:
- `kubectl get isvc prod-{name}` Ready=True
- always-on (toggle OFF): minReplicas=1
- scale-to-zero (toggle ON): minReplicas=0, 30s idle 후 pod=0
- 모델 상세 상단에 "운영 서빙 중" 녹색 배너

**종료**: 추론 호출 가능 (cold start ~3초 if scale-to-zero)

---

## 5.5 운영 중단
**전제**: 운영 배포된 모델

**동작**: 모델 상세 → `운영 중단`

**참조**: KServe, K8s

**검증**:
- `prod-{name}` ISVC + PVC 정리
- 해당 모델의 모든 Production version → Archived 자동 전환
- 녹색 배너 사라짐

**종료 / cascade**:
- **직접**: ISVC, PVC, helper pod (있다면)
- **간접**: Knative Configuration / Revision / Service, predictor Pod

---

## 5.6 ONNX 변환
**전제**: sklearn 또는 pytorch 모델 + 버전 존재

**동작**: 모델 상세 → 버전 카드 → `ONNX 변환`

**참조**:
- 외부: skl2onnx 또는 onnxconverter-common (Python lib), MLflow artifact, MinIO
- 백엔드: helper Pod `mlserver-onnx` 이미지 사용

**검증**: 새 모델 `{name}-onnx` 가 Registry 에 등록 + Production stage

**종료**: ONNX 변환된 모델은 별도 모델로 관리 (원본 + 변환본 공존)

---

## 5.7 모델 다운로드
**전제**: 모델 + 버전 존재

**동작**: 모델 상세 → 버전 카드 → `다운로드`

**참조**:
- 외부: MLflow artifact storage (MinIO via `mlflow.artifacts.download_artifacts`)
- 백엔드: `GET /api/models/{name}/versions/{version}/download` (asyncio.to_thread 로 비동기 처리, FileResponse 스트리밍)

**검증**: zip 파일 다운로드. 내용:
- `MLmodel`, `model.pkl`, `conda.yaml`, `python_env.yaml`, `requirements.txt`
- (선택) `features.json`, `input_example.json`, `serving_input_example.json`

**종료**: 임시 zip 파일은 BackgroundTask 로 자동 삭제 (메모리 영향 없음)

---

## 5.8 피드백 업로드 + 정확도 추이
**전제**: 모델 운영 중 / 실제 사용 데이터의 (y_true, y_pred) 보유

**동작**: 모델 상세 → `피드백` → CSV 업로드 (헤더 `y_true,y_pred`)

**참조**:
- 외부: MLflow custom metric (백엔드가 metric `accuracy_history` 기록)
- 백엔드: `POST /api/models/{name}/accuracy-feedback`

**검증**: 모델 상세에서 시간별 정확도(RMSE/R²/Accuracy) 차트 표시

**종료**: 모델 사용 데이터 모니터링 가능

---

## 5.9 롤백
**전제**: 현재 Production 버전 + 이전 Archived 버전 존재

**동작**: 모델 상세 → `롤백`

**참조**: MLflow stage transition (Production → Archived, 가장 최근 Archived → Production)

**검증**: 운영 배포된 ISVC 의 storageUri 새 Production 버전으로 자동 갱신 (Knative new revision)

**종료**: 새 Production 으로 트래픽 전환, cold start ~3초

---

## 5.10 모델 완전 삭제 (cascade)
**전제**: 모델 존재

**동작**: 모델 상세 → `삭제` → 확인 모달에서 cascade 4종 항목 확인

**참조**:
- 외부: MLflow (`runs/delete`, `model-versions/delete`, `registered-models/delete`, MinIO `rm -rf`, `mlflow gc`)
- K8s: KServe ISVC, PVC, helper pod
- 동적 스캔: 모든 `kubeflow-*` namespace 의 ISVC annotation 매칭

**검증**:
- MODELS 탭에서 사라짐
- MLflow Registry 에 없음
- ISVC + PVC 모두 정리 (admin 이 다른 ns 의 ISVC 도 검색하여 처리)

**종료 / cascade**:
- **직접**:
  - MLflow Model Versions (모든 버전)
  - Registered Model 자체
  - 각 버전의 source Run (soft delete + hard delete via `mlflow gc --older-than 0d`)
  - MLflow artifact 디렉토리 (`/mnt/mlflow-artifacts/{exp}/{run}/`) `rm -rf`
- **간접**:
  - Production ISVC `prod-{name}` + PVC `prod-{name}-pvc` + helper pod (`prod-{name}-copy`)
  - AutoML 서빙 ISVC (annotation `automl.job_id` 매칭, 모든 ns 스캔) + 그들의 PVC + helper pod
  - Knative Configuration / Revision / Service
  - (KFP 파이프라인이 만든 모델의 경우) MLflow experiment 는 별도 정리 필요

---

# 6. KFP 파이프라인

## 6.1 파이프라인 등록
**전제**: 사용자 로그인 / KFP YAML 파일 (예: `examples/weekly_retrain_pipeline.yaml`)

**동작**:
1. KFP UI (`/_/pipeline/`) → 좌측 Pipelines → `+ Upload pipeline`
2. YAML 업로드 → 이름 / Description / Namespace
3. `Create`

**참조**:
- 외부: ml-pipeline API server (`/apis/v2beta1/pipelines`)
- K8s 리소스: 없음 (DB 에 메타데이터 저장: ml-pipeline-mysql)

**검증**: KFP UI Pipelines 탭에 등록됨, 버전 1개 자동 생성

**종료**: Run 생성 가능 상태

---

## 6.2 Run 생성 (One-off / Recurring)
**전제**: 등록된 파이프라인 + Experiment

**동작**:
1. 파이프라인 → `+ Create run`
2. Experiment 선택 (없으면 사전에 `+ Create experiment`)
3. Run name / Run type (One-off / Recurring) / Cron (recurring 일 때)
4. 파라미터 입력 → `Start`

**참조**:
- 외부: ml-pipeline scheduledworkflow controller (recurring 일 때), Argo Workflow controller
- K8s 리소스:
  - One-off: `Workflow` (argoproj.io/v1alpha1)
  - Recurring: `ScheduledWorkflow` (kubeflow.org/v1beta1) → 트리거마다 `Workflow` 생성

**검증**: Runs 탭에 Run, RUNNING 상태 → SUCCEEDED. 각 task 별로 Pod 생성됨

**종료**: 결과는 KFP UI 에 (DAG, logs, artifacts) + 코드 안에서 MLflow 로 별도 기록 (parallel)

---

## 6.3 weekly-retrain 파이프라인 시연 (E2E)
**전제**: pipeline yaml 등록 + Experiment 생성

**동작**:
1. Run create → 파라미터:
   - `dataset_url`: titanic CSV URL
   - `target_column`: `Survived`
   - `threshold`: `0.7` (등록 분기 트리거 위해 낮춤)
   - `max_attempts`: `3`
   - `registered_name`: `titanic-test`
2. Start

**참조**:
- 외부: MLflow tracking + Registry, sklearn (학습 코드 in-pipeline)
- K8s 리소스: Workflow + 그 안의 Pod (이미지 `python:3.10-slim`, pip install 시점에 ray-mlflow 의존성 설치)

**검증**:
- 5번 이내에 threshold 0.7 통과
- MLflow experiment `weekly-retrain-titanic-test` 자동 생성 + 시도별 run
- threshold 통과 시:
  - MLflow Registered Model `titanic-test` v1 생성
  - Production stage 자동 전환 (코드 안의 `transition-stage` 호출)
- 미달 시 Registry 등록 skip + status `below_threshold`

**종료**: 운영 배포는 별도 (MODELS 탭에서 수동 운영 배포 또는 운영 자동화 추가 구현 필요)

---

## 6.4 파이프라인 삭제 (정상 순서)
**전제**: 파이프라인 + 그 파이프라인의 Run / Recurring Run / Version 일부 또는 전부 존재

**동작 (순서 중요)**:
1. **모든 Run 삭제** (KFP UI Runs 탭 또는 API)
2. **모든 Recurring Run 삭제** (ScheduledWorkflow)
3. **모든 Pipeline Version 삭제**
4. **Pipeline 삭제**

**참조**:
- 외부: ml-pipeline API server
- K8s 리소스: ScheduledWorkflow / Workflow (단계별로 정리)

**검증 / cascade**:
- **직접**: ScheduledWorkflow 삭제 → 자식 Workflow 들 cascade (ownerReference 통해) → 그 Pod 들 정리
- **간접**:
  - Run 의 Argo Workflow CR + Pod 잔여 자동 정리
  - PV/PVC: 파이프라인이 임시 PVC 만들면 cascade. 영구 데이터 (MLflow run 등) 는 **분리 시스템이라 별도 정리 필요**

**종료 / 한계**:
- **MLflow experiment·run 은 자동 정리되지 않음** — 수동으로 MLflow 또는 PM ADMIN 의 GC 사용
- **Registered Model 도 자동 정리 X** — MODELS 탭에서 별도 삭제

---

# 7. 모니터링 (Grafana)

## 7.1 MLOps 통합 대시보드
**전제**: Grafana 로그인 / Prometheus targets healthy

**동작**: FeDIT → Grafana 타일 또는 `https://121.183.206.41:30443/grafana/`

**참조**:
- 외부: Prometheus (`kube-prometheus-stack`), DCGM-exporter (GPU), kube-state-metrics, mlflow-exporter
- 데이터 소스 ConfigMap: `mlops-dashboards` (namespace `monitoring`)

**검증**:
- GPU 사용률 / 온도 / VRAM (DCGM)
- 사용자별 노트북 자원 사용량 (StatefulSet 필터 — 시스템 Pod 제외)
- PVC 할당 용량 / 개수
- Ray 클러스터 (활성 노드 + 완료 Job)
- 실행 중인 노트북
- MLflow 실험·모델·런 수
- KServe 추론 latency p95 / RPS / 에러율 / Top 5 (트래픽 발생 시)

**종료**: 시간 범위 (Last 5 minutes 권장 — stale 데이터 회피)

---

## 7.2 Ray Dashboard 임베드
**전제**: Ray head pod Running + Grafana 정상

**동작**: Ray Dashboard (head svc 8265) 의 메트릭 패널 → Grafana iframe 임베드

**참조**:
- Ray head env `RAY_GRAFANA_IFRAME_HOST` (체크리스트 6번 항목)
- 호스트 변경 시 동기화 필요

**검증**: Ray dashboard 의 메트릭 차트가 Grafana 패널로 정상 표시

---

# 8. 사용자 격리 (보안)

## 8.1 Namespace 격리
**전제**: 사용자 2명 이상 + 각각 노트북·모델·이미지 보유

**동작**:
- researcher1 로그인 → API 호출 → 응답에 자기 ns 데이터만
- 다른 ns 의 데이터 접근 시도 → 403

**참조**:
- 외부: Kubeflow Profile (namespace 매핑), Istio AuthorizationPolicy
- 백엔드: `auth.py` 의 `get_user_namespace`, `get_user_accessible_namespaces`

**검증** (curl):
```bash
# researcher1 으로 researcher2 ns 의 컨테이너 조회 시도
curl -H "kubeflow-userid: researcher1@example.com" \
  "http://.../api/containers?ns=kubeflow-researcher2"
# → 자기 ns 만 반환 (ns 파라미터 무시)
```

**종료**: 데이터 노출 없음

---

## 8.2 Contributor 권한
**전제**: admin 이 researcher2 에게 researcher1 namespace 의 edit 권한 부여 (1.2 시나리오)

**동작**: researcher2 로그인 → namespace 드롭다운에 researcher1 ns 추가 → researcher1 의 노트북·모델 조회/편집

**참조**:
- 외부: Kubeflow KFAM
- K8s 리소스: `RoleBinding` `user-researcher2-example-com-clusterrole-edit` in `kubeflow-researcher1`

**검증**:
- researcher2 의 `accessible_namespaces` 에 researcher1 ns 포함
- researcher1 의 노트북 시작/중지 가능 (edit 권한)
- researcher1 본인은 researcher2 ns 에 접근 불가 (양방향 X)

**종료**: 권한 회수 (admin 이 contributor 삭제) 시 RoleBinding 도 정리

---

## 8.3 헤더 위조 차단
**전제**: 외부에서 접근

**동작**: 외부 클라이언트가 `kubeflow-userid: admin@example.com` 헤더 임의 추가하여 호출

**참조**:
- Istio EnvoyFilter `strip-client-auth-headers` (Lua 스크립트로 client 송신 헤더 제거)
- 그 다음 oauth2-proxy 가 인증 후 자기 헤더 주입

**검증**:
- 외부 위조 헤더 → 무시됨 / oauth2-proxy 가 302 redirect
- 내부 oauth2-proxy 통과한 요청에만 진짜 헤더 적용

**종료**: 보안 보장. 내부 PM 직접 (kubectl port-forward) 호출 시에는 헤더 검증 없음 (백엔드 트러스트)

---

# 9. 알려진 한계 (회의 안건)

| 항목 | 현 상태 | 협의/개선 방향 |
|------|---------|---------------|
| KFP 파이프라인 → MLflow experiment cascade | 미연동 | PM 백엔드에 통합 layer (B/C 옵션) |
| KFP 가 만든 모델의 owner ns 추론 | 실패 (`automl-` 패턴만 인식) | experiment 이름 컨벤션 또는 tag 기반 매핑 |
| 데이터 수집 인프라 (MQTT/Kafka/TimescaleDB/MinIO) | 미구현 | 수집 영역 결정 후 파이프라인 input 으로 통합 |
| 호스트 변경 9곳 동기화 | 수동 | 자동화 스크립트 또는 Phase 2 (DDNS/도메인) |
| 단일 worker 전제 (in-memory state) | AutoML state · scheduler 1개 worker 가정 | 다중 worker 시 Redis/DB 기반 state 이전 필요 |
| 운영 배포 (`220.124.222.90`) | 별도 서버 미셋업 | K8s 신규 설치 + 데이터 마이그레이션 (1~2일) |
| 메모리 오버커밋 (limits 합 127%) | 사용자 적어 안전 | 사용자·워크로드 증가 시 재검토 |

---

# 부록 A: 빠른 healthcheck

회의 시연 직전 또는 운영 점검 시:
```bash
# 1. 비정상 Pod
kubectl get pods -A | grep -vE "Running|Completed"

# 2. PM healthcheck
curl -sk -o /dev/null -w "%{http_code}\n" https://121.183.206.41:30443/

# 3. 핵심 서비스
kubectl get pods -n ray-system -l ray.io/node-type=head
kubectl get pods -n ray-system -l app=mlflow
kubectl get pods -n keycloak -l app=keycloak
kubectl get pods -n kubeflow -l app=prediction-manager

# 4. 잔여 Workflow 확인 (KFP)
kubectl get workflow -A
kubectl get scheduledworkflow -A
```

# 부록 B: 운영 배포 시 호스트 일괄 변경

`project_host_change.md` 의 9곳 체크리스트 참조. 변경 순서:
1. Keycloak `KC_HOSTNAME` env
2. oauth2-proxy ConfigMap 3항목
3. Keycloak Client redirectUris (Admin API)
4. Istio RequestAuthentication
5. Central Dashboard LOGOUT_URL
6. RayCluster `RAY_GRAFANA_IFRAME_HOST`
7. FeDIT 번들 핫픽스 + 소스 재빌드
8. PM `config.py` `kubeflow_url` + 재빌드
9. 문서·메모리 업데이트
