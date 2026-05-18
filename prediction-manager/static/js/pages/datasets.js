(() => {
let _datasetsState = {
    datasets: [],
    selectedId: null,
    detail: null,
    pipeline: null,
};

function _fmtBytes(n) {
    n = Number(n || 0);
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
}

function _kindLabel(kind) {
    return ({ raw:'원본', preprocessed:'전처리', image_standardized:'이미지 표준화', labeling_export:'라벨링 완료', nifi_output:'NiFi 출력', external_uri:'외부 URI' })[kind] || kind || '-';
}

function _typeLabel(type) {
    return ({ csv:'CSV', json:'JSON', jsonl:'JSONL', parquet:'Parquet', image:'Image' })[type] || type || '-';
}

function _taskLabel(task) {
    return ({ regression:'회귀', classification:'분류', labeling:'라벨링', unknown:'미지정' })[task] || task || '-';
}

function _statusLabel(status) {
    return ({ registered:'registered', ready:'ready', published:'published', deprecated:'deprecated', archived:'archived' })[status] || status || 'registered';
}

function _latest(ds) {
    return ds.latest_version || (ds.versions || [])[0] || null;
}

function _versionExtra(ver) {
    const meta = ver.metadata || {};
    if (meta.image_count) return `images ${meta.image_count}`;
    if (meta.label_studio?.task_count) return `tasks ${meta.label_studio.task_count}`;
    if (meta.preprocess?.row_count) return `rows ${meta.preprocess.row_count}`;
    return '-';
}

function _datasetCard(ds) {
    const latest = _latest(ds);
    const selected = _datasetsState.selectedId === ds.id ? 'selected' : '';
    return `
        <button class="ds-card ${selected}" data-dataset-id="${esc(ds.id)}">
            <div class="ds-card-title"><b>${esc(ds.name)}</b></div>
            <div class="ds-meta-line ds-card-meta">
                <span>${esc(_typeLabel(ds.data_type))}</span>
                <span>${esc(_taskLabel(ds.task))}</span>
                <span>target ${esc(ds.target_column || '-')}</span>
            </div>
            <div class="ds-card-sub">versions ${esc(ds.version_count || 0)}${latest ? ` · latest ${esc(latest.version_label)}` : ''}</div>
            ${latest ? `<div class="ds-ready ${latest.pipeline_ready ? 'ok' : ''}">${latest.pipeline_ready ? 'Pipeline ready' : 'Pipeline 준비 전'}</div>` : ''}
        </button>`;
}

function _versionRow(ver) {
    const meta = ver.metadata || {};
    const target = meta.target_column || '-';
    const canPrep = ver.data_type === 'csv';
    const canImage = ver.data_type === 'image';
    return `
        <tr>
            <td><b>${esc(ver.version_label)}</b><div class="ds-muted">${esc(_statusLabel(ver.status))}</div></td>
            <td>${esc(_kindLabel(ver.source_kind))}</td>
            <td><span title="${esc(ver.file_name || ver.source_uri || '-')}">${esc(ver.file_name || ver.source_uri || '-')}</span></td>
            <td>${esc(ver.row_count ?? '-')}</td>
            <td>${esc(_fmtBytes(ver.size_bytes))}</td>
            <td>${esc(target)}</td>
            <td>${esc(_versionExtra(ver))}</td>
            <td>${ver.pipeline_ready ? '<span class="ds-pill ok">ready</span>' : '<span class="ds-pill">draft</span>'}</td>
            <td>
                <div class="ds-row-actions">
                    ${canPrep ? `<button class="pm-btn pm-btn-sm ds-prep" data-version="${esc(ver.version)}">전처리</button>` : ''}
                    ${canImage ? `<button class="pm-btn pm-btn-sm ds-image-standard" data-version="${esc(ver.version)}">이미지 표준화</button>` : ''}
                    <button class="pm-btn pm-btn-sm ds-labelstudio" data-version="${esc(ver.version)}">Label Studio</button>
                    <button class="pm-btn pm-btn-sm ds-publish" data-version="${esc(ver.version)}">Publish</button>
                    <button class="pm-btn pm-btn-sm pm-btn-primary ds-pipeline" data-version="${esc(ver.version)}">Pipeline 입력</button>
                </div>
            </td>
        </tr>`;
}

function _renderList() {
    const list = document.getElementById('ds-list');
    if (!list) return;
    if (!_datasetsState.datasets.length) {
        list.innerHTML = '<div class="ds-empty">등록된 데이터셋이 없습니다.</div>';
        return;
    }
    list.innerHTML = _datasetsState.datasets.map(_datasetCard).join('');
}

function _renderDetail() {
    const panel = document.getElementById('ds-detail');
    const ds = _datasetsState.detail;
    if (!panel) return;
    if (!ds) {
        panel.innerHTML = '<div class="ds-empty">왼쪽에서 데이터셋을 선택하세요.</div>';
        return;
    }
    const versions = ds.versions || [];
    panel.innerHTML = `
        <div class="ds-detail-head">
            <div>
                <h3>${esc(ds.name)}</h3>
                <div class="ds-muted">${esc(ds.description || '설명 없음')}</div>
            </div>
            <div class="ds-detail-actions">
                <div class="ds-meta-line">
                    <span>${esc(_typeLabel(ds.data_type))}</span>
                    <span>${esc(_taskLabel(ds.task))}</span>
                    <span>target ${esc(ds.target_column || '-')}</span>
                </div>
                <button class="pm-btn pm-btn-sm pm-btn-danger ds-delete" type="button">삭제</button>
            </div>
        </div>

        <div class="ds-section">
            <div class="ds-section-title">버전 등록</div>
            <div class="ds-version-form">
                <label>종류
                    <select id="ds-source-kind" class="pm-input">
                        <option value="raw">원본 데이터</option>
                        <option value="labeling_export">라벨링 완료 데이터</option>
                        <option value="nifi_output">NiFi 출력</option>
                        <option value="external_uri">외부 URI</option>
                    </select>
                </label>
                <label>파일 업로드
                    <input id="ds-file" class="pm-input" type="file" accept=".csv,.json,.jsonl,.jpg,.jpeg,.png,.zip" />
                </label>
                <label>또는 source URI/path
                    <input id="ds-source-uri" class="pm-input pm-input-mono" placeholder="https://... 또는 /path/to/data.csv" />
                </label>
                <label class="ds-check"><input id="ds-pipeline-ready" type="checkbox" /> Pipeline ready</label>
                <button class="pm-btn pm-btn-primary" id="ds-add-version">버전 등록</button>
            </div>
            <div class="ds-help">CSV/JSON/JSONL과 image 데이터셋의 JPEG/PNG/ZIP을 저장소에 보관합니다. 대용량은 URI 등록을 권장합니다.</div>
        </div>

        <div class="ds-section">
            <div class="ds-section-title">버전 목록</div>
            ${versions.length ? `
                <table class="ds-table">
                    <thead><tr><th>Version</th><th>종류</th><th>파일/소스</th><th>Rows</th><th>Size</th><th>Target</th><th>요약</th><th>상태</th><th></th></tr></thead>
                    <tbody>${versions.map(_versionRow).join('')}</tbody>
                </table>` : '<div class="ds-empty compact">아직 버전이 없습니다.</div>'}
        </div>

        <div id="ds-work-panel"></div>
    `;
}

function _renderPreprocessForm(version) {
    const panel = document.getElementById('ds-work-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div class="ds-section ds-work">
            <div class="ds-section-title">${esc(version)} 전처리 결과 등록</div>
            <div class="ds-preprocess-grid">
                <label>병합할 source versions
                    <input id="ds-pre-source" class="pm-input" value="${esc(version)}" placeholder="예: 1,2" />
                </label>
                <label>샘플링 row 수
                    <input id="ds-pre-sample" class="pm-input" type="number" min="1" placeholder="비우면 전체" />
                </label>
                <label>출력 파일명
                    <input id="ds-pre-output" class="pm-input" value="preprocessed.csv" />
                </label>
                <label class="ds-check"><input id="ds-pre-clean" type="checkbox" checked /> 컬럼명 정리</label>
                <label class="ds-check"><input id="ds-pre-fill" type="checkbox" checked /> 결측값 기본 처리</label>
                <label class="ds-check"><input id="ds-pre-normalize" type="checkbox" /> 숫자 컬럼 min-max 정규화</label>
                <label class="ds-check"><input id="ds-pre-ready" type="checkbox" checked /> Pipeline ready</label>
                <button class="pm-btn pm-btn-primary" id="ds-run-preprocess" data-version="${esc(version)}">전처리 실행</button>
            </div>
        </div>`;
}

function _renderImageStandardizeForm(version) {
    const panel = document.getElementById('ds-work-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div class="ds-section ds-work">
            <div class="ds-section-title">${esc(version)} 이미지 표준화</div>
            <div class="ds-preprocess-grid">
                <label>출력 형식
                    <select id="ds-img-format" class="pm-input"><option value="jpeg">JPEG</option><option value="png">PNG</option></select>
                </label>
                <label>최대 width
                    <input id="ds-img-width" class="pm-input" type="number" min="1" placeholder="원본 유지" />
                </label>
                <label>최대 height
                    <input id="ds-img-height" class="pm-input" type="number" min="1" placeholder="원본 유지" />
                </label>
                <label>JPEG 품질
                    <input id="ds-img-quality" class="pm-input" type="number" min="1" max="100" value="95" />
                </label>
                <label>배경색
                    <input id="ds-img-bg" class="pm-input" value="#ffffff" />
                </label>
                <label>출력 ZIP
                    <input id="ds-img-output" class="pm-input" value="standardized-images.zip" />
                </label>
                <label class="ds-check"><input id="ds-img-aspect" type="checkbox" checked /> 비율 유지</label>
                <label class="ds-check"><input id="ds-img-ready" type="checkbox" checked /> Pipeline ready</label>
                <button class="pm-btn pm-btn-primary" id="ds-run-image-standard" data-version="${esc(version)}">표준화 실행</button>
            </div>
        </div>`;
}

function _renderLabelStudioForm(version) {
    const panel = document.getElementById('ds-work-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div class="ds-section ds-work">
            <div class="ds-section-title">${esc(version)} Label Studio export 등록</div>
            <div class="ds-label-grid">
                <label>Export JSON/JSONL
                    <input id="ds-ls-file" class="pm-input" type="file" accept=".json,.jsonl" />
                </label>
                <label>출력 CSV
                    <input id="ds-ls-output" class="pm-input" value="label-studio-export.csv" />
                </label>
                <label class="ds-check"><input id="ds-ls-ready" type="checkbox" checked /> Pipeline ready</label>
                <button class="pm-btn pm-btn-primary" id="ds-upload-ls" data-version="${esc(version)}">라벨링 결과 등록</button>
            </div>
        </div>`;
}

function _renderPipelinePanel(data) {
    _datasetsState.pipeline = data;
    const panel = document.getElementById('ds-work-panel');
    if (!panel) return;
    const params = data.params || {};
    panel.innerHTML = `
        <div class="ds-section ds-work">
            <div class="ds-section-title">Pipeline 입력 패키지</div>
            <div class="ds-pipeline-grid">
                ${Object.entries(params).map(([k, v]) => `
                    <div class="ds-param"><div>${esc(k)}</div><code>${esc(v)}</code></div>
                `).join('')}
            </div>
            <div class="ds-help">${esc(data.pipeline?.upload_method || '')}</div>
            <textarea id="ds-copy-text" class="pm-input pm-input-mono" rows="8" readonly>${esc(data.copy_text || '')}</textarea>
            <button class="pm-btn pm-btn-primary" id="ds-copy-pipeline">입력값 복사</button>
        </div>`;
}

async function _refreshDatasets() {
    const buttons = [...document.querySelectorAll('.ds-refresh')];
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
        btn.textContent = '새로고침 중';
    });
    try {
        await _loadDatasets(true);
    } finally {
        document.querySelectorAll('.ds-refresh').forEach(btn => {
            btn.disabled = false;
            btn.textContent = btn.dataset.originalText || '새로고침';
        });
    }
}

async function _loadDatasets(keepSelected = true) {
    const data = await API.get('/api/datasets');
    _datasetsState.datasets = data.datasets || [];
    if (!keepSelected || !_datasetsState.selectedId || !_datasetsState.datasets.some(d => d.id === _datasetsState.selectedId)) {
        _datasetsState.selectedId = _datasetsState.datasets[0]?.id || null;
    }
    _renderList();
    if (_datasetsState.selectedId) {
        _datasetsState.detail = await API.get(`/api/datasets/${encodeURIComponent(_datasetsState.selectedId)}`);
    } else {
        _datasetsState.detail = null;
    }
    _renderDetail();
}

async function _createDataset() {
    const payload = {
        name: document.getElementById('ds-name').value.trim(),
        description: document.getElementById('ds-desc').value.trim(),
        data_type: document.getElementById('ds-type').value,
        task: document.getElementById('ds-task').value,
        target_column: document.getElementById('ds-target').value.trim(),
    };
    if (!payload.name) throw new Error('데이터셋 이름을 입력하세요');
    const created = await API.post('/api/datasets', payload);
    _datasetsState.selectedId = created.id;
    await _loadDatasets(true);
}

async function _addVersion() {
    const ds = _datasetsState.detail;
    if (!ds) return;
    const kind = document.getElementById('ds-source-kind').value;
    const file = document.getElementById('ds-file').files[0];
    const sourceUri = document.getElementById('ds-source-uri').value.trim();
    const ready = document.getElementById('ds-pipeline-ready').checked;
    if (file) {
        const resp = await fetch(API._withNs(`/api/datasets/${encodeURIComponent(ds.id)}/versions`), {
            method: 'POST',
            headers: API._headers({
                'Content-Type': 'application/octet-stream',
                'x-dataset-filename': encodeURIComponent(file.name),
                'x-dataset-source-kind': kind,
                'x-pipeline-ready': ready ? 'true' : 'false',
            }),
            body: await file.arrayBuffer(),
        });
        await API._json(resp);
    } else if (sourceUri) {
        await API.post(`/api/datasets/${encodeURIComponent(ds.id)}/versions`, {
            source_uri: sourceUri,
            source_kind: kind === 'raw' ? 'external_uri' : kind,
            file_name: sourceUri.split('/').pop() || 'external-dataset',
            pipeline_ready: ready,
        });
    } else {
        throw new Error('파일 또는 source URI/path를 입력하세요');
    }
    await _loadDatasets(true);
}

async function _runPreprocess(version) {
    const ds = _datasetsState.detail;
    const sourceVersions = document.getElementById('ds-pre-source').value.split(',')
        .map(v => Number(v.trim())).filter(Boolean);
    const sampleRaw = document.getElementById('ds-pre-sample').value.trim();
    await API.post(`/api/datasets/${encodeURIComponent(ds.id)}/versions/${encodeURIComponent(version)}/preprocess`, {
        source_versions: sourceVersions.length ? sourceVersions : [Number(version)],
        clean_columns: document.getElementById('ds-pre-clean').checked,
        fill_missing: document.getElementById('ds-pre-fill').checked,
        normalize_numeric: document.getElementById('ds-pre-normalize').checked,
        sample_rows: sampleRaw ? Number(sampleRaw) : null,
        output_name: document.getElementById('ds-pre-output').value.trim() || 'preprocessed.csv',
        pipeline_ready: document.getElementById('ds-pre-ready').checked,
    });
    await _loadDatasets(true);
}

async function _runImageStandardize(version) {
    const ds = _datasetsState.detail;
    const width = document.getElementById('ds-img-width').value.trim();
    const height = document.getElementById('ds-img-height').value.trim();
    await API.post(`/api/datasets/${encodeURIComponent(ds.id)}/versions/${encodeURIComponent(version)}/standardize-images`, {
        target_format: document.getElementById('ds-img-format').value,
        max_width: width ? Number(width) : null,
        max_height: height ? Number(height) : null,
        keep_aspect_ratio: document.getElementById('ds-img-aspect').checked,
        background_color: document.getElementById('ds-img-bg').value.trim() || '#ffffff',
        quality: Number(document.getElementById('ds-img-quality').value || 95),
        output_name: document.getElementById('ds-img-output').value.trim() || 'standardized-images.zip',
        pipeline_ready: document.getElementById('ds-img-ready').checked,
    });
    await _loadDatasets(true);
}

async function _uploadLabelStudioExport(version) {
    const ds = _datasetsState.detail;
    const file = document.getElementById('ds-ls-file').files[0];
    if (!file) throw new Error('Label Studio export JSON/JSONL 파일을 선택하세요');
    const resp = await fetch(API._withNs(`/api/datasets/${encodeURIComponent(ds.id)}/versions/${encodeURIComponent(version)}/label-studio-export`), {
        method: 'POST',
        headers: API._headers({
            'Content-Type': 'application/octet-stream',
            'x-dataset-filename': encodeURIComponent(file.name),
            'x-output-name': encodeURIComponent(document.getElementById('ds-ls-output').value.trim() || 'label-studio-export.csv'),
            'x-pipeline-ready': document.getElementById('ds-ls-ready').checked ? 'true' : 'false',
        }),
        body: await file.arrayBuffer(),
    });
    await API._json(resp);
    await _loadDatasets(true);
}

async function _publishVersion(version) {
    const ds = _datasetsState.detail;
    await API.post(`/api/datasets/${encodeURIComponent(ds.id)}/versions/${encodeURIComponent(version)}/publish`, {});
    await _loadDatasets(true);
}

async function _deleteDataset() {
    const ds = _datasetsState.detail;
    if (!ds) return;
    const typed = prompt(`데이터셋 ${ds.name} 을 삭제하려면 이름을 입력하세요.`);
    if (typed === null) return;
    if (typed !== ds.name) {
        alert('이름이 일치하지 않아 삭제하지 않았습니다.');
        return;
    }
    await API.del(`/api/datasets/${encodeURIComponent(ds.id)}`);
    _datasetsState.selectedId = null;
    _datasetsState.detail = null;
    await _loadDatasets(false);
}

async function _buildPipelineInputs(version) {
    const ds = _datasetsState.detail;
    const data = await API.post(`/api/datasets/${encodeURIComponent(ds.id)}/versions/${encodeURIComponent(version)}/pipeline-inputs`, {
        registered_name: ds.safe_name || ds.name,
        target_column: ds.target_column || '',
        threshold: 0.9,
        max_attempts: 10,
    });
    _renderPipelinePanel(data);
}

async function renderDatasets() {
    return `
        <style>
        .ds-layout { display:grid; grid-template-columns:320px minmax(0,1fr); gap:16px; align-items:start; }
        .ds-panel { background:white; border:1px solid var(--border); border-radius:8px; padding:16px; box-shadow:var(--shadow); }
        .ds-create { display:grid; gap:10px; margin-bottom:14px; }
        .ds-create-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .ds-create label, .ds-version-form label, .ds-preprocess-grid label, .ds-label-grid label { font-size:11px; font-weight:700; color:var(--text-secondary); display:grid; gap:5px; }
        .ds-list { display:grid; gap:8px; }
        .ds-card { width:100%; text-align:left; border:1px solid var(--border); border-radius:8px; background:#fff; padding:11px; cursor:pointer; }
        .ds-card:hover, .ds-card.selected { border-color:var(--accent); background:var(--accent-bg); }
        .ds-card-title { display:block; font-size:13px; line-height:18px; }
        .ds-card-sub, .ds-muted, .ds-help { color:var(--text-muted); font-size:11px; margin-top:5px; line-height:1.45; }
        .ds-ready { display:inline-block; margin-top:8px; padding:3px 7px; border-radius:4px; font-size:10px; font-weight:800; color:#92400e; background:#fef3c7; }
        .ds-ready.ok, .ds-pill.ok { color:var(--success); background:var(--success-bg); }
        .ds-empty { padding:24px; text-align:center; color:var(--text-muted); border:1px dashed var(--border); border-radius:8px; background:#fafafa; }
        .ds-empty.compact { padding:14px; }
        .ds-detail-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:16px; }
        .ds-detail-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
        .ds-detail-head h3 { margin:0; font-size:18px; }
        .ds-meta-line { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
        .ds-card-meta { justify-content:flex-start; margin-top:8px; }
        .ds-meta-line span, .ds-pill { display:inline-flex; align-items:center; justify-content:center; height:22px; padding:0 8px; border-radius:4px; background:#f1f5f9; color:#334155; font-size:10px; font-weight:800; line-height:1; white-space:nowrap; }
        .ds-section { border-top:1px solid #edf2f7; padding-top:14px; margin-top:14px; }
        .ds-section-title { font-weight:800; color:var(--text-secondary); font-size:13px; margin-bottom:10px; }
        .ds-version-form { display:grid; grid-template-columns:150px minmax(240px,1.15fr) minmax(280px,1.4fr) 118px 100px; gap:8px; align-items:end; }
        .ds-version-form .pm-input, .ds-version-form .pm-btn { min-height:44px; }
        .ds-check { display:flex !important; align-items:center; gap:6px !important; min-height:44px; padding-bottom:0; white-space:nowrap; }
        .ds-table { width:100%; border-collapse:collapse; font-size:12px; }
        .ds-table th, .ds-table td { border-bottom:1px solid #eef2f7; padding:8px; vertical-align:middle; }
        .ds-table th { color:var(--text-muted); font-size:10px; text-transform:uppercase; text-align:left; }
        .ds-row-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px; }
        .ds-table td:last-child { min-width:360px; }
        .ds-work { background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:14px; }
        .ds-preprocess-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; align-items:end; }
        .ds-label-grid { display:grid; grid-template-columns:1fr 1fr auto auto; gap:8px; align-items:end; }
        .ds-pipeline-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; margin-bottom:10px; }
        .ds-param { border:1px solid #e5e7eb; border-radius:6px; background:#fff; padding:8px; min-width:0; }
        .ds-param div { color:var(--text-muted); font-size:10px; font-weight:800; margin-bottom:4px; }
        .ds-param code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-mono); font-size:11px; }
        @media (max-width: 1180px) { .ds-version-form { grid-template-columns:150px minmax(220px,1fr) minmax(260px,1fr); } .ds-version-form .ds-check, .ds-version-form #ds-add-version { grid-column:auto; } }
        @media (max-width: 1100px) { .ds-layout { grid-template-columns:1fr; } .ds-version-form, .ds-preprocess-grid, .ds-label-grid, .ds-pipeline-grid { grid-template-columns:1fr; } .ds-table td:last-child { min-width:0; } .ds-row-actions { justify-content:flex-start; } .ds-meta-line, .ds-detail-actions { justify-content:flex-start; } }
        </style>
        <div class="pm-page-header" style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
                <h1 class="pm-page-title">데이터셋 카탈로그</h1>
                <p class="pm-page-desc">전처리 결과, 이미지 표준화 결과, Label Studio 라벨링 데이터를 Kubeflow Pipeline 입력으로 연결합니다.</p>
            </div>
            <button class="pm-btn pm-btn-ghost ds-refresh" id="ds-refresh" type="button">새로고침</button>
        </div>
        <div class="ds-layout">
            <div class="ds-panel">
                <div class="ds-section-title">데이터셋 생성</div>
                <div class="ds-create">
                    <input id="ds-name" class="pm-input" placeholder="데이터셋 이름" />
                    <input id="ds-target" class="pm-input" placeholder="target column" />
                    <div class="ds-create-grid">
                        <select id="ds-type" class="pm-input"><option value="csv">CSV</option><option value="json">JSON</option><option value="jsonl">JSONL</option><option value="parquet">Parquet</option><option value="image">Image</option></select>
                        <select id="ds-task" class="pm-input"><option value="unknown">미지정</option><option value="regression">회귀</option><option value="classification">분류</option><option value="labeling">라벨링</option></select>
                    </div>
                    <textarea id="ds-desc" class="pm-input" rows="2" placeholder="설명"></textarea>
                    <button class="pm-btn pm-btn-primary pm-btn-full" id="ds-create-btn">데이터셋 생성</button>
                </div>
                <div class="ds-section-title">목록</div>
                <div id="ds-list" class="ds-list"><div class="ds-empty">로딩 중...</div></div>
            </div>
            <div class="ds-panel" id="ds-detail"><div class="ds-empty">로딩 중...</div></div>
        </div>`;
}

function setupDatasetsPage() {
    document.getElementById('ds-refresh')?.addEventListener('click', () => _refreshDatasets().catch(e => alert(e.message)));
    document.getElementById('ds-create-btn')?.addEventListener('click', () => _createDataset().catch(e => alert(e.message)));
    document.getElementById('ds-list')?.addEventListener('click', async (e) => {
        const card = e.target.closest('.ds-card');
        if (!card) return;
        _datasetsState.selectedId = card.dataset.datasetId;
        await _loadDatasets(true).catch(err => alert(err.message));
    });
    document.getElementById('ds-detail')?.addEventListener('click', async (e) => {
        const del = e.target.closest('.ds-delete');
        if (del) return _deleteDataset().catch(err => alert(err.message));
        const add = e.target.closest('#ds-add-version');
        if (add) return _addVersion().catch(err => alert(err.message));
        const prep = e.target.closest('.ds-prep');
        if (prep) return _renderPreprocessForm(prep.dataset.version);
        const runPrep = e.target.closest('#ds-run-preprocess');
        if (runPrep) return _runPreprocess(runPrep.dataset.version).catch(err => alert(err.message));
        const img = e.target.closest('.ds-image-standard');
        if (img) return _renderImageStandardizeForm(img.dataset.version);
        const runImg = e.target.closest('#ds-run-image-standard');
        if (runImg) return _runImageStandardize(runImg.dataset.version).catch(err => alert(err.message));
        const ls = e.target.closest('.ds-labelstudio');
        if (ls) return _renderLabelStudioForm(ls.dataset.version);
        const uploadLs = e.target.closest('#ds-upload-ls');
        if (uploadLs) return _uploadLabelStudioExport(uploadLs.dataset.version).catch(err => alert(err.message));
        const publish = e.target.closest('.ds-publish');
        if (publish) return _publishVersion(publish.dataset.version).catch(err => alert(err.message));
        const pipe = e.target.closest('.ds-pipeline');
        if (pipe) return _buildPipelineInputs(pipe.dataset.version).catch(err => alert(err.message));
        const copy = e.target.closest('#ds-copy-pipeline');
        if (copy) {
            const text = document.getElementById('ds-copy-text')?.value || '';
            try { await navigator.clipboard.writeText(text); alert('Pipeline 입력값을 복사했습니다'); }
            catch { alert(text); }
        }
    });
    _loadDatasets(false).catch(e => {
        const list = document.getElementById('ds-list');
        if (list) list.innerHTML = `<div class="ds-empty">${esc(e.message)}</div>`;
    });
}

window.renderDatasets = renderDatasets;
window.setupDatasetsPage = setupDatasetsPage;
})();
