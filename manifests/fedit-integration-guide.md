# FeDiT 서버에 Kubeflow MLOps 플랫폼 구축 가이드

## 개요

FeDiT이 운영 중인 서버에 Kubernetes + Kubeflow MLOps 스택을 설치하여,
FeDiT의 "예측기 생성/연동 도구"에서 모든 MLOps 서비스를 iframe으로 바로 사용할 수 있게 합니다.

### 최종 구조

```
[FeDiT 서버 (220.124.222.x)]
│
├── FeDiT 기존 서비스 (Spring Boot + React + PostgreSQL)
│
└── Kubernetes 클러스터 (신규 설치)
    ├── Istio Gateway (:30443)
    │   ├── /fedit/                ← FeDiT 프론트엔드 (수정본)
    │   ├── /prediction-manager/   ← 예측매니저
    │   ├── /jupyter/              ← Kubeflow 노트북
    │   ├── /pipeline/             ← Kubeflow 파이프라인
    │   ├── /mlflow/               ← MLflow
    │   ├── /ray/                  ← Ray 대시보드
    │   ├── /kserve-endpoints/     ← KServe 모델 서빙
    │   ├── /katib/                ← Katib HPO
    │   ├── /tensorboards/         ← 텐서보드
    │   ├── /volumes/              ← 볼륨 관리
    │   ├── /grafana/              ← Grafana 모니터링
    │   ├── /nifi/                 ← Apache NiFi
    │   └── /auth/                 ← Keycloak SSO
    │
    ├── kubeflow 네임스페이스
    ├── monitoring 네임스페이스 (Prometheus + Grafana)
    ├── keycloak 네임스페이스
    ├── nifi 네임스페이스
    └── ray-system 네임스페이스
```

같은 서버에서 돌기 때문에:
- nginx 프록시 불필요 (같은 도메인)
- iframe 인증서/CORS 문제 없음
- 단, FeDiT 인증과 Keycloak 인증은 별개 → 통합하려면 추가 개발 필요

---

## 서버 요구사항

### 하드웨어 최소 사양

| 항목 | 최소 | 권장 |
|------|------|------|
| CPU | 8코어 | 16코어 이상 |
| RAM | 32GB | 64GB 이상 |
| 디스크 | 200GB SSD | 500GB SSD |
| GPU | (선택) | NVIDIA RTX 3090 이상 (ML 학습용) |

### 소프트웨어 요구사항

| 항목 | 버전 |
|------|------|
| OS | Ubuntu 22.04 / 24.04 LTS |
| Kubernetes | v1.30.x |
| containerd | 2.x |
| NVIDIA Driver | 550+ (GPU 사용 시) |

---

## 설치 순서

### Phase 1: Kubernetes 클러스터 설치

```bash
# 1. containerd 설치
sudo apt-get update
sudo apt-get install -y containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
# SystemdCgroup = true 로 변경
sudo systemctl restart containerd

# 2. kubeadm/kubelet/kubectl 설치
sudo apt-get install -y apt-transport-https ca-certificates curl
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet=1.30.14-* kubeadm=1.30.14-* kubectl=1.30.14-*
sudo apt-mark hold kubelet kubeadm kubectl

# 3. 클러스터 초기화
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# 4. kubeconfig 설정
mkdir -p $HOME/.kube
sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# 5. 단일 노드인 경우 taint 제거
kubectl taint nodes --all node-role.kubernetes.io/control-plane-

# 6. CNI (Calico 또는 Flannel)
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml

# 7. local-path-provisioner (PVC 지원)
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.28/deploy/local-path-storage.yaml
kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### Phase 2: GPU 설정 (선택)

```bash
# NVIDIA Device Plugin
helm repo add nvdp https://nvidia.github.io/k8s-device-plugin
helm install nvidia-device-plugin nvdp/nvidia-device-plugin \
  --namespace nvidia-device-plugin --create-namespace \
  --set config.default=time-slicing \
  --set config.data.time-slicing.renameByDefault=false \
  --set config.data.time-slicing.resources[0].name=nvidia.com/gpu \
  --set config.data.time-slicing.resources[0].replicas=8

