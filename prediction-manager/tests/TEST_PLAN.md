# 예측매니저 테스트 플랜

## 환경
- 베이스 URL: `https://192.168.0.166:30443/`
- Admin 계정: `admin@example.com`
- 일반 계정: `researcher1@example.com`, `researcher2@example.com`
- 모든 테스트: **admin 계정** 우선, 격리 테스트는 researcher 계정 병행

## 실행 순서 권장
1. 스모크 테스트 (자동) → 핵심 엔드포인트 healthcheck
2. 단위 기능 (수동 UI 또는 curl)
3. 통합 시나리오 (E2E)
4. 보안·정리 검증

---

## 0. 스모크 테스트 (자동)

`tests/smoke_test.sh` 실행. **모든 핵심 API 응답 검증**. Pass 시 나머지 진행.

```bash
bash tests/smoke_test.sh
```

기대: 모든 체크 `[OK]`

---

## 1. 인증 · 권한

### TC-AUTH-01: kubeflow-userid 헤더 위조 차단
**목적**: Istio Lua 필터가 클라이언트 송신 헤더 제거하는지

```bash
# oauth2-proxy 를 지나는 외부 요청에 forged 헤더 주입 시도
curl -sk -H "kubeflow-userid: admin@example.com" \
  "https://192.168.0.166:30443/prediction-manager/api/user-info" \
  -w "\n%{http_code}\n"
```
**기대**: 302 redirect to login (oauth2-proxy 가 차단) / 200 이어도 응답의 `email` 이 admin 아닐 것.

### TC-AUTH-02: Namespace 격리
**목적**: researcher1 이 researcher2 namespace 리소스 접근 불가

researcher1 로 로그인 후:
```bash
curl -sk -b ~/.cookies "https://192.168.0.166:30443/prediction-manager/api/containers?ns=kubeflow-researcher2"
```
**기대**: 403 또는 자기 namespace 의 데이터만 반환

### TC-AUTH-03: Admin 전용 엔드포인트
```bash
# researcher1 쿠키로 admin 호출
curl -sk -b ~/.cookies-researcher1 \
  "https://192.168.0.166:30443/prediction-manager/api/admin/users"
```
**기대**: 403

---

## 2. ADMIN

### TC-ADMIN-01: 사용자 목록
- 브라우저: ADMIN 페이지 접속
- **기대**: 3명 (admin/researcher1/researcher2) 테이블 표시, Keycloak 필드 정상

### TC-ADMIN-02: 클러스터 리소스 패널
- ADMIN 페이지 상단 카드 4개 (CPU/메모리/GPU/스토리지) 표시
- 각 카드에 할당률·사용률 바
- **기대**: 10초마다 자동 갱신

### TC-ADMIN-03: 사용자 추가
- "+ 사용자 추가" 클릭 → 모달
- email: `test-user@example.com`, password: `test1234`, memory: `4Gi`
- **기대**: Keycloak 사용자 + Profile + Quota 생성됨

**검증**:
```bash
kubectl get profile kubeflow-test-user-example-com
kubectl get resourcequota -n kubeflow-test-user-example-com
```

### TC-ADMIN-04: 사용자 삭제 (완전 cascade)
- 방금 만든 test-user 삭제
- **기대**: Profile·namespace·Keycloak 모두 사라짐. 다른 namespace 의 contributor RoleBinding 도 정리.

### TC-ADMIN-05: 쿼터 단위 검증
- researcher2 메모리 입력창에 `16` (단위 없음) 입력 후 저장
- **기대**: 에러 메시지 `"16" 형식이 틀립니다. 예: 16Gi` / 저장 안 됨

### TC-ADMIN-06: 오버커밋 경고
- researcher1 메모리 `100Gi` 로 변경 시도
- **기대**: 저장은 허용되지만 **오버커밋 경고 배너** 표시

