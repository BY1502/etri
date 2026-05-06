# SSH + Git + Live Deployment 개발 가이드

이 문서는 현재 서버에 이미 올라가 있는 예측기 생성 연동 도구를 SSH로 접속해서 수정하고, Git으로 기록하고, 실제 Kubernetes 배포 화면까지 확인하는 절차를 정리한다.

## 1. 현재 기준 구조

### Git 기준 폴더

앞으로 개발 기준은 아래 폴더로 통일한다.

```bash
/home/yt/etri
```

GitHub 원격 저장소:

```bash
https://github.com/BY1502/etri.git
```

현재 repo 구성:

```text
/home/yt/etri
├── prediction-manager/   # 예측 매니저 백엔드 + 정적 UI + k8s spec
├── fedit-frontend/       # FeDiT 프론트엔드, 예측기 생성 연동 도구 탭 포함
└── manifests/            # 안전하게 Git 관리 가능한 문서
```

### 실제 운영 배포 대상

현재 Kubernetes에는 아래 deployment가 떠 있다.

```text
namespace: kubeflow

deployment/prediction-manager
  container: prediction-manager
  current image: localhost:5000/prediction-manager-app@sha256:5d47afaf7dfcc903403a3b3627e4760425eeb02f50b110b5312ce4154ecbede9

deployment/fedit-frontend
  container: fedit-frontend
  current image: localhost:5000/fedit-frontend@sha256:68064c5880703bd608f1f6bcb9878d5ee5027bfc9908a72ec2afc1c768caf4ec
```

운영 URL:

```text
Kubeflow / FeDiT 진입: https://192.168.0.166:30443
Prediction Manager 직접 경로: https://192.168.0.166:30443/prediction-manager/
```

## 2. 왜 Git 수정만으로는 화면이 안 바뀌는가

현재 서비스는 서버 디렉터리의 파일을 직접 읽는 방식이 아니라 Docker 이미지로 빌드된 뒤 Kubernetes Pod에서 실행된다.

따라서 수정 확인 흐름은 아래 순서가 되어야 한다.

```text
코드 수정
→ Git commit
→ Docker image build
→ local registry push
→ Kubernetes deployment image 교체
→ rollout 완료 확인
→ 브라우저에서 실제 화면 확인
```

`/home/yt/etri`에서 코드를 고쳐도 배포하지 않으면 현재 떠 있는 화면은 바뀌지 않는다.

## 3. SSH 접속

개발자는 자기 PC에서 서버로 접속한다.

```bash
ssh yt@192.168.0.166
```

VS Code Remote-SSH를 쓸 경우 예시:

```sshconfig
Host etri-server
  HostName 192.168.0.166
  User yt
```

접속 후 기본 작업 위치:

```bash
cd /home/yt/etri
```

## 4. 여러 명이 작업할 때 권장 방식

같은 `yt` 계정으로 같은 `/home/yt/etri` 폴더를 동시에 만지면 충돌이 쉽게 난다.

가능하면 개발자별 clone을 따로 둔다.

```bash
mkdir -p /home/yt/dev
cd /home/yt/dev
git clone https://github.com/BY1502/etri.git etri-개발자이름
cd etri-개발자이름
```

다만 실제 배포는 기준 폴더인 `/home/yt/etri`에서 수행하는 것을 원칙으로 한다. 개발자별 폴더에서 작업한 내용은 GitHub branch/PR 또는 merge로 `/home/yt/etri`에 반영한 뒤 배포한다.

## 5. 작업 시작 전 필수 확인

항상 작업 전에 현재 상태를 확인한다.

```bash
cd /home/yt/etri
git status
git branch
git pull --ff-only
```

작업 브랜치를 만든다.

```bash
git checkout -b feature/작업이름
```

예:

```bash
git checkout -b feature/predictor-container-ui
```

## 6. 수정 위치 판단

### Prediction Manager를 수정하는 경우

대상 폴더:

```bash
/home/yt/etri/prediction-manager
```

주요 위치:

```text
app/main.py                         # FastAPI 앱 진입점
app/routers/*.py                    # API 라우터
app/services/*.py                   # Kubernetes, MLflow, Ray, NiFi 등 서비스 로직
static/index.html                   # 정적 UI 진입
static/js/pages/*.js                # 예측 매니저 화면별 JS
static/css/style.css                # 예측 매니저 스타일
k8s/*.yaml                          # prediction-manager 배포 spec
tests/*.md                          # 테스트 계획/시나리오 문서
```

### FeDiT 프론트엔드를 수정하는 경우

대상 폴더:

```bash
/home/yt/etri/fedit-frontend
```

예측기 생성 연동 도구 탭 주요 위치:

```text
src/pages/predictor-creator-tool/predictor-creator-tool.tsx
src/pages/predictor-creator-tool/predictor-creator-tool.scss
src/pages/home/home.tsx
src/assets/images/home/*.svg
```

