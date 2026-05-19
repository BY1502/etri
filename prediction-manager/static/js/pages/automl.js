let automlRefreshTimer = null;
let automlLogEs = null;

const AUTOML_MODELS = [
    { id: 'rf', label: 'Random Forest', desc: '트리 앙상블 (기본, 빠름)' },
    { id: 'xgb', label: 'XGBoost', desc: '그래디언트 부스팅 (고성능)' },
    { id: 'lgbm', label: 'LightGBM', desc: '빠른 부스팅 (대용량 데이터)' },
    { id: 'mlp', label: 'MLP (NN)', desc: '다층 퍼셉트론 (sklearn)' },
    { id: 'tabnet', label: 'TabNet', desc: 'Tabular Deep Learning (느림, torch)' },
];

const METRICS_BY_TASK = {
    regression: [
        { id: 'auto', label: '자동 (MSE)' },
        { id: 'mse', label: 'MSE' },
        { id: 'rmse', label: 'RMSE' },
        { id: 'mae', label: 'MAE' },
        { id: 'r2', label: 'R²' },
    ],
    classification: [
        { id: 'auto', label: '자동 (Accuracy)' },
        { id: 'accuracy', label: 'Accuracy' },
        { id: 'f1', label: 'F1 (weighted)' },
        { id: 'precision', label: 'Precision' },
        { id: 'recall', label: 'Recall' },
        { id: 'roc_auc', label: 'ROC-AUC' },
    ],
};

const STATUS_STYLE = {
    QUEUED: { color: '#555', bg: '#f5e6ff' },
    PENDING: { color: '#6c757d', bg: '#e9ecef' },
    RUNNING: { color: '#0066cc', bg: '#e8f4ff' },
    SUCCEEDED: { color: '#155724', bg: '#d4edda' },
    FAILED: { color: '#721c24', bg: '#f8d7da' },
    STOPPED: { color: '#856404', bg: '#fff3cd' },
    CANCELED: { color: '#555', bg: '#e9ecef' },
};

let _automlIsAdmin = false;

function _statusBadge(status) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.PENDING;
    return `<span style="padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; color:${s.color}; background:${s.bg};">${status}</span>`;
}

function _fmtTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { hour12: false });
}

