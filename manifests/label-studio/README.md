# Label Studio 통합

Label Studio를 Kubeflow Gateway 뒤 `/label-studio/` 경로로 노출하고, FeDiT 예측기 생성 연동 도구 카드에서 iframe으로 접근한다.

## 라이선스

- Label Studio: Apache-2.0
- 공식 repo: https://github.com/HumanSignal/label-studio
- PyPI: https://pypi.org/project/label-studio/

## 배포

공식 이미지를 로컬 레지스트리에 미러링한다.

```bash
docker pull heartexlabs/label-studio:1.23.0
docker tag heartexlabs/label-studio:1.23.0 localhost:5000/label-studio:1.23.0
docker push localhost:5000/label-studio:1.23.0
```

권한 오류가 나면 `docker` 앞에 `sudo`를 붙인다.

현재 매니페스트는 push 결과 digest를 고정해서 사용한다.

```text
localhost:5000/label-studio@sha256:20cec817e63144adec9f23d699bf4f33ce4249a56eb183ae4853d20fbd10fd93
```

매니페스트 적용:

```bash
kubectl apply -f /home/yt/etri/manifests/label-studio/label-studio.yaml
kubectl rollout status deployment/label-studio -n kubeflow
kubectl get pods -n kubeflow -l app=label-studio
```

접속:

```text
https://192.168.0.166:30443/label-studio/
```

FeDiT 경로:

```text
https://192.168.0.166:30443/fedit/
→ 예측기 생성/연동 도구
→ Label Studio
```

## 데이터

기본 데이터는 PVC에 저장한다.

```text
PVC: kubeflow/label-studio-data
mount: /label-studio/data
```

현재 구성은 SQLite 기반 단일 인스턴스이다. 여러 명이 많이 쓰거나 장기 운영할 경우 PostgreSQL 분리를 별도 설계한다.

## 인증 메모

외부 접근은 Kubeflow Gateway/OAuth2-Proxy 경로를 통과한다. Label Studio 내부 계정/프로젝트 권한은 Label Studio 자체 기능으로 관리한다.

초기 접속 시 Label Studio의 첫 사용자 생성 화면이 뜰 수 있다. 운영 계정 생성 후에는 Label Studio 내부에서 사용자 초대/권한을 관리한다.

## 주의

- `LABEL_STUDIO_HOST`는 `/label-studio` sub-path를 포함해야 한다.
- 공식 문서 기준 Docker sub-path 배포는 `LABEL_STUDIO_HOST`로 설정한다.
- Istio VirtualService는 `/label-studio/` prefix를 backend `/`로 rewrite하고 `x-forwarded-prefix: /label-studio`를 전달한다.
- Secret, 초기 비밀번호, 토큰은 이 repo에 커밋하지 않는다.
