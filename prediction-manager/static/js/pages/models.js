(() => {
let modelsSelected = null;
let modelListFilters = {
    q: '',
    project: '',
    status: '',
    framework: '',
    task: '',
};

const STATUS_STYLE = {
    none: { color: '#495057', bg: '#e9ecef', label: '미지정' },
    candidate: { color: '#075985', bg: '#e8f4ff', label: '후보' },
    staging: { color: '#78350f', bg: '#fef3c7', label: '검증' },
    best: { color: '#166534', bg: '#dcfce7', label: '최적' },
    production: { color: '#fff', bg: '#28a745', label: '운영' },
    archived: { color: '#fff', bg: '#6c757d', label: '보관' },
    deprecated: { color: '#b91c1c', bg: '#fee2e2', label: '폐기 예정' },
};

const STATUS_OPTIONS = [
    ['none', '미지정'],
    ['candidate', '후보'],
    ['staging', '검증'],
    ['best', '최적'],
    ['production', '운영'],
    ['archived', '보관'],
    ['deprecated', '폐기 예정'],
];

function _statusBadge(s) {
    const st = STATUS_STYLE[s] || STATUS_STYLE.none;
    return `<span style="padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; color:${st.color}; background:${st.bg};">${st.label}</span>`;
}

function _statusLabel(s) {
    return (STATUS_STYLE[s] || STATUS_STYLE.none).label;
}

function _fmtTs(ts) {
    if (!ts) return '-';
    return new Date(+ts).toLocaleString('ko-KR', { hour12: false });
}

function _fmtBytes(n) {
    if (n >= 1024**3) return (n / 1024**3).toFixed(2) + ' GiB';
    if (n >= 1024**2) return (n / 1024**2).toFixed(1) + ' MiB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB';
    return n + ' B';
}

function _versionNumber(v) {
    return Number(v?.version ?? v) || 0;
}

function _metricNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function _fmtMetricValue(value) {
    const n = _metricNumber(value);
    if (n === null) return '-';
    const abs = Math.abs(n);
    if (abs === 0) return '0';
    if (abs >= 1000000) return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    if (abs >= 1000) return n.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
    if (abs >= 1) return n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
    return n.toPrecision(4);
}

function _metricDirection(key) {
    const k = String(key || '').toLowerCase();
    if (/(loss|error|rmse|mse|mae|mape|msle|deviance|logloss|log_loss|wer|cer)/.test(k)) return 'lower';
    return 'higher';
}

function _metricOrder(key) {
    const k = String(key || '').toLowerCase();
    const preferred = ['rmse', 'mae', 'mse', 'r2', 'accuracy', 'acc', 'f1', 'auc', 'roc_auc', 'loss'];
    const idx = preferred.findIndex(p => k === p || k.includes(p));
    return idx >= 0 ? idx : 100 + k.charCodeAt(0);
}

function _metricKeys(versions) {
    const keys = new Set();
    (versions || []).forEach(v => {
        Object.entries(v.metrics || {}).forEach(([k, value]) => {
            if (_metricNumber(value) !== null) keys.add(k);
        });
    });
    return [...keys].sort((a, b) => _metricOrder(a) - _metricOrder(b) || a.localeCompare(b));
}

function _bestMetricValue(versions, key) {
    const vals = (versions || []).map(v => _metricNumber(v.metrics?.[key])).filter(v => v !== null);
    if (!vals.length) return null;
    return _metricDirection(key) === 'lower' ? Math.min(...vals) : Math.max(...vals);
}

function _renderVersionComparison(versions) {
    const rows = [...(versions || [])].sort((a, b) => _versionNumber(b) - _versionNumber(a));
    const metricKeys = _metricKeys(rows).slice(0, 8);
    if (!rows.length || !metricKeys.length) return '';
    const latestVersion = Math.max(...rows.map(_versionNumber));
    const bestByMetric = Object.fromEntries(metricKeys.map(k => [k, _bestMetricValue(rows, k)]));
    const metricHeaders = metricKeys.map(k => {
        const arrow = _metricDirection(k) === 'lower' ? '↓' : '↑';
        return `<th title="${esc(k)}">${esc(k)} <span class="metric-dir">${arrow}</span></th>`;
    }).join('');
    const body = rows.map(v => {
        const status = v.status || v.lifecycle_status || 'none';
        const isProduction = status === 'production';
        const isLatest = _versionNumber(v) === latestVersion;
        const metricCells = metricKeys.map(k => {
            const val = _metricNumber(v.metrics?.[k]);
            const best = bestByMetric[k];
            const isBest = val !== null && best !== null && Math.abs(val - best) <= Math.max(1e-12, Math.abs(best) * 1e-12);
            return `<td class="${isBest ? 'best-metric' : ''}">${_fmtMetricValue(val)}</td>`;
        }).join('');
        return `
            <tr class="${isProduction ? 'production-row' : ''}">
                <td>
                    <div class="compare-version-cell">
                        <span class="compare-version">v${esc(v.version)}</span>
                        ${isLatest ? '<span class="compare-chip">최신</span>' : ''}
                    </div>
                </td>
                <td>${_statusBadge(status)}</td>
                <td>${esc(_fmtTs(v.last_updated_timestamp))}</td>
                ${metricCells}
            </tr>
        `;
    }).join('');
    return `
        <div class="version-compare">
            <div class="compare-head">
                <div>
                    <div class="compare-title">버전별 성능 비교</div>
                    <div class="compare-sub">${rows.length}개 버전 · ${metricKeys.length}개 지표</div>
                </div>
            </div>
            <div class="compare-table-wrap">
                <table class="compare-table">
                    <thead>
                        <tr>
                            <th>버전</th>
                            <th>상태</th>
                            <th>업데이트</th>
                            ${metricHeaders}
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>
    `;
}

function _firstTag(tags, keys) {
    for (const key of keys) {
        const value = tags?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    }
    return '';
}

function _metaItem(label, value, extra = '') {
    const text = value === undefined || value === null || value === '' ? '-' : String(value);
    return `
        <div class="version-meta-item ${extra}">
            <div class="version-meta-label">${esc(label)}</div>
            <div class="version-meta-value" title="${esc(text)}">${esc(text)}</div>
        </div>
    `;
}

function _renderVersionMetadata(v, { modelName, namespace, productionStatus } = {}) {
    const tags = v.tags || {};
    const repo = v.repository || {};
    const repoStatus = repo.status || 'missing';
    const repoOk = repoStatus === 'synced' && repo.exists;
    const repoLabel = repoOk ? '동기화됨' : repoStatus === 'failed' ? '실패' : repoStatus === 'synced' ? '파일 확인 필요' : '미동기화';
    const repoPath = repo.path || '';
    const createdBy = _firstTag(tags, ['created_by', 'converted_by', 'mlflow.user']);
    const framework = _firstTag(tags, ['framework']) + (_firstTag(tags, ['framework.version']) ? ` ${_firstTag(tags, ['framework.version'])}` : '');
    const task = _firstTag(tags, ['automl.task']);
    const sourceModel = tags['source.model'] ? `${tags['source.model']} v${tags['source.version'] || '?'}` : '';
    const isServed = productionStatus?.deployed && String(productionStatus.deployed_version || '') === String(v.version);
    const servingUrl = isServed ? productionStatus.url : '';
    const inferUrl = isServed && productionStatus.isvc_name ? `${servingUrl}/v2/models/${productionStatus.isvc_name}/infer` : '';
    const repoStatusClass = repoOk ? 'repo-ok' : repoStatus === 'failed' ? 'repo-failed' : 'repo-warn';
    const sections = [
        {
            title: '출처',
            items: [
                _metaItem('Run ID', v.run_id || '', 'mono-value'),
                _metaItem('AutoML Job', _firstTag(tags, ['automl.job_id', 'automl.job.id']), 'mono-value'),
                _metaItem('실험', v.experiment_name || '', 'mono-value'),
                _metaItem('생성자', createdBy),
                _metaItem('생성일시', _fmtTs(v.creation_timestamp)),
                _metaItem('업데이트', _fmtTs(v.last_updated_timestamp)),
            ],
        },
        {
            title: '데이터/프레임워크',
            items: [
                _metaItem('프레임워크', framework.trim()),
                _metaItem('작업 유형', task === 'regression' ? '회귀' : task === 'classification' ? '분류' : task),
                _metaItem('데이터셋 ID', _firstTag(tags, ['dataset.id']), 'mono-value'),
                _metaItem('Rows', _firstTag(tags, ['dataset.rows'])),
                _metaItem('타깃', _firstTag(tags, ['dataset.target']), 'mono-value'),
                _metaItem('원본 모델', sourceModel, 'mono-value'),
            ],
        },
        {
            title: '저장소',
            items: [
                _metaItem('상태', repoLabel, repoStatusClass),
                _metaItem('백엔드', repo.backend || ''),
                _metaItem('경로', repoPath, 'mono-value wide-value'),
                _metaItem('메타데이터', repo.metadata_path || '', 'mono-value wide-value'),
                _metaItem('동기화', repo.synced_at ? new Date(repo.synced_at).toLocaleString('ko-KR', { hour12: false }) : ''),
                _metaItem('소스 URI', repo.source_uri || v.source || '', 'mono-value wide-value'),
            ],
        },
    ];
    if (isServed || (v.status || v.lifecycle_status) === 'production') {
        sections.push({
            title: '운영',
            items: isServed ? [
                _metaItem('Namespace', productionStatus.namespace || namespace || '', 'mono-value'),
                _metaItem('ISVC', productionStatus.isvc_name || '', 'mono-value'),
                _metaItem('서빙 URL', servingUrl, 'mono-value wide-value'),
                _metaItem('예측 Endpoint', inferUrl, 'mono-value wide-value'),
                _metaItem('배포 시각', productionStatus.deployed_at ? new Date(productionStatus.deployed_at).toLocaleString('ko-KR', { hour12: false }) : ''),
                _metaItem('Scale-to-Zero', productionStatus.scale_to_zero ? '활성' : '비활성'),
            ] : [
                _metaItem('상태', 'Registry는 운영 상태이나 KServe 배포 정보 없음', 'wide-value repo-warn'),
                _metaItem('Namespace', namespace || '', 'mono-value'),
                _metaItem('모델명', modelName || '', 'mono-value'),
            ],
        });
    }
    return `
        <div class="version-meta-sections">
            ${sections.map(section => `
                <details class="version-meta-section" ${section.title === '운영' ? 'open' : ''}>
                    <summary class="version-meta-title">${esc(section.title)}</summary>
                    <div class="version-meta-grid">${section.items.join('')}</div>
                </details>
            `).join('')}
        </div>
    `;
}

function _renderParamDetails(params) {
    const entries = Object.entries(params || {});
    if (!entries.length) return '';
    return `
        <details class="param-details">
            <summary>하이퍼파라미터 ${entries.length}개</summary>
            <div class="param-kv-grid">
                ${entries.map(([key, value]) => `
                    <div class="param-kv">
                        <div class="param-k">${esc(key)}</div>
                        <div class="param-v" title="${esc(String(value))}">${esc(String(value))}</div>
                    </div>
                `).join('')}
            </div>
        </details>
    `;
}

function _defaultProductionTestPayload(versionInfo) {
    const schemaPayload = versionInfo?.input_schema?.serving_payload;
    if (schemaPayload?.inputs?.length) return schemaPayload;
    return {
        inputs: [
            {
                name: 'input-0',
                shape: [1],
                datatype: 'FP64',
                data: [0.0],
            },
        ],
    };
}

function _b64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

function _modelListPath() {
    const qs = new URLSearchParams();
    Object.entries(modelListFilters).forEach(([key, value]) => {
        if (value) qs.set(key, value);
    });
    const q = qs.toString();
    return q ? `/api/models?${q}` : '/api/models';
}

function _uniqueOptions(values, selected) {
    const set = new Set((values || []).filter(Boolean).map(String));
    if (selected) set.add(selected);
    return [...set].sort((a, b) => a.localeCompare(b));
}

function _opt(value, label, selected) {
    return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
}

function _taskLabel(value) {
    const map = { regression: '회귀', classification: '분류' };
    return map[value] || value;
}

function _readModelFiltersFromUI() {
    return {
        q: document.getElementById('model-filter-q')?.value.trim() || '',
        project: document.getElementById('model-filter-project')?.value || '',
        status: document.getElementById('model-filter-status')?.value || '',
        framework: document.getElementById('model-filter-framework')?.value || '',
        task: document.getElementById('model-filter-task')?.value || '',
    };
}

function _applyModelFiltersFromUI() {
    modelListFilters = _readModelFiltersFromUI();
    navigate('models');
}

async function renderModels() {
    let models = [];
    try { models = await API.get(_modelListPath()); } catch (e) { models = []; }
    if (modelsSelected && !models.some(m => m.name === modelsSelected)) {
        modelsSelected = null;
    }

    const projectOptions = _uniqueOptions(models.map(m => m.project || m.owner_namespace), modelListFilters.project);
    const frameworkOptions = _uniqueOptions(models.flatMap(m => m.frameworks || []), modelListFilters.framework);
    const taskOptions = _uniqueOptions(models.flatMap(m => m.tasks || []), modelListFilters.task);
    const activeFilterCount = Object.values(modelListFilters).filter(Boolean).length;

    const listItems = models.map(m => {
        const framework = m.latest_framework || (m.frameworks || [])[0] || '';
        const dataset = m.latest_dataset_id || '';
        const task = m.latest_task || '';
        const status = m.model_status || m.status || m.latest_status || m.latest_lifecycle_status || 'none';
        const productionVersions = (m.stage_summary?.Production || []).map(v => Number(v)).filter(Number.isFinite);
        const productionVersion = productionVersions.length ? Math.max(...productionVersions) : null;
        const meta = [
            framework ? `FW ${framework}` : '',
            dataset ? `DS ${dataset}` : '',
            task ? _taskLabel(task) : '',
        ].filter(Boolean).join(' · ');
        return `
        <div class="model-list-item ${modelsSelected === m.name ? 'selected' : ''}" data-name="${m.name}">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
                <div style="font-weight:600; font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis;">${m.name}</div>
                ${_statusBadge(status)}
            </div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">소유: ${m.owner_namespace || '-'}</div>
            ${meta ? `<div style="font-size:10px; color:var(--text-muted); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(meta)}">${esc(meta)}</div>` : ''}
            <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
                ${productionVersion ? `운영 v${productionVersion} · ` : ''}최신 v${m.latest_version} (총 ${m.total_versions})
            </div>
        </div>`;
    }).join('') || '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12px;">등록된 모델이 없습니다</div>';

    return `
        <style>
        .automl-modal-bg { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:2000; }
        .automl-modal-bg.hidden { display:none; }
        .automl-modal { background:white; padding:20px; border-radius:8px; min-width:520px; max-width:95vw; max-height:85vh; overflow:auto; box-shadow:0 10px 30px rgba(0,0,0,0.2); }
        .automl-modal h3 { margin:0 0 12px 0; font-size:15px; }
        .models-layout { display:grid; grid-template-columns:280px 1fr; gap:16px; min-height:600px; }
        .model-list { background:white; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
        .model-list-item { padding:12px 14px; border-bottom:1px solid #f0f0f0; cursor:pointer; transition:background 0.15s; }
        .model-list-item:hover { background:#f8f9fa; }
        .model-list-item.selected { background:#e8f4ff; border-left:3px solid var(--accent); }
        .model-detail { background:white; border:1px solid var(--border); border-radius:8px; padding:18px; }
        .model-filter-panel { display:grid; grid-template-columns:minmax(240px, 1.5fr) repeat(4, minmax(110px, .8fr)) auto auto; gap:8px; align-items:end; background:white; border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:12px; }
        .model-filter-field { display:flex; flex-direction:column; gap:4px; min-width:0; font-size:10px; font-weight:600; color:var(--text-muted); }
        .model-filter-input { width:100%; height:32px; box-sizing:border-box; border:1px solid var(--border); border-radius:6px; padding:0 9px; font-size:12px; background:white; color:var(--text-primary); }
        .model-filter-input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-bg); }
        .model-filter-count { font-size:11px; color:var(--text-muted); margin-left:8px; font-weight:500; }
        .version-card { border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:10px; }
        .version-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .version-title { font-weight:600; font-size:14px; }
        .metric-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:6px; font-size:11px; margin-top:6px; }
        .metric-item { background:#f8f9fa; padding:4px 8px; border-radius:4px; }
        .metric-key { color:var(--text-muted); }
        .metric-val { font-family:var(--font-mono); font-weight:600; }
        .version-compare { border:1px solid var(--border); border-radius:8px; margin-bottom:12px; overflow:hidden; background:white; }
        .compare-head { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--border); background:#f8fafc; }
        .compare-title { font-size:13px; font-weight:700; color:var(--text-primary); }
        .compare-sub { font-size:11px; color:var(--text-muted); margin-top:2px; }
        .compare-table-wrap { overflow-x:auto; }
        .compare-table { width:100%; border-collapse:collapse; font-size:11px; min-width:720px; }
        .compare-table th { text-align:left; padding:8px 10px; color:var(--text-muted); font-weight:700; border-bottom:1px solid var(--border); white-space:nowrap; }
        .compare-table td { padding:9px 10px; border-bottom:1px solid #eef2f7; vertical-align:middle; white-space:nowrap; }
        .compare-table tbody tr:last-child td { border-bottom:0; }
        .compare-table .production-row { background:#f0fdf4; }
        .compare-version-cell { display:flex; align-items:center; gap:6px; }
        .compare-version { font-weight:700; color:var(--text-primary); }
        .compare-chip { padding:1px 5px; border-radius:4px; font-size:10px; font-weight:700; color:#075985; background:#e0f2fe; }
        .metric-dir { color:var(--text-muted); font-weight:700; }
        .best-metric { color:#166534; background:#dcfce7; font-family:var(--font-mono); font-weight:800; }
        .version-meta-sections { display:grid; gap:8px; margin-top:10px; }
        .version-meta-section { border-top:1px solid #eef2f7; padding-top:8px; }
        .version-meta-title { cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; font-weight:800; color:var(--text-secondary); }
        .version-meta-title::-webkit-details-marker { display:none; }
        .version-meta-title::after { content:'펼치기'; font-size:10px; font-weight:700; color:var(--text-muted); }
        .version-meta-section[open] .version-meta-title { margin-bottom:8px; }
        .version-meta-section[open] .version-meta-title::after { content:'접기'; }
        .version-meta-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; }
        .version-meta-item { min-width:0; }
        .version-meta-label { font-size:10px; color:var(--text-muted); margin-bottom:2px; }
        .version-meta-value { font-size:11px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .version-meta-item.wide-value { grid-column:span 2; }
        .version-meta-item.mono-value .version-meta-value { font-family:var(--font-mono); }
        .version-meta-item.repo-ok .version-meta-value { color:#15803d; font-weight:800; }
        .version-meta-item.repo-warn .version-meta-value { color:#92400e; font-weight:800; }
        .version-meta-item.repo-failed .version-meta-value { color:#b91c1c; font-weight:800; }
        .param-list { font-family:var(--font-mono); font-size:10px; color:var(--text-muted); word-break:break-all; }
        .param-details { margin-top:8px; border-top:1px solid #eef2f7; padding-top:8px; }
        .param-details summary { cursor:pointer; font-size:11px; font-weight:700; color:var(--text-secondary); }
        .param-kv-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:6px; margin-top:8px; }
        .param-kv { min-width:0; padding:6px 8px; border-radius:4px; background:#f8fafc; }
        .param-k { font-size:10px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .param-v { font-family:var(--font-mono); font-size:11px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .status-select { padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size:11px; }
        .version-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .model-upload-trigger { height:30px; padding:3px 10px; font-size:12px; border-radius:6px; line-height:1; align-self:flex-start; }
        .model-toolbar { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
        .model-toolbar-divider { width:1px; height:24px; background:var(--border); margin:0 2px; }
        .model-upload-modal { width:min(720px, calc(100vw - 48px)); min-width:0; max-height:calc(100vh - 64px); padding:0; overflow:hidden; display:flex; flex-direction:column; }
        .mu-header { padding:18px 20px 14px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
        .mu-title { margin:0; font-size:16px; font-weight:700; color:var(--text-primary); }
        .mu-body { padding:18px 20px; display:grid; gap:14px; overflow:auto; min-height:0; }
        .mu-section { border:1px solid var(--border); border-radius:8px; padding:14px; background:#fff; }
        .mu-section-title { font-size:12px; font-weight:700; margin-bottom:10px; color:var(--text-secondary); }
        .mu-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .mu-field { display:flex; flex-direction:column; gap:5px; font-size:11px; color:var(--text-secondary); font-weight:600; min-width:0; }
        .mu-field-full { grid-column:1 / -1; }
        .mu-input { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:12px; background:white; color:var(--text-primary); }
        .mu-input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-bg); }
        .mu-file-drop { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:12px; border:1px dashed #9ec5fe; border-radius:8px; background:#f3f8ff; }
        .mu-file-name { min-height:34px; display:flex; align-items:center; padding:0 10px; border:1px solid #d7e6ff; border-radius:6px; font-size:12px; color:var(--text-muted); background:white; font-family:var(--font-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .mu-footer { padding:14px 20px; border-top:1px solid var(--border); background:#f8f9fa; display:flex; justify-content:flex-end; gap:8px; flex-shrink:0; }
        .prod-test-modal { width:min(860px, calc(100vw - 48px)); min-width:0; max-height:calc(100vh - 64px); display:flex; flex-direction:column; padding:0; overflow:hidden; }
        .prod-test-body { padding:16px 20px; display:grid; gap:12px; overflow:auto; min-height:0; }
        .prod-test-meta { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
        .prod-test-meta-item { min-width:0; padding:8px 10px; background:#f8fafc; border-radius:6px; }
        .prod-test-meta-label { font-size:10px; color:var(--text-muted); margin-bottom:2px; }
        .prod-test-meta-value { font-family:var(--font-mono); font-size:11px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .prod-test-editor { width:100%; box-sizing:border-box; min-height:190px; resize:vertical; font-family:var(--font-mono); font-size:12px; line-height:1.45; border:1px solid var(--border); border-radius:6px; padding:10px; }
        .prod-test-output { min-height:120px; max-height:280px; overflow:auto; white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11px; background:#0f172a; color:#e5e7eb; border-radius:6px; padding:10px; }
        .retrain-modal { width:min(760px, calc(100vw - 48px)); min-width:0; max-height:calc(100vh - 64px); padding:0; overflow:hidden; display:flex; flex-direction:column; }
        .retrain-body { padding:16px 20px; display:grid; gap:12px; overflow:auto; min-height:0; }
        .rt-source { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; }
        .rt-source-item { min-width:0; padding:9px 10px; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; }
        .rt-source-label { font-size:10px; color:var(--text-muted); margin-bottom:3px; }
        .rt-source-value { font-size:11px; font-weight:700; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rt-source-value.mono { font-family:var(--font-mono); font-weight:600; }
        .rt-section { border:1px solid var(--border); border-radius:8px; padding:12px; background:white; }
        .rt-section-title { font-size:12px; font-weight:800; color:var(--text-secondary); margin-bottom:10px; display:flex; justify-content:space-between; gap:8px; align-items:center; }
        .rt-required { color:#b91c1c; font-size:10px; font-weight:800; }
        .rt-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .rt-field { display:flex; flex-direction:column; gap:5px; min-width:0; font-size:11px; color:var(--text-secondary); font-weight:700; }
        .rt-field-full { grid-column:1 / -1; }
        .rt-help { font-size:10px; color:var(--text-muted); font-weight:500; line-height:1.4; }
        .rt-model-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:8px; }
        .rt-model-option { cursor:pointer; display:flex; align-items:center; gap:7px; min-width:0; padding:9px 10px; border:1px solid var(--border); border-radius:6px; background:#fff; font-size:11px; font-weight:800; color:var(--text-secondary); }
        .rt-model-option.selected { border-color:var(--accent); background:var(--accent-bg); color:var(--accent); }
        .rt-model-option input { margin:0; }
        .rt-tuning-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
        .rt-advanced { border-top:1px solid #eef2f7; padding-top:10px; margin-top:10px; }
        .rt-advanced summary { cursor:pointer; font-size:11px; font-weight:800; color:var(--text-secondary); }
        .rt-warning { padding:9px 10px; border:1px solid #fde68a; border-radius:6px; background:#fffbeb; color:#78350f; font-size:11px; line-height:1.45; }
        .rt-footer { padding:14px 20px; border-top:1px solid var(--border); background:#f8f9fa; display:flex; justify-content:space-between; gap:10px; align-items:center; flex-shrink:0; }
        .rt-error { color:#dc3545; font-size:12px; min-height:18px; }
        @media (max-width: 1180px) {
            .model-filter-panel { grid-template-columns:repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 760px) {
            .models-layout { grid-template-columns:1fr; }
            .model-filter-panel { grid-template-columns:1fr; }
            .model-filter-panel .pm-btn { width:100%; }
            .version-meta-grid { grid-template-columns:1fr; }
            .version-meta-item.wide-value { grid-column:auto; }
            .param-kv-grid { grid-template-columns:1fr; }
            .prod-test-meta { grid-template-columns:1fr; }
            .rt-source { grid-template-columns:1fr 1fr; }
            .rt-grid, .rt-tuning-grid, .rt-model-grid { grid-template-columns:1fr; }
        }
        </style>

        <div class="pm-page-header" style="display:flex; justify-content:space-between;">
            <div>
                <h1>모델 운영 관리</h1>
                <p>모델 버전 관리 · 상태 태깅(미지정/검증/운영/보관) · 롤백</p>
            </div>
            <button class="pm-btn pm-btn-primary model-upload-trigger" id="model-upload-btn">모델 업로드</button>
        </div>

        <div class="model-filter-panel">
            <label class="model-filter-field">검색
                <input id="model-filter-q" class="model-filter-input" value="${esc(modelListFilters.q)}" placeholder="모델명, 상태, 데이터셋" />
            </label>
            <label class="model-filter-field">프로젝트
                <select id="model-filter-project" class="model-filter-input">
                    ${_opt('', '전체', modelListFilters.project)}
                    ${projectOptions.map(v => _opt(v, v, modelListFilters.project)).join('')}
                </select>
            </label>
            <label class="model-filter-field">상태
                <select id="model-filter-status" class="model-filter-input">
                    ${_opt('', '전체', modelListFilters.status)}
                    ${STATUS_OPTIONS.map(([val, lbl]) => _opt(val, lbl, modelListFilters.status)).join('')}
                </select>
            </label>
            <label class="model-filter-field">프레임워크
                <select id="model-filter-framework" class="model-filter-input">
                    ${_opt('', '전체', modelListFilters.framework)}
                    ${frameworkOptions.map(v => _opt(v, v, modelListFilters.framework)).join('')}
                </select>
            </label>
            <label class="model-filter-field">작업
                <select id="model-filter-task" class="model-filter-input">
                    ${_opt('', '전체', modelListFilters.task)}
                    ${taskOptions.map(v => _opt(v, _taskLabel(v), modelListFilters.task)).join('')}
                </select>
            </label>
            <button class="pm-btn pm-btn-sm pm-btn-primary" id="model-filter-apply">적용</button>
            <button class="pm-btn pm-btn-sm" id="model-filter-clear" ${activeFilterCount ? '' : 'disabled'}>초기화</button>
        </div>

        <div class="models-layout">
            <div class="model-list" id="model-list">
                <div style="padding:10px 14px; border-bottom:1px solid #e9ecef; background:#f8f9fa; font-size:12px; font-weight:600; color:var(--text-secondary);">
                    등록된 모델 (${models.length})${activeFilterCount ? `<span class="model-filter-count">필터 ${activeFilterCount}</span>` : ''}
                </div>
                ${listItems}
            </div>
            <div id="model-detail-panel">
                <div style="padding:60px; text-align:center; color:var(--text-muted); background:white; border:1px solid var(--border); border-radius:8px;">
                    ← 왼쪽에서 모델을 선택하세요
                </div>
            </div>
        </div>
    `;
}

function setupModelsPage() {
    document.getElementById('model-upload-btn')?.addEventListener('click', openModelUploadModal);
    document.getElementById('model-filter-apply')?.addEventListener('click', _applyModelFiltersFromUI);
    document.getElementById('model-filter-clear')?.addEventListener('click', () => {
        modelListFilters = { q: '', project: '', status: '', framework: '', task: '' };
        navigate('models');
    });
    ['project', 'status', 'framework', 'task'].forEach(key => {
        document.getElementById(`model-filter-${key}`)?.addEventListener('change', _applyModelFiltersFromUI);
    });
    document.getElementById('model-filter-q')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _applyModelFiltersFromUI();
    });
    document.querySelectorAll('.model-list-item').forEach(item => {
        item.addEventListener('click', async () => {
            modelsSelected = item.dataset.name;
            document.querySelectorAll('.model-list-item').forEach(i => i.classList.toggle('selected', i === item));
            await loadModelDetail(modelsSelected);
        });
    });
    if (modelsSelected) {
        loadModelDetail(modelsSelected);
    }
}