### TC-ADMIN-07: 비밀번호 재설정
- researcher1 "비밀번호" 버튼 → 새 비밀번호 입력
- **기대**: Keycloak 에서 실제 비번 변경됨. 로그아웃 후 새 비번으로 로그인 성공.

### TC-ADMIN-08: 권한 관리 (Contributor)
- researcher2 "권한" → researcher1 `edit` 권한 부여
- **기대**: researcher1 로그인 시 namespace 드롭다운에 researcher2 ns 보임

### TC-ADMIN-09: MLflow 저장소 패널
- ADMIN 페이지의 "MLflow 저장소" 카드
- **기대**: artifact/Run/Experiment 수치 표시. "지금 정리" 버튼 동작 (30일 이상 deleted run 제거).

---

## 3. IMAGES

### TC-IMG-01: 이미지 목록 분류
- IMAGES 페이지
- **기대**: 구분 컬럼에 `시스템`/`사용자`/`미분류` 배지
- 시스템 이미지 예: `prediction-manager-app`, `fedit-frontend`, `ray-mlflow`, `mlserver-onnx`

### TC-IMG-02: 시스템 이미지 삭제 보호
- `prediction-manager-app` 의 "삭제" 클릭
- **기대**: 2단 확인 모달 (경고 + 이름 재입력 프롬프트). 이름 틀리면 취소됨.

### TC-IMG-03: 사용자 이미지 빌드
- "+ 새 이미지 빌드" → python 3.10 + pip: `numpy`
- **기대**: 빌드 로그 스트리밍. 성공 후 `kubeflow-{user}/...` prefix 로 Registry 저장.

### TC-IMG-04: 사용자 간 이미지 격리
- researcher1 빌드한 이미지가 researcher2 목록에 안 보여야
- **기대**: researcher2 API 응답에 해당 이미지 없음

---

## 4. CONTAINERS (Notebook)

### TC-CON-01: 기본 노트북 생성
- 컨테이너 생성 → JupyterLab 타입 → 기본 옵션 유지 → Launch
- **기대**: 2분 내 Pod Ready. Jupyter 링크 클릭 시 새 탭에서 JupyterLab 열림.

### TC-CON-02: VS Code 타입
- 유형: VS Code 카드 선택 → 이미지 드롭다운이 vscode 이미지로 변경
- **기대**: VSCode 노트북 생성 후 접속 시 code-server 뜸

### TC-CON-03: 커스텀 이미지
- "커스텀 Notebook" 열고 `ghcr.io/kubeflow/kubeflow/notebook-servers/jupyter-pytorch-cuda-full:v1.10.0` 입력
- **기대**: 해당 이미지로 Pod 생성

### TC-CON-04: CPU Min/Max 자동 계산
- CPU Min 에 `2` 입력
- **기대**: CPU Max 에 `2.4` 자동 계산

### TC-CON-05: 데이터 볼륨 추가
- Data Volumes 섹션 → "+ 새 볼륨" → 5Gi → 마운트 `/home/jovyan/data1`
- **기대**: 노트북 안에서 `ls /home/jovyan/data1` 동작, 별도 PVC 생성됨

### TC-CON-06: 기존 PVC 연결
- "+ 기존 PVC 연결" → 기존 workspace PVC 선택
- **기대**: 해당 PVC 가 지정 경로에 마운트

### TC-CON-07: GPU 할당
- GPU 칩 `1` 선택
- **기대**: Pod spec 에 `nvidia.com/gpu: 1` 추가. `nvidia-smi` 동작.

### TC-CON-08: 중지/시작
- 실행 중 노트북 "중지" → "시작"
- **기대**: Stopped → Running 전환. 데이터 유지됨.

### TC-CON-09: 삭제 cascade
- 노트북 삭제
- **기대**: Pod + Workspace PVC 모두 제거

---

## 5. AUTOML

### TC-AUTOML-01: Job 제출
- AutoML → "+ 새 AutoML Job"
- 이름: `test-job-01`
- task: regression, dataset: titanic URL, target: Survived
- models: rf, trials: 5
- **기대**: Job 생성, QUEUED 상태 → 30초 내 PENDING → RUNNING