# 확인
kubectl get nodes -o json | grep nvidia.com/gpu
```

### Phase 3: Kubeflow 설치

```bash
# Kubeflow manifests 다운로드
git clone https://github.com/kubeflow/manifests.git
cd manifests
git checkout v1.9-branch

# kustomize 설치
wget https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.4.3/kustomize_v5.4.3_linux_amd64.tar.gz
tar xzf kustomize_v5.4.3_linux_amd64.tar.gz
sudo mv kustomize /usr/local/bin/

# Kubeflow 전체 설치 (시간 소요: 10~20분)
while ! kustomize build example | kubectl apply -f -; do
  echo "Retrying..."; sleep 10;
done

# 설치 확인
kubectl get pods -n kubeflow --field-selector=status.phase!=Running
# 모든 Pod이 Running이면 완료
```

### Phase 4: Keycloak 설치 (Dex 대체)

```bash
# 네임스페이스 생성
kubectl create namespace keycloak

# Keycloak 배포 (dev 모드, 내장 H2 DB)
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak
  namespace: keycloak
spec:
  replicas: 1
  selector:
    matchLabels:
      app: keycloak
  template:
    metadata:
      labels:
        app: keycloak
      annotations:
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: keycloak
          image: quay.io/keycloak/keycloak:26.0
          args: ["start-dev"]
          env:
            - name: KC_HTTP_RELATIVE_PATH
              value: "/auth"
            - name: KC_PROXY_HEADERS
              value: "xforwarded"
            - name: KC_HTTP_ENABLED
              value: "true"
            - name: KC_HOSTNAME_STRICT
              value: "false"
            - name: KEYCLOAK_ADMIN
              value: "admin"
            - name: KEYCLOAK_ADMIN_PASSWORD
              value: "<관리자 비밀번호>"
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 2Gi
---
apiVersion: v1
kind: Service
metadata:
  name: keycloak
  namespace: keycloak
spec:
  ports:
    - name: http
      port: 80
      targetPort: 8080
  selector:
    app: keycloak
EOF

# Istio 연동 (VirtualService, NetworkPolicy, AuthorizationPolicy)
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: keycloak
  namespace: keycloak
spec:
  gateways:
    - kubeflow/kubeflow-gateway
  hosts:
    - "*"
  http:
    - match:
        - uri:
            prefix: /auth
      route:
        - destination:
            host: keycloak.keycloak.svc.cluster.local
            port:
              number: 80
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-istio-ingress
  namespace: keycloak
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: istio-system
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: oauth2-proxy
---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: keycloak-allow
  namespace: keycloak
spec:
  rules:
    - {}
EOF

# Keycloak Realm, Client, User 설정
kubectl port-forward -n keycloak svc/keycloak 8888:80 &
KC="http://localhost:8888/auth"

# Admin 토큰
ADMIN_TOKEN=$(curl -s -X POST "${KC}/realms/master/protocol/openid-connect/token" \
  -d "username=admin&password=<관리자 비밀번호>&grant_type=password&client_id=admin-cli" \
  | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['access_token'])")

# Realm 생성
curl -s -X POST "${KC}/admin/realms" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"realm":"kubeflow","enabled":true,"displayName":"Kubeflow MLOps Platform"}'

# Client 생성 (※ FEDIT_SERVER_URL을 실제 서버 URL로 변경)
FEDIT_SERVER_URL="https://<FeDiT서버IP>:30443"
curl -s -X POST "${KC}/admin/realms/kubeflow/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\": \"kubeflow-client\",
    \"publicClient\": false,
    \"secret\": \"<클라이언트 시크릿>\",
    \"redirectUris\": [\"${FEDIT_SERVER_URL}/oauth2/callback\", \"${FEDIT_SERVER_URL}/*\"],
    \"webOrigins\": [\"${FEDIT_SERVER_URL}\"],
    \"standardFlowEnabled\": true,
    \"directAccessGrantsEnabled\": true
  }"