function openModelUploadModal() {
    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    modal.innerHTML = `
        <div class="automl-modal model-upload-modal">
            <div class="mu-header">
                <div>
                    <div class="mu-title">모델 업로드</div>
                </div>
                <button class="pm-btn pm-btn-sm" id="mu-x">닫기</button>
            </div>
            <div class="mu-body">
                <div class="mu-section">
                    <div class="mu-section-title">기본 정보</div>
                    <div class="mu-grid">
                        <label class="mu-field">모델명
                            <input id="mu-name" class="mu-input" placeholder="my-model" />
                        </label>
                        <label class="mu-field">프레임워크
                            <select id="mu-framework" class="mu-input">
                                <option value="mlflow">MLflow bundle</option>
                                <option value="onnx">ONNX</option>
                                <option value="scikit-learn">scikit-learn</option>
                                <option value="xgboost">XGBoost</option>
                                <option value="lightgbm">LightGBM</option>
                                <option value="custom">Custom</option>
                            </select>
                        </label>
                    </div>
                </div>
                <div class="mu-section">
                    <div class="mu-section-title">모델 파일</div>
                    <div class="mu-file-drop">
                        <div class="mu-file-name" id="mu-file-name">선택된 파일 없음</div>
                        <label class="pm-btn pm-btn-sm" style="margin:0;">
                            파일 선택
                            <input id="mu-file" type="file" accept=".zip,.onnx,.joblib,.pkl,.pickle" style="display:none;" />
                        </label>
                    </div>
                </div>
                <div class="mu-section">
                    <div class="mu-section-title">메타데이터</div>
                    <div class="mu-grid">
                        <label class="mu-field">데이터셋 ID
                            <input id="mu-dataset" class="mu-input" />
                        </label>
                        <label class="mu-field">타깃 컬럼
                            <input id="mu-target" class="mu-input" />
                        </label>
                        <label class="mu-field mu-field-full">메트릭 JSON
                            <textarea id="mu-metrics" rows="3" class="mu-input" style="font-family:var(--font-mono);" placeholder='{"f1":0.91,"rmse":123.4}'></textarea>
                        </label>
                        <label class="mu-field mu-field-full">설명
                            <textarea id="mu-desc" rows="2" class="mu-input"></textarea>
                        </label>
                    </div>
                </div>
            </div>
            <div class="mu-footer">
                <button class="pm-btn" id="mu-cancel">취소</button>
                <button class="pm-btn pm-btn-primary" id="mu-submit">업로드</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#mu-cancel').onclick = close;
    modal.querySelector('#mu-x').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#mu-file').addEventListener('change', () => {
        const file = modal.querySelector('#mu-file').files[0];
        modal.querySelector('#mu-file-name').textContent = file ? `${file.name} (${_fmtBytes(file.size)})` : '선택된 파일 없음';
    });
    modal.querySelector('#mu-submit').onclick = async () => {
        const btn = modal.querySelector('#mu-submit');
        const file = modal.querySelector('#mu-file').files[0];
        const modelName = modal.querySelector('#mu-name').value.trim();
        if (!modelName) return alert('모델명을 입력하세요');
        if (!file) return alert('모델 파일을 선택하세요');
        let metrics = {};
        const metricText = modal.querySelector('#mu-metrics').value.trim();
        if (metricText) {
            try {
                metrics = JSON.parse(metricText);
            } catch {
                return alert('메트릭 JSON 형식이 올바르지 않습니다');
            }
        }
        const metadata = {
            model_name: modelName,
            filename: file.name,
            framework: modal.querySelector('#mu-framework').value,
            dataset_id: modal.querySelector('#mu-dataset').value.trim(),
            dataset_target: modal.querySelector('#mu-target').value.trim(),
            description: modal.querySelector('#mu-desc').value.trim(),
            metrics,
        };
        const qs = new URLSearchParams({ model_name: modelName, filename: file.name });
        btn.disabled = true;
        btn.textContent = '업로드 중...';
        try {
            const resp = await fetch(API._withNs(`/api/models?${qs.toString()}`), {
                method: 'POST',
                headers: API._headers({
                    'Content-Type': 'application/octet-stream',
                    'x-pm-model-metadata-b64': _b64Utf8(JSON.stringify(metadata)),
                }),
                body: file,
            });
            const r = await API._json(resp);
            alert(`✅ 모델 업로드 완료\n모델: ${r.name}\n버전: v${r.version}\n저장소: ${r.repository?.path || '-'}`);
            modelsSelected = r.name;
            close();
            navigate('models');
        } catch (e) {
            alert('업로드 실패: ' + e.message);
            btn.disabled = false;
            btn.textContent = '업로드';
        }
    };
}

async function loadModelDetail(name) {
    const panel = document.getElementById('model-detail-panel');
    panel.innerHTML = '<div style="padding:20px; text-align:center;">로딩 중...</div>';
    let data = null;
    try {
        data = await API.get(`/api/models/${encodeURIComponent(name)}`);
    } catch (e) {
        panel.innerHTML = `<div style="padding:20px; color:#dc3545;">로드 실패: ${e.message}</div>`;
        return;
    }

    const firstVer = data.versions[0];
    const nsGuess = data.owner_namespace || (firstVer ? _guessNamespace(firstVer.experiment_name) : '');
    let productionStatus = null;
    let prodStatusHtml = '';
    if (nsGuess) {
        try {
            const ps = await API.get(`/api/models/${encodeURIComponent(name)}/production-status?namespace=${encodeURIComponent(nsGuess)}`);
            productionStatus = ps;
            if (ps.deployed) {
                const stzBadge = ps.scale_to_zero
                    ? `<span style="margin-left:6px; padding:1px 6px; border-radius:3px; background:#dbeafe; color:#1e40af; font-size:10px; font-weight:600;">Scale-to-Zero</span>`
                    : '';
                prodStatusHtml = `
                    <div style="background:${ps.ready ? '#d4edda' : '#fff3cd'}; border:1px solid ${ps.ready ? '#28a745' : '#ffc107'}; padding:8px 12px; border-radius:6px; font-size:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <div>
                            <b>${ps.ready ? '운영 서빙 중' : '배포 진행 중'}</b> ·
                            v${esc(ps.deployed_version || '?')} ·
                            <span style="font-family:var(--font-mono);">${esc(ps.url)}</span>
                            ${stzBadge}
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                            <button class="pm-btn pm-btn-sm pm-btn-primary" id="prod-test-btn" data-ns="${esc(nsGuess)}" title="운영 KServe endpoint에 테스트 요청 전송">테스트 요청</button>
                            <button class="pm-btn pm-btn-sm pm-btn-danger" id="undeploy-btn" data-ns="${esc(nsGuess)}" title="KServe InferenceService 즉시 제거 (모든 버전을 자동으로 보관 처리)">운영 중단</button>
                        </div>
                    </div>
                `;
            } else {
                prodStatusHtml = `<div style="background:#f8f9fa; border:1px solid var(--border); padding:8px 12px; border-radius:6px; font-size:12px; color:var(--text-muted); margin-bottom:12px;">아직 운영 배포된 버전이 없습니다</div>`;
            }
        } catch (e) {}
    }

    const comparisonHtml = _renderVersionComparison(data.versions || []);
    const versionCards = data.versions.map(v => {
        const metricsHtml = Object.entries(v.metrics || {}).slice(0, 8).map(([k, val]) => `
            <div class="metric-item">
                <div class="metric-key">${esc(k)}</div>
                <div class="metric-val">${_fmtMetricValue(val)}</div>
            </div>
        `).join('');
        const ver = esc(v.version);
        const status = v.status || v.lifecycle_status || 'none';
        const metadataHtml = _renderVersionMetadata(v, { modelName: name, namespace: nsGuess, productionStatus });
        const paramsHtml = _renderParamDetails(v.params || {});
        return `
        <div class="version-card" data-version="${ver}">
            <div class="version-card-header">
                <div>
                    <span class="version-title">v${ver}</span>
                    ${_statusBadge(status)}
                    <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${_fmtTs(v.last_updated_timestamp)}</span>
                </div>
                <div class="version-actions" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                    <label style="font-size:10px; color:var(--text-muted);">상태</label>
                    <select class="status-select" data-version="${ver}" data-current="${esc(status)}">
                        ${STATUS_OPTIONS.map(([val,lbl]) => `<option value="${val}" ${val === status ? 'selected' : ''}>${lbl}</option>`).join('')}
                    </select>
                    <button class="pm-btn pm-btn-sm repo-sync-btn" data-version="${ver}" title="이 버전의 artifact를 표준 모델 저장소 경로로 동기화">저장소 동기화</button>
                    <button class="pm-btn pm-btn-sm retrain-btn" data-version="${ver}" title="이 버전의 학습 설정을 기반으로 AutoML 재학습 Job 생성">재학습</button>
                    <button class="pm-btn pm-btn-sm onnx-btn" data-version="${ver}" title="이 모델을 ONNX로 변환 (추론 속도 향상)">ONNX 변환</button>
                    <button class="pm-btn pm-btn-sm download-btn" data-version="${ver}" title="모델 artifact를 zip으로 다운로드">다운로드</button>
                    <button class="pm-btn pm-btn-sm pm-btn-danger delete-version-btn" data-version="${ver}" data-status="${esc(status)}" title="이 버전 삭제 (Registry + 저장소)">버전 삭제</button>
                </div>
            </div>
            ${metadataHtml}
            ${metricsHtml ? `<div class="metric-grid">${metricsHtml}</div>` : ''}
            ${paramsHtml}
        </div>`;
    }).join('');

    panel.innerHTML = `
        <div class="model-detail">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:18px; font-weight:700;">${esc(name)}</div>
                    <div style="font-size:12px; color:var(--text-muted);">${data.versions.length}개 버전 · 소유 네임스페이스: ${esc(nsGuess || '-')}</div>
                </div>
                <div class="model-toolbar">
                    <button class="pm-btn pm-btn-sm" id="repo-check-btn" title="Registry 메타데이터와 /models 파일 정합성 검사">정합성 검사</button>
                    <button class="pm-btn pm-btn-sm" id="repo-repair-btn" title="정합성이 깨진 버전을 MLflow artifact에서 다시 복구">저장소 복구</button>
                    <span class="model-toolbar-divider"></span>
                    <button class="pm-btn pm-btn-sm" id="accuracy-btn" title="시간별 정확도 추이 보기">정확도</button>
                    <button class="pm-btn pm-btn-sm" id="feedback-btn" title="실제 값과 예측 값을 업로드">피드백</button>
                    <span class="model-toolbar-divider"></span>
                    <button class="pm-btn pm-btn-sm" id="rollback-btn" title="이전 운영 버전(보관)으로 복원">롤백</button>
                    <button class="pm-btn pm-btn-sm pm-btn-danger" id="delete-model-btn" title="모델 전체 삭제 (자기 namespace 소유만)">삭제</button>
                </div>
            </div>
            ${prodStatusHtml}
            ${comparisonHtml}
            <div>${versionCards || '<div style="text-align:center; padding:40px; color:var(--text-muted);">버전이 없습니다</div>'}</div>
        </div>
    `;

    document.getElementById('repo-check-btn').addEventListener('click', async () => {
        try {
            const r = await API.get(`/api/models/${encodeURIComponent(name)}/repository-consistency`);
            const bad = (r.versions || []).filter(v => !v.ok);
            const lines = [
                r.ok ? '✅ 저장소 정합성 정상' : '⚠ 저장소 정합성 문제 감지',
                `버전: ${r.total_versions}개`,
                `문제 버전: ${r.inconsistent_versions}개`,
                ...bad.slice(0, 8).map(v => `v${v.version}: ${(v.issues || []).join(', ')}`),
            ];
            alert(lines.join('\n'));
        } catch (e) {
            alert('정합성 검사 실패: ' + e.message);
        }
    });

    document.getElementById('repo-repair-btn').addEventListener('click', async () => {
        if (!confirm('정합성이 깨진 모델 버전을 MLflow artifact에서 다시 복구합니다. 계속할까요?')) return;
        const btn = document.getElementById('repo-repair-btn');
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '복구 중...';
        try {
            const r = await API.post(`/api/models/${encodeURIComponent(name)}/repository-repair`, {});
            const after = r.after || {};
            const lines = [
                r.status === 'ok' ? '✅ 저장소 복구 완료' : '⚠ 저장소 복구 일부 실패',
                `복구 버전: ${(r.repaired || []).length}개`,
                `실패 버전: ${(r.failed || []).length}개`,
                `남은 문제 버전: ${after.inconsistent_versions ?? '-' }개`,
            ];
            alert(lines.join('\n'));
            await loadModelDetail(name);
        } catch (e) {
            alert('저장소 복구 실패: ' + e.message);
            btn.disabled = false;
            btn.textContent = original;
        }
    });

    panel.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            const version = sel.dataset.version;
            const nextStatus = sel.value;
            const currentStatus = sel.dataset.current || 'none';
            if (nextStatus === currentStatus) return;

            let payload = { status: nextStatus };
            if (nextStatus === 'production') {
                if (!confirm(`v${version}을(를) 운영 상태로 변경하고 KServe에 배포하시겠습니까?\n기존 운영 버전은 자동으로 보관 처리됩니다.`)) {
                    await loadModelDetail(name);
                    return;
                }
                const ns = nsGuess || prompt('배포할 namespace를 입력하세요 (예: kubeflow-user-example-com):');
                if (!ns) {
                    await loadModelDetail(name);
                    return;
                }
                const opts = await _openDeployOptionsModal(name, version, ns);
                if (!opts) {
                    await loadModelDetail(name);
                    return;
                }
                payload = { status: nextStatus, target_namespace: ns, scale_to_zero: opts.scale_to_zero };
            } else if (nextStatus === 'archived' && !confirm(`v${version}을(를) 보관 상태로 변경하시겠습니까?`)) {
                await loadModelDetail(name);
                return;
            }
            try {
                const r = await API.put(`/api/models/${encodeURIComponent(name)}/versions/${version}/status`, payload);
                if (nextStatus === 'production') {
                    const stzNote = payload.scale_to_zero ? '\n유휴 시 자동 종료 활성' : '';
                    alert(`운영 배포 완료\nURL: ${r.isvc_url}${stzNote}`);
                }
                navigate('models');
            } catch (e) {
                alert('상태 변경 실패: ' + e.message);
                await loadModelDetail(name);
            }
        });
    });

    panel.querySelectorAll('.retrain-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const version = btn.dataset.version;
            const versionInfo = (data.versions || []).find(v => String(v.version) === String(version));
            openRetrainModal(name, versionInfo || { version });
        });
    });

    panel.querySelectorAll('.onnx-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const version = btn.dataset.version;
            if (!confirm(`v${version}을(를) ONNX로 변환하시겠습니까?\n'${name}-onnx'라는 새 모델로 등록됩니다.`)) return;
            btn.disabled = true;
            btn.textContent = '변환 중...';
            try {
                const r = await API.post(`/api/models/${encodeURIComponent(name)}/versions/${version}/to-onnx`, {});
                if (r.status === 'ok') {
                    alert(`✅ ONNX 변환 완료\n\n새 모델: ${r.new_name}\n원본 타입: ${r.model_type}\n피처: ${r.n_features}개`);
                    navigate('models');
                } else {
                    alert('변환 실패: ' + (r.detail || JSON.stringify(r)));
                    btn.disabled = false;
                    btn.textContent = 'ONNX 변환';
                }
            } catch (e) {
                alert('변환 실패: ' + e.message);
                btn.disabled = false;
                btn.textContent = 'ONNX 변환';
            }
        });
    });

    panel.querySelectorAll('.repo-sync-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const version = btn.dataset.version;
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = '동기화 중...';
            try {
                const r = await API.post(`/api/models/${encodeURIComponent(name)}/versions/${version}/repository-sync`, {});
                if (r.status === 'warning') {
                    alert('저장소 동기화 경고: ' + (r.repository?.error || '원인을 확인할 수 없습니다'));
                }
                await loadModelDetail(name);
            } catch (e) {
                alert('저장소 동기화 실패: ' + e.message);
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    });

    panel.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const version = btn.dataset.version;
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = '준비 중...';
            try {
                const url = API.base + `/api/models/${encodeURIComponent(name)}/versions/${version}/download`;
                const r = await fetch(url, { credentials: 'include' });
                if (!r.ok) {
                    const detail = await r.text();
                    throw new Error(`${r.status}: ${detail.slice(0, 200)}`);
                }
                const blob = await r.blob();
                const cd = r.headers.get('Content-Disposition') || '';
                const m = cd.match(/filename="?([^"]+)"?/);
                const filename = m ? m[1] : `${name}-v${version}.zip`;
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(a.href);
            } catch (e) {
                alert('다운로드 실패: ' + e.message);
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    });

    panel.querySelectorAll('.delete-version-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const version = btn.dataset.version;
            const status = btn.dataset.status || 'none';
            const isProduction = status === 'production';
            if (isProduction && !confirm(`v${version}은 운영 상태입니다.\n\n` +
                `운영 중단 후 이 버전을 삭제하려면 확인이 필요합니다.\n` +
                `계속할까요?`)) {
                return;
            } else if (!isProduction) {
                if (!confirm(`v${version}을(를) 삭제할까요?\n\n` +
                    `Registry 버전 엔트리와 모델 저장소 경로를 삭제합니다.\n` +
                    `Run/Artifact는 유지됩니다.`)) return;
            }
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = '삭제 중...';
            try {
                const path = `/api/models/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}` + (isProduction ? '?force=true' : '');
                const r = await API.del(path);
                const lines = [
                    `삭제 완료: v${r.version || version}`,
                    `저장소 삭제: ${(r.repository_purged || []).length}개`,
                ];
                alert(lines.join('\n'));
                await loadModelDetail(name);
            } catch (e) {
                alert('버전 삭제 실패: ' + e.message);
                btn.disabled = false;
                btn.textContent = '버전 삭제';
            }
        });
    });

    document.getElementById('accuracy-btn').addEventListener('click', () => loadAccuracyPanel(name));
    document.getElementById('feedback-btn').addEventListener('click', () => openFeedbackModal(name));

    document.getElementById('delete-model-btn').addEventListener('click', async () => {
        const msg = `${name} 모델을 완전 삭제합니다.\n\n함께 제거되는 항목:\n` +
            `• 모든 버전 + Registry 엔트리\n` +
            `• 운영 서빙(ISVC) + 모델 PVC\n` +
            `• AutoML 서빙으로 만든 ISVC + PVC\n` +
            `• MLflow Run 기록 + Artifact 파일 (디스크 영구 삭제)\n\n` +
            `복구 불가. 계속할까요?`;
        if (!confirm(msg)) return;
        try {
            const r = await fetch(API.base + `/api/models/${encodeURIComponent(name)}`, { method: 'DELETE' });
            const data = await r.json();
            if (r.ok && data.status === 'ok') {
                const lines = [
                    `삭제 완료: ${data.deleted}`,
                    `버전 ${data.versions_deleted}개 삭제`,
                    `Run ${(data.runs_deleted || []).length}개 삭제`,
                    `Artifact 파일 ${(data.artifacts_purged || []).length}개 영구 제거`,
                    `모델 저장소 ${(data.repository_purged || []).length}개 경로 제거`,
                    `ISVC ${(data.isvc_deleted || []).length}개 제거`,
                    `PVC ${(data.pvc_deleted || []).length}개 제거`,
                ];
                alert(lines.join('\n'));
                modelsSelected = null;
                navigate('models');
            } else {
                alert('삭제 실패: ' + (data.detail || r.status));
            }
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        }
    });

    document.getElementById('rollback-btn').addEventListener('click', async () => {
        if (!confirm('현재 운영 버전을 보관 처리하고, 가장 최근의 이전 운영 버전(보관)을 KServe에 즉시 재배포합니다. 계속할까요?')) return;
        try {
            const r = await API.post(`/api/models/${encodeURIComponent(name)}/rollback`, {
                target_namespace: nsGuess || null,
            });
            const lines = [
                `✅ 롤백 및 재배포 완료`,
                r.rolled_back_from ? `기존 운영 버전: v${r.rolled_back_from}` : '',
                `새 운영 버전: v${r.new_production}`,
                r.isvc_url ? `URL: ${r.isvc_url}` : '',
                r.pvc_name ? `PVC: ${r.pvc_name}` : '',
                r.repository?.path ? `저장소: ${r.repository.path}` : '',
            ].filter(Boolean);
            alert(lines.join('\n'));
            await loadModelDetail(name);
        } catch (e) {
            alert('롤백 실패: ' + e.message);
        }
    });

    document.getElementById('prod-test-btn')?.addEventListener('click', () => {
        const deployedVersion = String(productionStatus?.deployed_version || '');
        const versionInfo = (data.versions || []).find(v => String(v.version) === deployedVersion) || null;
        openProductionTestModal(name, nsGuess, productionStatus, versionInfo);
    });

    document.getElementById('undeploy-btn')?.addEventListener('click', async (ev) => {
        if (!confirm('운영 중단: KServe InferenceService와 PVC를 제거하고 모든 Production 버전을 보관(Archived)으로 변경합니다. 계속할까요?')) return;
        const btn = ev.target;
        btn.disabled = true; btn.textContent = '중단 중...';
        try {
            await API.post(`/api/models/${encodeURIComponent(name)}/undeploy`, {});
            await loadModelDetail(name);
        } catch (e) {
            alert('운영 중단 실패: ' + e.message);
            btn.disabled = false; btn.textContent = '운영 중단';
        }
    });
}

function openProductionTestModal(name, namespace, productionStatus, versionInfo) {
    const status = productionStatus || {};
    const inferUrl = status.isvc_name && status.url ? `${status.url}/v2/models/${status.isvc_name}/infer` : '-';
    const schemaCols = versionInfo?.input_schema?.columns || [];
    const payloadText = JSON.stringify(_defaultProductionTestPayload(versionInfo), null, 2);
    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    modal.innerHTML = `
        <div class="automl-modal prod-test-modal">
            <div class="mu-header">
                <div>
                    <div class="mu-title">운영 테스트 요청</div>
                </div>
                <button class="pm-btn pm-btn-sm" id="pt-close">닫기</button>
            </div>
            <div class="prod-test-body">
                <div class="prod-test-meta">
                    <div class="prod-test-meta-item">
                        <div class="prod-test-meta-label">Namespace</div>
                        <div class="prod-test-meta-value" title="${esc(namespace || '-')}">${esc(namespace || '-')}</div>
                    </div>
                    <div class="prod-test-meta-item">
                        <div class="prod-test-meta-label">Version</div>
                        <div class="prod-test-meta-value">v${esc(status.deployed_version || '-')}</div>
                    </div>
                    <div class="prod-test-meta-item">
                        <div class="prod-test-meta-label">ISVC</div>
                        <div class="prod-test-meta-value" title="${esc(status.isvc_name || '-')}">${esc(status.isvc_name || '-')}</div>
                    </div>
                    <div class="prod-test-meta-item">
                        <div class="prod-test-meta-label">Endpoint</div>
                        <div class="prod-test-meta-value" title="${esc(inferUrl)}">${esc(inferUrl)}</div>
                    </div>
                </div>
                <label class="mu-field">Payload JSON
                    <textarea id="pt-payload" class="prod-test-editor" spellcheck="false">${esc(payloadText)}</textarea>
                </label>
                ${schemaCols.length ? `
                    <div style="font-size:11px; color:var(--text-muted);">
                        입력 스키마: ${schemaCols.map(c => `<code>${esc(c.name)}</code>`).join(' · ')}
                    </div>
                ` : ''}
                <label class="mu-field" style="max-width:180px;">Timeout seconds
                    <input id="pt-timeout" class="mu-input" type="number" min="1" max="180" step="1" value="${status.scale_to_zero ? '90' : '60'}" />
                </label>
                <pre id="pt-output" class="prod-test-output">대기 중</pre>
            </div>
            <div class="mu-footer">
                <button class="pm-btn" id="pt-cancel">취소</button>
                <button class="pm-btn pm-btn-primary" id="pt-submit">전송</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();
    modal.querySelector('#pt-close').onclick = cleanup;
    modal.querySelector('#pt-cancel').onclick = cleanup;
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });
    modal.querySelector('#pt-submit').onclick = async () => {
        const submit = modal.querySelector('#pt-submit');
        const output = modal.querySelector('#pt-output');
        let payload = null;
        try {
            payload = JSON.parse(modal.querySelector('#pt-payload').value);
        } catch (e) {
            output.textContent = `JSON 파싱 실패: ${e.message}`;
            return;
        }
        submit.disabled = true;
        submit.textContent = '요청 중...';
        output.textContent = '요청 중';
        try {
            const timeout = Number(modal.querySelector('#pt-timeout').value) || 60;
            const r = await API.post(`/api/models/${encodeURIComponent(name)}/production-test`, {
                target_namespace: namespace || null,
                payload,
                timeout_seconds: timeout,
            });
            const body = r.response !== null && r.response !== undefined
                ? JSON.stringify(r.response, null, 2)
                : (r.response_text || '');
            const predictionLog = r.prediction_log || {};
            output.textContent = [
                `${r.ok ? 'OK' : 'ERROR'} · HTTP ${r.status_code} · ${r.elapsed_ms}ms · v${r.deployed_version || '-'}`,
                predictionLog.prediction_id ? `Prediction ID ${predictionLog.prediction_id}` : '',
                predictionLog.y_pred !== undefined && predictionLog.y_pred !== null ? `예측값 ${predictionLog.y_pred}` : '',
                r.prediction_log_error ? `예측 로그 저장 실패 ${r.prediction_log_error}` : '',
                `URL ${r.request_url}`,
                '',
                body || '(empty response)',
            ].filter(line => line !== '').join('\n');
        } catch (e) {
            output.textContent = `요청 실패: ${e.message}`;
        } finally {
            submit.disabled = false;
            submit.textContent = '전송';
        }
    };
}

