let _monitoringData = null;

async function renderMonitoring() {
    let data;
    try {
        data = await API.get('/api/monitoring/summary');
        _monitoringData = data;
    } catch (e) {
        return `
        <div class="pm-page-header">
            <h1>MLOps 모니터링</h1>
        </div>
        <div style="background:#fee2e2; border:1px solid #fca5a5; padding:16px 20px; border-radius:8px; color:#b91c1c; font-size:13px;">
            지표를 불러올 수 없습니다. Prometheus 연결을 확인해주세요.
        </div>`;
    }

    const gpu = data.gpu || {};
    const sys = data.system || {};
    const allNull = [gpu.util_pct, gpu.mem_used_gb, sys.cpu_cores, sys.mem_used_gb].every(v => v === null || v === undefined);

    const prometheusWarning = allNull ? `
    <div style="background:#fff3cd; border:1px solid #fde68a; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:16px; color:#92400e;">
        지표를 불러올 수 없습니다. Prometheus 연결을 확인해주세요.
    </div>` : '';

    const donutChart = (id, label, valueStr, subStr, pct, accent) => `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
            <canvas id="${id}" width="160" height="80" data-pct="${pct ?? 0}" data-accent="${accent}"></canvas>
            <div style="display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                <span style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(valueStr ?? '-')}</span>
                ${subStr ? `<span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${esc(subStr)}</span>` : ''}
            </div>
            <div style="font-size:13px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase;">${esc(label)}</div>
        </div>`;

    //── API 데이터 ── 테스트 시 아래 MOCK 섹션과 교체 ──────────────────
    const gpuUtil    = gpu.util_pct    ?? null;
    const gpuMemUsed = gpu.mem_used_gb ?? null;
    const gpuMemTotal = gpu.mem_total_gb ?? null;
    const gpuMemPct  = gpu.mem_pct     ?? null;
    const gpuTemp    = gpu.temp_c      ?? null;
    const gpuPower   = gpu.power_w     ?? null;
    const cpuCores   = sys.cpu_cores       ?? null;
    const cpuTotal   = sys.cpu_total_cores ?? null;
    const cpuPct     = sys.cpu_pct         ?? null;
    const memUsedGb  = sys.mem_used_gb     ?? null;
    const memTotalGb = sys.mem_total_gb    ?? null;
    const memPct     = sys.mem_pct         ?? null;

    const isAdminView     = data.is_admin_view     ?? true;
    const currentNs       = data.namespace         ?? '';
    const currentEmail    = data.user_email        ?? '';

    const ray             = data.ray              || {};
    const rayStatus       = ray.status            ?? 'error';
    const automl          = data.automl           || {};
    const automlError     = automl.error          ?? true;
    const automlJobs      = automl.jobs           || [];
    const kserve          = data.kserve           || {};
    const kserveError     = kserve.error          ?? true;
    const kserveEndpoints = kserve.endpoints      || [];
    const mlflowStats         = data.mlflow                          || { status: 'error', experiments: null, models: null, runs: null };
    const mlflowModelsStatus  = data.mlflow_models?.status           ?? 'error';
    const mlflowModels        = data.mlflow_models?.models           ?? [];
    const notebookStatus      = data.notebook_resources?.status      ?? 'error';
    const notebookRows        = data.notebook_resources?.rows        ?? [];
    const runningNbStatus     = data.running_notebooks?.status       ?? 'error';
    const runningNbs          = data.running_notebooks?.notebooks    ?? [];
    const pvcStatus           = data.pvc?.status                     ?? 'error';
    const pvcGroups           = data.pvc?.groups                     ?? [];
    const mlflowExpRunsStatus = data.mlflow_experiment_runs?.status  ?? 'error';
    const mlflowExpRuns       = data.mlflow_experiment_runs?.experiments ?? [];

    // ════════════════════════════════════════════════════════════════
    // MOCK 테스트 섹션 — 현재 모두 주석 처리 → 실제 API 데이터 사용 중
    // 활성화 시: 위 동일 변수 선언 라인을 주석 처리하고 아래 해제
    // ════════════════════════════════════════════════════════════════
    // data.kserve              = { error: false, endpoints: MOCK.kserve };  // KServe 엔드포인트 주입 (setupMonitoringPage 차트에도 반영)
    // data.kserve_rps          = MOCK.kserveRps;
    // data.kserve_latency_p95  = MOCK.kserveLatency;
    // data.kserve_error_rate   = MOCK.kserveErrorRate;
    // data.kserve_top5_latency = MOCK.kserveTop5Latency;
    // const gpuUtil    = 75;     const gpuMemUsed  = 18.4; const gpuMemTotal = 24;
    // const gpuMemPct  = 76.7;   const gpuTemp     = 68;   const gpuPower    = 180;
    // const cpuCores   = 8;      const cpuTotal    = 16;   const cpuPct      = 42;
    // const memUsedGb  = 28.5;   const memTotalGb  = 64;   const memPct      = 44.5;
    // const ray             = MOCK.ray;          const rayStatus       = 'ok';
    // const automlError     = false;             const automlJobs      = MOCK.automl;
    // const mlflowStats         = MOCK.mlflowStats;
    // const mlflowModelsStatus  = 'ok';          const mlflowModels        = MOCK.mlflowModels        ?? [];
    // const notebookStatus      = 'ok';          const notebookRows        = MOCK.jupyterResources    ?? [];
    // const runningNbStatus     = 'ok';          const runningNbs          = MOCK.jupyterNotebooks    ?? [];
    // const pvcStatus           = 'ok';          const pvcGroups           = MOCK.pvcByUser           ?? [];
    // const mlflowExpRunsStatus = 'ok';          const mlflowExpRuns       = MOCK.mlflowExperiments   ?? [];

    const timeAgo = (dateStr) => {
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return `${diff}초 전`;
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        return `${Math.floor(diff / 86400)}일 전`;
    };

    const statusBadge = (status) => {
        const colors = {
            SUCCEEDED: { bg: '#d4edda', color: '#155724' },
            RUNNING:   { bg: '#e8f4ff', color: '#1a56a8' },
            FAILED:    { bg: '#f8d7da', color: '#721c24' },
            STOPPED:   { bg: '#fff3cd', color: '#856404' },
            QUEUED:    { bg: '#f5e6ff', color: '#6f42c1' },
            PENDING:   { bg: '#e9ecef', color: '#495057' },
        };
        const c = colors[status] || { bg: '#e9ecef', color: '#495057' };
        return `<span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${c.bg}; color:${c.color};">${esc(status)}</span>`;
    };

    const noConnTd  = (cols) => `<tr><td colspan="${cols}" style="text-align:center; padding:32px 0; font-size:20px; font-weight:700; color:#ef4444; letter-spacing:0.5px;">No connection</td></tr>`;
    const noDataTd  = (cols) => `<tr><td colspan="${cols}" style="text-align:center; padding:32px 0; font-size:20px; font-weight:700; color:#d1d5db; letter-spacing:0.5px;">No data</td></tr>`;
    const noConnDiv = `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; color:#ef4444; letter-spacing:0.5px; white-space:nowrap;">No connection</div>`;
    const noDataDiv = `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; color:#d1d5db; letter-spacing:0.5px; white-space:nowrap;">No data</div>`;

    const automlDisplayJobs = isAdminView ? automlJobs : automlJobs.filter(j => j.submitted_by === currentEmail);
    const automlRows = automlDisplayJobs.map(j => `
        <tr>
            <td>
                <div style="font-size:14px; font-weight:500;">${esc(j.name)}</div>
                ${isAdminView ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(j.submitted_by)}</div>` : ''}
            </td>
            <td>${statusBadge(j.status)}</td>
            <td>
                <div style="font-size:13px; font-weight:500;">${timeAgo(j.submitted_at)}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); margin-top:2px;">${esc(j.submitted_at)}</div>
            </td>
        </tr>`).join('');

    const kserveDisplayEndpoints = isAdminView ? kserveEndpoints : kserveEndpoints.filter(e => e.namespace === currentNs);
    const kserveRows = kserveDisplayEndpoints.map(e => `
        <tr>
            <td style="font-size:14px; font-weight:500;">${esc(e.name)}</td>
            ${isAdminView ? `<td style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${esc(e.namespace)}</td>` : ''}
            <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${e.ready ? '#d4edda' : '#f8d7da'}; color:${e.ready ? '#155724' : '#721c24'};">${e.ready ? 'Ready' : 'Not Ready'}</span></td>
        </tr>`).join('');

    return `
    <div class="pm-page-header">
        <h1>MLOps 모니터링</h1>
        <p>GPU/CPU, Ray, AutoML, KServe 상태를 모니터링 합니다.</p>
    </div>

    ${prometheusWarning}

    <div class="pm-monitor-2col">
        <div class="pm-monitor-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:20px;">GPU</div>
            <div class="pm-donut-row" style="margin-bottom:20px;">
                ${donutChart('chart-gpu-util', 'GPU 사용률', gpuUtil !== null ? gpuUtil + '%' : null, ' ', gpuUtil, '#f59e0b')}
                ${donutChart('chart-gpu-mem', 'GPU 메모리', gpuMemUsed !== null ? gpuMemUsed.toFixed(1) + ' GB' : null, gpuMemTotal !== null ? gpuMemTotal + ' GB' : '', gpuMemPct, '#ef4444')}
            </div>
            <div style="border-top:1px solid #e5e7eb; padding-top:16px;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:20px;">시스템</div>
                <div class="pm-donut-row">
                    ${donutChart('chart-cpu', 'CPU', cpuCores !== null ? cpuCores.toFixed(2) + ' core' : null, cpuTotal !== null ? cpuTotal + ' core' : '', cpuPct, '#3b82f6')}
                    ${donutChart('chart-mem', '메모리', memUsedGb !== null ? memUsedGb.toFixed(1) + ' GB' : null, memTotalGb !== null ? memTotalGb + ' GB' : '', memPct, '#8b5cf6')}
                </div>
            </div>
        </div>
        <div class="pm-monitor-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">GPU 사용 추이</div>
            <canvas id="chart-gpu-trend" height="120"></canvas>
            <div style="border-top:1px solid #e5e7eb; margin-top:16px; padding-top:16px; display:grid; grid-template-columns:7fr 3fr; gap:10px;">
                ${(() => {
                    const pct = gpuTemp !== null ? Math.min(100, Math.round(gpuTemp)) : 0;
                    const fillColor = pct >= 85 ? '#dc3545' : pct >= 75 ? '#f59e0b' : '#22c55e';
                    const label = gpuTemp === null ? '-' : pct >= 85 ? '위험' : pct >= 75 ? '주의' : '정상';
                    const labelColor = pct >= 85 ? '#dc3545' : pct >= 75 ? '#f59e0b' : '#155724';
                    return `
                    <div style="background:#f3f4f6; border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; align-items:center; gap:8px;">
                        <div style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">온도</div>
                        <div style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:${labelColor}; margin-bottom:6px;">${gpuTemp !== null ? gpuTemp + '°C' : '-'} <span style="font-size:12px;">${label}</span></div>
                        <div style="position:relative; width:100%; height:14px; background:#e5e7eb; border-radius:7px; overflow:hidden;">
                            <div style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:${fillColor}; border-radius:7px; transition:width 0.4s;"></div>
                            <div style="position:absolute; left:75%; top:0; bottom:0; width:1px; background:rgba(0,0,0,0.2);"></div>
                            <div style="position:absolute; left:85%; top:0; bottom:0; width:1px; background:rgba(0,0,0,0.2);"></div>
                        </div>
                        <div style="font-size:10px; color:var(--text-muted);">기준 75° / 85°</div>
                    </div>`;
                })()}
                <div style="background:#f3f4f6; border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; align-items:center;">
                    <div style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">전력</div>
                    <div style="flex:1; display:flex; align-items:center; justify-content:center;">
                        <div style="font-size:26px; font-weight:700; font-family:var(--font-mono); color:#111827;">${gpuPower !== null ? gpuPower + ' W' : '-'}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="pm-monitor-card pm-fixed-card" style="margin-bottom:16px;">
        <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">${isAdminView ? '사용자별 노트북 자원 사용량' : '노트북 자원 사용량'} (CPU cores / Memory GB)</div>
        <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
        <table class="pm-table">
            <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                <tr>
                    <th>Time</th>
                    ${isAdminView ? '<th>Namespace</th>' : ''}
                    <th>Pod</th>
                    <th style="text-align:right;">Value #A (CPU cores)</th>
                    <th style="text-align:right;">Value #B (Memory GB)</th>
                </tr>
            </thead>
            <tbody>
                ${notebookStatus === 'error'
                    ? noConnTd(isAdminView ? 5 : 4)
                    : notebookStatus === 'empty' || notebookRows.length === 0
                        ? noDataTd(isAdminView ? 5 : 4)
                        : notebookRows.map(r => `
                <tr>
                    <td style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);">${esc(r.time)}</td>
                    ${isAdminView ? `<td style="font-size:13px;">${esc(r.ns)}</td>` : ''}
                    <td style="font-size:12px; font-family:var(--font-mono);">${esc(r.pod)}</td>
                    <td style="font-size:13px; font-family:var(--font-mono); text-align:right;">${esc(String(r.cpu))}</td>
                    <td style="font-size:13px; font-family:var(--font-mono); text-align:right;">${esc(String(r.mem))}</td>
                </tr>`).join('')
                }
            </tbody>
        </table>
        </div>
    </div>

    <div class="pm-monitor-2col" style="margin-bottom:16px;">
    <div class="pm-monitor-card pm-fixed-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div id="pvc-table-title" class="pm-section-title" style="font-size:16px; margin-bottom:0;">${isAdminView ? '사용자별 PVC 현황' : 'PVC 현황'}</div>
            ${isAdminView ? `
            <div style="display:flex; gap:4px;">
                <button id="pvc-left-tab-all"  style="padding:4px 10px; border-radius:6px; border:1px solid #3b82f6; background:#3b82f6; color:#fff; font-size:11px; font-weight:600; cursor:pointer;">전체</button>
                <button id="pvc-left-tab-mine" style="padding:4px 10px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; color:#6b7280; font-size:11px; font-weight:600; cursor:pointer;">내 PVC</button>
            </div>` : ''}
        </div>
        <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px; position:relative;">
        ${(() => {
            if (pvcStatus === 'error') return noConnDiv;
            if (pvcStatus === 'empty' || pvcGroups.length === 0) return noDataDiv;

            const phaseColors = { Bound: '#3b82f6', Pending: '#f59e0b', Lost: '#ef4444' };
            const phaseIcons  = { Bound: '●', Pending: '⚠', Lost: '✕' };

            const adminRows = pvcGroups.map(g => {
                const pc = g.phase_counts || {};
                const badges = [
                    pc.Bound   > 0 ? `<span style="color:#3b82f6; font-weight:600; margin-right:6px;">● ${pc.Bound}</span>`   : '',
                    pc.Pending > 0 ? `<span style="color:#f59e0b; font-weight:600; margin-right:6px;">⚠ ${pc.Pending}</span>` : '',
                    pc.Lost    > 0 ? `<span style="color:#ef4444; font-weight:600;">✕ ${pc.Lost}</span>`                      : '',
                ].filter(Boolean).join('');
                return `<tr>
                    <td style="font-size:13px;">${esc(g.ns)}</td>
                    <td style="text-align:right; font-family:var(--font-mono); font-weight:600;">${g.pvcs.length}</td>
                    <td style="text-align:right; font-family:var(--font-mono);">${g.total_gb?.toFixed(1) ?? '-'} GB</td>
                    <td>${badges || '<span style="color:#d1d5db;">-</span>'}</td>
                </tr>`;
            }).join('');

            const myGroup   = pvcGroups.find(g => g.ns === currentNs);
            const myPvcs    = myGroup?.pvcs ?? [];
            const mineRows  = myPvcs.map(p => {
                const color = phaseColors[p.phase] || '#9ca3af';
                const icon  = phaseIcons[p.phase]  || '?';
                return `<tr>
                    <td style="font-size:12px; font-family:var(--font-mono);" title="${esc(p.name)}">${esc(p.name)}</td>
                    <td style="text-align:right; font-family:var(--font-mono);">${p.allocated_gb.toFixed(1)} GB</td>
                    <td><span style="color:${color}; font-weight:600;">${icon} ${esc(p.phase)}</span></td>
                </tr>`;
            }).join('');

            if (isAdminView) {
                return `
                <div id="pvc-view-all">
                    <table class="pm-table">
                        <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                            <tr><th>Namespace</th><th style="text-align:right;">PVC 수</th><th style="text-align:right;">총 용량</th><th>상태</th></tr>
                        </thead>
                        <tbody>${adminRows}</tbody>
                    </table>
                </div>
                <div id="pvc-view-mine" style="display:none;">
                    <table class="pm-table">
                        <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                            <tr><th>PVC 이름</th><th style="text-align:right;">용량</th><th>상태</th></tr>
                        </thead>
                        <tbody>${mineRows || noDataTd(3)}</tbody>
                    </table>
                </div>`;
            } else {
                const pvcs = pvcGroups.flatMap(g => g.pvcs);
                if (pvcs.length === 0) return noDataDiv;
                const userRows = pvcs.map(p => {
                    const color = phaseColors[p.phase] || '#9ca3af';
                    const icon  = phaseIcons[p.phase]  || '?';
                    return `<tr>
                        <td style="font-size:12px; font-family:var(--font-mono);" title="${esc(p.name)}">${esc(p.name)}</td>
                        <td style="text-align:right; font-family:var(--font-mono);">${p.allocated_gb.toFixed(1)} GB</td>
                        <td><span style="color:${color}; font-weight:600;">${icon} ${esc(p.phase)}</span></td>
                    </tr>`;
                }).join('');
                return `<table class="pm-table">
                    <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                        <tr><th>PVC 이름</th><th style="text-align:right;">용량</th><th>상태</th></tr>
                    </thead>
                    <tbody>${userRows}</tbody>
                </table>`;
            }
        })()}
        </div>
    </div>
    <div class="pm-monitor-card pm-fixed-card">
        <div style="margin-bottom:16px;">
            <div class="pm-section-title" id="pvc-chart-title" style="font-size:16px; margin-bottom:0;">${isAdminView ? '용량 점유율' : 'PVC 상태'}</div>
        </div>
        <div style="flex:1; display:flex; align-items:center; justify-content:flex-start; position:relative; padding-left:50px;">
            ${pvcStatus === 'ok' && pvcGroups.length > 0
                ? `<div style="display:flex; align-items:center; gap:50px;">
                       <canvas id="chart-pvc-donut" width="220" height="220"></canvas>
                       <div id="chart-pvc-legend" style="font-size:12px; color:#6b7280; line-height:2;"></div>
                   </div>`
                : noDataDiv
            }
        </div>
    </div>
    </div>

    <div class="pm-monitor-2col-bottom">
        <div class="pm-monitor-col">
        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">Ray 클러스터 (활성 노드 / 완료 Job)</div>
            ${rayStatus === 'error'
                ? noConnDiv
                : rayStatus === 'empty'
                    ? noDataDiv
                    : `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; flex:1;">
                        ${[
                            { label: '활성 노드', value: ray.nodes ?? '-', color: '#1a56a8', bg: '#e8f4ff' },
                            { label: '완료 Job', value: ray.finished_total ?? '-', color: '#155724', bg: '#d4edda' },
                        ].map(s => `
                            <div style="background:${s.bg}; border-radius:8px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                                <div style="font-size:48px; font-weight:700; color:${s.color}; font-family:var(--font-mono); line-height:1;">${s.value}</div>
                                <div style="font-size:13px; font-weight:600; color:${s.color};">${s.label}</div>
                            </div>`).join('')}
                    </div>`
            }
        </div>
        </div>
        <div class="pm-monitor-col">
        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">AutoML 최근 Job</div>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:16px; flex-shrink:0;">
                ${[
                    { label: '전체',  value: automlError ? '-' : automlDisplayJobs.length, color: '#6b7280', bg: '#f3f4f6' },
                    { label: '실행중', value: automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'RUNNING').length, color: '#1a56a8', bg: '#e8f4ff' },
                    { label: '성공',  value: automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'SUCCEEDED').length, color: '#155724', bg: '#d4edda' },
                    { label: '실패',  value: automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'FAILED').length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>${isAdminView ? '이름 / 제출자' : '이름'}</th><th>상태</th><th>제출 시간 / 경과</th></tr></thead>
                <tbody>${
                    automlError
                        ? noConnTd(3)
                        : automlDisplayJobs.length === 0
                            ? noDataTd(3)
                            : automlRows
                }</tbody>
            </table>
            </div>
        </div>
        </div>
    </div>

    <div class="pm-monitor-2col" style="margin-bottom:16px;">
        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">실행 중인 노트북</div>
            <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
            <table class="pm-table" style="table-layout:fixed; width:100%;">
                <colgroup>
                    ${isAdminView ? '<col style="width:30%">' : ''}
                    <col style="width:${isAdminView ? '20%' : '35%'}">
                    <col style="width:15%">
                    <col style="width:${isAdminView ? '35%' : '50%'}">
                </colgroup>
                <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                    <tr>${isAdminView ? '<th>사용자</th>' : ''}<th>owner_name</th><th>상태</th><th>Pod 이름</th></tr>
                </thead>
                <tbody>
                    ${runningNbStatus === 'error'
                        ? noConnTd(isAdminView ? 4 : 3)
                        : runningNbStatus === 'empty' || runningNbs.length === 0
                            ? noDataTd(isAdminView ? 4 : 3)
                            : runningNbs.map(n => `
                        <tr>
                            ${isAdminView ? `<td style="font-size:12px; font-family:var(--font-mono);"><span data-tip="${esc(n.namespace)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.namespace)}</span></td>` : ''}
                            <td style="font-size:13px; font-weight:500;"><span data-tip="${esc(n.owner_name)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.owner_name)}</span></td>
                            <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:#d4edda; color:#155724;">Running</span></td>
                            <td style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);"><span data-tip="${esc(n.pod)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.pod)}</span></td>
                        </tr>`).join('')
                    }
                </tbody>
            </table>
            </div>
        </div>

        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">KServe Endpoint</div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:16px; flex-shrink:0;">
                ${[
                    { label: '전체',     value: kserveError ? '-' : kserveDisplayEndpoints.length, color: '#6b7280', bg: '#f3f4f6' },
                    { label: 'Ready',   value: kserveError ? '-' : kserveDisplayEndpoints.filter(e => e.ready).length, color: '#155724', bg: '#d4edda' },
                    { label: 'Not Ready', value: kserveError ? '-' : kserveDisplayEndpoints.filter(e => !e.ready).length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>이름</th>${isAdminView ? '<th>Namespace</th>' : ''}<th>상태</th></tr></thead>
                <tbody>${
                    kserveError
                        ? noConnTd(isAdminView ? 3 : 2)
                        : kserveDisplayEndpoints.length === 0
                            ? noDataTd(isAdminView ? 3 : 2)
                            : kserveRows
                }</tbody>
            </table>
            </div>
        </div>
    </div>

    <div class="pm-zigzag-section">
        <div class="pm-zigzag-col">
            <div style="display:flex; gap:10px; order:1;">
                ${[
                    { label: 'MLflow Experiments', value: mlflowStats.experiments ?? '-', color: '#16a34a' },
                    { label: 'Registered Models',  value: mlflowStats.models ?? '-',      color: '#2563eb' },
                    { label: 'Total Runs',         value: mlflowStats.runs ?? '-',         color: '#9333ea' },
                ].map(s => `
                <div class="pm-half-card" style="flex:1;">
                    <div style="font-size:14px; font-weight:600; color:#374151;">${s.label}</div>
                    <div style="font-size:48px; font-weight:700; font-family:var(--font-mono); color:${s.color}; text-align:center; line-height:1;">${s.value}</div>
                    <div></div>
                </div>`).join('')}
            </div>
            <div class="pm-monitor-card pm-fixed-card" style="order:3;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">MLflow 실험별 Run 수</div>
                <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
                ${mlflowExpRunsStatus === 'error'
                    ? noConnDiv
                    : mlflowExpRunsStatus === 'empty' || mlflowExpRuns.length === 0
                        ? noDataDiv
                        : `<table class="pm-table">
                    <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                        <tr><th>실험명</th><th style="text-align:right;">Run 수</th></tr>
                    </thead>
                    <tbody>
                        ${mlflowExpRuns.map(e => `
                        <tr>
                            <td>${esc(e.name)}</td>
                            <td style="text-align:right; font-family:var(--font-mono); font-weight:600;">${e.runs}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>`}
                </div>
            </div>
            <div class="pm-monitor-card pm-fixed-card" style="order:5;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">KServe 추론 지연시간 (초) - 모델별 p95</div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-kserve-latency"></canvas>
                </div>
            </div>
            <div class="pm-monitor-card pm-fixed-card" style="order:7;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">Top 5 Latency (p95, ms)</div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-top5-latency"></canvas>
                </div>
            </div>
        </div>
        <div class="pm-zigzag-col">
            <div class="pm-monitor-card pm-fixed-card" style="order:2;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">MLflow 모델별 버전 수</div>
                <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
                ${mlflowModelsStatus === 'error'
                    ? noConnDiv
                    : mlflowModelsStatus === 'empty' || mlflowModels.length === 0
                        ? noDataDiv
                        : `<table class="pm-table">
                    <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                        <tr><th>모델명</th><th style="text-align:center;">버전 수</th><th>최신 Stage</th></tr>
                    </thead>
                    <tbody>
                        ${mlflowModels.map(m => {
                            const stageStyle = m.stage === 'Production'
                                ? 'background:#e8f4ff; color:#1a56a8;'
                                : m.stage === 'Staging'
                                    ? 'background:#f5e6ff; color:#6f42c1;'
                                    : 'background:#e9ecef; color:#495057;';
                            return `<tr>
                                <td>${esc(m.name)}</td>
                                <td style="text-align:center; font-family:var(--font-mono); font-weight:600;">${m.versions}</td>
                                <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; ${stageStyle}">${esc(m.stage)}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`}
                </div>
            </div>
            <div class="pm-monitor-card pm-fixed-card" style="order:4;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">KServe 초당 요청 수 (RPS)</div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-kserve-rps"></canvas>
                </div>
            </div>
            <div class="pm-monitor-card pm-fixed-card" style="order:6;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">KServe 에러율 (%) - 5xx</div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-kserve-error-rate"></canvas>
                </div>
            </div>
        </div>
    </div>
    `;
}

async function setupMonitoringPage() {
    const isAdminView = _monitoringData?.is_admin_view ?? true;
    const currentNs   = _monitoringData?.namespace     ?? '';

    const gpuTrend          = _monitoringData?.gpu_trend            || {};
    const kserveRps         = _monitoringData?.kserve_rps           || { status: 'error', series: [] };
    const kserveLatency     = _monitoringData?.kserve_latency_p95   || { status: 'error', series: [] };
    const kserveErrorRate   = _monitoringData?.kserve_error_rate    || { status: 'error', models: [] };
    const kserveTop5Latency = _monitoringData?.kserve_top5_latency  || { status: 'error', models: [] };

    // ════════════════════════════════════════════════════════════════
    // MOCK 테스트 섹션 — 현재 모두 주석 처리 → 실제 API 데이터 사용 중
    // renderMonitoring() MOCK 섹션과 함께 활성화해야 차트 namespace 필터링 동작
    // ════════════════════════════════════════════════════════════════
    // const nsSuffix = currentNs ? `(${currentNs})` : null;
    // if (!isAdminView && nsSuffix) {
    //     kserveRps.series         = (kserveRps.series         || []).filter(s => s.name.includes(nsSuffix));
    //     kserveLatency.series     = (kserveLatency.series     || []).filter(s => s.name.includes(nsSuffix));
    //     kserveErrorRate.models   = (kserveErrorRate.models   || []).filter(m => m.name.includes(nsSuffix));
    //     kserveTop5Latency.models = (kserveTop5Latency.models || []).filter(m => m.name.includes(nsSuffix));
    // }

    let tooltip = document.getElementById('pm-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'pm-tooltip';
        document.body.appendChild(tooltip);
    }
    document.addEventListener('mouseover', e => {
        const el = e.target.closest('[data-tip]');
        if (!el) return;
        tooltip.textContent = el.dataset.tip;
        tooltip.style.display = 'block';
    });
    document.addEventListener('mousemove', e => {
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 24) + 'px';
    });
    document.addEventListener('mouseout', e => {
        if (!e.target.closest('[data-tip]')) return;
        tooltip.style.display = 'none';
    });
    ['chart-gpu-util', 'chart-gpu-mem', 'chart-cpu', 'chart-mem'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = parseFloat(el.dataset.pct) || 0;
        const accent = el.dataset.accent;
        const color = pct >= 90 ? '#dc3545' : pct >= 75 ? '#f59e0b' : accent;
        new Chart(el, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [pct, 100 - pct],
                    backgroundColor: [color, '#f3f4f6'],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: false,
                rotation: -90,
                circumference: 180,
                cutout: '60%',
                layout: { padding: 0 },
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                animation: { duration: 600 },
            },
        });
    });

    const KSERVE_COLORS = [
        { border: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
        { border: '#10b981', bg: 'rgba(16,185,129,0.12)' },
        { border: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        { border: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
        { border: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    ];
    const KSERVE_WINDOW_MS = 30 * 60 * 1000;

    const top5El = document.getElementById('chart-top5-latency');
    if (top5El) {
        const top5Placeholder = (msg, isError) => {
            const card = top5El.closest('.pm-fixed-card');
            top5El.remove();
            card.appendChild(Object.assign(document.createElement('div'), {
                style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; letter-spacing:0.5px; white-space:nowrap; color:${isError ? '#ef4444' : '#d1d5db'};`,
                textContent: msg,
            }));
        };

        if (kserveTop5Latency.status === 'error') { top5Placeholder('No connection', true); }
        else if (kserveTop5Latency.status === 'empty' || !kserveTop5Latency.models?.length) { top5Placeholder('No data', false); }
        else {
            new Chart(top5El, {
                type: 'bar',
                data: {
                    labels: kserveTop5Latency.models.map(m => m.name),
                    datasets: [{
                        label: 'p95 지연시간 (ms)',
                        data: kserveTop5Latency.models.map(m => m.latency_ms),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4,
                        borderSkipped: false,
                    }],
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.parsed.x.toLocaleString()} ms`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            min: 0,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + ' ms' },
                        },
                        y: {
                            grid: { display: false },
                            ticks: { font: { size: 11 }, color: '#6b7280' },
                        },
                    },
                },
            });
        }
    }

    const errorRateEl = document.getElementById('chart-kserve-error-rate');
    if (errorRateEl) {
        const errPlaceholder = (msg, isError) => {
            const card = errorRateEl.closest('.pm-fixed-card');
            errorRateEl.remove();
            card.appendChild(Object.assign(document.createElement('div'), {
                style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; letter-spacing:0.5px; white-space:nowrap; color:${isError ? '#ef4444' : '#d1d5db'};`,
                textContent: msg,
            }));
        };

        if (kserveErrorRate.status === 'error') { errPlaceholder('No connection', true); }
        else if (kserveErrorRate.status === 'empty' || !kserveErrorRate.models?.length) { errPlaceholder('No data', false); }
        else {
            const labels = kserveErrorRate.models.map(m => m.name);
            const values = kserveErrorRate.models.map(m => m.error_rate);
            const barColors = values.map(v => v >= 5 ? '#ef4444' : v >= 1 ? '#f59e0b' : '#10b981');

            new Chart(errorRateEl, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: '에러율 (%)',
                        data: values,
                        backgroundColor: barColors,
                        borderRadius: 4,
                        borderSkipped: false,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.parsed.y.toFixed(4)} %`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { font: { size: 11 }, color: '#6b7280' },
                        },
                        y: {
                            min: 0,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + '%' },
                        },
                    },
                },
            });
        }
    }

    const latencyEl = document.getElementById('chart-kserve-latency');
    if (latencyEl) {
        const latencyPlaceholder = (msg, isError) => {
            const card = latencyEl.closest('.pm-fixed-card');
            latencyEl.remove();
            card.appendChild(Object.assign(document.createElement('div'), {
                style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; letter-spacing:0.5px; white-space:nowrap; color:${isError ? '#ef4444' : '#d1d5db'};`,
                textContent: msg,
            }));
        };

        if (kserveLatency.status === 'error') { latencyPlaceholder('No connection', true); }
        else if (kserveLatency.status === 'empty' || !kserveLatency.series?.length) { latencyPlaceholder('No data', false); }
        else {
            const now = Date.now();
            const datasets = kserveLatency.series.map((s, i) => {
                const color = KSERVE_COLORS[i % KSERVE_COLORS.length];
                return {
                    label: s.name,
                    data: s.data.map(([ts, v]) => ({ x: ts, y: v })),
                    borderColor: color.border,
                    backgroundColor: color.border,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: color.border,
                    tension: 0.4,
                    fill: false,
                };
            });

            new Chart(latencyEl, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: { font: { size: 11 }, color: '#6b7280', boxWidth: 12, padding: 10 },
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)} s`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'minute', tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm' } },
                            min: now - KSERVE_WINDOW_MS,
                            max: now,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', maxTicksLimit: 7 },
                        },
                        y: {
                            min: 0,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + ' s' },
                        },
                    },
                },
            });
        }
    }

    const rpsEl = document.getElementById('chart-kserve-rps');
    if (rpsEl) {
        const rpsPlaceholder = (msg, isError) => {
            const card = rpsEl.closest('.pm-fixed-card');
            rpsEl.remove();
            card.appendChild(Object.assign(document.createElement('div'), {
                style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; letter-spacing:0.5px; white-space:nowrap; color:${isError ? '#ef4444' : '#d1d5db'};`,
                textContent: msg,
            }));
        };

        if (kserveRps.status === 'error') { rpsPlaceholder('No connection', true); }
        else if (kserveRps.status === 'empty' || !kserveRps.series?.length) { rpsPlaceholder('No data', false); }
        else {
            const now = Date.now();
            const datasets = kserveRps.series.map((s, i) => {
                const color = KSERVE_COLORS[i % KSERVE_COLORS.length];
                return {
                    label: s.name,
                    data: s.data.map(([ts, v]) => ({ x: ts, y: v })),
                    borderColor: color.border,
                    backgroundColor: color.bg,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: color.border,
                    tension: 0.4,
                    fill: true,
                };
            });

            new Chart(rpsEl, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: { font: { size: 11 }, color: '#6b7280', boxWidth: 12, padding: 10 },
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)} req/s`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'minute', tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm' } },
                            min: now - KSERVE_WINDOW_MS,
                            max: now,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', maxTicksLimit: 7 },
                        },
                        y: {
                            min: 0,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + ' req/s' },
                        },
                    },
                },
            });
        }
    }

    const trendEl = document.getElementById('chart-gpu-trend');
    if (trendEl) {
        const now = Date.now();
        const chartPlaceholder = (msg) => {
            trendEl.replaceWith(Object.assign(document.createElement('div'), {
                style: 'height:120px; display:flex; align-items:center; justify-content:center; font-size:13px; color:#9ca3af;',
                textContent: msg,
            }));
        };

        if (gpuTrend.status === 'error') { chartPlaceholder('연결 오류'); return; }
        if (gpuTrend.status === 'empty' || !gpuTrend.data?.length) { chartPlaceholder('데이터 없음'); return; }
        const trendPoints = gpuTrend.data.map(([ts, v]) => ({ x: ts, y: v }));

        new Chart(trendEl, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'GPU 사용률 (%)',
                    data: trendPoints,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    tension: 0,
                    pointRadius: 0,
                    pointHitRadius: 20,
                    pointBackgroundColor: '#f59e0b',
                    borderWidth: 2,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'minute', tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm' } },
                        min: now - 60 * 60000,
                        max: now,
                        grid: { color: '#f3f4f6' },
                        ticks: { font: { size: 11 }, color: '#9ca3af', maxTicksLimit: 7 },
                    },
                    y: {
                        min: 0,
                        grid: { color: '#f3f4f6' },
                        ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + '%' },
                    },
                },
            },
        });
    }

    const pvcDonutEl = document.getElementById('chart-pvc-donut');
    if (pvcDonutEl) {
        const isAdminView = _monitoringData?.is_admin_view ?? false;
        const pvcGroups   = _monitoringData?.pvc?.groups   ?? [];

        const CHART_COLORS  = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
        const PHASE_COLORS  = { Bound: '#3b82f6', Pending: '#f59e0b', Lost: '#ef4444' };
        const ALL_PHASES    = ['Bound', 'Pending', 'Lost'];

        const phaseTotals = pvcGroups.reduce(
            (acc, g) => {
                acc.Bound   += g.phase_counts?.Bound   ?? 0;
                acc.Pending += g.phase_counts?.Pending ?? 0;
                acc.Lost    += g.phase_counts?.Lost    ?? 0;
                return acc;
            },
            { Bound: 0, Pending: 0, Lost: 0 }
        );
        const statusLabels  = ALL_PHASES.filter(k => phaseTotals[k] > 0);
        const statusValues  = statusLabels.map(k => phaseTotals[k]);
        const statusColors  = statusLabels.map(k => PHASE_COLORS[k]);

        const storageLabels = pvcGroups.map(g => g.ns);
        const storageValues = pvcGroups.map(g => g.total_gb ?? 0);
        const storageColors = CHART_COLORS.slice(0, storageLabels.length);

        const initialLabels = isAdminView ? storageLabels : statusLabels;
        const initialValues = isAdminView ? storageValues : statusValues;
        const initialColors = isAdminView ? storageColors : statusColors;

        if (!initialValues.length || initialValues.every(v => v === 0)) return;

        const chart = new Chart(pvcDonutEl, {
            type: 'doughnut',
            data: {
                labels: initialLabels,
                datasets: [{ data: initialValues, backgroundColor: initialColors, borderWidth: 0 }],
            },
            options: {
                responsive: false,
                cutout: '60%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${ctx.parsed + '개'}`,
                        },
                    },
                },
            },
        });

        const legendEl = document.getElementById('chart-pvc-legend');
        legendEl.style.cssText = 'border:1px solid #e5e7eb; border-radius:8px; padding:4px 12px; min-width:140px;';

        const myNs          = _monitoringData?.namespace ?? '';
        const myGroup       = pvcGroups.find(g => g.ns === myNs);
        const myPhaseTotals = {
            Bound:   myGroup?.phase_counts?.Bound   ?? 0,
            Pending: myGroup?.phase_counts?.Pending ?? 0,
            Lost:    myGroup?.phase_counts?.Lost    ?? 0,
        };
        const myStatusLabels = ALL_PHASES.filter(k => myPhaseTotals[k] > 0);
        const myStatusValues = myStatusLabels.map(k => myPhaseTotals[k]);
        const myStatusColors = myStatusLabels.map(k => PHASE_COLORS[k]);

        const renderLegend = (tab, totals) => {
            const isStorage = tab === 'storage';
            const labels = isStorage ? storageLabels : (totals === myPhaseTotals ? myStatusLabels : statusLabels);
            const values = isStorage ? storageValues : (totals === myPhaseTotals ? myStatusValues : statusValues);
            const colors = isStorage ? storageColors : (totals === myPhaseTotals ? myStatusColors : statusColors);
            const total  = values.reduce((s, v) => s + v, 0);
            const activeTotals = totals ?? phaseTotals;

            const items = isStorage
                ? labels.map((l, i) => ({ label: l, value: values[i], color: colors[i], empty: false }))
                : ALL_PHASES.map(p => ({
                    label: p,
                    value: activeTotals[p],
                    color: PHASE_COLORS[p],
                    empty: activeTotals[p] === 0,
                  }));

            legendEl.innerHTML = items.map(item => {
                const val = isStorage ? item.value.toFixed(1) + ' GB' : item.value + '개';
                const pct = total > 0 ? Math.round(item.value / total * 100) : 0;
                return `
                <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #f3f4f6;">
                    <div style="width:12px; height:12px; border-radius:3px; background:${item.color}; flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div style="font-size:13px; font-weight:600; color:#111827;">${esc(item.label)}</div>
                        <div style="font-size:11px; color:#9ca3af;">${val}${!item.empty ? ' · ' + pct + '%' : ''}</div>
                    </div>
                </div>`;
            }).join('');

            chart.options.plugins.tooltip.callbacks.label =
                ctx => ` ${ctx.label}: ${isStorage ? ctx.parsed.toFixed(1) + ' GB' : ctx.parsed + '개'}`;
        };

        renderLegend(isAdminView ? 'storage' : 'status', phaseTotals);

        if (isAdminView) {
            const TAB_ON  = 'padding:4px 10px; border-radius:6px; border:1px solid #3b82f6; background:#3b82f6; color:#fff; font-size:11px; font-weight:600; cursor:pointer;';
            const TAB_OFF = 'padding:4px 10px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; color:#6b7280; font-size:11px; font-weight:600; cursor:pointer;';

            const btnAll   = document.getElementById('pvc-left-tab-all');
            const btnMine  = document.getElementById('pvc-left-tab-mine');
            const viewAll  = document.getElementById('pvc-view-all');
            const viewMine = document.getElementById('pvc-view-mine');
            const chartTitle = document.getElementById('pvc-chart-title');
            const tableTitle = document.getElementById('pvc-table-title');

            const switchMode = (mode) => {
                const isMine    = mode === 'mine';
                const newLabels = isMine ? myStatusLabels : storageLabels;
                const newValues = isMine ? myStatusValues : storageValues;
                const newColors = isMine ? myStatusColors : storageColors;

                viewAll.style.display  = isMine ? 'none' : '';
                viewMine.style.display = isMine ? ''     : 'none';
                btnAll.style.cssText   = isMine ? TAB_OFF : TAB_ON;
                btnMine.style.cssText  = isMine ? TAB_ON  : TAB_OFF;
                if (chartTitle) chartTitle.textContent = isMine ? 'PVC 상태' : '용량 점유율';
                if (tableTitle) tableTitle.textContent = isMine ? 'PVC 현황' : '사용자별 PVC 현황';

                chart.data.labels = newLabels;
                chart.data.datasets[0].data = newValues;
                chart.data.datasets[0].backgroundColor = newColors;
                chart.update();
                renderLegend(isMine ? 'status' : 'storage', isMine ? myPhaseTotals : phaseTotals);
            };

            btnAll?.addEventListener('click',  () => switchMode('all'));
            btnMine?.addEventListener('click', () => switchMode('mine'));
        }
    }
}
