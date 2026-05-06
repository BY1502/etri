# 예측기 생성 연동 도구 라이선스 검토

작성일: 2026-05-06 11:00:20 +0900

## 기준

- 허용 라이선스: `MIT`, `Apache-2.0`
- 비허용 라이선스: `BSD-*`, `ISC`, `MPL-*`, `GPL-*`, `LGPL-*`, `AGPL-*`, `CC0`, 기타 독자 라이선스
- 범위:
  - FeDiT 예측기 생성 연동 도구 카드: `/predictor-creator-tool`
  - 카드 정의 위치: `/home/yt/FeDiT/FeDiT-main/OSFW/DTSP_e8ight/union-twin-fe/src/pages/predictor-creator-tool/predictor-creator-tool.tsx`
  - 예측매니저/AutoML/모델 관리/시스템 관리는 내부 Prediction Manager backend 의존성까지 함께 확인

> 메모: 이 문서는 개발 의사결정용 정리이며 법무 검토를 대체하지 않는다.

## 카드별 판정

| 기능 카드 | 연결 대상 / 핵심 구성 | 확인 라이선스 | 판정 | 조치 |
|---|---|---:|---:|---|
| 예측매니저 | Prediction Manager 자체 앱 | 자체 코드 + backend 의존성에 BSD/ISC/MPL 포함 | 비허용 | backend 의존성 정리 전까지 MIT/Apache-only 기준 미충족 |
| AutoML | Ray Tune + Optuna + MLflow + 모델 학습 라이브러리 | Ray Apache-2.0, Optuna MIT, MLflow Apache-2.0, 단 sklearn/joblib BSD | 비허용 | Ray/Optuna 중심으로 유지하고 sklearn/joblib 제거 필요 |
| 모델 관리 | MLflow Registry, KServe 배포, ONNX 변환 | MLflow/KServe/ONNX 계열은 통과, backend 의존성에 BSD 포함 | 비허용 | backend 의존성 정리 필요 |
| 시스템 관리 | Prediction Manager admin 화면 | 자체 코드 + backend 의존성에 BSD/ISC/MPL 포함 | 비허용 | backend 의존성 정리 필요 |
| 파이프라인 | Kubeflow Pipelines | Apache-2.0 | 허용 | 유지 가능 |
| MLflow | MLflow Tracking/Registry UI | Apache-2.0 | 허용 | 유지 가능 |
| Ray 대시보드 | Ray Dashboard | Apache-2.0 | 허용 | 유지 가능 |
| KServe 엔드포인트 | KServe Models Web App / InferenceService 관리 | Apache-2.0 | 허용 | 유지 가능 |
| 텐서보드 | TensorBoard / Kubeflow TensorBoards | Apache-2.0 | 허용 | 유지 가능 |
| 볼륨 | Kubeflow Volumes Web App | Apache-2.0 | 허용 | 유지 가능 |
| Label Studio | 데이터 라벨링 / 어노테이션 | Apache-2.0 | 허용 | 유지 가능 |
| Grafana 모니터링 | Grafana OSS | AGPLv3 / AGPL-3.0-only | 비허용 | 제거 또는 MIT/Apache-2.0 대체 UI 필요 |
| Apache NiFi | Apache NiFi | Apache-2.0 | 허용 | 유지 가능 |

## 현재 코드 기준 카드 위치

| 기능 카드 | 코드 위치 |
|---|---|
| 예측매니저 | `predictor-creator-tool.tsx:61` |
| AutoML | `predictor-creator-tool.tsx:68` |
| 모델 관리 | `predictor-creator-tool.tsx:75` |
| 시스템 관리 | `predictor-creator-tool.tsx:82` |
| 파이프라인 | `predictor-creator-tool.tsx:90` |
| MLflow | `predictor-creator-tool.tsx:98` |
| Ray 대시보드 | `predictor-creator-tool.tsx:105` |
| KServe 엔드포인트 | `predictor-creator-tool.tsx:112` |
| 텐서보드 | `predictor-creator-tool.tsx:120` |
| 볼륨 | `predictor-creator-tool.tsx:128` |
| Label Studio | `predictor-creator-tool.tsx` |
| Grafana 모니터링 | `predictor-creator-tool.tsx` |
| Apache NiFi | `predictor-creator-tool.tsx` |

