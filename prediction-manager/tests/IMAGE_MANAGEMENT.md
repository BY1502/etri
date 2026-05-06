# 이미지 관리 매뉴얼

각 컴포넌트가 사용하는 이미지가 어디서 오고, 어디에 저장되며, 어떻게 갱신·교체되는지 정리.

---

# 1. 이미지 출처 분류

| 분류 | 의미 | 예시 | 저장소 위치 |
|------|------|------|-------------|
| **시스템 (자체 빌드)** | 우리가 만들어 사용하는 핵심 컴포넌트 | prediction-manager-app, fedit-frontend, ray-mlflow, mlserver-onnx | 호스트 Local Registry (`192.168.0.166:5000`) |
| **사용자 빌드** | 사용자가 IMAGES 페이지에서 빌드한 노트북용 이미지 | `kubeflow-{user}/{name}:{tag}` | 동일 Local Registry |
| **Kubeflow 공식** | Kubeflow 프로젝트가 배포하는 공식 컴포넌트 | jupyter-web-app, profile-controller, centraldashboard, kfam, notebook-controller, kfp 컴포넌트 | docker.io / gcr.io / ghcr.io (외부 pull) |
| **인프라** | K8s · Istio · Calico · Knative 등 클러스터 인프라 | calico, istio, knative, metacontroller | docker.io / gcr.io |
| **모니터링** | Prometheus, Grafana, DCGM, kube-state-metrics | grafana, prometheus, dcgm-exporter | docker.io / quay.io |
| **데이터 / DB** | MLflow, Keycloak, MinIO, MySQL, PostgreSQL | postgres, minio/minio, keycloak/keycloak, mysql | docker.io / quay.io |
| **AI 런타임** | KServe MLServer | seldonio/mlserver, ghcr.io/mlflow/mlflow | docker.io / ghcr.io |

---

# 2. 시스템 이미지 (자체 빌드 4종)

우리가 만든 핵심 컴포넌트. Local Registry 에만 존재.

## 2.1 `prediction-manager-app`

| 항목 | 값 |
|------|-----|
| 출처 | 자체 빌드 |
| 소스 | [/home/yt/prediction-manager/](prediction-manager/) (FastAPI 백엔드 + 정적 프론트엔드) |
| Dockerfile | [/home/yt/prediction-manager/Dockerfile](prediction-manager/Dockerfile) — `python:3.12-slim` 베이스 |
| 저장 | `localhost:5000/prediction-manager-app:latest` |
| 사용처 | Deployment `prediction-manager` (kubeflow ns) |
| 빌드 명령 | `docker build -t localhost:5000/prediction-manager-app:latest .` |
| Push | `docker push localhost:5000/prediction-manager-app:latest` |
| 갱신 절차 | 코드 수정 → 빌드 → push → `kubectl rollout restart deploy/prediction-manager -n kubeflow` |
| 보호 | UI 삭제 차단 (시스템 이미지) |
| 의존 | docker.io/python:3.12-slim, scikit-learn, pandas, mlflow client, kubernetes client, pydantic |

## 2.2 `fedit-frontend`

| 항목 | 값 |
|------|-----|
| 출처 | 자체 빌드 |
| 소스 | [/home/yt/FeDiT/FeDiT-main/OSFW/DTSP_e8ight/union-twin-fe/](FeDiT/FeDiT-main/OSFW/DTSP_e8ight/union-twin-fe/) (React) |
| Dockerfile | nginx:alpine + 빌드 결과 (`build/`) 복사 |
| 저장 | `localhost:5000/fedit-frontend:latest` |
| 사용처 | Deployment `fedit-frontend` (kubeflow ns) |
| 빌드 명령 | `cd <src> && npm run build && docker build -t localhost:5000/fedit-frontend:latest .` |
| 갱신 절차 | 소스 수정 → npm build → docker build/push → `kubectl set image` 또는 rollout restart |
| 보호 | UI 삭제 차단 |
| **주의** | 빌드 시점에 host (URL) 가 React 번들에 박힘 → 호스트 변경 시 재빌드 필요 ([호스트 변경 체크리스트 7번](.claude/projects/-home-yt/memory/project_host_change.md)) |

## 2.3 `ray-mlflow`

| 항목 | 값 |
|------|-----|
| 출처 | 자체 빌드 |
| 베이스 | `rayproject/ray:2.54.1-py310` (또는 GPU 변종) + MLflow + 학습 라이브러리 |
| 저장 | `localhost:5000/ray-mlflow:2.54.1` |
| 사용처 | Ray Cluster (head + worker) `ray-optuna-mlflow-cluster` (ray-system ns), AutoML trial 실행 환경 |
| 갱신 절차 | Ray 또는 MLflow 버전 업그레이드 시 → 새 태그로 빌드 + push → RayCluster spec 의 image 태그 교체 + head/worker pod 재시작 |
| 보호 | UI 삭제 차단 |
| **의존**: Ray 2.54.1, MLflow 3.0+, Optuna, sklearn, xgboost, lightgbm, mlserver |