async function loadAccuracyPanel(name) {
    // 모달로 열기
    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    modal.innerHTML = `
        <div class="automl-modal" style="min-width:720px; max-width:95vw;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0;">정확도: ${esc(name)}</h3>
                <button class="pm-btn" id="acc-close">닫기</button>
            </div>
            <div id="acc-body">로딩 중...</div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();
    modal.querySelector('#acc-close').onclick = cleanup;
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });

    const body = modal.querySelector('#acc-body');
    let data = null;
    try {
        data = await API.get(`/api/models/${encodeURIComponent(name)}/accuracy-history?hours=72&bucket_minutes=60`);
    } catch (e) {
        body.innerHTML = `<div style="padding:14px; color:#dc3545;">로드 실패: ${esc(e.message)}</div>`;
        return;
    }

    if (!data.buckets.length) {
        body.innerHTML = `
            <div style="padding:14px; background:#f8f9fa; border:1px solid var(--border); border-radius:8px; font-size:12px; color:var(--text-muted);">
                아직 피드백 데이터가 없습니다. "피드백" 버튼으로 실제 값과 예측값을 제출하면 시간대별 성능 변화가 여기에 표시됩니다.
            </div>`;
        return;
    }

    const task = data.task;
    const primary = task === 'regression' ? 'rmse' : 'accuracy';
    const buckets = data.buckets;
    const vals = buckets.map(b => b[primary]).filter(v => v !== undefined);
    const maxV = Math.max(...vals);
    const minV = Math.min(...vals);
    const range = (maxV - minV) || 1;
    const CHART_H = 160;

    const bars = buckets.map(b => {
        const v = b[primary];
        if (v === undefined) return '';
        const norm = task === 'regression' ? 1 - (v - minV) / range : (v - minV) / range;
        const h = Math.max(6, Math.round(norm * (CHART_H - 40)));
        const time = new Date(b.bucket).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit' });
        return `<div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; min-width:34px;">
            <div style="font-size:9px; color:var(--text-muted);">${v.toFixed(3)}</div>
            <div style="width:70%; height:${h}px; background:#0066cc; border-radius:3px 3px 0 0;" title="${time}: ${primary}=${v.toFixed(4)} (n=${b.n})"></div>
            <div style="font-size:9px; color:var(--text-muted); margin-top:3px; transform:rotate(-30deg); transform-origin:top left; white-space:nowrap;">${time}</div>
        </div>`;
    }).join('');

    const overall = data.overall;
    const ovPairs = Object.entries(overall).filter(([k]) => !['n'].includes(k)).map(([k, v]) => `
        <div style="background:#e8f4ff; padding:8px 12px; border-radius:6px;">
            <div style="font-size:10px; color:#0066cc; text-transform:uppercase;">${k}</div>
            <div style="font-size:15px; font-weight:700; font-family:var(--font-mono);">${typeof v === 'number' ? v.toFixed(4) : v}</div>
        </div>
    `).join('');

    body.innerHTML = `
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">최근 72시간 · 1시간 단위 · 총 ${overall.n}건 · 유형: ${task === 'regression' ? '회귀' : '분류'}</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; margin-bottom:16px;">${ovPairs}</div>
        <div style="display:flex; gap:4px; align-items:flex-end; height:${CHART_H + 40}px; border-bottom:1px solid #dee2e6; overflow-x:auto; padding:0 6px;">${bars}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:20px;">● ${primary} (${task === 'regression' ? '낮을수록 좋음' : '높을수록 좋음'}, 막대 높이는 범위 기준 정규화)</div>
    `;
}

function openFeedbackModal(name) {
    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    let recentPredictions = [];
    modal.innerHTML = `
        <div class="automl-modal" style="min-width:520px; max-height:calc(100vh - 48px); overflow-y:auto;">
            <h3>피드백</h3>
            <p style="font-size:12px; color:var(--text-muted);">운영 중인 모델의 실제 결과 값을 업로드합니다. 시간별 정확도에 반영됩니다.</p>
            <label style="font-size:12px; color:var(--text-secondary); margin:10px 0 4px 0; display:block;">작업 유형</label>
            <select id="fb-task" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
                <option value="regression">회귀</option>
                <option value="classification">분류</option>
            </select>
            <label style="font-size:12px; color:var(--text-secondary); margin:10px 0 4px 0; display:block;">최근 예측 결과</label>
            <select id="fb-pred-select" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
                <option value="">불러오는 중...</option>
            </select>
            <div id="fb-pred-hint" style="font-size:11px; color:var(--text-muted); margin-top:5px;">운영 테스트 요청 결과가 있으면 여기에서 선택할 수 있습니다.</div>
            <label style="font-size:12px; color:var(--text-secondary); margin:10px 0 4px 0; display:block;">선택한 예측의 실제값</label>
            <input id="fb-true" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; box-sizing:border-box;" placeholder="예: 136000" />
            <label style="font-size:12px; color:var(--text-secondary); margin:10px 0 4px 0; display:block;">
                직접 입력 CSV (한 줄에 "실제값,예측값" 형식)
            </label>
            <textarea id="fb-data" rows="8" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:6px; font-family:var(--font-mono); font-size:12px; background:#ffffff; color:#1f2937; box-sizing:border-box;" placeholder="4.5,4.23
3.9,3.87
2.1,2.34"></textarea>
            <div style="margin-top:12px; padding:10px; border:1px solid #dbe4ef; border-radius:6px; background:#f8fafc;">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <div style="font-size:12px; font-weight:700; color:#1f2937;">CSV 파일 일괄 업로드</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">권장 형식: <span style="font-family:var(--font-mono);">prediction_id,y_true</span> · 선택: <span style="font-family:var(--font-mono);">y_pred,model_version,task</span></div>
                    </div>
                    <button class="pm-btn pm-btn-sm" id="fb-csv-submit" type="button">CSV 업로드</button>
                </div>
                <input id="fb-csv-file" type="file" accept=".csv,text/csv" style="width:100%; font-size:12px;" />
                <pre style="margin:8px 0 0 0; padding:8px; border-radius:4px; background:#ffffff; border:1px solid #e5e7eb; color:#475569; font-size:11px; overflow:auto;">prediction_id,y_true
pred-abc123,42.5
pred-def456,39.1</pre>
                <div id="fb-csv-hint" style="font-size:11px; color:var(--text-muted); margin-top:6px;">운영 테스트 요청으로 생성된 Prediction ID와 실제값을 매칭합니다. 이미 피드백이 있는 Prediction ID는 건너뜁니다.</div>
            </div>
            <label style="font-size:12px; color:var(--text-secondary); margin:8px 0 4px 0; display:block;">모델 버전 (선택)</label>
            <input id="fb-version" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; box-sizing:border-box;" placeholder="예: 3" />
            <div id="fb-err" style="color:#dc3545; font-size:12px; margin-top:8px; min-height:18px;"></div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
                <button class="pm-btn" id="fb-cancel">취소</button>
                <button class="pm-btn pm-btn-primary" id="fb-submit">업로드</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();
    modal.querySelector('#fb-cancel').onclick = cleanup;
    const predSelect = modal.querySelector('#fb-pred-select');
    const predHint = modal.querySelector('#fb-pred-hint');
    API.get(`/api/models/${encodeURIComponent(name)}/predictions?limit=20`).then((data) => {
        recentPredictions = (data.predictions || []).filter(p => p.y_pred !== null && p.y_pred !== undefined);
        if (!recentPredictions.length) {
            predSelect.innerHTML = '<option value="">최근 예측 결과 없음</option>';
            predHint.textContent = '운영 테스트 요청을 먼저 보내면 예측값을 자동으로 연결할 수 있습니다.';
            return;
        }
        predSelect.innerHTML = [
            '<option value="">직접 입력 사용</option>',
            ...recentPredictions.map((p) => {
                const when = p.created_at ? new Date(p.created_at).toLocaleString('ko-KR', { hour12: false }) : '-';
                const fb = p.has_feedback ? ' · 피드백 있음' : '';
                return `<option value="${esc(p.prediction_id)}">${esc(p.prediction_id)} · v${esc(p.model_version || '-')} · y_pred=${esc(p.y_pred)} · ${esc(when)}${fb}</option>`;
            }),
        ].join('');
        predHint.textContent = '예측 결과를 선택하면 실제값만 입력해도 피드백으로 저장됩니다.';
    }).catch((e) => {
        predSelect.innerHTML = '<option value="">최근 예측 로드 실패</option>';
        predHint.textContent = e.message;
    });
    modal.querySelector('#fb-csv-file').addEventListener('change', (ev) => {
        const file = ev.target.files?.[0];
        modal.querySelector('#fb-csv-hint').textContent = file
            ? `${file.name} · ${_fmtBytes(file.size)} 선택됨`
            : '운영 테스트 요청으로 생성된 Prediction ID와 실제값을 매칭합니다. 이미 피드백이 있는 Prediction ID는 건너뜁니다.';
    });
    modal.querySelector('#fb-csv-submit').onclick = async () => {
        const file = modal.querySelector('#fb-csv-file').files?.[0];
        const errEl = modal.querySelector('#fb-err');
        errEl.textContent = '';
        if (!file) {
            errEl.textContent = '업로드할 CSV 파일을 선택하세요';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            errEl.textContent = 'CSV 파일은 10MB 이하만 업로드할 수 있습니다';
            return;
        }
        const task = modal.querySelector('#fb-task').value;
        const btn = modal.querySelector('#fb-csv-submit');
        btn.disabled = true; btn.textContent = '업로드 중...';
        try {
            const text = await file.text();
            if (!text.trim()) {
                throw new Error('CSV 파일이 비어 있습니다');
            }
            const resp = await fetch(
                API._withNs(`/api/models/${encodeURIComponent(name)}/feedback-csv?task=${encodeURIComponent(task)}&skip_existing=true`),
                {
                    method: 'POST',
                    headers: API._headers({ 'Content-Type': 'text/csv; charset=utf-8' }),
                    body: text,
                },
            );
            const r = await API._json(resp);
            cleanup();
            const skipped = r.skipped ? `\n건너뜀: ${r.skipped}건` : '';
            const errors = r.error_count ? `\n오류: ${r.error_count}건` : '';
            alert(`✅ CSV 피드백 업로드 완료\n\n저장: ${r.inserted}건${skipped}${errors}`);
            loadAccuracyPanel(name);
        } catch (e) {
            errEl.textContent = e.message;
            btn.disabled = false; btn.textContent = 'CSV 업로드';
        }
    };
    modal.querySelector('#fb-submit').onclick = async () => {
        const task = modal.querySelector('#fb-task').value;
        const raw = modal.querySelector('#fb-data').value.trim();
        const version = modal.querySelector('#fb-version').value.trim();
        const predictionId = predSelect.value;
        const selectedPrediction = recentPredictions.find(p => p.prediction_id === predictionId);
        const errEl = modal.querySelector('#fb-err');
        errEl.textContent = '';
        const entries = [];
        if (selectedPrediction) {
            const yt = parseFloat(modal.querySelector('#fb-true').value.trim());
            if (isNaN(yt)) {
                errEl.textContent = '선택한 예측 결과의 실제값을 입력하세요';
                return;
            }
            entries.push({
                task,
                y_true: yt,
                y_pred: Number(selectedPrediction.y_pred),
                model_version: selectedPrediction.model_version || version || null,
                prediction_id: selectedPrediction.prediction_id,
            });
        } else {
            if (!raw) { errEl.textContent = '데이터를 입력하거나 최근 예측 결과를 선택하세요'; return; }
            for (const line of raw.split('\n')) {
                const parts = line.split(',').map(s => s.trim());
                if (parts.length < 2) continue;
                const yt = parseFloat(parts[0]);
                const yp = parseFloat(parts[1]);
                if (isNaN(yt) || isNaN(yp)) continue;
                entries.push({ task, y_true: yt, y_pred: yp, model_version: version || null });
            }
        }
        if (!entries.length) { errEl.textContent = '유효한 데이터 없음'; return; }
        const btn = modal.querySelector('#fb-submit');
        btn.disabled = true; btn.textContent = '업로드 중...';
        try {
            const r = await API.post(`/api/models/${encodeURIComponent(name)}/feedback`, { entries });
            cleanup();
            alert(`✅ ${r.inserted}건 업로드 완료`);
            loadAccuracyPanel(name);
        } catch (e) {
            errEl.textContent = e.message;
            btn.disabled = false; btn.textContent = '업로드';
        }
    };
}


