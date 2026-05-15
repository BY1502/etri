// ============================================================
// MOCK DATA — API 연동 시 각 항목을 실제 데이터로 교체하세요
// ============================================================
const MOCK = {
    // ── Ray 클러스터 ────────────────────────────────────────────────────────
    ray: { status: 'ok', nodes: 4, finished_total: 42 },

    // ── AutoML Jobs ────────────────────────────────────────────────────────
    automl: [
        { name: 'xgb-tune-v1',  status: 'SUCCEEDED', submitted_by: 'researcher1@example.com', submitted_at: '2025-05-10 11:20' },
        { name: 'lgbm-search',  status: 'RUNNING',   submitted_by: 'admin@example.com',        submitted_at: '2025-05-11 09:10' },
        { name: 'rf-baseline',  status: 'FAILED',    submitted_by: 'researcher1@example.com',  submitted_at: '2025-05-11 08:00' },
        { name: 'catboost-v2',  status: 'QUEUED',    submitted_by: 'researcher2@example.com',  submitted_at: '2025-05-11 11:30' },
        { name: 'nn-tabular',   status: 'STOPPED',   submitted_by: 'admin@example.com',        submitted_at: '2025-05-09 15:00' },
    ],

    // ── KServe 엔드포인트 (전체 — Admin 뷰용) ────────────────────────────
    kserve: [
        { name: 'iris-classifier',  namespace: 'kubeflow-admin-example-com',       ready: true  },
        { name: 'fraud-detector',   namespace: 'kubeflow-admin-example-com',       ready: true  },
        { name: 'churn-predictor',  namespace: 'kubeflow-researcher1-example-com', ready: true  },
        { name: 'sentiment-model',  namespace: 'kubeflow-researcher1-example-com', ready: false },
        { name: 'demand-forecast',  namespace: 'kubeflow-researcher2-example-com', ready: true  },
    ],

    // ── KServe 엔드포인트 (researcher1 namespace만 — 일반 사용자 뷰용) ───
    kserve_researcher1: [
        { name: 'churn-predictor', namespace: 'kubeflow-researcher1-example-com', ready: true  },
        { name: 'sentiment-model', namespace: 'kubeflow-researcher1-example-com', ready: false },
    ],

    // ── Jupyter 노트북 리소스 사용량 ───────────────────────────────────────
    jupyterResources: [
        { time: '2025-05-11 12:00', ns: 'kubeflow-admin-example-com',       pod: 'jupyter-admin-0',       cpu: '0.15', mem: '4.59' },
        { time: '2025-05-11 12:00', ns: 'kubeflow-researcher1-example-com', pod: 'jupyter-researcher1-0', cpu: '0.13', mem: '4.50' },
        { time: '2025-05-11 12:00', ns: 'kubeflow-researcher2-example-com', pod: 'jupyter-researcher2-0', cpu: '0.12', mem: '4.25' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-admin-example-com',       pod: 'jupyter-admin-0',       cpu: '0.16', mem: '4.60' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-researcher1-example-com', pod: 'jupyter-researcher1-0', cpu: '0.11', mem: '4.48' },
        { time: '2025-05-11 11:55', ns: 'kubeflow-researcher2-example-com', pod: 'jupyter-researcher2-0', cpu: '0.14', mem: '4.22' },
    ],

    // ── PVC 할당 용량 (사용자별) ──────────────────────────────────────────
    pvcByUser: [
        {
            ns: 'kubeflow-admin-example-com',
            total_gb: 36,
            phase_counts: { Bound: 4, Pending: 1, Lost: 0 },
            pvcs: [
                { name: 'automl-61b14f5328-lgbm-pvc', allocated_gb: 1,  phase: 'Bound'   },
                { name: 'data-nifi-0',                allocated_gb: 5,  phase: 'Bound'   },
                { name: 'pm-mlflow-data',             allocated_gb: 20, phase: 'Pending' },
                { name: 'rs-workspace',               allocated_gb: 5,  phase: 'Bound'   },
                { name: 'vscode-workspace',           allocated_gb: 5,  phase: 'Bound'   },
            ],
        },
        {
            ns: 'kubeflow-researcher1-example-com',
            total_gb: 31,
            phase_counts: { Bound: 3, Pending: 0, Lost: 1 },
            pvcs: [
                { name: 'data-nifi-0',       allocated_gb: 5,  phase: 'Bound' },
                { name: 'ee-test-workspace', allocated_gb: 5,  phase: 'Lost'  },
                { name: 'pm-mlflow-data',    allocated_gb: 20, phase: 'Bound' },
                { name: 'researcher1-pvc',   allocated_gb: 1,  phase: 'Bound' },
            ],
        },
        {
            ns: 'kubeflow-researcher2-example-com',
            total_gb: 27,
            phase_counts: { Bound: 4, Pending: 0, Lost: 0 },
            pvcs: [
                { name: 'automl-61b14f5328-lgbm-pvc',     allocated_gb: 1,  phase: 'Bound' },
                { name: 'data-nifi-0',                     allocated_gb: 5,  phase: 'Bound' },
                { name: 'pm-mlflow-data',                  allocated_gb: 20, phase: 'Bound' },
                { name: 'prod-automl-61b14f5328-lgbm-pvc', allocated_gb: 1,  phase: 'Bound' },
            ],
        },
    ],

    // ── 실행 중인 노트북 ────────────────────────────────────────────────────
    jupyterNotebooks: [
        { namespace: 'kubeflow-admin-example-com',       owner_name: 'admin',       pod: 'jupyter-admin-0'       },
        { namespace: 'kubeflow-researcher1-example-com', owner_name: 'researcher1', pod: 'jupyter-researcher1-0' },
        { namespace: 'kubeflow-researcher2-example-com', owner_name: 'researcher2', pod: 'jupyter-researcher2-0' },
    ],

    // ── MLflow 전체 통계 ───────────────────────────────────────────────────
    mlflowStats: { status: 'ok', experiments: 12, models: 8, runs: 134 },

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

    // ── GPU 사용 추이 API 형식 ─────────────────────────────────────────────
    gpuTrend: (() => {
        const now = Date.now();
        const values = [4, 12, 35, 72, 68, 55, 80, 91, 76, 60, 45, 30, 0];
        return {
            status: 'ok',
            data: values.map((v, i) => [now - (values.length - 1 - i) * 5 * 60 * 1000, v]),
        };
    })(),

    // ── KServe 에러율 (전체 — Admin 뷰용) ────────────────────────────────
    kserveErrorRate: {
        status: 'ok',
        models: [
            { name: 'iris-classifier (kubeflow-admin)',       error_rate: 0.2  },
            { name: 'fraud-detector (kubeflow-admin)',        error_rate: 0.8  },
            { name: 'churn-predictor (kubeflow-researcher1)', error_rate: 1.5  },
            { name: 'sentiment-model (kubeflow-researcher1)', error_rate: 6.2  },
            { name: 'demand-forecast (kubeflow-researcher2)', error_rate: 0.0  },
        ],
    },

    // ── KServe 에러율 (researcher1 namespace만 — 일반 사용자 뷰용) ────────
    kserveErrorRate_researcher1: {
        status: 'ok',
        models: [
            { name: 'churn-predictor (kubeflow-researcher1)', error_rate: 1.5 },
            { name: 'sentiment-model (kubeflow-researcher1)', error_rate: 6.2 },
        ],
    },

    // ── KServe RPS (전체 — Admin 뷰용) ───────────────────────────────────
    kserveRps: (() => {
        const now = Date.now();
        const models = [
            { name: 'iris-classifier (kubeflow-admin)',       base: 20, noise: 5 },
            { name: 'fraud-detector (kubeflow-admin)',        base: 35, noise: 8 },
            { name: 'churn-predictor (kubeflow-researcher1)', base: 12, noise: 4 },
            { name: 'sentiment-model (kubeflow-researcher1)', base: 7,  noise: 3 },
            { name: 'demand-forecast (kubeflow-researcher2)', base: 4,  noise: 2 },
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

    // ── KServe RPS (researcher1 namespace만 — 일반 사용자 뷰용) ──────────
    kserveRps_researcher1: (() => {
        const now = Date.now();
        const models = [
            { name: 'churn-predictor (kubeflow-researcher1)', base: 12, noise: 4 },
            { name: 'sentiment-model (kubeflow-researcher1)', base: 7,  noise: 3 },
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

    // ── KServe 지연시간 p95 (전체 — Admin 뷰용) ──────────────────────────
    kserveLatency: (() => {
        const now = Date.now();
        const models = [
            { name: 'iris-classifier (kubeflow-admin)',       base: 0.08, noise: 0.02 },
            { name: 'fraud-detector (kubeflow-admin)',        base: 0.45, noise: 0.10 },
            { name: 'churn-predictor (kubeflow-researcher1)', base: 0.30, noise: 0.08 },
            { name: 'sentiment-model (kubeflow-researcher1)', base: 1.20, noise: 0.30 },
            { name: 'demand-forecast (kubeflow-researcher2)', base: 0.15, noise: 0.05 },
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

    // ── KServe 지연시간 p95 (researcher1 namespace만 — 일반 사용자 뷰용) ─
    kserveLatency_researcher1: (() => {
        const now = Date.now();
        const models = [
            { name: 'churn-predictor (kubeflow-researcher1)', base: 0.30, noise: 0.08 },
            { name: 'sentiment-model (kubeflow-researcher1)', base: 1.20, noise: 0.30 },
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

    // ── Top 5 Latency (전체 — Admin 뷰용) ────────────────────────────────
    kserveTop5Latency: {
        status: 'ok',
        models: [
            { name: 'sentiment-model (kubeflow-researcher1)', latency_ms: 1840 },
            { name: 'fraud-detector (kubeflow-admin)',        latency_ms: 1230 },
            { name: 'churn-predictor (kubeflow-researcher1)', latency_ms: 870  },
            { name: 'demand-forecast (kubeflow-researcher2)', latency_ms: 640  },
            { name: 'iris-classifier (kubeflow-admin)',       latency_ms: 410  },
        ],
    },

    // ── Top 5 Latency (researcher1 namespace만 — 일반 사용자 뷰용) ───────
    kserveTop5Latency_researcher1: {
        status: 'ok',
        models: [
            { name: 'sentiment-model (kubeflow-researcher1)', latency_ms: 1840 },
            { name: 'churn-predictor (kubeflow-researcher1)', latency_ms: 870  },
        ],
    },
};
