# 주간 재학습 파이프라인 사용법

## 1) 노트북에서 KFP 설치
```bash
pip install kfp>=2.0
```

## 2) 파이프라인 컴파일
연구원1 JupyterLab 에서:
```bash
# 이 파일을 노트북 PVC 로 복사
cp weekly_retrain_pipeline.py /home/jovyan/
cd /home/jovyan
python weekly_retrain_pipeline.py
# → weekly_retrain_pipeline.yaml 생성
```

## 3) Kubeflow Central Dashboard 에서 업로드
1. 브라우저에서 `https://192.168.0.166:30443/` 접속 (연구원1 로그인)
2. 왼쪽 메뉴 **Pipelines** 클릭
3. 상단 **Upload pipeline** 버튼
   - Pipeline Name: `weekly-retrain`
   - Description: 임의
   - Upload a file → `weekly_retrain_pipeline.yaml` 선택
   - Create 클릭

## 4) Recurring Run 생성 (스케줄)
1. **Pipelines** → 방금 업로드한 `weekly-retrain` 선택
2. **Create Run** 버튼
3. **Recurring** 탭 선택
4. 설정:
   - Run name: `weekly-auto-mon-3am`
   - Trigger Type: **Cron**
   - Cron expression: `0 3 * * 1`   (분 시 일 월 요일)
     - `0`  : 0분
     - `3`  : 3시
     - `*`  : 매일
     - `*`  : 매월
     - `1`  : 월요일 (0=일요일, 1=월요일, ..., 6=토요일)
   - Maximum concurrent runs: 1
   - Start date: 오늘
   - End date: 무기한
5. **Parameters** 에서 임계값 등 수정 가능
   - `dataset_url`: 실제 데이터 URL 또는 PVC 경로
   - `target_column`: 예측 타깃 컬럼 이름
   - `threshold`: 0.90
   - `max_attempts`: 10
   - `registered_name`: Registry 에 등록할 모델 이름
6. **Start** 클릭

## 5) 실행 확인
- **Experiments (KFP)** → 관련 Run 클릭 → 진행 상황 확인
- 각 run 은 단일 pod 로 실행됨 (train_until_threshold 내부에서 반복)
- 로그에서 `[attempt 1] score=...`, `[attempt 2]` ... 순차적으로 확인 가능
- 성공 시: 예측매니저 **MODELS** 페이지에서 `weekly-auto-*` 모델 확인 가능

## 참고: Cron 표현식 예시
- 매주 월요일 03:00: `0 3 * * 1`
- 매일 02:00: `0 2 * * *`
- 평일 06:00: `0 6 * * 1-5`
- 매월 1일 04:00: `0 4 1 * *`
- 30분마다: `*/30 * * * *`
