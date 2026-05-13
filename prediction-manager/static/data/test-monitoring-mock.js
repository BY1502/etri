// ============================================================
// MOCK DATA — API 연동 시 각 항목을 실제 데이터로 교체하세요
// ============================================================
const MOCK = {
    // ── Ray 클러스터 ────────────────────────────────────────────────────────
    ray: { status: 'ok', nodes: 4, finished_total: 42 },
    
    // ── AutoML Jobs ────────────────────────────────────────────────────────
    automl:   [
        { name: 'xgb-tune-v1',  status: 'SUCCEEDED', submitted_by: 'researcher1@example.com', submitted_at: '2025-05-10 11:20' },
        { name: 'lgbm-search',  status: 'RUNNING',   submitted_by: 'admin@example.com',        submitted_at: '2025-05-11 09:10' },
        { name: 'rf-baseline',  status: 'FAILED',    submitted_by: 'researcher1@example.com',  submitted_at: '2025-05-11 08:00' },
        { name: 'catboost-v2',  status: 'QUEUED',    submitted_by: 'researcher2@example.com',  submitted_at: '2025-05-11 11:30' },
        { name: 'nn-tabular',   status: 'STOPPED',   submitted_by: 'admin@example.com',         submitted_at: '2025-05-09 15:00' },
    ],
    
    // ── Kserve 엔드포인트 ────────────────────────────────────────────────────────
    kserve: [
        { name: 'iris-classifier',  namespace: 'kubeflow-user-a', ready: true  },
        { name: 'fraud-detector',   namespace: 'kubeflow-user-b', ready: true  },
        { name: 'churn-predictor',  namespace: 'kubeflow-user-a', ready: false },
        { name: 'sentiment-model',  namespace: 'kubeflow-user-b', ready: true  },
        { name: 'demand-forecast',  namespace: 'kubeflow-user-c', ready: false },
    ],

    // ── Jupyter 노트북 리소스 사용량 ───────────────────────────────────────
    jupyterResources: [
        { time: '2025-05-11 12:00', ns: 'kubeflow-researcher1',   pod: 'jupyter-researcher1-0', cpu: '0.13', mem: '4.50' },
        { time: '2025-05-11 12:00', ns: 'kubeflow-researcher2',   pod: 'jupyter-researcher2-0', cpu: '0.12', mem: '4.25' },
        { time: '2025-05-11 12:00', ns: 'kubeflow-admin',         pod: 'jupyter-admin-0',       cpu: '0.15', mem: '4.59' },
        { time: '2025-05-11 12:00', ns: 'kubeflow-test-test-com', pod: 'jupyter-test-0',        cpu: '0.01', mem: '0.25' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-researcher1',   pod: 'jupyter-researcher1-0', cpu: '0.11', mem: '4.48' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-researcher2',   pod: 'jupyter-researcher2-0', cpu: '0.14', mem: '4.22' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-admin',         pod: 'jupyter-admin-0',       cpu: '0.16', mem: '4.60' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-test-test-com', pod: 'jupyter-test-0',        cpu: '0.01', mem: '0.25' },
    ],

    // ── PVC 할당 용량 (사용자별) ──────────────────────────────────────────
    pvcByUser: [
        { ns: 'kubeflow-admin', pvcs: [
            { name: 'automl-61b14f5328-lgbm-pvc', allocated: 1,  used: 0.8  },
            { name: 'data-nifi-0',                allocated: 5,  used: 3.2  },
            { name: 'pm-mlflow-data',             allocated: 20, used: 12.5 },
            { name: 'rs-workspace',               allocated: 5,  used: 2.1  },
            { name: 'vscode-workspace',           allocated: 5,  used: 1.5  },
        ]},
        { ns: 'kubeflow-researcher1', pvcs: [
            { name: 'data-nifi-0',       allocated: 5,  used: 2.8 },
            { name: 'ee-test-workspace', allocated: 5,  used: 1.2 },
            { name: 'pm-mlflow-data',    allocated: 20, used: 8.3 },
            { name: 'researcher1-pvc',   allocated: 1,  used: 0.5 },
        ]},
        { ns: 'kubeflow-researcher2', pvcs: [
            { name: 'automl-61b14f5328-lgbm-pvc',     allocated: 1,  used: 0.6  },
            { name: 'data-nifi-0',                     allocated: 5,  used: 4.1  },
            { name: 'pm-mlflow-data',                  allocated: 20, used: 15.2 },
            { name: 'prod-automl-61b14f5328-lgbm-pvc', allocated: 1,  used: 0.9  },
        ]},
        { ns: 'kubeflow-test-test-com', pvcs: [
            { name: 'data-nifi-0',    allocated: 5,  used: 0.3 },
            { name: 'pm-mlflow-data', allocated: 20, used: 1.1 },
        ]},
    ],

    // ── 사용자별 PVC 개수 ──────────────────────────────────────────────────
    pvcCounts: [
        { ns: 'kubeflow-admin',         count: 5 },
        { ns: 'kubeflow-researcher1',   count: 4 },
        { ns: 'kubeflow-researcher2',   count: 4 },
        { ns: 'kubeflow-test-test-com', count: 2 },
    ],

    // ── 실행 중인 노트북 ────────────────────────────────────────────────────
    jupyterNotebooks: [
        { user: 'researcher1@example.com', owner: 'researcher1', status: 'Running', pod: 'jupyter-researcher1-0' },
        { user: 'researcher2@example.com', owner: 'researcher2', status: 'Running', pod: 'jupyter-researcher2-0' },
        { user: 'admin@example.com',       owner: 'admin',       status: 'Running', pod: 'jupyter-admin-0'       },
        { user: 'test@test.com',           owner: 'test',        status: 'Stopped', pod: 'jupyter-test-0'        },
    ],

    // ── MLflow 실험별 Run 수 ───────────────────────────────────────────────
    mlflowExperiments: [
        { name: 'xgb-fraud-detection', runs: 47 },
        { name: 'sklearn-iris-clf',    runs: 32 },
        { name: 'torch-nlp-sentiment', runs: 21 },
        { name: 'resnet50-image-cls',  runs: 18 },
        { name: 'bert-base-ner',       runs: 9  },
    ],

    // ── MLflow 모델별 버전 수 ──────────────────────────────────────────────
    mlflowModels: [
        { name: 'xgb-fraud-detection', versions: 8, stage: 'Production' },
        { name: 'sklearn-iris-clf',    versions: 5, stage: 'Production' },
        { name: 'torch-nlp-sentiment', versions: 4, stage: 'Staging'    },
        { name: 'resnet50-image-cls',  versions: 3, stage: 'Archived'   },
        { name: 'bert-base-ner',       versions: 2, stage: 'Staging'    },
    ],

    // ── GPU 사용 추이 (5분 간격, 최근 1시간) ──────────────────────────────
    gpuUtil: [4, 12, 35, 72, 68, 55, 80, 91, 76, 60, 45, 30, 0],

    // ── KServe 모델 목록 (에러율 차트 공용) ──────────────────────────────
    kserveModels: ['sklearn-iris', 'xgb-fraud', 'torch-nlp'],

    // ── KServe 에러율 (%, kserveModels 순서와 일치) ───────────────────────
    kserveErrorRates: [0.4, 6.2, 1.8],

    // ── KServe 에러율 API 형식 ────────────────────────────────────────────
    kserveErrorRate: {
        status: 'ok',
        models: [
            { name: 'sklearn-iris (kubeflow-user-a)', error_rate: 0.4  },
            { name: 'torch-nlp (kubeflow-user-a)',    error_rate: 1.8  },
            { name: 'xgb-fraud (kubeflow-user-b)',    error_rate: 6.2  },
        ],
    },

    // ── KServe 초당 요청 수 (RPS) ─────────────────────────────────────────
    kserveRps: (() => {
        const now = Date.now();
        const models = [
            { name: 'sklearn-iris (kubeflow-user-a)', base: 12, noise: 5 },
            { name: 'xgb-fraud (kubeflow-user-b)',    base: 30, noise: 8 },
            { name: 'torch-nlp (kubeflow-user-a)',    base: 7,  noise: 3 },
        ];
        return {
            status: 'ok',
            series: models.map(m => ({
                name: m.name,
                data: Array.from({ length: 31 }, (_, i) => [
                    now - (30 - i) * 60 * 1000,
                    parseFloat((m.base + (Math.random() - 0.5) * m.noise * 2).toFixed(4)),
                ]),
            })),
        };
    })(),

    // ── KServe 추론 지연시간 p95 (초) ────────────────────────────────────
    kserveLatency: (() => {
        const now = Date.now();
        const models = [
            { name: 'sklearn-iris (kubeflow-user-a)', base: 0.12, noise: 0.05 },
            { name: 'xgb-fraud (kubeflow-user-b)',    base: 0.45, noise: 0.10 },
            { name: 'torch-nlp (kubeflow-user-a)',    base: 1.20, noise: 0.30 },
        ];
        return {
            status: 'ok',
            series: models.map(m => ({
                name: m.name,
                data: Array.from({ length: 31 }, (_, i) => [
                    now - (30 - i) * 60 * 1000,
                    parseFloat((m.base + (Math.random() - 0.5) * m.noise * 2).toFixed(4)),
                ]),
            })),
        };
    })(),

    // ── Top 5 Latency (p95, ms) — 내림차순 정렬 ──────────────────────────
    top5Latency: {
        models: ['torch-nlp', 'xgb-fraud', 'sklearn-iris', 'resnet-50', 'bert-base'],
        values: [1840, 1230, 870, 640, 410],
    },

    // ── Top 5 Latency API 형식 ────────────────────────────────────────────
    kserveTop5Latency: {
        status: 'ok',
        models: [
            { name: 'torch-nlp (kubeflow-user-a)',    latency_ms: 1840 },
            { name: 'xgb-fraud (kubeflow-user-b)',    latency_ms: 1230 },
            { name: 'sklearn-iris (kubeflow-user-a)', latency_ms: 870  },
            { name: 'resnet-50 (kubeflow-user-c)',    latency_ms: 640  },
            { name: 'bert-base (kubeflow-user-b)',    latency_ms: 410  },
        ],
    },
};