### TC-AUTOML-02: 데이터셋 크기 사전 체크
- dataset URL 에 1GB 이상 파일 URL 입력 후 blur
- **기대**: 노란 경고 배지 "⚠ 데이터셋이 큽니다"

### TC-AUTOML-03: Ray 공용 클러스터 안내
- AutoML 제출 모달 상단
- **기대**: 공용 Ray cluster 혼잡 안내 배너 표시

### TC-AUTOML-04: 10개 동시 제출 (큐 동작)
- 10개 Job 연속 제출
- **기대**: 2개씩 순차 실행 (MAX_CONCURRENT_PER_NS=2). 나머지 QUEUED 대기. 앞 2개 완료되면 다음 2개 자동 진입.

### TC-AUTOML-05: 실시간 진행률
- 실행 중 Job 의 "로그" 버튼
- **기대**: 로그 실시간 스트림. Best Score 값 실시간 업데이트.

### TC-AUTOML-06: Job 중지
- RUNNING 상태 job "중지" 버튼
- **기대**: STOPPED 상태 전환. Ray job cancel.

### TC-AUTOML-07: 서빙 (등록+배포 통합)
- 완료된 Job 결과 모달 → 모델 카드 "서빙" 버튼
- 이름 입력 프롬프트 확인 후 실행
- **기대**:
  - MLflow Registry 에 모델 등록 (MODELS 페이지에 표시됨)
  - KServe ISVC 생성 (scale-to-zero)
  - 30초 idle 시 pod 자동 종료

### TC-AUTOML-08: 노트북으로 import
- 모델 카드 "노트북" 버튼 → 노트북 선택
- **기대**: 해당 노트북의 PVC 에 `automl_*.ipynb` 파일 생성

### TC-AUTOML-09: AutoML Job 완전 삭제
- SUCCEEDED Job "삭제"
- **기대**: 
  - 이 Job 으로 만든 ISVC + PVC 제거
  - Helper pod 정리
  - MLflow Experiment + Run hard delete (artifact 파일 포함)
  - 예측매니저 Job 기록 제거

---

## 6. MODELS

### TC-MODEL-01: 모델 목록
- MODELS 페이지
- **기대**: 서빙으로 등록한 모델 목록. 각 행: 이름·버전 수·최신 stage·소유 namespace

### TC-MODEL-02: 모델 상세
- 모델 클릭
- **기대**: 버전 카드 리스트. 각 카드: metric · params · meta chips · action 버튼

### TC-MODEL-03: 버전별 Stage 변경
- 버전 드롭다운을 "운영" 선택
- **기대**: MLflow API 호출. 기존 운영 버전은 자동 보관.

### TC-MODEL-04: 운영 배포 (always-on)
- "운영 배포" 버튼 → scale-to-zero 토글 **OFF**
- **기대**: 
  - `prod-<모델명>` ISVC 생성
  - **항상 1 pod 유지** (always-on)
  - 상단 "운영 서빙 중" 녹색 배너 표시

### TC-MODEL-05: 운영 배포 (scale-to-zero)
- "운영 배포" → scale-to-zero 토글 **ON**
- **기대**: 
  - ISVC 생성, **30초 idle 시 pod 0**
  - 상단 배너에 "Scale-to-Zero" 배지
  - Cold start: ~3초

### TC-MODEL-06: 운영 중단
- "운영 서빙 중" 배너의 "운영 중단" 버튼
- **기대**: 
  - 모든 Production 버전을 Archived 로 전환
  - KServe ISVC + PVC 삭제
  - 녹색 배너 사라짐

### TC-MODEL-07: ONNX 변환
- sklearn 모델 버전 "ONNX 변환"
- **기대**: 새 모델 `<name>-onnx` 생성. 원본 피처 스키마 유지.

