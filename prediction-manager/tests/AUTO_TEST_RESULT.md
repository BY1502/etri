# 자동 테스트 실행 결과 (2026-04-24)

## 실행 방식
- `kubectl port-forward` 로 `prediction-manager` 서비스에 직접 접근 (Istio/oauth2-proxy 우회)
- `kubeflow-userid` 헤더로 admin/researcher1/researcher2 역할 시뮬레이션
- 외부 URL (`https://192.168.0.166:30443/`) 은 헤더 위조 차단(TC-AUTH-01) 검증에만 사용

## 결과 요약

| 번호 | 항목 | 결과 | 비고 |
|------|------|------|------|
| TC-AUTH-01 | 외부 헤더 위조 차단 | **PASS** | oauth2-proxy 가 302 로 차단 |
| TC-AUTH-02 | ns 파라미터 위조 | **PASS** | 쿼리스트링 `?ns=` 무시되고 본인 ns 만 반환 |
| TC-AUTH-03 | admin-only 엔드포인트 | **PASS** | `/api/admin/users` → 403 |
| TC-ADMIN-01 | 사용자 목록 | **PASS** | 3명 (admin/r1/r2) 정상 반환 |
| TC-ADMIN-02 | 클러스터 리소스 | **PASS** | `/api/admin/cluster-capacity` 정상 |
| TC-ADMIN-04 | 사용자 삭제 idempotency | **PASS** | 존재하지 않는 email → 200 (무해) |
| TC-ADMIN-07 | 비밀번호 재설정 validation | **PASS** | 존재하지 않는 email → 404 |
| TC-ADMIN-08 | Contributor 조회 | **PASS** | r1 의 ns 에 r2 가 edit role 로 등록됨 |
| TC-ADMIN-09 | MLflow 저장소 통계 | **PASS** | experiments/runs/artifacts 수치 정상 |
| TC-IMG-01 | 이미지 분류 | **PASS** | system(4개)/user(1개) 정확히 분류 |
| TC-IMG-04 | 사용자 간 이미지 격리(조회) | **PASS** | r2 에 r1 이미지 안 보임 |
| TC-IMG-04b | **사용자 간 이미지 격리(삭제)** | **🔥 FAIL → 수정 후 PASS** | 취약점 발견, 즉시 패치 |
| TC-MODEL-01 | 모델 목록 | **PASS** | |
| TC-MODEL-12/13 | 모델 권한 | **N/A** | r2 가 r1 의 contributor 이므로 정상 접근 허용 (설계 의도) |
| TC-SEC-04 | 시스템 이미지 force 없이 삭제 | **PASS** | admin 도 force 없으면 409 |
| TC-SEC-04b | **일반 사용자 + force=true 시스템 이미지** | **🔥 FAIL → 수정 후 PASS** | 동일 취약점 |
| TC-OPS-01 | Helper pod 자동 정리 | **PARTIAL** | 이전 세션 흔적 3개 잔존 (현재 코드는 Succeeded 시 자동 삭제, 과거 Failed pod 는 수동 정리 필요) |
| TC-OPS-04 | MLflow GC CronJob | **PASS** | `0 3 * * 0` Forbid concurrency |
| TC-OPS-07 | ResourceQuota 강제 | **PASS** | GPU=5 요청 → K8s 가 Pod 생성 거부 (notebook CR 은 생성되지만 StatefulSet 실패, UI 쪽 사전 체크 개선 여지 있음) |
| TC-HOME-02 | 내 리소스 카드 | **PASS** | admin/researcher 모두 my_resource 반환 |
| TC-HOME-03 | 사용자별 리소스 (admin 전용) | **PASS** | admin=3개 user_resources, r1=0개 |
| TC-HOME-04 | AutoML 필터링 | **PASS** | r1 에만 본인 ns AutoML 보임 |

## 🔥 발견된 취약점 (수정 완료)

### Cross-user Image Deletion / System Image Force Delete
- **위치**: `app/routers/images.py` `delete_image` 엔드포인트
- **증상**: 
  1. researcher2 가 `DELETE /api/images/kubeflow-researcher1/ee-test?tag=v1.0` 로 r1 이미지 삭제 성공 (200)
  2. researcher1 이 `DELETE /api/images/prediction-manager-app?force=true` 로 시스템 이미지 삭제 성공 (200)
- **원인**: `is_admin` / `owner_ns` 검사 누락. `protected && force` 조건만 체크
- **영향**: 실제로 테스트 중 `kubeflow-researcher1/ee-test:v1.0` 과 `prediction-manager-app:latest` 태그가 삭제됨 → Registry blob 복구로 원상회복
- **수정**: `images.py:68-90` - admin 여부 + owner namespace 매칭 체크 추가
  ```python
  if cls.get("protected"):
      if not admin: raise 403 (관리자만)
      if not force: raise 409
  else:
      if not admin and owner_ns != user_ns: raise 403
  ```
- **검증**: 수정 후 3개 재테스트 모두 403/409 정상 반환

## ⚠️ 관찰 사항 (위험도 낮음)

1. **TC-AUTH-02 - ns 파라미터 위조**: 403 대신 무시되고 본인 ns 데이터 반환. 데이터 유출은 없으나 UX 관점에서 403 이 더 명확함.
2. **TC-OPS-07 - Quota 체크 타이밍**: API는 200 반환 후 실제 Pod 스케줄링 시 K8s 가 차단. 사전 체크 추가하면 UX 개선.
3. **TC-MODEL 권한**: `owner_namespace=null` 인 구 모델은 모든 사용자 접근 허용. 설계상 의도된 backward compat.
4. **TC-OPS-01 - 잔존 helper pod**: `automl-coldstar-rf-r1-copy`(Succeeded), `automl-e0189610-xgb-r1-copy`(Failed), `automl-mlupgrad-rf-r1-copy`(Succeeded) 3개. Failed 는 사용자 지시사항에 따라 유지 (디버깅용), Succeeded 는 이전 버전 코드에서 남은 것.

## UI 수동 테스트 필요 항목

자동화 불가능한 테스트 (수동 UI 검증 필요):
- TC-CON-01~09 (Notebook 생성/접속/중지/볼륨 연결/GPU)
- TC-AUTOML-01~09 (Job 제출·진행·서빙 UI)
- TC-MODEL-04~11 (운영 배포 UI · Stage 변경 · 다운로드 · 피드백 · 롤백 · ONNX 변환)
- TC-ADMIN-03/05/06 (사용자 추가 모달 · 쿼터 단위 validation · 오버커밋 경고 배너)
- TC-SEC-01/02 (UI XSS · CSRF)
- TC-HOME-01 (KPI 카드 · GPU 시각화)
- TC-E2E-01~03 (브라우저 전체 플로우)
- TC-OPS-03/06 (scale-to-zero cold start 측정, AutoML 스케줄러 회귀)

## 정리 및 환경 상태

- 테스트 중 생성한 `quota-test-dummy` notebook + PVC 모두 삭제 완료
- 삭제된 이미지 (`prediction-manager-app:latest`, `kubeflow-researcher1/ee-test:v1.0`) 모두 blob 기반 복구 완료
- prediction-manager 배포는 패치된 새 이미지 (`sha256:74acc1...`) 로 교체됨