function _fmtDuration(start, end) {
    if (!start) return '-';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const sec = Math.round((e - s) / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const rs = sec % 60;
    return `${m}m ${rs}s`;
}

function _renderRows(jobs) {
    return jobs.map(j => {
        const best = j.best_run?.best;
        const bestText = best ? `${esc(best.model_id)} ${esc(j.best_run.metric)}=${(+best.best_metric).toFixed(4)}` : '-';
        const qpos = j.queue_position ? `<div style="font-size:10px; color:var(--text-muted);">대기열 #${esc(j.queue_position)}</div>` : '';
        const feedbackStale = j.source === 'feedback' && (j.feedback_dataset_stale || j.stale);
        const feedbackText = j.source === 'feedback'
            ? `<div style="font-size:10px; color:${feedbackStale ? '#b45309' : 'var(--text-muted)'}; margin-top:2px;">피드백 재학습${feedbackStale ? ' · 피드백 변경됨' : ''}</div>`
            : '';
        const jid = esc(j.job_id);
        const stopBtn = (j.status === 'RUNNING' || j.status === 'PENDING') ? `<button class="pm-btn pm-btn-sm pm-btn-danger automl-stop-btn" data-id="${jid}">중지</button>` : '';
        const cancelBtn = j.status === 'QUEUED' ? `<button class="pm-btn pm-btn-sm automl-cancel-btn" data-id="${jid}">취소</button>` : '';
        const promoteBtn = (j.status === 'QUEUED' && _automlIsAdmin) ? `<button class="pm-btn pm-btn-sm automl-promote-btn" data-id="${jid}">우선순위↑</button>` : '';
        const deleteBtn = ['SUCCEEDED','FAILED','STOPPED','CANCELED'].includes(j.status) ? `<button class="pm-btn pm-btn-sm pm-btn-danger automl-delete-btn" data-id="${jid}">삭제</button>` : '';
        return `
        <tr data-id="${jid}">
            <td>
                <div style="font-weight:600;">${esc(j.experiment_name)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${esc(j.submitted_by)} · ${esc(j.task)}</div>
                ${feedbackText}
            </td>
            <td>${_statusBadge(j.status)}${qpos}</td>
            <td style="font-family:var(--font-mono); font-size:11px;">${esc((j.models||[]).join(', '))}</td>
            <td style="font-family:var(--font-mono); font-size:12px;">${bestText}</td>
            <td style="font-size:12px;">${_fmtTime(j.submitted_at)}</td>
            <td style="font-size:12px;">${_fmtDuration(j.started_at || j.submitted_at, j.finished_at)}</td>
            <td style="white-space:nowrap;">
                <button class="pm-btn pm-btn-sm automl-log-btn" data-id="${jid}">로그</button>
                ${promoteBtn}${cancelBtn}${stopBtn}${deleteBtn}
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" style="color:var(--text-muted); text-align:center; padding:40px;">제출된 AutoML Job이 없습니다</td></tr>';
}

async function renderAutoML() {
    try {
        const info = await API.get('/api/user-info');
        _automlIsAdmin = !!info.is_admin;
    } catch (e) { _automlIsAdmin = false; }
    let jobs = [];
    try { jobs = await API.get('/api/automl/jobs'); } catch (e) { jobs = []; }

    const rows = _renderRows(jobs);

    return `
        <style>
        .automl-table { width:100%; border-collapse:collapse; }
        .automl-table th { padding:10px 12px; text-align:left; background:#f8f9fa; border-bottom:2px solid var(--border); font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; }
        .automl-table td { padding:12px; border-bottom:1px solid #f0f0f0; vertical-align:middle; font-size:13px; }
        .automl-table tr:hover td { background:#fafbfc; }
        .automl-panel { display:grid; grid-template-columns:1.2fr 2fr; gap:20px; }
        .automl-form label { display:block; font-size:12px; color:var(--text-secondary); margin:12px 0 4px 0; font-weight:500; }
        .automl-form input, .automl-form select, .automl-form textarea { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; box-sizing:border-box; font-family:var(--font-sans); }
        .automl-form input:focus, .automl-form select:focus { border-color:var(--accent); outline:none; }
        .automl-form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .automl-model-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:4px; }
        .automl-model-card { border:1px solid var(--border); border-radius:6px; padding:10px 12px; cursor:pointer; font-size:12px; user-select:none; }
        .automl-model-card.selected { border-color:var(--accent); background:#e8f4ff; }
        .automl-model-card-label { font-weight:600; font-size:13px; }
        .automl-model-card-desc { font-size:11px; color:var(--text-muted); margin-top:2px; }
        .automl-log-pane { background:#1e1e1e; color:#d4d4d4; font-family:var(--font-mono); font-size:11px; line-height:1.5; padding:12px; border-radius:8px; max-height:420px; overflow:auto; white-space:pre-wrap; margin-top:12px; }
        .automl-result { background:#f8f9fa; border:1px solid var(--border); border-radius:6px; padding:12px; margin-top:12px; font-size:12px; }
        .automl-modal-bg { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:2000; }
        .automl-modal-bg.hidden { display:none; }
        .automl-modal { background:white; padding:20px; border-radius:8px; min-width:680px; max-width:900px; max-height:85vh; overflow:auto; }
        .automl-modal h3 { margin:0 0 12px 0; font-size:15px; }
        .automl-error-msg { color:#dc3545; font-size:12px; min-height:18px; margin-top:6px; }
        </style>

        <div class="pm-page-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <h1>AutoML</h1>
                <p>Ray Tune + Optuna로 모델 후보를 자동 탐색하고 MLflow에 기록합니다.
                <span id="automl-queue-info" style="font-size:11px; color:var(--text-muted); margin-left:8px;"></span></p>
            </div>
            <button class="pm-btn pm-btn-primary" id="automl-new-btn">+ 새 AutoML Job</button>
        </div>

        <div class="pm-card">
            <table class="automl-table">
                <thead>
                    <tr>
                        <th>실험 / 사용자</th>
                        <th>상태</th>
                        <th>모델</th>
                        <th>베스트</th>
                        <th>제출</th>
                        <th>경과</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody id="automl-tbody">${rows}</tbody>
            </table>
        </div>

        <div class="automl-modal-bg hidden" id="automl-new-modal">
            <div class="automl-modal">
                <h3>새 AutoML Job</h3>
                <div style="background:#fef3c7; border:1px solid #fcd34d; padding:8px 12px; border-radius:6px; font-size:12px; margin-bottom:12px; color:#78350f;">
                    <b>사용자 Ray 클러스터</b> · 여러 Job을 동시에 제출하면 리소스(CPU/메모리/GPU)가 부족해 Trial이 <b>대기(PENDING)</b> 상태로 머무를 수 있습니다. GPU는 TabNet처럼 GPU 학습 경로가 있는 모델에만 사용됩니다.
                </div>
                <div class="automl-form">
                    <label>실험 이름 *</label>
                    <input id="automl-name" placeholder="예: parking-demand-v1" />

                    <div class="automl-form-row">
                        <div>
                            <label>Task</label>
                            <select id="automl-task">
                                <option value="regression">회귀 (Regression)</option>
                                <option value="classification">분류 (Classification)</option>
                            </select>
                        </div>
                        <div>
                            <label>평가 메트릭</label>
                            <select id="automl-metric"></select>
                        </div>
                    </div>

                    <div class="automl-form-row">
                        <div>
                            <label>시도 횟수 (num_trials)</label>
                            <input id="automl-trials" type="number" value="10" min="1" max="200" />
                        </div>
                        <div>
                            <label>제한 시간 (분)</label>
                            <input id="automl-timeout" type="number" value="60" min="1" max="720" />
                        </div>
                    </div>

                    <div class="automl-form-row">
                        <div>
                            <label>저장할 상위 모델 수 (Top-N)</label>
                            <input id="automl-topn" type="number" value="3" min="1" max="10" />
                        </div>
                        <div></div>
                    </div>

                    <label>데이터셋 경로 *</label>
                    <input id="automl-dataset" placeholder="/home/jovyan/data.csv 또는 https://..." />
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">CSV / Parquet 지원. 노트북 PVC 경로 또는 HTTP(S) URL</div>
                    <div id="automl-dataset-info" style="margin-top:6px; font-size:12px; display:none;"></div>

                    <div class="automl-form-row">
                        <div>
                            <label>타깃 컬럼 *</label>
                            <input id="automl-target" placeholder="예: price" />
                        </div>
                        <div>
                            <label>테스트 비율</label>
                            <input id="automl-testsize" type="number" value="0.2" min="0.05" max="0.5" step="0.05" />
                        </div>
                    </div>

                    <label style="margin-top:8px; font-weight:600;">시도당 리소스 할당</label>
                    <div class="automl-form-row" style="grid-template-columns:1fr 1fr 1fr;">
                        <div>
                            <label style="margin-top:2px;">CPU (cores)</label>
                            <input id="automl-cpu" type="number" value="1" min="0.1" max="16" step="0.1" />
                        </div>
                        <div>
                            <label style="margin-top:2px;">GPU</label>
                            <input id="automl-gpu" type="number" value="0" min="0" max="4" step="0.25" />
                            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">RF/XGB/LGBM/MLP는 현재 CPU로 실행</div>
                        </div>
                        <div>
                            <label style="margin-top:2px;">메모리 (GB)</label>
                            <input id="automl-mem" type="number" value="2" min="0.5" max="128" step="0.5" />
                        </div>
                    </div>

                    <label>모델 후보 (복수 선택)</label>
                    <div class="automl-model-grid" id="automl-models">
                        ${AUTOML_MODELS.map(m => `
                            <div class="automl-model-card ${['rf','xgb','lgbm'].includes(m.id) ? 'selected' : ''}" data-id="${m.id}">
                                <div class="automl-model-card-label">${m.label}</div>
                                <div class="automl-model-card-desc">${m.desc}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="automl-error-msg" id="automl-err"></div>

                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                        <button class="pm-btn" id="automl-new-cancel">취소</button>
                        <button class="pm-btn pm-btn-primary" id="automl-new-submit">제출</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="automl-modal-bg hidden" id="automl-log-modal">
            <div class="automl-modal" style="min-width:780px; max-width:95vw;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 id="automl-log-title" style="margin:0;">로그</h3>
                    <button class="pm-btn" id="automl-log-close">닫기</button>
                </div>
                <div id="automl-log-meta" style="font-size:12px; color:var(--text-secondary); margin-top:6px;"></div>
                <div id="automl-progress-panel" style="display:none; margin-top:12px; padding:12px; background:#f1f8ff; border:1px solid #b8daff; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
                        <div id="automl-progress-label" style="font-weight:600; color:#0066cc;"></div>
                        <div id="automl-progress-best" style="font-family:var(--font-mono); color:#155724; font-weight:600;"></div>
                    </div>
                    <div style="background:#fff; border:1px solid #b8daff; border-radius:4px; height:10px; overflow:hidden;">
                        <div id="automl-progress-bar" style="height:100%; background:linear-gradient(90deg,#0066cc,#28a745); width:0%; transition:width 0.5s;"></div>
                    </div>
                    <div id="automl-progress-detail" style="font-size:11px; color:var(--text-muted); margin-top:6px;"></div>
                </div>
                <div id="automl-log-result"></div>
                <pre class="automl-log-pane" id="automl-log-pane">연결 중...</pre>
            </div>
        </div>
    `;
}

function setupAutoMLPage() {
    if (automlRefreshTimer) { clearInterval(automlRefreshTimer); automlRefreshTimer = null; }
    if (automlLogEs) { automlLogEs.close(); automlLogEs = null; }

    // 주기적 테이블 새로고침
    automlRefreshTimer = setInterval(async () => {
        try {
            const jobs = await API.get('/api/automl/jobs');
            const tbody = document.getElementById('automl-tbody');
            if (!tbody) { clearInterval(automlRefreshTimer); return; }
            const rowsHtml = _renderRows(jobs);
            if (tbody.innerHTML !== rowsHtml) {
                tbody.innerHTML = rowsHtml;
                bindAutoMLRowButtons();
            }
        } catch (e) {}
    }, 5000);

    // 새 Job 모달
    const newModal = document.getElementById('automl-new-modal');
    function _refreshMetricOptions() {
        const task = document.getElementById('automl-task').value;
        const sel = document.getElementById('automl-metric');
        sel.innerHTML = METRICS_BY_TASK[task].map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    }
    document.getElementById('automl-task').addEventListener('change', _refreshMetricOptions);

    document.getElementById('automl-new-btn').addEventListener('click', () => {
        document.getElementById('automl-name').value = '';
        document.getElementById('automl-dataset').value = '';
        document.getElementById('automl-target').value = '';
        document.getElementById('automl-trials').value = 10;
        document.getElementById('automl-timeout').value = 60;
        document.getElementById('automl-cpu').value = 1;
        document.getElementById('automl-gpu').value = 0;
        document.getElementById('automl-mem').value = 2;
        document.getElementById('automl-topn').value = 3;
        document.getElementById('automl-err').textContent = '';
        document.querySelectorAll('#automl-models .automl-model-card').forEach(c => {
            if (['rf','xgb','lgbm'].includes(c.dataset.id)) c.classList.add('selected');
            else c.classList.remove('selected');
        });
        _refreshMetricOptions();
        newModal.classList.remove('hidden');
    });
    document.getElementById('automl-new-cancel').addEventListener('click', () => newModal.classList.add('hidden'));

    // 데이터셋 경로 크기 사전 조회 (입력 후 포커스 아웃 시)
    let _dsCheckTimer = null;
    let _dsLastLevel = null;
    const dsInput = document.getElementById('automl-dataset');
    const dsInfoEl = document.getElementById('automl-dataset-info');
    async function _checkDatasetSize() {
        const path = dsInput.value.trim();
        if (!path) { dsInfoEl.style.display = 'none'; _dsLastLevel = null; return; }
        dsInfoEl.style.display = 'block';
        dsInfoEl.innerHTML = '<span style="color:var(--text-muted);">크기 확인 중...</span>';
        try {
            const r = await API.get(`/api/automl/dataset-size?path=${encodeURIComponent(path)}`);
            _dsLastLevel = r.level;
            const colors = { ok:'#15803d', warn:'#b45309', block:'#b91c1c', unknown:'#6b7280' };
            const icons = { ok:'[OK]', warn:'[경고]', block:'[차단]', unknown:'[?]' };
            const bg = { ok:'#dcfce7', warn:'#fef3c7', block:'#fee2e2', unknown:'#f3f4f6' };
            dsInfoEl.innerHTML = `<span style="display:inline-block; padding:4px 10px; border-radius:4px; background:${bg[r.level]}; color:${colors[r.level]};">${icons[r.level]} ${esc(r.message)}</span>`;
        } catch (e) {
            _dsLastLevel = null;
            dsInfoEl.innerHTML = `<span style="color:var(--text-muted);">크기 확인 실패: ${esc(e.message)}</span>`;
        }
    }
    dsInput.addEventListener('blur', _checkDatasetSize);
    dsInput.addEventListener('input', () => {
        clearTimeout(_dsCheckTimer);
        _dsCheckTimer = setTimeout(_checkDatasetSize, 800);
    });
    // 제출 시 block 레벨이면 확인 절차
    window._automlGetDsLevel = () => _dsLastLevel;

    document.querySelectorAll('#automl-models .automl-model-card').forEach(card => {
        card.addEventListener('click', () => card.classList.toggle('selected'));
    });

    document.getElementById('automl-new-submit').addEventListener('click', async () => {
        const errEl = document.getElementById('automl-err');
        errEl.textContent = '';
        const models = [...document.querySelectorAll('#automl-models .automl-model-card.selected')].map(c => c.dataset.id);
        const body = {
            name: document.getElementById('automl-name').value.trim(),
            task: document.getElementById('automl-task').value,
            dataset_path: document.getElementById('automl-dataset').value.trim(),
            target_column: document.getElementById('automl-target').value.trim(),
            models,
            num_trials: parseInt(document.getElementById('automl-trials').value) || 10,
            timeout_minutes: parseInt(document.getElementById('automl-timeout').value) || 60,
            metric: document.getElementById('automl-metric').value || 'auto',
            test_size: parseFloat(document.getElementById('automl-testsize').value) || 0.2,
            cpu_per_trial: parseFloat(document.getElementById('automl-cpu').value) || 1,
            gpu_per_trial: parseFloat(document.getElementById('automl-gpu').value) || 0,
            memory_per_trial_gb: parseFloat(document.getElementById('automl-mem').value) || 2,
            top_n: parseInt(document.getElementById('automl-topn').value) || 3,
        };
        if (!body.name) return errEl.textContent = '실험 이름을 입력하세요';
        if (!body.dataset_path) return errEl.textContent = '데이터셋 경로를 입력하세요';
        if (!body.target_column) return errEl.textContent = '타깃 컬럼을 입력하세요';
        if (!models.length) return errEl.textContent = '최소 1개 모델을 선택하세요';
        // 데이터셋 크기 레벨 확인
        const dsLevel = window._automlGetDsLevel?.();
        if (dsLevel === 'block') return errEl.textContent = '데이터셋 크기 초과로 제출할 수 없습니다. 크기 제한 이하 파일을 사용하세요.';
        if (dsLevel === 'warn') {
            if (!confirm('데이터셋이 크기 때문에 학습에 시간이 오래 걸리거나 실패할 수 있습니다. 계속 진행할까요?')) return;
        }
        const btn = document.getElementById('automl-new-submit');
        btn.disabled = true; btn.textContent = '제출 중...';
        try {
            const r = await API.post('/api/automl/jobs', body);
            if (r.job_id) {
                newModal.classList.add('hidden');
                navigate('automl');
            } else {
                errEl.textContent = r.detail || '제출 실패';
            }
        } catch (e) {
            errEl.textContent = e.message;
        } finally {
            btn.disabled = false; btn.textContent = '제출';
        }
    });

    // 로그 모달
    const logModal = document.getElementById('automl-log-modal');
    document.getElementById('automl-log-close').addEventListener('click', () => {
        logModal.classList.add('hidden');
        if (automlLogEs) { automlLogEs.close(); automlLogEs = null; }
    });

    bindAutoMLRowButtons();

    // queue config info
    API.get('/api/automl/queue-config').then(cfg => {
        const el = document.getElementById('automl-queue-info');
        if (el) el.textContent = `(사용자별 동시 실행 최대 ${cfg.max_concurrent_per_namespace}건)`;
    }).catch(() => {});
}

function bindAutoMLRowButtons() {
    document.querySelectorAll('.automl-log-btn').forEach(btn => {
        btn.onclick = async () => openAutoMLLog(btn.dataset.id);
    });
    document.querySelectorAll('.automl-stop-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('Job을 중지하시겠습니까?')) return;
            btn.disabled = true;
            try {
                await API.post(`/api/automl/jobs/${btn.dataset.id}/stop`, {});
            } catch (e) {}
        };
    });
    document.querySelectorAll('.automl-cancel-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('대기 중인 Job을 취소하시겠습니까?')) return;
            btn.disabled = true;
            try {
                await API.post(`/api/automl/jobs/${btn.dataset.id}/cancel`, {});
            } catch (e) {}
        };
    });
    document.querySelectorAll('.automl-promote-btn').forEach(btn => {
        btn.onclick = async () => {
            btn.disabled = true;
            try {
                await API.post(`/api/automl/jobs/${btn.dataset.id}/promote`, {});
            } catch (e) {}
        };
    });
    document.querySelectorAll('.automl-delete-btn').forEach(btn => {
        btn.onclick = async () => {
            const msg = '이 AutoML Job을 완전 삭제합니다.\n\n함께 제거되는 항목:\n' +
                '• 이 Job의 "서빙" 으로 만든 ISVC + PVC\n' +
                '• Helper Pod 잔존\n' +
                '• MLflow Experiment + 모든 Run\n' +
                '• Artifact 파일 (디스크 영구 삭제)\n' +
                '• 예측매니저 Job 기록\n\n복구 불가. 계속할까요?';
            if (!confirm(msg)) return;
            btn.disabled = true;
            try {
                const r = await fetch(API.base + `/api/automl/jobs/${btn.dataset.id}`, { method: 'DELETE' });
                const data = await r.json().catch(() => ({}));
                if (!r.ok || !data.deleted) {
                    alert('삭제 실패: ' + (data.detail || data.reason || r.status));
                    btn.disabled = false;
                    return;
                }
                const lines = [
                    `삭제 완료: ${data.job_id}`,
                    `ISVC ${(data.isvc_deleted || []).length}개`,
                    `PVC ${(data.pvc_deleted || []).length}개`,
                    `Helper Pod ${(data.helper_pods_deleted || []).length}개`,
                    `Run ${data.runs_deleted || 0}개 제거`,
                    `Artifact ${data.artifacts_purged || 0}개 영구 제거`,
                ];
                alert(lines.join('\n'));
            } catch (e) { alert(e.message); btn.disabled = false; }
        };
    });
}

async function openAutoMLLog(jobId) {
    const logModal = document.getElementById('automl-log-modal');
    const pane = document.getElementById('automl-log-pane');
    const title = document.getElementById('automl-log-title');
    const meta = document.getElementById('automl-log-meta');
    const resultEl = document.getElementById('automl-log-result');
    pane.textContent = '연결 중...';
    resultEl.innerHTML = '';
    logModal.classList.remove('hidden');

    let info = null;
    try { info = await API.get(`/api/automl/jobs/${jobId}`); } catch (e) {}
    if (info) {
        title.textContent = `로그: ${info.experiment_name}`;
        meta.innerHTML = `
            ${_statusBadge(info.status)}
            · ${esc(info.submitted_by)} · ${esc(info.task)}
            · 제출: ${_fmtTime(info.submitted_at)}
            · 경과: ${_fmtDuration(info.started_at || info.submitted_at, info.finished_at)}
        `;
        // 설정값 섹션
        const cfgDiv = document.createElement('div');
        cfgDiv.style.cssText = 'margin-top:10px; padding:10px 12px; background:#f8f9fa; border:1px solid var(--border); border-radius:6px; font-size:11px;';
        cfgDiv.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:6px 16px;">
                <div><b>데이터셋:</b> <span style="font-family:var(--font-mono); word-break:break-all;">${esc(info.dataset_path)}</span></div>
                <div><b>타깃:</b> <span style="font-family:var(--font-mono);">${esc(info.target_column)}</span></div>
                <div><b>모델:</b> ${esc((info.models||[]).join(', '))}</div>
                <div><b>메트릭:</b> ${esc(info.metric || 'auto')}</div>
                <div><b>시도 횟수:</b> ${esc(info.num_trials)}</div>
                <div><b>제한시간:</b> ${esc(info.timeout_minutes || '-')}분</div>
                <div><b>테스트 비율:</b> ${esc(info.test_size || '-')}</div>
                <div><b>상위 저장:</b> ${esc(info.top_n || '-')}개</div>
                <div><b>시도당 CPU:</b> ${esc(info.cpu_per_trial || '-')}</div>
                <div><b>시도당 GPU:</b> ${esc(info.gpu_per_trial || 0)}</div>
                <div><b>시도당 메모리:</b> ${esc(info.memory_per_trial_gb || '-')} GB</div>
                <div><b>우선순위:</b> ${esc(info.priority || '-')}</div>
                <div><b>Ray Job ID:</b> <span style="font-family:var(--font-mono); font-size:10px;">${esc(info.ray_job_id || '-')}</span></div>
                <div><b>네임스페이스:</b> ${esc(info.namespace)}</div>
            </div>
        `;
        resultEl.innerHTML = '';
        resultEl.appendChild(cfgDiv);
        const resultBox = document.createElement('div');
        resultEl.appendChild(resultBox);
        renderAutoMLResult(info, resultBox);
    }

    if (automlLogEs) { automlLogEs.close(); automlLogEs = null; }
    pane.textContent = '';
    const progPanel = document.getElementById('automl-progress-panel');
    const progBar = document.getElementById('automl-progress-bar');
    const progLabel = document.getElementById('automl-progress-label');
    const progBest = document.getElementById('automl-progress-best');
    const progDetail = document.getElementById('automl-progress-detail');
    progPanel.style.display = 'none';
    let progState = { total_trials: 0, done_trials: 0, total_models: 1, cur_model_idx: 0, cur_model: '', best_score: null, best_model: '', metric: '', mode: 'min', done: false };

    function _overallTotal() {
        const models = progState.total_models || (info.models || []).length || 1;
        const trials = progState.total_trials || Number(info.num_trials || 0);
        return trials * models;
    }

    function _markProgressDone(bestRun) {
        const overallTotal = _overallTotal();
        if (overallTotal > 0) {
            progState.done_trials = overallTotal;
        }
        progState.total_trials = progState.total_trials || Number(info.num_trials || 0);
        progState.total_models = progState.total_models || (info.models || []).length || 1;
        progState.cur_model_idx = progState.total_models;
        progState.done = true;
        const best = bestRun?.best || bestRun;
        if (best?.best_metric !== undefined && best?.best_metric !== null) {
            progState.best_score = Number(best.best_metric);
            progState.best_model = best.model_id || progState.best_model;
        }
        progState.metric = bestRun?.metric || progState.metric;
        progState.mode = bestRun?.mode || progState.mode;
    }

    function _updateProgressUI() {
        const overallTotal = _overallTotal();
        const pct = progState.done ? 100 : (overallTotal > 0 ? Math.min(100, Math.round((progState.done_trials / overallTotal) * 100)) : 0);
        progBar.style.width = pct + '%';
        progLabel.textContent = progState.done
            ? `완료 · ${pct}%`
            : (progState.cur_model
                ? `탐색 중: ${progState.cur_model} (${progState.cur_model_idx}/${progState.total_models}) · ${pct}%`
                : `대기 중 · ${pct}%`);
        progBest.textContent = progState.best_score !== null && !Number.isNaN(+progState.best_score)
            ? `베스트: ${progState.best_model || ''} ${progState.metric}=${(+progState.best_score).toFixed(4)}`
            : '';
        progDetail.textContent = `완료 시도: ${progState.done_trials} / ${overallTotal}  (모델당 ${progState.total_trials || Number(info.num_trials || 0)}회)`;
    }

    automlLogEs = API.sse(`/api/automl/jobs/${jobId}/logs`, (data) => {
        if (data.queued) {
            pane.textContent = `대기열에서 대기 중 (#${data.queue_position || '?'})...\n`;
            return;
        }
        if (data.progress) {
            progPanel.style.display = '';
            const p = data.progress;
            if (p.event === 'start') {
                progState.total_trials = p.num_trials || 0;
                progState.total_models = (p.models || []).length;
                progState.metric = p.metric || '';
                progState.mode = p.mode || 'min';
                progState.done = false;
            } else if (p.event === 'model_start') {
                progState.cur_model = p.model_id;
                progState.cur_model_idx = p.model_idx;
                progState.total_models = p.model_total;
                progState.done = false;
            } else if (p.event === 'done') {
                progState.total_trials = p.num_trials || progState.total_trials;
                progState.total_models = (p.models || []).length || progState.total_models;
                progState.done_trials = p.done_trials || p.total_trials || _overallTotal();
                progState.metric = p.metric || progState.metric;
                progState.mode = p.mode || progState.mode;
                progState.best_score = typeof p.best_score === 'number' ? p.best_score : progState.best_score;
                progState.best_model = p.best_model || progState.best_model;
                progState.done = true;
            } else {
                // trial completion event
                if (p.model_id) progState.cur_model = p.model_id;
                if (p.model_idx) progState.cur_model_idx = p.model_idx;
                if (p.model_total) progState.total_models = p.model_total;
                if (p.trial_total) progState.total_trials = p.trial_total;
                if (typeof p.trial_done === 'number') {
                    progState.done_trials = (progState.cur_model_idx - 1) * progState.total_trials + p.trial_done;
                }
                if (typeof p.best_score === 'number') {
                    const isBetter = progState.best_score === null
                        || (progState.mode === 'min' && p.best_score < progState.best_score)
                        || (progState.mode === 'max' && p.best_score > progState.best_score);
                    if (isBetter) {
                        progState.best_score = p.best_score;
                        progState.best_model = p.model_id;
                    }
                }
                progState.metric = p.metric || progState.metric;
                progState.mode = p.mode || progState.mode;
            }
            _updateProgressUI();
            return;
        }
        if (data.log) {
            pane.textContent += data.log + '\n';
            pane.scrollTop = pane.scrollHeight;
        }
        if (data.status) {
            pane.textContent += `\n=== ${data.status} ===\n`;
            if (data.message) pane.textContent += data.message + '\n';
            if (data.status === 'SUCCEEDED') {
                progPanel.style.display = '';
                _markProgressDone(data.best);
                _updateProgressUI();
            }
            // 최종 정보 refresh
            API.get(`/api/automl/jobs/${jobId}`).then(updated => {
                meta.innerHTML = `
                    ${_statusBadge(updated.status)}
                    · ${esc(updated.submitted_by)} · ${esc(updated.task)}
                    · 제출: ${_fmtTime(updated.submitted_at)}
                    · 경과: ${_fmtDuration(updated.started_at || updated.submitted_at, updated.finished_at)}
                `;
                if (updated.status === 'SUCCEEDED') {
                    progPanel.style.display = '';
                    _markProgressDone(updated.best_run);
                    _updateProgressUI();
                }
                // 마지막 div (결과)만 재렌더
                const boxes = resultEl.children;
                if (boxes.length >= 2) {
                    renderAutoMLResult(updated, boxes[1]);
                } else {
                    renderAutoMLResult(updated, resultEl);
                }
            }).catch(() => {});
            if (automlLogEs) { automlLogEs.close(); automlLogEs = null; }
        }
        if (data.error) {
            pane.textContent += `\n[ERR] ${data.error}\n`;
        }
    });
}

function renderAutoMLResult(info, el) {
    if (!info.best_run?.best) { el.innerHTML = ''; return; }
    const r = info.best_run;
    const best = r.best;

    // 전체 top-N 모델 수집 (모든 모델의 top-N 합쳐서 정렬)
    const allTopModels = [];
    (r.per_model || []).forEach(pm => {
        (pm.top_models || []).forEach(tm => allTopModels.push(tm));
    });
    allTopModels.sort((a, b) => r.mode === 'max' ? b.score - a.score : a.score - b.score);

    const topTable = allTopModels.map((tm, i) => `
        <tr>
            <td style="padding:6px 8px; font-weight:600;">#${i + 1}</td>
            <td style="padding:6px 8px; font-family:var(--font-mono);">${esc(tm.model_id)}</td>
            <td style="padding:6px 8px; font-family:var(--font-mono); text-align:right;">${_fmtScore(tm.score)}</td>
            <td style="padding:6px 8px; font-family:var(--font-mono); font-size:10px;" title="${esc(JSON.stringify(tm.params))}">${esc(_truncate(JSON.stringify(tm.params), 60))}</td>
            <td style="padding:6px 8px; font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">${esc(tm.virtual_path)}</td>
            <td style="padding:6px 8px; white-space:nowrap;">
                <button class="pm-btn pm-btn-sm pm-btn-primary automl-nb-btn" data-run="${esc(tm.run_id)}" data-rank="${esc(tm.rank)}" data-model="${esc(tm.model_id)}" data-jobid="${esc(info.job_id)}" title="이 모델을 Jupyter 노트북에 임포트">노트북</button>
                <button class="pm-btn pm-btn-sm automl-deploy-btn" data-run="${esc(tm.run_id)}" data-rank="${esc(tm.rank)}" data-model="${esc(tm.model_id)}" data-jobid="${esc(info.job_id)}" title="MLflow Registry 등록 + KServe 배포 (scale-to-zero)">서빙</button>
            </td>
        </tr>
    `).join('');

    // Trial별 메트릭 히스토리 (compact horizontal bars)
    const perModelCharts = (r.per_model || []).map(pm => {
        const hasTrialIndex = (pm.trials || []).some(t => t.trial_index);
        const trials = (pm.trials || [])
            .map((t, i) => ({
                score: +t.score,
                label: t.trial_index ? `T${t.trial_index}` : `#${i + 1}`,
                params: t.config || {},
            }))
            .filter(t => !isNaN(t.score));
        if (!trials.length) return '';
        const scores = trials.map(t => t.score);
        const maxVal = Math.max(...scores);
        const minVal = Math.min(...scores);
        const range = (maxVal - minVal) || 1;
        const bestVal = r.mode === 'max' ? maxVal : minVal;
        const worstVal = r.mode === 'max' ? minVal : maxVal;
        const rows = trials.map(t => {
            const s = t.score;
            const norm = r.mode === 'max' ? (s - minVal) / range : 1 - (s - minVal) / range;
            const w = Math.max(5, Math.round(norm * 100));
            const isBest = s === bestVal;
            const paramsText = JSON.stringify(t.params || {});
            const title = `${t.label}: ${_fmtScore(s)}\nparams: ${JSON.stringify(t.params)}`;
            return `<div style="display:grid; grid-template-columns:42px 88px minmax(180px,1fr) minmax(220px,0.9fr); gap:10px; align-items:center; min-height:30px;" title="${esc(title)}">
                <div style="font-family:var(--font-mono); font-size:11px; color:${isBest ? '#0d904f' : 'var(--text-muted)'}; font-weight:${isBest ? '700' : '500'};">${esc(t.label)}</div>
                <div style="font-family:var(--font-mono); font-size:11px; color:${isBest ? '#0d904f' : 'var(--text)'}; text-align:right;">${_fmtScore(s)}</div>
                <div style="height:12px; background:#edf1f5; border-radius:4px; overflow:hidden;">
                    <div style="height:100%; width:${w}%; background:${isBest ? '#0d904f' : '#1a73e8'}; border-radius:4px;"></div>
                </div>
                <div style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(_truncate(paramsText, 88))}</div>
            </div>`;
        }).join('');
        return `
            <div style="margin-top:10px; padding:12px; background:#f8f9fa; border:1px solid var(--border); border-radius:6px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
                    <div>
                        <div style="font-size:12px; font-weight:700;">${pm.model_id}</div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${hasTrialIndex ? '실행 순서' : '기록 순서'} · ${r.mode === 'min' ? '낮은 값 우수' : '높은 값 우수'}</div>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); text-align:right;">
                        best=${_fmtScore(bestVal)} · worst=${_fmtScore(worstVal)} · ${trials.length} trials
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:42px 88px minmax(180px,1fr) minmax(220px,0.9fr); gap:10px; align-items:center; padding:6px 0; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; color:var(--text-muted); font-size:10px; font-weight:600;">
                    <div>Trial</div>
                    <div style="text-align:right;">${esc(r.metric)}</div>
                    <div>상대 성능</div>
                    <div>파라미터</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; padding-top:8px; max-height:210px; overflow:auto;">
                    ${rows}
                </div>
            </div>
        `;
    }).join('');

    el.innerHTML = `
        <div class="automl-result">
            <div style="font-weight:600; margin-bottom:6px;">베스트: ${best.model_id} (${r.metric} = ${(+best.best_metric).toFixed(4)}, ${r.mode})</div>
            <div style="font-family:var(--font-mono); font-size:11px; margin-bottom:12px; color:var(--text-secondary);">${JSON.stringify(best.best_config)}</div>

            <div style="font-weight:600; font-size:12px; margin-bottom:4px;">전체 Top-${allTopModels.length} 모델 ${allTopModels.length > 0 ? '<span style="font-weight:normal; color:var(--text-muted); font-size:11px;">(맨 오른쪽 노트북 / 서빙 버튼으로 원클릭 배포)</span>' : ''}</div>
            <div style="max-height:240px; overflow:auto; border:1px solid var(--border); border-radius:6px;">
                <table style="width:100%; border-collapse:collapse; font-size:11px;">
                    <thead><tr style="background:#e9ecef; position:sticky; top:0;">
                        <th style="padding:6px 8px; text-align:left;">순위</th>
                        <th style="padding:6px 8px; text-align:left;">모델</th>
                        <th style="padding:6px 8px; text-align:right;">${r.metric}</th>
                        <th style="padding:6px 8px; text-align:left;">파라미터</th>
                        <th style="padding:6px 8px; text-align:left;">저장 경로</th>
                        <th style="padding:6px 8px;">배포</th>
                    </tr></thead>
                    <tbody>${topTable || '<tr><td colspan="6" style="padding:12px; text-align:center; color:var(--text-muted);">이 Job은 Top-N 모델 저장 기능이 추가되기 전 실행되었습니다. 새 Job을 제출해보세요.</td></tr>'}</tbody>
                </table>
            </div>

            ${perModelCharts ? `<div style="margin-top:12px; font-weight:600; font-size:12px;">Trial별 ${r.metric} 변화</div>${perModelCharts}` : ''}
        </div>
    `;

    // 원클릭 배포 버튼 바인딩
    el.querySelectorAll('.automl-nb-btn').forEach(btn => {
        btn.onclick = () => createNotebookForModel(btn.dataset);
    });
    el.querySelectorAll('.automl-deploy-btn').forEach(btn => {
        btn.onclick = () => deployModelAsKServe(btn.dataset);
    });
}

async function createNotebookForModel(data) {
    let notebooks = [];
    try {
        notebooks = await API.get('/api/automl/notebooks');
    } catch (e) {
        alert('노트북 목록 조회 실패: ' + e.message);
        return;
    }

    if (!notebooks.length) {
        alert('사용 가능한 Kubeflow Notebook이 없습니다.\nCentral Dashboard에서 먼저 노트북을 시작해주세요.');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    modal.innerHTML = `
        <div class="automl-modal" style="min-width:480px;">
            <h3>노트북 선택</h3>
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">
                <b>${data.model}</b> (rank ${data.rank}) 모델을 어느 노트북에 임포트할까요?
            </p>
            <select id="nb-select" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; font-family:var(--font-mono);">
                ${notebooks.map(nb => `<option value="${nb.namespace}|${nb.notebook_name}">${nb.namespace} / ${nb.notebook_name}</option>`).join('')}
            </select>
            <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">총 ${notebooks.length}개 노트북 실행 중</div>
            <div id="nb-err" style="color:#dc3545; font-size:12px; margin-top:8px; min-height:18px;"></div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                <button class="pm-btn" id="nb-cancel">취소</button>
                <button class="pm-btn pm-btn-primary" id="nb-submit">생성</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();
    modal.querySelector('#nb-cancel').onclick = cleanup;
    modal.querySelector('#nb-submit').onclick = async () => {
        const [target_ns, target_nb] = modal.querySelector('#nb-select').value.split('|');
        const errEl = modal.querySelector('#nb-err');
        const btn = modal.querySelector('#nb-submit');
        btn.disabled = true; btn.textContent = '생성 중...';
        try {
            const r = await API.post(`/api/automl/jobs/${data.jobid}/notebook`, {
                run_id: data.run,
                rank: parseInt(data.rank),
                model_id: data.model,
                target_namespace: target_ns,
                target_notebook: target_nb,
            });
            if (r.file_path) {
                cleanup();
                const msg = `노트북 생성 완료\n\n${r.notebook_name} (${target_ns})에 ${r.file_path}\n\n"확인"을 누르면 파일을 바로 엽니다.`;
                if (confirm(msg)) window.open(r.open_url, '_blank');
            } else {
                errEl.textContent = r.detail || '실패';
                btn.disabled = false; btn.textContent = '생성';
            }
        } catch (e) {
            errEl.textContent = e.message;
            btn.disabled = false; btn.textContent = '생성';
        }
    };
}

function _truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }
function _fmtScore(v) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    const n = +v;
    const abs = Math.abs(n);
    if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) return n.toExponential(3);
    if (abs >= 1000) return n.toFixed(0);
    if (abs >= 10) return n.toFixed(2);
    return n.toFixed(4);
}

function openNotebookSnippetModal(data) {
    const snippet = `# AutoML Job: ${data.jobid}
# Model: ${data.model} (rank ${data.rank})
# Run ID: ${data.run}

import mlflow
mlflow.set_tracking_uri("http://mlflow-service.ray-system:5000")

# 모델 로드 (MLflow artifact에서)
import os, joblib
local_dir = mlflow.artifacts.download_artifacts(
    run_id="${data.run}",
    artifact_path="model"
)
model = joblib.load(os.path.join(local_dir, "model.joblib"))

# 피처 정보
import json
with open(os.path.join(local_dir, "features.json")) as f:
    feats = json.load(f)
print("Features:", feats["columns"])
print("Target:", feats["target"])

# 예측 예시
# import pandas as pd
# df = pd.read_csv("your_data.csv")
# preds = model.predict(df[feats["columns"]].fillna(0))
`;
    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    modal.innerHTML = `
        <div class="automl-modal" style="min-width:640px;">
            <h3>노트북에 붙여넣기</h3>
            <p style="font-size:12px; color:var(--text-muted);">아래 코드를 복사해서 Kubeflow Notebook에 붙여넣으면 모델을 바로 사용할 수 있습니다.</p>
            <pre style="background:#1e1e1e; color:#d4d4d4; padding:12px; border-radius:6px; font-size:11px; max-height:400px; overflow:auto; white-space:pre-wrap;">${snippet.replace(/</g, '&lt;')}</pre>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                <button class="pm-btn" id="nb-close">닫기</button>
                <button class="pm-btn pm-btn-primary" id="nb-copy">코드 복사</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#nb-close').onclick = () => modal.remove();
    modal.querySelector('#nb-copy').onclick = () => {
        navigator.clipboard.writeText(snippet).then(() => {
            modal.querySelector('#nb-copy').textContent = '✓ 복사됨';
            setTimeout(() => modal.remove(), 1000);
        });
    };
}

async function deployModelAsKServe(data) {
    // 1) 모델 등록 이름 입력 (서빙 = 등록 + 배포 통합)
    const defaultName = `automl-${data.jobid}-${data.model}`;
    const name = prompt('모델 이름 (Registry 등록 + 서빙 공통):', defaultName);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    // 2) Registry 등록
    let registered;
    try {
        registered = await API.post(`/api/automl/jobs/${data.jobid}/register`, {
            run_id: data.run,
            rank: parseInt(data.rank),
            model_id: data.model,
            registered_name: trimmed,
        });
        if (registered.status !== 'ok') {
            alert('등록 실패: ' + (registered.detail || JSON.stringify(registered)));
            return;
        }
    } catch (e) {
        alert('등록 실패: ' + e.message);
        return;
    }

    // 3) KServe 배포 (자동 scale-to-zero) — 사용자 입력 이름을 ISVC 이름으로도 사용
    try {
        const r = await API.post(`/api/automl/jobs/${data.jobid}/deploy`, {
            run_id: data.run, rank: parseInt(data.rank), model_id: data.model,
            serving_name: trimmed,
        });
        if (r.isvc_url) {
            alert(
                `등록 + 서빙 완료\n` +
                `\n모델: ${registered.name} v${registered.version} (MODELS 탭 확인)` +
                `\nURL: ${r.isvc_url}` +
                `\n유휴 시 자동 종료 (첫 요청 cold start 3~5초)` +
                `\n\n예측 요청:\nPOST ${r.isvc_url}/v2/models/${r.isvc_name}/infer`
            );
        } else {
            alert('서빙 실패 (등록은 완료): ' + (r.detail || '알 수 없는 오류'));
        }
    } catch (e) {
        alert('서빙 실패 (등록은 완료): ' + e.message);
    }
}