## 2.4 `mlserver-onnx`

| 항목 | 값 |
|------|-----|
| 출처 | 자체 빌드 |
| 베이스 | `seldonio/mlserver:1.6.1` + `onnxruntime` |
| 저장 | `localhost:5000/mlserver-onnx:1.6.1` |
| 사용처 | KServe ClusterServingRuntime `kserve-mlserver-onnx` (ONNX 변환 모델 서빙용) |
| 갱신 절차 | MLServer 또는 ONNX 버전 업그레이드 시 → 호환성 검증 후 새 태그 → ClusterServingRuntime spec 의 image 교체 |
| 보호 | UI 삭제 차단 |
| **참고** | MLServer 1.7.x 의 ONNX runtime 에 regression 있어 1.6.1 유지 (work-log 기록) |

---

# 3. 사용자 이미지 (IMAGES 페이지 빌드)

## 3.1 빌드 흐름

```
[사용자] IMAGES → + 새 이미지 빌드 → 베이스/패키지 선택 → 빌드
     │
     ▼
[PM 백엔드] POST /api/images/build
     │
     ├─→ Dockerfile 자동 생성 (베이스 + pip install + cmd)
     │   또는 사용자 직접 편집 (수동 편집됨 뱃지)
     │
     └─→ Docker daemon (호스트 socket /var/run/docker.sock)
          │ docker build → docker tag → docker push
          ▼
     [Local Registry]
          ▼
     `localhost:5000/kubeflow-{user_ns}/{name}:{tag}`
```

## 3.2 노출 / 사용

- **IMAGES 페이지**: 본인 이미지만 표시 (admin 은 전체)
- **CONTAINERS 노트북 생성 드롭다운**: 자기 namespace 의 이미지가 자동 추가됨 (백엔드 `notebook_service.get_spawner_config` 가 동적으로 합성)
- **Kubeflow 공식 base 이미지**도 같이 표시 (예: jupyter-scipy, jupyter-pytorch-cuda 등)

## 3.3 권한

- 빌드: 본인만 (자기 namespace prefix 강제)
- 조회: 본인 + admin
- 삭제: 본인 + admin (다른 사용자 거 삭제 시도 → 403)

## 3.4 갱신 / 삭제

- 같은 이름·태그로 다시 빌드 → 덮어쓰기
- 새 태그로 빌드 → 별도 옵션 추가
- 삭제: PM API → Registry 의 manifest 삭제 (blob GC 는 별도)

---

# 4. Local Registry 운영