## 7. Git 커밋

수정 후 확인:

```bash
cd /home/yt/etri
git status
git diff
```

커밋:

```bash
git add .
git commit -m "작업 내용"
```

GitHub에 branch push:

```bash
git push -u origin feature/작업이름
```

`main`에 바로 커밋하는 것은 피한다. 최소한 기능 단위 branch를 만들고, 확인 후 merge한다.

## 8. Prediction Manager 라이브 배포

백엔드 또는 예측 매니저 정적 UI를 수정했을 때 수행한다.

### 8-1. 현재 운영 이미지 백업

롤백을 위해 현재 이미지를 먼저 기록한다.

```bash
kubectl get deployment prediction-manager -n kubeflow \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

출력값 예:

```text
localhost:5000/prediction-manager-app@sha256:...
```

### 8-2. 이미지 빌드

```bash
cd /home/yt/etri/prediction-manager

TAG="$(date +%Y%m%d-%H%M%S)-$(git -C /home/yt/etri rev-parse --short HEAD)"
IMAGE="localhost:5000/prediction-manager-app:${TAG}"

docker build -t "${IMAGE}" .
```

Docker 권한 오류가 나면 `docker` 앞에 `sudo`를 붙인다.

```bash
sudo docker build -t "${IMAGE}" .
```

### 8-3. Local registry push

```bash
docker push "${IMAGE}"
```

권한 오류가 나면:

```bash
sudo docker push "${IMAGE}"
```

### 8-4. Push된 digest 확인

현재 클러스터는 digest 고정 배포가 안전하다. 태그만 쓰면 containerd 캐시 때문에 예전 이미지가 재사용될 수 있다.

```bash
DIGEST="$(
  curl -sI \
    -H 'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
    "http://localhost:5000/v2/prediction-manager-app/manifests/${TAG}" \
  | tr -d '\r' \
  | awk -F': ' '/Docker-Content-Digest/ {print $2}'
)"

echo "${DIGEST}"
```

`sha256:...` 값이 출력되어야 한다. 비어 있으면 배포하지 말고 push/tag를 다시 확인한다.

### 8-5. Kubernetes 이미지 교체

```bash
kubectl set image deployment/prediction-manager -n kubeflow \
  prediction-manager="localhost:5000/prediction-manager-app@${DIGEST}"
```

### 8-6. Rollout 확인

```bash
kubectl rollout status deployment/prediction-manager -n kubeflow
kubectl get pods -n kubeflow -l app=prediction-manager
```

로그 확인:

```bash
kubectl logs -n kubeflow deployment/prediction-manager -c prediction-manager --tail=100
```

HTTP 확인:

```bash
curl -sk https://192.168.0.166:30443/prediction-manager/ -o /dev/null -w "%{http_code}\n"
```

정상 기대값:

```text
200
```

## 9. FeDiT 프론트엔드 라이브 배포

예측기 생성 연동 도구 탭, 홈 카드, FeDiT 라우팅/화면을 수정했을 때 수행한다.

### 9-1. 현재 운영 이미지 백업

```bash
kubectl get deployment fedit-frontend -n kubeflow \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

### 9-2. 프론트엔드 빌드

FeDiT Dockerfile은 `build/` 폴더를 nginx 이미지에 복사한다. 따라서 Docker image build 전에 React build가 먼저 필요하다.

```bash
cd /home/yt/etri/fedit-frontend
npm ci
npm run build
```

`npm ci`는 처음 한 번 또는 `package-lock.json`이 바뀐 경우에 필요하다. 이미 `node_modules`가 있고 의존성이 바뀌지 않았으면 `npm run build`만 해도 된다.

### 9-3. Docker image build

```bash
TAG="$(date +%Y%m%d-%H%M%S)-$(git -C /home/yt/etri rev-parse --short HEAD)"
IMAGE="localhost:5000/fedit-frontend:${TAG}"

docker build -t "${IMAGE}" .
```

권한 오류가 나면:

```bash
sudo docker build -t "${IMAGE}" .
```

### 9-4. Local registry push

```bash
docker push "${IMAGE}"
```

권한 오류가 나면:

```bash
sudo docker push "${IMAGE}"
```

### 9-5. Push된 digest 확인

```bash
DIGEST="$(
  curl -sI \
    -H 'Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
    "http://localhost:5000/v2/fedit-frontend/manifests/${TAG}" \
  | tr -d '\r' \
  | awk -F': ' '/Docker-Content-Digest/ {print $2}'
)"

echo "${DIGEST}"
```

`sha256:...` 값이 출력되어야 한다.

### 9-6. Kubernetes 이미지 교체

```bash
kubectl set image deployment/fedit-frontend -n kubeflow \
  fedit-frontend="localhost:5000/fedit-frontend@${DIGEST}"
```