function _inferRetrainModel(tags, params) {
    const explicit = String(tags?.['automl.model'] || '').toLowerCase();
    if (['rf', 'xgb', 'lgbm', 'mlp', 'tabnet'].includes(explicit)) return explicit;
    const framework = String(tags?.framework || '').toLowerCase();
    if (framework.includes('xgboost')) return 'xgb';
    if (framework.includes('lightgbm')) return 'lgbm';
    if (framework.includes('tabnet')) return 'tabnet';
    if (params?.hidden_layer_sizes || params?.activation) return 'mlp';
    return 'rf';
}

function _safeRetrainJobName(value) {
    return String(value || '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 80) || 'retrain-job';
}

function openRetrainModal(name, versionInfo) {
    const version = String(versionInfo?.version || '');
    const tags = versionInfo?.tags || {};
    const params = versionInfo?.params || {};
    const modelId = _inferRetrainModel(tags, params);
    const task = ['regression', 'classification'].includes(String(tags['automl.task'] || '').toLowerCase())
        ? String(tags['automl.task']).toLowerCase()
        : 'regression';
    const metric = String(tags['automl.metric'] || 'auto').toLowerCase();
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const defaultJobName = _safeRetrainJobName(`retrain-${name}-v${version}-${ts}`);
    const datasetPath = tags['dataset.path'] || '';
    const targetColumn = tags['dataset.target'] || '';
    const datasetLabel = tags['dataset.id'] || (datasetPath ? _truncate(String(datasetPath), 34) : '직접 입력 필요');
    const frameworkLabel = [tags.framework, tags['framework.version']].filter(Boolean).join(' ') || '-';
    const modelOptions = [
        ['rf', 'Random Forest'],
        ['xgb', 'XGBoost'],
        ['lgbm', 'LightGBM'],
        ['mlp', 'MLP'],
        ['tabnet', 'TabNet'],
    ];
    const selectedModels = new Set([modelId]);
    const sourceWarning = (!datasetPath || !targetColumn)
        ? `<div class="rt-warning">이 버전에 데이터셋 경로 또는 타깃 컬럼 메타데이터가 부족합니다. 재학습을 만들기 전에 학습 CSV 경로와 타깃 컬럼을 직접 확인해 주세요.</div>`
        : '';
    const modal = document.createElement('div');
    modal.className = 'automl-modal-bg';
    modal.innerHTML = `
        <div class="automl-modal retrain-modal">
            <div class="mu-header">
                <div>
                    <h3 class="mu-title">재학습 Job 생성</h3>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;"><b>${esc(name)}</b> v${esc(version)} 설정을 기반으로 새 AutoML Job을 만듭니다.</div>
                </div>
                <button class="pm-btn pm-btn-sm" id="rt-cancel-top" title="닫기">닫기</button>
            </div>
            <div class="retrain-body">
                <div class="rt-source">
                    <div class="rt-source-item">
                        <div class="rt-source-label">원본 버전</div>
                        <div class="rt-source-value">v${esc(version)}</div>
                    </div>
                    <div class="rt-source-item">
                        <div class="rt-source-label">데이터셋</div>
                        <div class="rt-source-value mono" title="${esc(datasetPath || datasetLabel)}">${esc(datasetLabel)}</div>
                    </div>
                    <div class="rt-source-item">
                        <div class="rt-source-label">타깃</div>
                        <div class="rt-source-value mono">${esc(targetColumn || '-')}</div>
                    </div>
                    <div class="rt-source-item">
                        <div class="rt-source-label">프레임워크</div>
                        <div class="rt-source-value">${esc(frameworkLabel)}</div>
                    </div>
                </div>
                ${sourceWarning}
                <div class="rt-section">
                    <div class="rt-section-title">학습 데이터 <span class="rt-required">필수</span></div>
                    <div class="rt-grid">
                        <label class="rt-field rt-field-full">데이터셋 경로
                            <input id="rt-dataset" class="mu-input" value="${esc(datasetPath)}" placeholder="/home/jovyan/data/train.csv 또는 http(s) URL" />
                            <span class="rt-help">컨테이너 안에서 접근 가능한 CSV 경로 또는 URL이어야 합니다.</span>
                        </label>
                        <label class="rt-field">타깃 컬럼
                            <input id="rt-target" class="mu-input" value="${esc(targetColumn)}" placeholder="예: median_house_value" />
                        </label>
                        <label class="rt-field">작업 유형
                            <select id="rt-task" class="mu-input">
                                <option value="regression" ${task === 'regression' ? 'selected' : ''}>회귀</option>
                                <option value="classification" ${task === 'classification' ? 'selected' : ''}>분류</option>
                            </select>
                        </label>
                    </div>
                </div>
                <div class="rt-section">
                    <div class="rt-section-title">AutoML 탐색 설정</div>
                    <label class="rt-field rt-field-full" style="margin-bottom:10px;">모델 후보
                        <div class="rt-model-grid" id="rt-model-grid">
                            ${modelOptions.map(([id, label]) => `
                                <label class="rt-model-option ${selectedModels.has(id) ? 'selected' : ''}">
                                    <input type="checkbox" name="rt-model" value="${id}" ${selectedModels.has(id) ? 'checked' : ''} />
                                    <span title="${esc(label)}">${esc(id)}</span>
                                </label>
                            `).join('')}
                        </div>
                        <span class="rt-help">기존 버전에서 추정한 모델을 먼저 선택했습니다. 여러 개를 고르면 Ray Tune이 모델별 trial을 나눠 탐색합니다.</span>
                    </label>
                    <div class="rt-tuning-grid">
                        <label class="rt-field">탐색 횟수
                            <input id="rt-trials" class="mu-input" type="number" min="1" max="200" value="10" />
                        </label>
                        <label class="rt-field">제한 시간(분)
                            <input id="rt-timeout" class="mu-input" type="number" min="1" max="720" value="60" />
                        </label>
                        <label class="rt-field">Top-N 저장
                            <input id="rt-topn" class="mu-input" type="number" min="1" max="10" value="3" />
                        </label>
                    </div>
                    <details class="rt-advanced">
                        <summary>고급 설정</summary>
                        <div class="rt-grid" style="margin-top:10px;">
                            <label class="rt-field">Job 이름
                                <input id="rt-job-name" class="mu-input" value="${esc(defaultJobName)}" />
                            </label>
                            <label class="rt-field">평가 지표
                                <select id="rt-metric" class="mu-input">
                                    ${['auto','mse','rmse','mae','r2','accuracy','f1','precision','recall','roc_auc'].map(m => `<option value="${m}" ${m === metric ? 'selected' : ''}>${m}</option>`).join('')}
                                </select>
                            </label>
                            <label class="rt-field">Trial CPU
                                <input id="rt-cpu" class="mu-input" type="number" min="0.1" max="16" step="0.1" value="1" />
                            </label>
                            <label class="rt-field">Trial GPU
                                <input id="rt-gpu" class="mu-input" type="number" min="0" max="4" step="0.25" value="0" />
                            </label>
                            <label class="rt-field rt-field-full">Trial Memory(GB)
                                <input id="rt-memory" class="mu-input" type="number" min="0.5" max="128" step="0.5" value="2" />
                            </label>
                        </div>
                    </details>
                </div>
            </div>
            <div class="rt-footer">
                <div id="rt-err" class="rt-error"></div>
                <div style="display:flex; gap:8px; justify-content:flex-end; flex-shrink:0;">
                    <button class="pm-btn" id="rt-cancel">취소</button>
                    <button class="pm-btn pm-btn-primary" id="rt-submit">기본값으로 재학습 시작</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();
    modal.querySelector('#rt-cancel').onclick = cleanup;
    modal.querySelector('#rt-cancel-top').onclick = cleanup;
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });
    modal.querySelectorAll('input[name="rt-model"]').forEach(input => {
        input.addEventListener('change', () => {
            input.closest('.rt-model-option')?.classList.toggle('selected', input.checked);
        });
    });
    modal.querySelector('#rt-submit').onclick = async () => {
        const errEl = modal.querySelector('#rt-err');
        errEl.textContent = '';
        const models = [...modal.querySelectorAll('input[name="rt-model"]:checked')].map(input => input.value);
        const payload = {
            job_name: modal.querySelector('#rt-job-name').value.trim(),
            dataset_path: modal.querySelector('#rt-dataset').value.trim(),
            target_column: modal.querySelector('#rt-target').value.trim(),
            task: modal.querySelector('#rt-task').value,
            models,
            metric: modal.querySelector('#rt-metric').value,
            num_trials: Number(modal.querySelector('#rt-trials').value) || 10,
            timeout_minutes: Number(modal.querySelector('#rt-timeout').value) || 60,
            top_n: Number(modal.querySelector('#rt-topn').value) || 3,
            cpu_per_trial: Number(modal.querySelector('#rt-cpu').value) || 1,
            gpu_per_trial: Number(modal.querySelector('#rt-gpu').value) || 0,
            memory_per_trial_gb: Number(modal.querySelector('#rt-memory').value) || 2,
        };
        if (!payload.dataset_path) { errEl.textContent = '데이터셋 경로를 입력하세요'; return; }
        if (!payload.target_column) { errEl.textContent = '타깃 컬럼을 입력하세요'; return; }
        if (!models.length) { errEl.textContent = '모델 후보를 최소 1개 선택하세요'; return; }
        const btn = modal.querySelector('#rt-submit');
        btn.disabled = true; btn.textContent = '생성 중...';
        try {
            const r = await API.post(`/api/models/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/retrain`, payload);
            cleanup();
            const job = r.job || {};
            const lines = [
                '✅ 재학습 Job 생성 완료',
                `Job ID: ${job.job_id || '-'}`,
                `Experiment: ${job.experiment_name || '-'}`,
                `완료 후 AutoML 결과를 '${r.register_suggestion || name}' 모델명으로 등록하면 새 버전이 됩니다.`,
            ];
            alert(lines.join('\n'));
            if (confirm('AutoML 화면으로 이동할까요?')) navigate('automl');
        } catch (e) {
            errEl.textContent = e.message;
            btn.disabled = false; btn.textContent = '기본값으로 재학습 시작';
        }
    };
}

function _renderMetaChips(tags) {
    if (!tags || !Object.keys(tags).length) return '';
    const chips = [];
    const push = (label, value, color) => {
        if (value) chips.push(`<span style="display:inline-block; padding:3px 8px; border-radius:4px; font-size:10px; background:${color}; color:#1f2937; margin-right:4px; margin-top:4px;"><b>${label}:</b> ${esc(value)}</span>`);
    };
    push('프레임워크', tags['framework'] + (tags['framework.version'] ? ` ${tags['framework.version']}` : ''), '#e8f4ff');
    push('데이터셋', tags['dataset.id'], '#fff3cd');
    push('Rows', tags['dataset.rows'], '#fff3cd');
    push('타깃', tags['dataset.target'], '#fff3cd');
    push('생성자', tags['created_by'], '#f0f0f0');
    push('작업 유형', tags['automl.task'] === 'regression' ? '회귀' : tags['automl.task'] === 'classification' ? '분류' : tags['automl.task'], '#f0f0f0');
    push('Source', tags['source.model'] ? `${tags['source.model']} v${tags['source.version']||'?'}` : '', '#e8f4ff');
    if (!chips.length) return '';
    return `<div style="margin-top:8px;">${chips.join('')}</div>`;
}

function _truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }

function _openDeployOptionsModal(name, version, ns) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'automl-modal-bg';
        modal.innerHTML = `
          <div class="automl-modal" style="min-width:480px; max-width:560px;">
            <h3 style="margin:0 0 12px 0;">운영 배포 옵션</h3>
            <div style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">
              <b>${esc(name)}</b> v${esc(version)} → <code>${esc(ns)}</code>
            </div>
            <div style="background:#fffbeb; border:1px solid #fde68a; padding:10px 12px; border-radius:6px; margin-bottom:14px; font-size:12px; color:#78350f;">
              기존 운영 버전이 있으면 자동으로 보관 처리됩니다.
            </div>
            <label style="display:flex; gap:10px; align-items:flex-start; padding:12px; border:1px solid var(--border); border-radius:6px; cursor:pointer;">
              <input type="checkbox" id="dpo-stz" style="margin-top:3px;" />
              <div>
                <div style="font-size:13px; font-weight:600; color:#111827;">유휴 시 자동 종료 (Scale-to-Zero)</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.5;">
                  ✅ 30초 idle 시 pod 자동 종료 → CPU/메모리 회수<br>
                  ⚠ 첫 요청 시 <b>3~5초 cold start</b><br>
                  📌 추천: 데모·검증·저빈도 호출 모델<br>
                  ❌ 비추천: 실시간 응답 SLA 모델
                </div>
              </div>
            </label>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
              <button class="pm-btn" id="dpo-cancel">취소</button>
              <button class="pm-btn pm-btn-primary" id="dpo-ok">배포</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const close = (val) => { modal.remove(); resolve(val); };
        modal.querySelector('#dpo-cancel').onclick = () => close(null);
        modal.querySelector('#dpo-ok').onclick = () => close({
            scale_to_zero: modal.querySelector('#dpo-stz').checked,
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) close(null); });
    });
}
function _guessNamespace(experimentName) {
    if (!experimentName) return '';
    // automl-{ns}-{name}, pipeline-{ns}-{name}, models-{ns}-{name}
    const prefixes = ['automl-', 'pipeline-', 'models-'];
    const prefix = prefixes.find((p) => experimentName.startsWith(p));
    if (prefix) {
        const rest = experimentName.slice(prefix.length);
        const idx = rest.lastIndexOf('-');
        return idx > 0 ? rest.slice(0, idx) : rest;
    }
    return '';
}

window.renderModels = renderModels;
window.setupModelsPage = setupModelsPage;
})();
