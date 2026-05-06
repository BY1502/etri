# etri

ETRI predictor creator integration workspace.

## Layout

- `prediction-manager/`: Prediction Manager backend, static UI, Kubernetes specs, and tests.
- `fedit-frontend/`: FeDiT frontend with the predictor creator tool page.
- `manifests/`: Project notes and review documents that are safe to version.

## Guides

- `manifests/ssh-git-live-development-guide.md`: SSH로 서버에 접속해서 Git 작업, Docker 빌드, Kubernetes 배포, 실제 화면 확인까지 진행하는 절차.
- `manifests/predictor-creator-tool-license-review.md`: 예측기 생성 연동 도구 라이선스 검토.
- `manifests/fedit-integration-guide.md`: FeDiT 연동 구성 가이드.

## Local-only files

Runtime secrets, local environment files, generated build outputs, dependency folders,
and operational history logs are intentionally excluded from Git.