### 9-7. Rollout 확인

```bash
kubectl rollout status deployment/fedit-frontend -n kubeflow
kubectl get pods -n kubeflow -l app=fedit-frontend
```

로그 확인:

```bash
kubectl logs -n kubeflow deployment/fedit-frontend -c fedit-frontend --tail=100
```

브라우저 확인:

```text
https://192.168.0.166:30443
```

브라우저 캐시 때문에 이전 JS가 남아 보이면 강력 새로고침을 한다.

```text
Windows/Linux: Ctrl + Shift + R
macOS: Cmd + Shift + R
```

## 10. 둘 다 바뀐 경우의 순서

Prediction Manager API와 FeDiT 화면이 같이 바뀌면 보통 아래 순서로 배포한다.

```text
1. prediction-manager 배포
2. prediction-manager API 정상 확인
3. fedit-frontend build/deploy
4. 브라우저에서 전체 플로우 확인
```

프론트가 새 API를 먼저 호출하는데 백엔드가 아직 예전이면 화면 오류가 날 수 있다.

## 11. 확인 체크리스트

배포 후 최소 확인:

```bash
kubectl get deployment prediction-manager fedit-frontend -n kubeflow
kubectl get pods -n kubeflow -l app=prediction-manager
kubectl get pods -n kubeflow -l app=fedit-frontend
```

Prediction Manager:

```bash
curl -sk https://192.168.0.166:30443/prediction-manager/ -o /dev/null -w "%{http_code}\n"
```

FeDiT:

```text
1. https://192.168.0.166:30443 접속
2. FeDiT 홈 진입
3. 예측기 생성 연동 도구 카드 클릭
4. 수정한 화면/기능 확인
5. 브라우저 개발자 도구 Console/Network 에러 확인
```

## 12. 롤백

배포 전에 기록해둔 이전 이미지로 되돌린다.

Prediction Manager:

```bash
kubectl set image deployment/prediction-manager -n kubeflow \
  prediction-manager="이전에_기록한_prediction_manager_이미지"

kubectl rollout status deployment/prediction-manager -n kubeflow
```

FeDiT:

```bash
kubectl set image deployment/fedit-frontend -n kubeflow \
  fedit-frontend="이전에_기록한_fedit_frontend_이미지"

kubectl rollout status deployment/fedit-frontend -n kubeflow
```

`kubectl rollout undo`도 가능하지만, 이 환경에서는 digest를 직접 기록하고 되돌리는 방식이 더 명확하다.

## 13. GitHub 반영

라이브 확인까지 끝난 뒤 GitHub에 branch를 push한다.

```bash
cd /home/yt/etri
git status
git push -u origin feature/작업이름
```

`main`에 반영할 때는 GitHub PR을 사용하거나, 최소한 서버에서 아래 순서를 지킨다.

```bash
cd /home/yt/etri
git checkout main
git pull --ff-only
git merge --no-ff feature/작업이름
git push origin main
```

## 14. 절대 Git에 넣으면 안 되는 것

아래 파일/정보는 Git에 넣지 않는다.

```text
.env
.env.*
tls.crt
tls.key
*.pem
*.key
work-log.md
Kubernetes Secret 원문
GitHub token
Keycloak client secret
OAuth cookie secret
실제 운영 비밀번호
node_modules/
venv/
build/
```

`work-log.md`는 운영 이력과 과거 secret 문자열이 섞여 있으므로 로컬 참고용으로만 둔다.

## 15. 신입 개발자에게 줄 최소 지시문

```text
1. SSH로 서버 접속
   ssh yt@192.168.0.166

2. 개인 작업 폴더 생성
   mkdir -p /home/yt/dev
   cd /home/yt/dev
   git clone https://github.com/BY1502/etri.git etri-본인이름
   cd etri-본인이름

3. 브랜치 생성
   git checkout -b feature/작업명

4. 수정 위치
   - 백엔드/예측매니저: prediction-manager/
   - FeDiT 화면: fedit-frontend/

5. 커밋
   git status
   git add .
   git commit -m "작업 내용"

6. 서버 라이브 반영은 담당자와 함께 /home/yt/etri 기준 폴더에 merge 후 진행

7. 배포 후 반드시 실제 URL에서 확인
   https://192.168.0.166:30443
```

## 16. 사고 방지 규칙

- 작업 전 `git status`를 먼저 본다.
- 공용 폴더에서 남의 변경을 `git reset --hard`로 지우지 않는다.
- `main`에서 직접 개발하지 않는다.
- 배포 전 현재 운영 image digest를 기록한다.
- tag만 믿고 배포하지 말고 digest로 `kubectl set image` 한다.
- 화면만 확인하지 말고 `kubectl rollout status`와 pod log를 같이 본다.
- secret이나 token은 채팅, 문서, Git에 남기지 않는다.