# 사용자 생성 (※ lastName 필수, 없으면 VERIFY_PROFILE 에러)
curl -s -X POST "${KC}/admin/realms/kubeflow/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"user","email":"user@example.com","emailVerified":true,
       "enabled":true,"firstName":"User","lastName":"Admin",
       "credentials":[{"type":"password","value":"<비밀번호>","temporary":false}]}'
```

### Phase 5: OAuth2-Proxy 설정 변경 (Dex → Keycloak)

```bash
# ConfigMap 수정
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: oauth2-proxy
  namespace: oauth2-proxy
data:
  oauth2_proxy.cfg: |
    provider = "oidc"
    oidc_issuer_url = "http://keycloak.keycloak.svc.cluster.local/auth/realms/kubeflow"
    scope = "openid email profile"
    upstreams = "static://200"
    email_domains = [ "*" ]
    skip_auth_regex=["/auth/.*", "/oauth2/sign_out", "/oauth2/sign_in"]
    skip_oidc_discovery = true
    login_url = "/auth/realms/kubeflow/protocol/openid-connect/auth"
    redeem_url = "http://keycloak.keycloak.svc.cluster.local/auth/realms/kubeflow/protocol/openid-connect/token"
    oidc_jwks_url = "http://keycloak.keycloak.svc.cluster.local/auth/realms/kubeflow/protocol/openid-connect/certs"
    skip_provider_button = true
    set_authorization_header = true
    set_xauthrequest = true
    cookie_name = "oauth2_proxy_kubeflow"
    cookie_expire = "24h"
    cookie_refresh = 0
    code_challenge_method = "S256"
    redirect_url = "/oauth2/callback"
    relative_redirect_url = true
EOF

# Secret 수정
kubectl create secret generic oauth2-proxy-h675gf55ht \
  --namespace oauth2-proxy \
  --from-literal=client-id=kubeflow-client \
  --from-literal=client-secret=<클라이언트 시크릿> \
  --from-literal=cookie-secret=$(openssl rand -hex 16) \
  --dry-run=client -o yaml | kubectl apply -f -

# Dex 스케일 다운 + OAuth2-Proxy 재시작
kubectl scale deployment dex -n auth --replicas=0
kubectl rollout restart deployment oauth2-proxy -n oauth2-proxy
```

### Phase 6: 추가 서비스 설치

#### MLflow
```bash
# MLflow는 Kubeflow 사용자 네임스페이스에 배포
# Deployment + Service + VirtualService
# 상세: /home/yt/manifests/work-log.md 참고
```

#### Ray Cluster
```bash
helm repo add kuberay https://ray-project.github.io/kuberay-helm/
helm install kuberay-operator kuberay/kuberay-operator --namespace ray-system --create-namespace
# RayCluster CRD 배포 (Head 1 + Worker 1, GPU 할당)
```

#### Prometheus + Grafana
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace
# DCGM Exporter (GPU 메트릭), Ray Dashboard 연동
```

#### Apache NiFi
```bash
# StatefulSet으로 배포 (NiFi 1.16.3, HTTP 모드)
# VirtualService + authorization header 제거
```

#### 예측매니저
```bash
# FastAPI 앱 Docker 빌드 → localhost:5000 레지스트리 push → K8s 배포
# 소스: /home/yt/prediction-manager/
```

### Phase 7: FeDiT 프론트엔드 배포