## Prediction Manager 의존성 이슈

현재 `prediction-manager/requirements.txt` 기준으로 MIT/Apache-2.0 외 라이선스가 포함되어 있다.

| 패키지 | 용도 | 라이선스 | 판정 |
|---|---|---:|---:|
| `uvicorn[standard]` | FastAPI 서버 런타임 | BSD-3-Clause 계열 | 비허용 |
| `httpx` | HTTP client | BSD-3-Clause | 비허용 |
| `jinja2` | 템플릿 | BSD 계열 | 비허용 |
| `sse-starlette` | SSE 응답 | BSD-3-Clause | 비허용 |
| `joblib` | 모델 저장/로드, sklearn 생태계 | BSD-3-Clause | 비허용 |
| `scikit-learn` | AutoML 기본 모델/전처리/metric | BSD-3-Clause | 비허용 |
| `certifi` | 인증서 bundle, transitive | MPL-2.0 | 비허용 |
| `requests-oauthlib` | OAuth helper, transitive | ISC | 비허용 |

따라서 Prediction Manager 자체 기능을 MIT/Apache-only 기준으로 통과시키려면 backend 스택과 AutoML 학습 라이브러리를 재검토해야 한다.

## AutoML 정리 방향

MIT/Apache-2.0만 허용할 경우 AutoML은 다음처럼 정리하는 방향이 맞다.

| 유지 후보 | 라이선스 | 비고 |
|---|---:|---|
| Ray / Ray Tune | Apache-2.0 | 분산 실행 / trial 스케줄링 |
| Optuna | MIT | 탐색 알고리즘 / study |
| MLflow | Apache-2.0 | 실험 기록 / registry |
| XGBoost | Apache-2.0 | 모델 후보 |
| LightGBM | MIT | 모델 후보 |
| ONNX | Apache-2.0 | 모델 포맷 |
| ONNX Runtime | MIT | 추론 런타임 |

| 제거 또는 대체 필요 | 라이선스 | 이유 |
|---|---:|---|
| scikit-learn | BSD-3-Clause | 허용 라이선스 밖 |
| joblib | BSD-3-Clause | 허용 라이선스 밖 |

## 권장 조치

1. Grafana 카드를 예측기 생성 연동 도구에서 제거하거나, Prometheus API 기반 자체 경량 모니터링 화면으로 대체한다.
2. AutoML에서 sklearn/joblib 기반 모델과 저장 방식을 제거한다.
3. AutoML 기본 후보를 XGBoost/LightGBM 중심으로 제한한다.
4. 모델 저장은 joblib 대신 각 라이브러리 자체 포맷 또는 ONNX를 사용한다.
5. Prediction Manager backend가 MIT/Apache-only 정책을 만족해야 한다면 `uvicorn/httpx/jinja2/sse-starlette` 대체 가능성을 별도 검토한다.

## 참고 출처

- Grafana licensing: https://grafana.com/licensing/
- Grafana GitHub license: https://github.com/grafana/grafana
- MLflow: https://mlflow.org/
- MLflow GitHub: https://github.com/mlflow/mlflow
- Ray GitHub: https://github.com/ray-project/ray
- Kubeflow GitHub: https://github.com/kubeflow/kubeflow
- Kubeflow Pipelines GitHub: https://github.com/kubeflow/pipelines
- KServe GitHub: https://github.com/kserve/kserve
- KServe license docs: https://kserve.github.io/website/docs/community/get-involved
- TensorBoard GitHub: https://github.com/tensorflow/tensorboard
- Optuna GitHub: https://github.com/optuna/optuna
- Optuna PyPI: https://pypi.org/project/optuna/
- Label Studio GitHub: https://github.com/HumanSignal/label-studio
- Label Studio PyPI: https://pypi.org/project/label-studio/
- Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0.html
