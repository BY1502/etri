let modelsSelected = null;

const STAGE_STYLE = {
    Production: { color: '#fff', bg: '#28a745', label: '운영' },
    Staging: { color: '#fff', bg: '#ffc107', label: '검증' },
    Archived: { color: '#fff', bg: '#6c757d', label: '보관' },
    None: { color: '#495057', bg: '#e9ecef', label: '미지정' },
};

function _stageBadge(s) {
    const st = STAGE_STYLE[s] || STAGE_STYLE.None;
    return `<span style="padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; color:${st.color}; background:${st.bg};">${st.label}</span>`;
}

function _fmtTs(ts) {
    if (!ts) return '-';
    return new Date(+ts).toLocaleString('ko-KR', { hour12: false });
}

async function renderModels() {
    let models = [];
    try { models = await API.get('/api/models'); } catch (e) { models = []; }

    const listItems = models.map(m => {
        const prod = m.stage_summary?.Production?.length || 0;
        const stg = m.stage_summary?.Staging?.length || 0;
        return `
        <div class="model-list-item ${modelsSelected === m.name ? 'selected' : ''}" data-name="${m.name}">
            <div style="font-weight:600; font-size:13px;">${m.name}</div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">소유: ${m.owner_namespace || '-'}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
                v${m.latest_version} (총 ${m.total_versions}) ·
                ${prod ? `<span style="color:#28a745; font-weight:600;">운영 ${prod}</span> · ` : ''}
                ${stg ? `<span style="color:#ffc107; font-weight:600;">검증 ${stg}</span>` : ''}
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
        .version-card { border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:10px; }
        .version-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .version-title { font-weight:600; font-size:14px; }
        .metric-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:6px; font-size:11px; margin-top:6px; }
        .metric-item { background:#f8f9fa; padding:4px 8px; border-radius:4px; }
        .metric-key { color:var(--text-muted); }
        .metric-val { font-family:var(--font-mono); font-weight:600; }
        .param-list { font-family:var(--font-mono); font-size:10px; color:var(--text-muted); word-break:break-all; }
        .stage-select { padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size:11px; }
        .version-actions { display:flex; gap:6px; flex-wrap:wrap; }
        </style>

        <div class="pm-page-header" style="display:flex; justify-content:space-between;">
            <div>
                <h1>모델 운영 관리</h1>
                <p>모델 버전 관리 · 상태 태깅(미지정/검증/운영/보관) · 롤백</p>
            </div>
        </div>

        <div class="models-layout">
            <div class="model-list" id="model-list">
                <div style="padding:10px 14px; border-bottom:1px solid #e9ecef; background:#f8f9fa; font-size:12px; font-weight:600; color:var(--text-secondary);">
                    등록된 모델 (${models.length})
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

    const versionCards = data.versions.map(v => {
        const metricsHtml = Object.entries(v.metrics).slice(0, 8).map(([k, val]) => `
            <div class="metric-item">
                <div class="metric-key">${esc(k)}</div>
                <div class="metric-val">${(+val).toFixed(4)}</div>
            </div>
        `).join('');
        const params = Object.entries(v.params).map(([k, val]) => `${k}=${val}`).join(', ');
        const nsGuess = data.owner_namespace || _guessNamespace(v.experiment_name);
        const ver = esc(v.version);
        return `
        <div class="version-card" data-version="${ver}">
            <div class="version-card-header">
                <div>
                    <span class="version-title">v${ver}</span>
                    ${_stageBadge(v.current_stage)}
                    <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${_fmtTs(v.last_updated_timestamp)}</span>
                </div>
                <div class="version-actions" style="display:flex; gap:6px; align-items:center;">
                    <label style="font-size:10px; color:var(--text-muted);">단계</label>
                    <select class="stage-select" data-version="${ver}" style="padding:4px 8px; font-size:11px; border-radius:4px; border:1px solid var(--border);">
                        ${[['None','미지정'],['Staging','검증'],['Production','운영'],['Archived','보관']].map(([val,lbl]) => `<option value="${val}" ${val === v.current_stage ? 'selected' : ''}>${lbl}</option>`).join('')}
                    </select>
                    <button class="pm-btn pm-btn-sm pm-btn-primary deploy-prod-btn" data-version="${ver}" data-ns="${esc(nsGuess)}" title="이 버전을 운영 단계로 승격 + KServe에 자동 배포">운영 배포</button>
                    <button class="pm-btn pm-btn-sm onnx-btn" data-version="${ver}" title="이 모델을 ONNX로 변환 (추론 속도 향상)">ONNX 변환</button>
                    <button class="pm-btn pm-btn-sm download-btn" data-version="${ver}" title="모델 artifact를 zip으로 다운로드">다운로드</button>
                </div>
            </div>
            <div style="font-size:11px; color:var(--text-muted);">실행: <span style="font-family:var(--font-mono);">${esc(v.run_id || '-')}</span> · 실험: ${esc(v.experiment_name || '-')}</div>
            ${_renderMetaChips(v.tags || {})}
            ${metricsHtml ? `<div class="metric-grid">${metricsHtml}</div>` : ''}
            ${params ? `<div class="param-list" style="margin-top:8px;" title="${esc(params)}">${esc(_truncate(params, 120))}</div>` : ''}
        </div>`;
    }).join('');

    // Production ISVC 상태 조회 - 백엔드의 owner_namespace 우선
    const firstVer = data.versions[0];
    const nsGuess = data.owner_namespace || (firstVer ? _guessNamespace(firstVer.experiment_name) : '');
    let prodStatusHtml = '';
    if (nsGuess) {
        try {
            const ps = await API.get(`/api/models/${encodeURIComponent(name)}/production-status?namespace=${encodeURIComponent(nsGuess)}`);
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
                        <button class="pm-btn pm-btn-sm pm-btn-danger" id="undeploy-btn" data-ns="${esc(nsGuess)}" title="KServe InferenceService 즉시 제거 (모든 버전을 자동으로 보관 처리)">운영 중단</button>
                    </div>
                `;
            } else {
                prodStatusHtml = `<div style="background:#f8f9fa; border:1px solid var(--border); padding:8px 12px; border-radius:6px; font-size:12px; color:var(--text-muted); margin-bottom:12px;">아직 운영 배포된 버전이 없습니다</div>`;
            }
        } catch (e) {}
    }

    panel.innerHTML = `
        <div class="model-detail">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:18px; font-weight:700;">${esc(name)}</div>
                    <div style="font-size:12px; color:var(--text-muted);">${data.versions.length}개 버전 · 소유 네임스페이스: ${esc(nsGuess || '-')}</div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="pm-btn pm-btn-sm" id="accuracy-btn" title="시간별 정확도 추이 보기">정확도</button>
                    <button class="pm-btn pm-btn-sm" id="feedback-btn" title="실제 값과 예측 값을 업로드">피드백</button>
                    <button class="pm-btn pm-btn-sm" id="rollback-btn" title="이전 운영 버전(보관)으로 복원">롤백</button>
                    <button class="pm-btn pm-btn-sm pm-btn-danger" id="delete-model-btn" title="모델 전체 삭제 (자기 namespace 소유만)">삭제</button>
                </div>
            </div>
            ${prodStatusHtml}
            <div>${versionCards || '<div style="text-align:center; padding:40px; color:var(--text-muted);">버전이 없습니다</div>'}</div>
        </div>
    `;

    panel.querySelectorAll('.stage-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            const version = sel.dataset.version;
            const newStage = sel.value;
            if (newStage === 'Production' && !confirm(`v${version}을(를) 운영 단계로 승격하시겠습니까?\n기존 운영 버전은 자동으로 보관 처리됩니다.`)) {
                await loadModelDetail(name);
                return;
            }
            try {
                await API.put(`/api/models/${encodeURIComponent(name)}/versions/${version}/stage`, { stage: newStage, archive_existing: true });
                await loadModelDetail(name);
            } catch (e) {
                alert('변경 실패: ' + e.message);
                await loadModelDetail(name);
            }
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

    panel.querySelectorAll('.deploy-prod-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const version = btn.dataset.version;
            const ns = btn.dataset.ns || prompt('배포할 namespace를 입력하세요 (예: kubeflow-user-example-com):');
            if (!ns) return;
            const opts = await _openDeployOptionsModal(name, version, ns);
            if (!opts) return;
            btn.disabled = true; btn.textContent = '배포 중...';
            try {
                const r = await API.post(`/api/models/${encodeURIComponent(name)}/deploy-production`, {
                    version, target_namespace: ns, scale_to_zero: opts.scale_to_zero,
                });
                const stzNote = opts.scale_to_zero ? '\n⚡ 유휴 시 자동 종료 활성 (첫 요청 시 3~5초 cold start)' : '';
                alert(`✅ 배포 완료\nURL: ${r.isvc_url}${stzNote}\n\n예측: POST ${r.isvc_url}/v2/models/${r.isvc_name}/infer`);
                await loadModelDetail(name);
            } catch (e) {
                alert('배포 실패: ' + e.message);
                btn.disabled = false; btn.textContent = '운영 배포';
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
        if (!confirm('현재 운영 버전을 보관 처리하고, 가장 최근의 이전 운영 버전(보관)으로 복원합니다. 계속할까요?')) return;
        try {
            const r = await API.post(`/api/models/${encodeURIComponent(name)}/rollback`, {});
            alert(`✅ 롤백 완료. 새 운영 버전: v${r.new_production}`);
            await loadModelDetail(name);
        } catch (e) {
            alert('롤백 실패: ' + e.message);
        }
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
    modal.innerHTML = `
        <div class="automl-modal" style="min-width:520px;">
            <h3>피드백</h3>
            <p style="font-size:12px; color:var(--text-muted);">운영 중인 모델의 실제 결과 값을 업로드합니다. 시간별 정확도에 반영됩니다.</p>
            <label style="font-size:12px; color:var(--text-secondary); margin:10px 0 4px 0; display:block;">작업 유형</label>
            <select id="fb-task" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
                <option value="regression">회귀</option>
                <option value="classification">분류</option>
            </select>
            <label style="font-size:12px; color:var(--text-secondary); margin:10px 0 4px 0; display:block;">
                데이터 (한 줄에 "실제값,예측값" 형식)
            </label>
            <textarea id="fb-data" rows="8" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:6px; font-family:var(--font-mono); font-size:12px; background:#ffffff; color:#1f2937; box-sizing:border-box;" placeholder="4.5,4.23
3.9,3.87
2.1,2.34"></textarea>
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
    modal.querySelector('#fb-submit').onclick = async () => {
        const task = modal.querySelector('#fb-task').value;
        const raw = modal.querySelector('#fb-data').value.trim();
        const version = modal.querySelector('#fb-version').value.trim();
        const errEl = modal.querySelector('#fb-err');
        errEl.textContent = '';
        if (!raw) { errEl.textContent = '데이터를 입력하세요'; return; }
        const entries = [];
        for (const line of raw.split('\n')) {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length < 2) continue;
            const yt = parseFloat(parts[0]);
            const yp = parseFloat(parts[1]);
            if (isNaN(yt) || isNaN(yp)) continue;
            entries.push({ task, y_true: yt, y_pred: yp, model_version: version || null });
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
    // automl-{ns}-{name}
    if (experimentName.startsWith('automl-')) {
        const rest = experimentName.slice(7);
        const idx = rest.lastIndexOf('-');
        return idx > 0 ? rest.slice(0, idx) : rest;
    }
    return '';
}