### TC-MODEL-08: 모델 다운로드
- "다운로드" 버튼
- **기대**: `<name>-v<ver>.zip` 다운로드. 내부: MLmodel + model.pkl + conda.yaml + requirements.txt + features.json

### TC-MODEL-09: 피드백 업로드
- "피드백" 버튼 → y_true, y_pred 쌍 CSV 업로드
- **기대**: `/api/models/.../accuracy-history` 에 기록. Grafana 정확도 패널 업데이트.

### TC-MODEL-10: 롤백
- 현재 Production 이 있고 이전 보관 버전도 있는 상태에서 "롤백"
- **기대**: 현재 버전 → Archived, 가장 최근 Archived 버전 → Production

### TC-MODEL-11: 완전 삭제 cascade
- 모델 "삭제"
- 확인 모달에서 cascade 대상 4개 항목 확인
- **기대**:
  - 모든 version 삭제
  - Registered Model 엔트리 삭제
  - Production ISVC + PVC 제거
  - AutoML 서빙 ISVC + PVC 제거 (job_id 매칭)
  - MLflow Run hard delete + artifact rm -rf + gc

### TC-MODEL-12: 권한 체크 (읽기)
- researcher2 가 researcher1 모델 상세 조회 시도
- **기대**: 403

### TC-MODEL-13: 권한 체크 (쓰기)
- researcher1 이 researcher2 모델 stage 변경 시도
- **기대**: 403

---

## 7. DASHBOARD (HOME)

### TC-HOME-01: KPI 카드
- admin 접속
- **기대**: IMAGES / CONTAINERS / GPU 3개 카드. GPU 카드에 model 이름 + VRAM 공유 안내

### TC-HOME-02: 내 리소스 카드 (4-card 그리드)
- admin / researcher1 접속
- **기대**: CPU / 메모리 / PVC / 스토리지 4개 카드. 사용량/할당 표시. 75%+ 시 색상 변경.

### TC-HOME-03: 사용자별 리소스 (admin 전용)
- admin 접속
- **기대**: 전체 사용자 리소스 테이블 표시. researcher 계정에선 숨김.

### TC-HOME-04: 최근 AutoML 작업
- admin: 전체 Job 5개
- researcher1: 자기 Job 5개만
- **기대**: 올바르게 필터링됨 (이전 버그: researcher 에게 안 보이던 것)

---

## 8. 보안

### TC-SEC-01: XSS 방어
- admin 으로 Keycloak 사용자 생성: firstName 에 `<img src=x onerror=alert('XSS')>`
- ADMIN 페이지에서 이 사용자가 포함된 리스트 렌더
- **기대**: 텍스트로 표시 (`&lt;img...&gt;`), alert 실행 안 됨

### TC-SEC-02: CSRF / SameSite
- 외부 origin 에서 `<form action="...prediction-manager/api/..." method=POST>` 제출 시도
- **기대**: 쿠키 SameSite 에 따라 차단

### TC-SEC-03: 모델 downloadURL 권한
- researcher2 가 researcher1 모델 download URL 직접 호출
- **기대**: 403

### TC-SEC-04: 시스템 이미지 force 삭제 방어
```bash
curl -sk -X DELETE "https://192.168.0.166:30443/prediction-manager/api/images/prediction-manager-app?tag=latest"
```
**기대**: 409 Conflict. `?force=true` 없으면 거부.

---

## 9. 운영 · 리소스

### TC-OPS-01: Helper Pod 자동 정리
- AutoML 서빙 또는 운영 배포 후 `kubectl get pods -n kubeflow-researcher1`
- **기대**: `*-copy` pod 없음 (Succeeded 시 자동 삭제됨)

### TC-OPS-02: Scale-to-zero 동작
- AutoML "서빙" 로 배포 → 40초 대기
- **기대**: `kubectl get pod -l serving.kserve.io/inferenceservice=automl-*` → 0개 pod