| 항목 | 값 |
|------|-----|
| 위치 | 호스트 도커 컨테이너 (`docker ps` 의 `registry`) |
| 이미지 | `registry:2` |
| 포트 | `0.0.0.0:5000` (호스트 바인딩) |
| 저장소 | 호스트 docker volume (`/var/lib/registry/...`) |
| URL (PM 내부) | `http://192.168.0.166:5000` ([config.py:5](prediction-manager/app/config.py#L5)) — hairpin 으로 접근 |
| URL (노트북 pod 내부) | `localhost:5000` (containerd 가 호스트 registry 로 routing) |
| **인증** | 없음 (내부망 전제) |
| **TLS** | 없음 (HTTP) |
| GC | 수동 (`registry garbage-collect`) — 자동화 미설정 |

**용량 관리**: 
- 호스트 디스크 71% 사용 중 (231G/348G)
- 옛 이미지 / 사용 안 하는 태그 누적 → GC 권장 (협의사항)

**호스트 변경 영향**: 노드 IP 가 바뀌어도 registry container 는 그대로 동작 (localhost 매핑). 다만 PM `config.py:5` 의 `registry_url` 도 동기화 필요.

---

# 5. Kubeflow / 인프라 / 외부 이미지

이미지가 외부 (docker.io / gcr.io / ghcr.io) 에 있고, 클러스터 노드의 containerd 가 직접 pull.

## 5.1 Kubeflow 컴포넌트 (Kubeflow 1.9 기반)

| 컴포넌트 | 이미지 | namespace |
|----------|--------|-----------|
| Profile Controller | `docker.io/kubeflownotebookswg/profile-controller:v1.9.0` | kubeflow |
| Notebook Controller | `docker.io/kubeflownotebookswg/notebook-controller:v1.9.0` | kubeflow |
| Central Dashboard | `docker.io/kubeflownotebookswg/centraldashboard:v1.9.0` | kubeflow |
| Jupyter Web App (JWA) | `docker.io/kubeflownotebookswg/jupyter-web-app:v1.9.0` | kubeflow |
| KFAM (Access Mgmt) | `docker.io/kubeflownotebookswg/kfam:v1.9.0` | kubeflow |
| Volumes Web App | `docker.io/kubeflownotebookswg/volumes-web-app:v1.9.0` | kubeflow |
| TensorBoard Controller | `docker.io/kubeflownotebookswg/tensorboard-controller:v1.9.0` | kubeflow |
| **갱신** | Kubeflow 신 버전 (1.10 등) 출시 시 manifest 재배포 |
| **삭제 영향** | 있으면 안 됨 — 운영 절대 불가 |

## 5.2 KFP (Kubeflow Pipelines)

| 컴포넌트 | 이미지 |
|----------|--------|
| ml-pipeline-api-server | `gcr.io/ml-pipeline/api-server:2.2.0` |
| ml-pipeline-ui | `ghcr.io/kubeflow/kfp-frontend:master` (운영자 직접 pull, 우리가 변경) |
| ml-pipeline-ui-artifact (per-namespace) | `ghcr.io/kubeflow/kfp-frontend:master` (env `FRONTEND_IMAGE` 로 override 함) |
| ml-pipeline-visualizationserver | `gcr.io/ml-pipeline/visualization-server:2.2.0` |
| metadata-grpc / metadata-envoy / metadata-writer | `gcr.io/ml-pipeline/...:2.2.0` |
| scheduled-workflow | `gcr.io/ml-pipeline/scheduledworkflow:2.2.0` |
| persistenceagent | `gcr.io/ml-pipeline/persistenceagent:2.2.0` |
| cache-server | `gcr.io/ml-pipeline/cache-server:2.2.0` |
| workflow-controller (Argo) | `gcr.io/ml-pipeline/workflow-controller:v3.4.16-license-compliance` |
| ml-pipeline-mysql | `gcr.io/ml-pipeline/mysql:8.0.26` |
| metadata-store-server | `gcr.io/tfx-oss-public/ml_metadata_store_server:1.14.0` |

**주의**: `gcr.io/ml-pipeline/frontend:2.2.0` (ml-pipeline-ui-artifact 의 기본 이미지) 은 GCR 에서 사라짐 → `ghcr.io/kubeflow/kfp-frontend:master` 로 교체 (env `FRONTEND_IMAGE`, `FRONTEND_TAG` override 사용)

## 5.3 KServe + Knative

| 컴포넌트 | 이미지 |
|----------|--------|
| Knative Serving (controller, autoscaler, activator, webhook, queue-proxy) | `gcr.io/knative-releases/knative.dev/serving/...` (여러 sha digests) |
| Knative Eventing | `gcr.io/knative-releases/knative.dev/eventing/...` |
| net-istio (Knative-Istio 통합) | `gcr.io/knative-releases/knative.dev/net-istio/...` |
| KServe Controller / Webhook | `kserve/kserve-controller-manager` (kserve ns) |
| MLServer (KServe runtime) | `seldonio/mlserver:1.7.1` (sklearn/mlflow runtime), `localhost:5000/mlserver-onnx:1.6.1` (ONNX runtime) |

## 5.4 Istio + Service Mesh

| 컴포넌트 | 이미지 |
|----------|--------|
| Istio control plane (istiod) | `docker.io/istio/pilot:1.22.1` |
| Istio sidecar (proxy) | `docker.io/istio/proxyv2:1.22.1` |
| Calico (CNI) | `docker.io/calico/kube-controllers:v3.27.3`, `docker.io/calico/node:v3.27.3` |

## 5.5 Auth (oauth2-proxy + Keycloak)

| 컴포넌트 | 이미지 |
|----------|--------|
| oauth2-proxy | (별도 namespace) |
| Keycloak | `quay.io/keycloak/keycloak:26.0` |
| Keycloak PostgreSQL | `postgres:...` (keycloak namespace) |

## 5.6 모니터링

| 컴포넌트 | 이미지 |
|----------|--------|
| Prometheus | `quay.io/prometheus/prometheus:...` |
| Grafana | `docker.io/grafana/grafana:12.4.2` |
| kube-state-metrics | `registry.k8s.io/kube-state-metrics/...` |
| DCGM-exporter (GPU 메트릭) | `nvcr.io/nvidia/k8s/dcgm-exporter:...` (ray-system ns) |
| mlflow-exporter | (자체 만든 ConfigMap-mounted Python script — 베이스 `python:3.12-alpine`) |

## 5.7 ML 데이터 서비스

| 컴포넌트 | 이미지 |
|----------|--------|
| MLflow Tracking Server | `ghcr.io/mlflow/mlflow:v3.0.0` |
| MLflow PostgreSQL | `postgres:...` (ray-system ns) |
| MinIO (artifact storage) | `minio/minio:...` (kubeflow ns) |

---

# 6. 이미지 관련 운영 작업 흐름

## 6.1 시스템 이미지 갱신 (예측매니저 / FeDIT)

```
1. 소스 수정
2. docker build -t localhost:5000/{name}:latest .
3. docker push localhost:5000/{name}:latest
4. kubectl rollout restart deployment/{name} -n {ns}
   (또는 kubectl set image deployment/{name} {container}=localhost:5000/{name}:latest)
5. kubectl rollout status deployment/{name} -n {ns}
```

## 6.2 외부 이미지 갱신 (Kubeflow 컴포넌트)

```
1. Kubeflow manifest 의 새 버전 가져옴
2. kubectl apply -k kubeflow/manifests/...
3. 컴포넌트별 호환성 확인 (Notebook CR, Profile, KFP 등)
```

**주의**: Kubeflow 1.9 → 1.10 같은 메이저 업그레이드는 호환성 영향 큼. 별도 리허설 권장.

## 6.3 사용자 이미지 정리 (orphan 제거)

```bash
# 옛 사용자가 만든 이미지 (사용자 삭제 후 잔여)
curl http://localhost:5000/v2/_catalog | jq '.repositories[]'
# kubeflow-{deleted_user}/* 패턴은 삭제

# manifest 삭제
DIGEST=$(curl -sI http://localhost:5000/v2/{repo}/manifests/{tag} \
  -H "Accept: application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json" \
  | grep -i docker-content-digest | awk '{print $2}' | tr -d '\r\n')
curl -X DELETE "http://localhost:5000/v2/{repo}/manifests/$DIGEST"

# Blob GC (디스크 회수)
docker exec registry registry garbage-collect /etc/docker/registry/config.yml
```

## 6.4 노드 디스크 부족 시 정리

```bash
# 미사용 docker 이미지 정리 (호스트)
docker image prune -a

# containerd 의 미사용 이미지 정리 (각 노드)
crictl rmi --prune
```

---

# 7. 호스트 변경 시 이미지 영향

호스트 IP 가 바뀔 때 이미지 관련 영향:

| 영향 | 대상 | 조치 |
|------|------|------|
| 이미지 자체는 영향 없음 | 모든 이미지 | (작업 X) |
| FeDIT React 번들에 host 박힘 | `localhost:5000/fedit-frontend:latest` | **소스 수정 + 재빌드 필요** ([체크리스트 7번](.claude/projects/-home-yt/memory/project_host_change.md)) |
| PM `config.py` 의 `kubeflow_url` | `localhost:5000/prediction-manager-app:latest` | **소스 수정 + 재빌드 필요** ([체크리스트 8번](.claude/projects/-home-yt/memory/project_host_change.md)) |
| Registry URL (`192.168.0.166:5000`) | PM `config.py:5` | hairpin 작동하면 그대로 OK / 안 되면 새 IP 로 |

---

# 8. 권장 갱신 정책

| 이미지 종류 | 권장 갱신 주기 | 우선 순위 |
|-------------|---------------|-----------|
| 시스템 (자체 빌드) | 코드 변경 시마다 | High (배포 직접 영향) |
| 사용자 빌드 | 사용자 자율 | N/A |
| Kubeflow 공식 | 1년 1회 메이저 (1.x) + 보안 패치 | Medium |
| Knative / KServe / Istio | 6개월 1회 검토 | Medium |
| Keycloak | 보안 패치 시 즉시 | High (CVE 영향) |
| 모니터링 (Prometheus / Grafana) | 1년 1회 검토 | Low |
| AI 런타임 (MLServer) | 호환성 확인 후 | Medium |

---

# 9. 알려진 이미지 관련 이슈 (협의사항)

| 항목 | 영향 | 대응 |
|------|------|------|
| FeDIT 번들 host 하드코딩 | 호스트 변경 시 재빌드 | Phase 3 런타임 config 도입 |
| PM `config.py` host 하드코딩 | 동일 | env 변수로 변경 |
| 시스템 이미지 GC 자동화 X | 디스크 누적 | CronJob 으로 registry GC 추가 검토 |
| `gcr.io/ml-pipeline/frontend:2.2.0` GCR 에서 사라짐 | KFP UI artifact pod 깨짐 (해결됨, 환경변수 override) | 추후 KFP 업그레이드 시 자체 manifest 검토 |
| 노드 디스크 71% | 추가 빌드 시 부담 | docker prune + registry GC 정기화 |