```bash
cd /home/yt/FeDiT/FeDiT-main/OSFW/DTSP_e8ight/union-twin-fe

# .env 수정 (PUBLIC_URL, 서비스 URL은 상대경로 유지)
# App.tsx basename="/fedit" 설정

# 빌드
npm run build

# Docker 이미지
docker build -t localhost:5000/fedit-frontend:latest .
docker push localhost:5000/fedit-frontend:latest

# K8s 배포 (Deployment + Service + VirtualService + DestinationRule + NetworkPolicy)
kubectl apply -f /tmp/fedit-k8s.yaml
```

### Phase 8: Central Dashboard 로그아웃 수정

```bash
kubectl set env deployment/centraldashboard -n kubeflow \
  LOGOUT_URL="/auth/realms/kubeflow/protocol/openid-connect/logout?post_logout_redirect_uri=https%3A%2F%2F<서버IP>%3A30443%2F&client_id=kubeflow-client"
```

---

## 설치 후 검증 체크리스트

| # | 항목 | 확인 방법 |
|---|------|----------|
| 1 | Keycloak 관리 콘솔 | `https://<서버IP>:30443/auth/admin/` 접근 |
| 2 | Keycloak 로그인 | `https://<서버IP>:30443/` → 로그인 화면 표시 |
| 3 | FeDiT 대시보드 | `https://<서버IP>:30443/fedit/` → 로그인 후 대시보드 |
| 4 | 예측기 도구 카드 | 예측매니저, 노트북, MLflow 등 11개 카드 표시 |
| 5 | 노트북 생성/접속 | 카드 클릭 → iframe 내 노트북 목록 + 생성 |
| 6 | MLflow 실험 | 카드 클릭 → iframe 내 실험 목록 |
| 7 | 로그아웃 | 로그아웃 버튼 → Keycloak 로그아웃 → 재로그인 |
| 8 | GPU 할당 | 노트북 생성 시 GPU 선택 가능 |

---

## 인증 구조 (FeDiT ↔ Kubeflow)

### 현재 상태 (통합 전)
- **FeDiT**: 자체 로그인 (dataAuth + PostgreSQL + JWT)
- **Kubeflow**: Keycloak SSO (별도 로그인)
- 사용자는 FeDiT 로그인 1번 + Keycloak 로그인 1번 = **총 2번 로그인**

### 인증 통합 옵션 (추가 개발 필요)

| 방법 | 작업량 | 설명 |
|------|--------|------|
| **그냥 2번 로그인** | 없음 | FeDiT 로그인 + Keycloak 로그인 각각. 가장 간단 |
| **FeDiT → Keycloak 전환** | 중간 | FeDiT 로그인을 Keycloak OIDC로 교체. FeDiT 프론트엔드 + dataAuth 수정 필요. FeDiT 관리자와 협의 필수 |
| **Keycloak User Storage SPI** | 높음 | Keycloak이 FeDiT DB(member 테이블)를 직접 읽어 인증. Java SPI 커스텀 개발 + 비밀번호 해시 매핑 필요 |

같은 서버라고 인증이 자동 통합되지 않습니다.
DB가 localhost라 네트워크 설정은 편하지만, 연동 개발은 별도로 해야 합니다.

---

## 참고 파일 위치

| 파일 | 설명 |
|------|------|
| `/home/yt/manifests/work-log.md` | 전체 작업 로그 (명령어, 에러, 해결 과정) |
| `/home/yt/prediction-manager/` | 예측매니저 소스코드 |
| `/home/yt/FeDiT/FeDiT-main/OSFW/DTSP_e8ight/union-twin-fe/` | 수정된 FeDiT 프론트엔드 |
| `/home/yt/e2e-test/` | E2E 테스트 스크립트 + 가이드 |
| `/home/yt/docker-images/ray-mlflow/` | Ray 커스텀 이미지 Dockerfile |
| `/tmp/keycloak-deploy.yaml` | Keycloak 배포 매니페스트 |
| `/tmp/fedit-k8s.yaml` | FeDiT K8s 배포 매니페스트 |
| `/tmp/oauth2-proxy-cm-backup.yaml` | Dex 시절 OAuth2-Proxy 백업 |