### TC-OPS-03: Scale-to-zero Cold start
- Pod 가 0 인 상태에서 첫 추론 요청
- **기대**: 응답 시간 3~5초 (cold start)
- 연속 요청: 5ms 이내

### TC-OPS-04: MLflow GC CronJob
```bash
kubectl get cronjob mlflow-gc -n ray-system
kubectl get job -n ray-system -l job-name=mlflow-gc 
```
**기대**: 일요일 03:00 실행 기록. 30일 이상 deleted run 제거.

### TC-OPS-05: 수동 MLflow GC
- ADMIN "MLflow 저장소" → "지금 정리" → `older_than_days=0`
- **기대**: 모든 deleted run + experiment 즉시 hard delete. 디스크 사용량 감소.

### TC-OPS-06: AutoML 스케줄러 복구 (버그 회귀 방지)
- AutoML Job 여러 개 submit
- **기대**: Ray job SUCCEEDED 되면 자동으로 DB status 도 SUCCEEDED 전환. 큐 계속 진행.

### TC-OPS-07: ResourceQuota 초과 방어
- researcher2 에게 PVC 5개 다 만들어둔 상태에서 노트북 추가 생성 시도
- **기대**: 403 Forbidden (quota 초과)

### TC-OPS-08: OOM 테스트 (선택)
- stress 이미지로 memory limit 초과 pod 배포
- **기대**: OOMKilled (exit 137), 다른 사용자 영향 없음

---

## 10. E2E 통합 시나리오

### TC-E2E-01: AutoML → 등록 → 배포 → 추론 → 정리
1. researcher1 로그인
2. AutoML Job 제출 (titanic, rf, 3 trials)
3. 완료 대기 (~2분)
4. 결과에서 "서빙" 클릭, 이름 `e2e-test`
5. MODELS 페이지에서 `e2e-test` 확인
6. Production 서빙 배포
7. 추론 요청 (노트북 또는 curl)
8. 응답 확인
9. "운영 중단"
10. "삭제"

**검증**: 각 단계별 UI 상태·Kubernetes 리소스·MLflow 상태가 예상대로 변화

### TC-E2E-02: 멀티 사용자 시나리오
1. researcher1 모델 생성·배포
2. researcher2 가 researcher1 모델 보려 시도 (권한 없음 → 403)
3. admin 이 researcher2 를 researcher1 ns contributor(edit) 추가
4. researcher2 로그인 시 researcher1 namespace 접근 가능 확인
5. researcher2 에서 researcher1 모델 조회 가능

### TC-E2E-03: 장애 복구
1. Ray worker pod 강제 삭제
2. 새 pod 자동 생성 확인 (RayCluster controller)
3. 진행 중이던 AutoML Job 자동 재개 또는 FAILED 전환 확인
4. Scheduler 자동 재시도 (5회 한도)

---

## 부록 A: 빠른 전체 검증 (smoke_test.sh)

자동화 가능한 범위만 bash 로 돌려봄. 상세 기능은 수동 필요.

## 부록 B: 테스트 후 정리

```bash
# 테스트로 생성된 리소스 일괄 정리
kubectl delete job,pod -n kubeflow-researcher1 -l test=true
kubectl delete isvc -n kubeflow-researcher1 --all
# AutoML test jobs 삭제는 예측매니저 UI 사용
```

## 부록 C: 알려진 제약 (테스트 제외)

다음은 의도적으로 수용된 상태. 테스트 대상 아님:
- Docker 빌드 RCE/injection (내부 신뢰 전제)
- `dockerfile_override` admin-free (수용)
- AutoML `dataset_path` SSRF (수용)
- 예외 메시지 내부 정보 노출 (수용, 연구원 자력 디버깅)
- 사용자 삭제 순서 Profile 우선 (수용, 명시적 보류)
- In-memory dict 동시성 (단일 worker 전제)
- Email → namespace 충돌 (협의사항)
- 단일 노드 구성 (확정 전제)
