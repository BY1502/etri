let _monitoringData = null;
const _charts = {};
let _lastSuccessTime = null;
// _alarmHistory, _ZONE, _statusColor, _fmtNow → monitoring-alarm.js

// 최초 진입 시 전체 HTML 생성
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
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <canvas id="${id}" width="210" height="105" data-pct="${pct ?? 0}" data-accent="${accent}"></canvas>
            <div style="display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                <span id="val-${id}" style="font-size:20px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(valueStr ?? '-')}</span>
                ${subStr ? `<span id="sub-${id}" style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${esc(subStr)}</span>` : ''}
            </div>
            <div style="font-size:12px; font-weight:600; color:#6b7280; letter-spacing:0.4px; text-transform:uppercase;">${esc(label)}</div>
        </div>`;

    const gpuUtil    = gpu.util_pct    ?? null;
    const gpuMemUsedMb  = gpu.mem_used_mb  ?? null;
    const gpuMemTotalMb = gpu.mem_total_mb ?? null;
    const gpuMemPct     = gpu.mem_pct      ?? null;
    const _fmtMem = (mb) => mb == null ? null : mb < 1024 ? mb + ' MiB' : (mb / 1024).toFixed(1) + ' GB';
    const gpuMemUsed  = _fmtMem(gpuMemUsedMb);
    const gpuMemTotal = _fmtMem(gpuMemTotalMb);
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
    const rayTrend        = data.ray_trend        || {};
    const rayClusterUtil  = data.ray_cluster_util || {};
    const rayNodeCount    = data.ray_node_count   || {};
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
        <p style="margin:0;">GPU/CPU, Ray, AutoML, KServe 상태를 모니터링 합니다.</p>
    </div>

    <button class="pm-alarm-btn" id="pm-alarm-btn" onclick="document.getElementById('pm-alarm-sidebar')?.classList.contains('open') ? window._closeAlarmSidebar() : window._openAlarmSidebar()" title="알람 이력" style="position:fixed; bottom:28px; right:28px; z-index:900; width:auto; padding:0 18px; gap:7px; flex-direction:row; font-size:13px; font-weight:600; color:#fff; border:none; border-radius:14px; background:#3b82f6; height:44px; box-shadow:0 4px 10px rgba(59,130,246,0.15);">
        <img src="static/icons/log.svg" width="22" height="22" alt="Log" style="display:block; background:transparent; filter:brightness(0) invert(1);">
        Log
    </button>

    ${prometheusWarning}

    <div id="section-gpu" class="pm-gpu-grid-wrapper">

        <!-- 1+2. GPU (사용률 + 메모리) -->
        <div class="pm-monitor-card pm-gpu-donut" style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; align-items:center;">
                <div class="pm-section-title" style="font-size:15px; margin-bottom:0; display:flex; align-items:center; gap:6px;">GPU<span id="alarm-ind-gpu" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#e53935;color:white;font-size:10px;font-weight:700;cursor:default;">!</span></span></div>
            </div>
            <div style="flex:1; display:flex; flex-wrap:wrap; align-items:stretch; gap:14px;">
                <div style="flex:1; flex:1 1 140px; background:#fff; border:1px solid #eaecf0; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:14px 10px;">
                    ${donutChart('chart-gpu-util', 'GPU 사용률', gpuUtil !== null ? gpuUtil + '%' : null, ' ', gpuUtil, '#f59e0b')}
                </div>
                <div style="flex:1; flex:1 1 140px; background:#fff; border:1px solid #eaecf0; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:14px 10px;">
                    ${donutChart('chart-gpu-mem', 'GPU 메모리', gpuMemUsed, gpuMemTotal ?? '', gpuMemPct, '#ef4444')}
                </div>
            </div>
        </div>

        <!-- 3+4. 시스템 (CPU + 메모리) -->
        <div id="section-system" class="pm-monitor-card pm-gpu-donut" style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; align-items:center;">
                <div class="pm-section-title" style="font-size:15px; margin-bottom:0; display:flex; align-items:center; gap:6px;">시스템<span id="alarm-ind-system" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#f59e0b;color:white;font-size:10px;font-weight:700;cursor:default;">!</span></span></div>
            </div>
            <div style="flex:1; display:flex; flex-wrap:wrap; align-items:stretch; gap:14px;">
                <div style="flex:1; flex:1 1 140px; background:#fff; border:1px solid #eaecf0; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:14px 10px;">
                    ${donutChart('chart-cpu', 'CPU', cpuCores !== null ? cpuCores.toFixed(2) + ' core' : null, cpuTotal !== null ? cpuTotal + ' core' : '', cpuPct, '#3b82f6')}
                </div>
                <div style="flex:1; flex:1 1 140px; background:#fff; border:1px solid #eaecf0; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:14px 10px;">
                    ${donutChart('chart-mem', '메모리', memUsedGb !== null ? memUsedGb.toFixed(1) + ' GB' : null, memTotalGb !== null ? memTotalGb + ' GB' : '', memPct, '#8b5cf6')}
                </div>
            </div>
        </div>

        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:15px; margin-bottom:12px; flex-shrink:0;">GPU 사용 추이</div>
            <div style="flex:1; min-height:0; position:relative;">
                <canvas id="chart-gpu-trend"></canvas>
            </div>
        </div>
            ${(() => {
            const pct = gpuTemp !== null ? Math.min(100, Math.round(gpuTemp)) : 0;
            const fillColor = pct >= 85 ? '#EF4444' : pct >= 75 ? '#F59E0B' : '#1DB877';
            const label = gpuTemp === null ? '-' : pct >= 85 ? '위험' : pct >= 75 ? '주의' : '정상';
            const labelColor = pct >= 85 ? '#EF4444' : pct >= 75 ? '#b07415' : '#0d8a57';
            return `
        <div id="section-gpu-temp" class="pm-monitor-card pm-fixed-card" style="display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-shrink:0;">
                <div style="font-size:15px; font-weight:600; color:#6b7280; display:flex; align-items:center; gap:4px;">온도<span id="alarm-ind-gpu-temp" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#e53935;color:white;font-size:9px;font-weight:700;cursor:default;">!</span></span></div>
            </div>
            <div style="flex:1; display:flex; align-items:center; justify-content:center; padding-bottom:14px; border-bottom:1px solid #eaecf0;">
                <div style="display:flex; align-items:flex-end; gap:12px;">
                    <div style="position:relative; width:22px; height:120px; flex-shrink:0;">
                        <div style="position:absolute; top:0; bottom:22px; left:50%; transform:translateX(-50%); width:12px; background:#e5e7eb; border-radius:6px 6px 0 0; overflow:hidden;">
                            <div id="bar-gpu-temp-fill" style="position:absolute; bottom:0; left:0; right:0; height:${pct}%; background:${fillColor}; transition:height 0.4s;"></div>
                        </div>
                        <div style="position:absolute; left:1px; right:1px; bottom:96px; height:1.5px; background:#f59e0b; border-radius:1px;"></div>
                        <div style="position:absolute; left:1px; right:1px; bottom:105px; height:1.5px; background:#dc3545; border-radius:1px;"></div>
                        <div id="bulb-gpu-temp" style="position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:22px; height:22px; border-radius:50%; background:${fillColor}; border:2px solid #e5e7eb;"></div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <div id="stat-gpu-temp-value" style="font-size:20px; font-weight:700; font-family:var(--font-mono); color:${labelColor};">${gpuTemp !== null ? gpuTemp + '\u00b0C' : '-'} <span style="font-size:12px;">${label}</span></div>
                        <div style="font-size:10px; color:var(--text-muted);">기준 75° / 85°</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:4px; padding-top:14px;">
                <div style="font-size:15px; font-weight:600; color:#6b7280;">전력</div>
                <div style="width:100%; display:flex; justify-content:center; align-items:center; margin-top:4px;">
                    <span id="stat-gpu-power-value" style="font-size:26px; font-weight:700; font-family:var(--font-mono); color:#111827;">${gpuPower !== null ? gpuPower + ' W' : '-'}</span>
                </div>
            </div>
        </div>`;
            })()}
        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:15px; margin-bottom:12px; flex-shrink:0;">${isAdminView ? '사용자별 노트북 자원 사용량' : '노트북 자원 사용량'} (CPU cores / Memory GB)</div>
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
                <tbody id="tbody-notebook-res">
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

    </div>

    <div class="pm-monitor-2col" style="margin-bottom:14px;">
    <div id="section-pvc" class="pm-monitor-card pm-fixed-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:8px;">
                <div id="pvc-table-title" class="pm-section-title" style="font-size:15px; margin-bottom:0; display:flex; align-items:center; gap:6px;">${isAdminView ? '사용자별 PVC 현황' : 'PVC 현황'}<span id="alarm-ind-pvc" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e53935;color:white;font-size:11px;font-weight:700;cursor:default;flex-shrink:0;">!</span></span></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
            ${isAdminView ? `
            <div style="display:flex; gap:4px;">
                <button id="pvc-left-tab-all"  style="padding:4px 10px; border-radius:6px; border:1px solid #3b82f6; background:#3b82f6; color:#fff; font-size:11px; font-weight:600; cursor:pointer;">전체</button>
                <button id="pvc-left-tab-mine" style="padding:4px 10px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; color:#6b7280; font-size:11px; font-weight:600; cursor:pointer;">내 PVC</button>
            </div>` : ''}
            </div>
        </div>
        <div style="display:flex; gap:16px; flex:1; min-height:0;">
            <div style="flex:3; min-height:0; overflow-y:auto; border-radius:6px; position:relative;">
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
            <div style="flex:2; display:flex; align-items:center; min-height:0; border-left:1px solid #f3f4f6; padding-left:16px;">
                ${pvcStatus === 'ok' && pvcGroups.length > 0
                    ? `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">
                           <canvas id="chart-pvc-donut" width="180" height="180"></canvas>
                       </div>`
                    : noDataDiv
                }
            </div>
        </div>
    </div>
    <div id="section-automl" class="pm-monitor-card pm-fixed-card">
        <div style="margin-bottom:12px;">
            <div class="pm-section-title" style="font-size:15px; display:flex; align-items:center; gap:6px;">AutoML 최근 Job<span id="alarm-ind-automl" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f59e0b;color:white;font-size:11px;font-weight:700;cursor:default;flex-shrink:0;">!</span></span></div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:16px; flex-shrink:0;">
            ${[
                { id: 'stat-automl-total',   label: '전체',  value: automlError ? '-' : automlDisplayJobs.length, color: '#6b7280', bg: '#f3f4f6' },
                { id: 'stat-automl-running',  label: '실행중', value: automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'RUNNING').length, color: '#1a56a8', bg: '#e8f4ff' },
                { id: 'stat-automl-success',  label: '성공',  value: automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'SUCCEEDED').length, color: '#155724', bg: '#d4edda' },
                { id: 'stat-automl-failed',   label: '실패',  value: automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'FAILED').length, color: '#721c24', bg: '#f8d7da' },
            ].map(s => `
                <div style="background:${s.bg}; border-radius:8px; padding:8px 12px; text-align:center;">
                    <div id="${s.id}" style="font-size:20px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                    <div style="font-size:11px; color:${s.color}; margin-top:1px;">${s.label}</div>
                </div>`).join('')}
        </div>
        <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
        <table class="pm-table">
            <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>${isAdminView ? '이름 / 제출자' : '이름'}</th><th>상태</th><th>제출 시간 / 경과</th></tr></thead>
            <tbody id="tbody-automl">${
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

    <div id="section-ray" class="pm-monitor-card pm-ray-section">
        <div class="pm-section-title" style="font-size:15px; margin-bottom:0; flex-shrink:0;">Ray 클러스터</div>
        <div class="pm-ray-inner">
            <div id="section-ray-util" style="flex:1; min-height:0; background:#fff; border:1px solid transparent; border-radius:8px; display:flex; flex-direction:column; padding:12px;">
                <div style="text-align:center; font-size:13px; font-weight:600; color:#374151; margin-bottom:4px; flex-shrink:0;">Cluster Utilization</div>
                <div id="legend-ray-util" style="display:flex; flex-wrap:wrap; gap:4px 14px; margin-bottom:6px; flex-shrink:0; justify-content:center;"></div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-ray-util"></canvas>
                </div>
            </div>
            <div id="section-ray-node" style="flex:1; min-height:0; background:#fff; border:1px solid transparent; border-radius:8px; display:flex; flex-direction:column; padding:12px;">
                <div style="position:relative; text-align:center; margin-bottom:4px; flex-shrink:0;">
                    <div style="font-size:13px; font-weight:600; color:#374151;">Node Count</div>
                    <div id="stat-ray-finished" style="position:absolute; right:0; top:0; font-size:11px; color:#6b7280;"></div>
                </div>
                <div id="legend-ray-node" style="display:flex; flex-wrap:wrap; gap:4px 14px; margin-bottom:6px; flex-shrink:0; justify-content:center;"></div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-ray-node-count"></canvas>
                </div>
            </div>
        </div>
    </div>

    <div class="pm-monitor-2col" style="margin-bottom:16px;">
        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:15px; margin-bottom:12px;">실행 중인 노트북</div>
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
                <tbody id="tbody-running-nb">
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

        <div id="section-kserve" class="pm-monitor-card pm-fixed-card">
            <div style="margin-bottom:12px;">
                <div class="pm-section-title" style="font-size:15px; display:flex; align-items:center; gap:6px;">KServe Endpoint<span id="alarm-ind-kserve" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e53935;color:white;font-size:11px;font-weight:700;cursor:default;flex-shrink:0;">!</span></span></div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:16px; flex-shrink:0;">
                ${[
                    { id: 'stat-kserve-total',    label: '전체',     value: kserveError ? '-' : kserveDisplayEndpoints.length, color: '#6b7280', bg: '#f3f4f6' },
                    { id: 'stat-kserve-ready',    label: 'Ready',   value: kserveError ? '-' : kserveDisplayEndpoints.filter(e => e.ready).length, color: '#155724', bg: '#d4edda' },
                    { id: 'stat-kserve-notready', label: 'Not Ready', value: kserveError ? '-' : kserveDisplayEndpoints.filter(e => !e.ready).length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:8px 12px; text-align:center;">
                        <div id="${s.id}" style="font-size:20px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:1px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>이름</th>${isAdminView ? '<th>Namespace</th>' : ''}<th>상태</th></tr></thead>
                <tbody id="tbody-kserve">${
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

    <div id="section-mlflow" class="pm-zigzag-section">
        <div class="pm-zigzag-col">
            <div style="display:flex; gap:10px; order:1;">
                ${[
                    { id: 'stat-mlflow-exp',     label: 'MLflow Experiments', value: mlflowStats.experiments ?? '-', color: '#16a34a' },
                    { id: 'stat-mlflow-models',  label: 'Registered Models',  value: mlflowStats.models ?? '-',      color: '#2563eb' },
                    { id: 'stat-mlflow-runs',    label: 'Total Runs',         value: mlflowStats.runs ?? '-',         color: '#9333ea' },
                ].map(s => `
                <div class="pm-half-card" style="flex:1;">
                    <div style="font-size:14px; font-weight:600; color:#374151;">${s.label}</div>
                    <div id="${s.id}" style="font-size:48px; font-weight:700; font-family:var(--font-mono); color:${s.color}; text-align:center; line-height:1;">${s.value}</div>
                    <div></div>
                </div>`).join('')}
            </div>
            <div class="pm-monitor-card pm-fixed-card" style="order:3;">
                <div class="pm-section-title" style="font-size:15px; margin-bottom:12px;">MLflow 실험별 Run 수</div>
                <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
                ${mlflowExpRunsStatus === 'error'
                    ? noConnDiv
                    : mlflowExpRunsStatus === 'empty' || mlflowExpRuns.length === 0
                        ? noDataDiv
                        : `<table class="pm-table">
                    <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                        <tr><th>실험명</th><th style="text-align:right;">Run 수</th></tr>
                    </thead>
                    <tbody id="tbody-mlflow-exp-runs">
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
                <div class="pm-section-title" style="font-size:15px; margin-bottom:12px;">KServe 추론 지연시간 (초) - 모델별 p95</div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-kserve-latency"></canvas>
                </div>
            </div>
            <div id="section-kserve-latency" class="pm-monitor-card pm-fixed-card" style="order:7;">
                <div style="margin-bottom:12px;">
                    <div class="pm-section-title" style="font-size:15px; display:flex; align-items:center; gap:6px;">Top 5 Latency (p95, ms)<span id="alarm-ind-kserve-latency" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f59e0b;color:white;font-size:11px;font-weight:700;cursor:default;flex-shrink:0;">!</span></span></div>
                </div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-top5-latency"></canvas>
                </div>
            </div>
        </div>
        <div class="pm-zigzag-col">
            <div class="pm-monitor-card pm-fixed-card" style="order:2;">
                <div class="pm-section-title" style="font-size:15px; margin-bottom:12px;">MLflow 모델별 버전 수</div>
                <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
                ${mlflowModelsStatus === 'error'
                    ? noConnDiv
                    : mlflowModelsStatus === 'empty' || mlflowModels.length === 0
                        ? noDataDiv
                        : `<table class="pm-table">
                    <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                        <tr><th>모델명</th><th style="text-align:center;">버전 수</th><th>최신 Stage</th></tr>
                    </thead>
                    <tbody id="tbody-mlflow-models">
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
                <div class="pm-section-title" style="font-size:15px; margin-bottom:12px;">KServe 초당 요청 수 (RPS)</div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-kserve-rps"></canvas>
                </div>
            </div>
            <div id="section-kserve-error" class="pm-monitor-card pm-fixed-card" style="order:6;">
                <div style="margin-bottom:12px;">
                    <div class="pm-section-title" style="font-size:15px; display:flex; align-items:center; gap:6px;">KServe 에러율 (%) - 5xx<span id="alarm-ind-kserve-error" style="display:none;"><span data-tip="" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e53935;color:white;font-size:11px;font-weight:700;cursor:default;flex-shrink:0;">!</span></span></div>
                </div>
                <div style="flex:1; min-height:0; position:relative;">
                    <canvas id="chart-kserve-error-rate"></canvas>
                </div>
            </div>
        </div>
    </div>
    `;
}

// 차트 및 이벤트 초기화
async function setupMonitoringPage() {
    Object.values(_charts).forEach(c => c?.destroy());
    Object.keys(_charts).forEach(k => delete _charts[k]);

    Chart.defaults.animation = false;

    const isAdminView = _monitoringData?.is_admin_view ?? true;
    const currentNs   = _monitoringData?.namespace     ?? '';

    const gpuTrend          = _monitoringData?.gpu_trend            || {};
    const kserveRps         = _monitoringData?.kserve_rps           || { status: 'error', series: [] };
    const kserveLatency     = _monitoringData?.kserve_latency_p95   || { status: 'error', series: [] };
    const kserveErrorRate   = _monitoringData?.kserve_error_rate    || { status: 'error', models: [] };
    const kserveTop5Latency = _monitoringData?.kserve_top5_latency  || { status: 'error', models: [] };



    let tooltip = document.getElementById('pm-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'pm-tooltip';
        document.body.appendChild(tooltip);
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
    }
    ['chart-gpu-util', 'chart-gpu-mem', 'chart-cpu', 'chart-mem'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = parseFloat(el.dataset.pct) || 0;
        const color = _statusColor(id, pct);
        const z = _ZONE[id] || { warn: 75, danger: 90 };
        _charts[id] = new Chart(el, {
            type: 'doughnut',
            data: {
                datasets: [
                    {
                        data: [z.warn, z.danger - z.warn, 100 - z.danger],
                        backgroundColor: ['#1DB877', '#F59E0B', '#EF4444'],
                        borderWidth: 0,
                        weight: 0.12,
                    },
                    { data: [100], backgroundColor: ['#ffffff'], borderWidth: 0, weight: 0.04 },
                    { data: [pct, 100 - pct], backgroundColor: [color, '#f3f4f6'], borderWidth: 0, weight: 1 },
                ],
            },
            options: {
                responsive: false,
                rotation: -90,
                circumference: 180,
                cutout: '60%',
                layout: { padding: 0 },
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
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
            _charts['chart-top5-latency'] = new Chart(top5El, {
                type: 'bar',
                data: {
                    labels: kserveTop5Latency.models.map(m => m.name),
                    datasets: [{
                        label: 'p95 지연시간 (ms)',
                        data: kserveTop5Latency.models.map(m => m.latency_ms),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 32,
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

            _charts['chart-kserve-error-rate'] = new Chart(errorRateEl, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: '에러율 (%)',
                        data: values,
                        backgroundColor: barColors,
                        borderRadius: 4,
                        borderSkipped: false,
                        maxBarThickness: 40,
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

            _charts['chart-kserve-latency'] = new Chart(latencyEl, {
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

            _charts['chart-kserve-rps'] = new Chart(rpsEl, {
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
        const chartPlaceholder = (msg, color) => {
            trendEl.replaceWith(Object.assign(document.createElement('div'), {
                style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; color:${color}; letter-spacing:0.5px; white-space:nowrap;`,
                textContent: msg,
            }));
        };

        if (gpuTrend.status === 'error') { chartPlaceholder('No connection', '#ef4444'); }
        else if (gpuTrend.status === 'empty' || !gpuTrend.data?.length) { chartPlaceholder('No data', '#d1d5db'); }
        else {
        const trendPoints = gpuTrend.data.map(([ts, v]) => ({ x: ts, y: v }));

        _charts['chart-gpu-trend'] = new Chart(trendEl, {
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
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'minute', tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm' } },
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
        } // else
    }

    // ── Ray 커스텀 범례 렌더 헬퍼 ────────────────────────────────────────────
    const _renderRayLegend = (elId, datasets, fmtVal) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = datasets.map(ds => {
            const last = ds.data.length ? ds.data[ds.data.length - 1]?.y : null;
            const val  = last != null ? fmtVal(last) : '-';
            const label = String(ds.label).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return `<div style="display:flex; align-items:center; gap:5px;">
                <div style="width:12px; height:12px; background:${ds.borderColor}; flex-shrink:0;"></div>
                <span style="font-size:11px; color:#6b7280; white-space:nowrap;">${label}</span>
                <span style="font-size:11px; color:#9ca3af; white-space:nowrap;">${val}</span>
            </div>`;
        }).join('');
    };

    // ── Cluster Utilization ──────────────────────────────────────────────────
    const rayUtilEl = document.getElementById('chart-ray-util');
    if (rayUtilEl) {
        const ru = _monitoringData?.ray_cluster_util || {};
        const placeholder = (msg, color) => rayUtilEl.replaceWith(Object.assign(document.createElement('div'), {
            style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; color:${color}; letter-spacing:0.5px; white-space:nowrap;`,
            textContent: msg,
        }));
        if (ru.status === 'error') { placeholder('No connection', '#ef4444'); }
        else if (ru.status === 'empty' || (!ru.cpu?.length && !ru.mem?.length && !ru.disk?.length)) { placeholder('No data', '#d1d5db'); }
        else {
            const toPoints = arr => (arr || []).map(([ts, v]) => ({ x: ts, y: v !== null ? parseFloat(v) : null }));
            const utilDatasets = [
                { label: 'Disk',         data: toPoints(ru.disk), borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)',  tension: 0, pointRadius: 0, pointHitRadius: 20, borderWidth: 2, fill: true },
                { label: 'CPU (physical)',data: toPoints(ru.cpu),  borderColor: '#1DB877', backgroundColor: 'rgba(29,184,119,0.08)',  tension: 0, pointRadius: 0, pointHitRadius: 20, borderWidth: 2, fill: true },
                { label: 'Memory (RAM)', data: toPoints(ru.mem),  borderColor: '#67E8F9', backgroundColor: 'rgba(103,232,249,0.08)', tension: 0, pointRadius: 0, pointHitRadius: 20, borderWidth: 2, fill: true },
            ];
            _charts['chart-ray-util'] = new Chart(rayUtilEl, {
                type: 'line',
                data: { datasets: utilDatasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) ?? '-'}%` } },
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'minute', tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm' } },
                            min: Date.now() - 60 * 60 * 1000, max: Date.now(),
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', maxTicksLimit: 7 },
                        },
                        y: {
                            min: 0, max: 100,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + '%' },
                        },
                    },
                },
            });
            _renderRayLegend('legend-ray-util', utilDatasets, v => v.toFixed(2) + ' %');
        }
    }

    // ── Node Count ───────────────────────────────────────────────────────────
    const rayNodeEl = document.getElementById('chart-ray-node-count');
    if (rayNodeEl) {
        const rn = _monitoringData?.ray_node_count || {};
        const finishedEl = document.getElementById('stat-ray-finished');
        if (finishedEl && rn.finished_jobs != null) {
            finishedEl.textContent = `완료 Job: ${rn.finished_jobs.toLocaleString()}`;
        }
        const placeholder = (msg, color) => rayNodeEl.replaceWith(Object.assign(document.createElement('div'), {
            style: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:700; color:${color}; letter-spacing:0.5px; white-space:nowrap;`,
            textContent: msg,
        }));
        if (rn.status === 'error') { placeholder('No connection', '#ef4444'); }
        else if (rn.status === 'empty' || !rn.types?.length) { placeholder('No data', '#d1d5db'); }
        else {
            const NODE_COLORS = ['#F59E0B', '#3B82F6', '#1DB877', '#8B5CF6', '#EF4444'];
            const toPoints = arr => (arr || []).map(([ts, v]) => ({ x: ts, y: v !== null ? parseFloat(v) : null }));
            const nodeDatasets = rn.types.slice(0, 5).map((t, i) => ({
                label: t.name,
                data: toPoints(t.data),
                borderColor: NODE_COLORS[i],
                backgroundColor: NODE_COLORS[i] + '26',
                tension: 0, pointRadius: 0, pointHitRadius: 20, borderWidth: 2, fill: true,
            }));
            _charts['chart-ray-node-count'] = new Chart(rayNodeEl, {
                type: 'line',
                data: { datasets: nodeDatasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y ?? '-'} nodes` } },
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'minute', tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm' } },
                            min: Date.now() - 60 * 60 * 1000, max: Date.now(),
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', maxTicksLimit: 7 },
                        },
                        y: {
                            min: 0, stacked: true,
                            grid: { color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af', stepSize: 1, callback: v => Number.isInteger(v) ? v + ' nodes' : '' },
                        },
                    },
                },
            });
            _renderRayLegend('legend-ray-node', nodeDatasets, v => v + ' nodes');
        }
    }

    const pvcDonutEl = document.getElementById('chart-pvc-donut');
    if (pvcDonutEl) {
        const isAdminView = _monitoringData?.is_admin_view ?? false;
        const pvcGroups   = _monitoringData?.pvc?.groups   ?? [];

        const CHART_COLORS  = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
        const PHASE_COLORS  = { Bound: '#3b82f6', Pending: '#f59e0b', Lost: '#ef4444' };
        const ALL_PHASES    = ['Bound', 'Pending', 'Lost'];

        const phaseTotals = { Bound: 0, Pending: 0, Lost: 0 };
        pvcGroups.flatMap(g => g.pvcs ?? []).forEach(p => {
            if (p.phase in phaseTotals) phaseTotals[p.phase] += p.allocated_gb ?? 0;
        });
        const statusLabels  = ALL_PHASES.filter(k => phaseTotals[k] > 0);
        const statusValues  = statusLabels.map(k => phaseTotals[k]);
        const statusColors  = statusLabels.map(k => PHASE_COLORS[k]);

        const storageLabels = pvcGroups.map(g => g.ns);
        const storageValues = pvcGroups.map(g => g.total_gb ?? 0);
        const storageColors = CHART_COLORS.slice(0, storageLabels.length);

        const initialLabels = isAdminView ? storageLabels : statusLabels;
        const initialValues = isAdminView ? storageValues : statusValues;
        const initialColors = isAdminView ? storageColors : statusColors;

        if (initialValues.length && !initialValues.every(v => v === 0)) {

        const chart = _charts['chart-pvc-donut'] = new Chart(pvcDonutEl, {
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
                            label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)} GB`,
                        },
                    },
                },
            },
        });

        const myNs          = _monitoringData?.namespace ?? '';
        const myGroup       = pvcGroups.find(g => g.ns === myNs);
        const myPhaseTotals = { Bound: 0, Pending: 0, Lost: 0 };
        (myGroup?.pvcs ?? []).forEach(p => {
            if (p.phase in myPhaseTotals) myPhaseTotals[p.phase] += p.allocated_gb ?? 0;
        });
        const myStatusLabels = ALL_PHASES.filter(k => myPhaseTotals[k] > 0);
        const myStatusValues = myStatusLabels.map(k => myPhaseTotals[k]);
        const myStatusColors = myStatusLabels.map(k => PHASE_COLORS[k]);

        if (isAdminView) {
            const TAB_ON  = 'padding:4px 10px; border-radius:6px; border:1px solid #3b82f6; background:#3b82f6; color:#fff; font-size:11px; font-weight:600; cursor:pointer;';
            const TAB_OFF = 'padding:4px 10px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; color:#6b7280; font-size:11px; font-weight:600; cursor:pointer;';

            const btnAll   = document.getElementById('pvc-left-tab-all');
            const btnMine  = document.getElementById('pvc-left-tab-mine');
            const viewAll  = document.getElementById('pvc-view-all');
            const viewMine = document.getElementById('pvc-view-mine');
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
                if (tableTitle) tableTitle.textContent = isMine ? 'PVC 현황' : '사용자별 PVC 현황';

                chart.data.labels = newLabels;
                chart.data.datasets[0].data = newValues;
                chart.data.datasets[0].backgroundColor = newColors;
                chart.options.plugins.tooltip.callbacks.label =
                    ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)} GB`;
                chart.update();
            };

            btnAll?.addEventListener('click',  () => switchMode('all'));
            btnMine?.addEventListener('click', () => switchMode('mine'));
        }
        } // if (initialValues.length && ...)
    }

    setupAlarmHistoryCards();
    if (_monitoringData) updateAlarmIndicators(_monitoringData);

    const scrollTo = new URLSearchParams(window.location.search).get('scrollTo');
    if (scrollTo) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        });
    }
}

// 알람 인디케이터 업데이트 및 과거 이력 관리
// updateAlarmIndicators, setupAlarmHistoryCards → monitoring-alarm.js

// 새로 받아온 모니터링 데이터를 기반으로 화면의 모든 지표와 차트를 업데이트
function updateMonitoringInPlace(newData) {
    _monitoringData = newData;

    const gpu    = newData.gpu    || {};
    const sys    = newData.system || {};
    const ray    = newData.ray    || {};
    const automl = newData.automl || {};
    const kserve = newData.kserve || {};

    const isAdminView  = newData.is_admin_view ?? true;
    const currentNs    = newData.namespace     ?? '';
    const currentEmail = newData.user_email    ?? '';

    const gpuUtil     = gpu.util_pct     ?? null;
    const gpuMemUsedMb  = gpu.mem_used_mb  ?? null;
    const gpuMemTotalMb = gpu.mem_total_mb ?? null;
    const gpuMemPct     = gpu.mem_pct      ?? null;
    const _fmtMemR = (mb) => mb == null ? null : mb < 1024 ? mb + ' MiB' : (mb / 1024).toFixed(1) + ' GB';
    const gpuMemUsed  = _fmtMemR(gpuMemUsedMb);
    const gpuMemTotal = _fmtMemR(gpuMemTotalMb);
    const gpuTemp     = gpu.temp_c       ?? null;
    const gpuPower    = gpu.power_w      ?? null;
    const cpuCores    = sys.cpu_cores        ?? null;
    const cpuTotal    = sys.cpu_total_cores  ?? null;
    const cpuPct      = sys.cpu_pct          ?? null;
    const memUsedGb   = sys.mem_used_gb      ?? null;
    const memTotalGb  = sys.mem_total_gb     ?? null;
    const memPct      = sys.mem_pct          ?? null;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // ── 도넛 차트 4개 ──────────────────────────────────────────────
    [
        { id: 'chart-gpu-util', pct: gpuUtil,    accent: '#f59e0b', valueStr: gpuUtil    !== null ? gpuUtil + '%'                  : null, subStr: ' ' },
        { id: 'chart-gpu-mem',  pct: gpuMemPct,  accent: '#ef4444', valueStr: gpuMemUsed,  subStr: gpuMemTotal ?? '' },
        { id: 'chart-cpu',      pct: cpuPct,     accent: '#3b82f6', valueStr: cpuCores   !== null ? cpuCores.toFixed(2) + ' core'  : null, subStr: cpuTotal    !== null ? cpuTotal + ' core'  : '' },
        { id: 'chart-mem',      pct: memPct,     accent: '#8b5cf6', valueStr: memUsedGb  !== null ? memUsedGb.toFixed(1) + ' GB'   : null, subStr: memTotalGb  !== null ? memTotalGb + ' GB'  : '' },
    ].forEach(({ id, pct, accent, valueStr, subStr }) => {
        const chart = _charts[id];
        if (chart) {
            const color = _statusColor(id, pct);
            chart.data.datasets[2].data            = [pct ?? 0, 100 - (pct ?? 0)];
            chart.data.datasets[2].backgroundColor = [color, '#f3f4f6'];
            chart.update('none');
        }
        setText('val-' + id, valueStr ?? '-');
        setText('sub-' + id, subStr ?? '');
    });

    // ── GPU 온도 / 전력 ────────────────────────────────────────────
    const tempPct       = gpuTemp !== null ? Math.min(100, Math.round(gpuTemp)) : 0;
    const tempFillColor = tempPct >= 85 ? '#EF4444' : tempPct >= 75 ? '#F59E0B' : '#1DB877';
    const tempLabel     = gpuTemp === null ? '-' : tempPct >= 85 ? '위험' : tempPct >= 75 ? '주의' : '정상';
    const tempColor     = tempPct >= 85 ? '#EF4444' : tempPct >= 75 ? '#b07415' : '#0d8a57';
    const tempEl = document.getElementById('stat-gpu-temp-value');
    if (tempEl) {
        tempEl.style.color   = tempColor;
        tempEl.innerHTML     = `${gpuTemp !== null ? gpuTemp + '°C' : '-'} <span style="font-size:12px;">${tempLabel}</span>`;
    }
    const barEl = document.getElementById('bar-gpu-temp-fill');
    if (barEl) { barEl.style.height = tempPct + '%'; barEl.style.background = tempFillColor; }
    const bulbEl = document.getElementById('bulb-gpu-temp');
    if (bulbEl) bulbEl.style.background = tempFillColor;
    setText('stat-gpu-power-value', gpuPower !== null ? gpuPower + ' W' : '-');

    // ── GPU 추이 차트 ──────────────────────────────────────────────
    const gpuTrend = newData.gpu_trend || {};
    if (_charts['chart-gpu-trend'] && gpuTrend.data?.length) {
        const now = Date.now();
        _charts['chart-gpu-trend'].data.datasets[0].data = gpuTrend.data.map(([ts, v]) => ({ x: ts, y: v }));
        _charts['chart-gpu-trend'].update('none');
    }

    // ── Ray: Cluster Utilization ──────────────────────────────────
    const ruNew = newData.ray_cluster_util || {};
    if (_charts['chart-ray-util'] && ruNew.status === 'ok') {
        const toP = arr => (arr || []).map(([ts, v]) => ({ x: ts, y: v !== null ? parseFloat(v) : null }));
        const nowTs = Date.now();
        if (ruNew.disk?.length) _charts['chart-ray-util'].data.datasets[0].data = toP(ruNew.disk);
        if (ruNew.cpu?.length)  _charts['chart-ray-util'].data.datasets[1].data = toP(ruNew.cpu);
        if (ruNew.mem?.length)  _charts['chart-ray-util'].data.datasets[2].data = toP(ruNew.mem);
        _charts['chart-ray-util'].options.scales.x.min = nowTs - 60 * 60 * 1000;
        _charts['chart-ray-util'].options.scales.x.max = nowTs;
        _charts['chart-ray-util'].update('none');
        _renderRayLegend('legend-ray-util', _charts['chart-ray-util'].data.datasets, v => v.toFixed(2) + ' %');
    }

    // ── Ray: Node Count ───────────────────────────────────────────
    const rnNew = newData.ray_node_count || {};
    const finishedEl = document.getElementById('stat-ray-finished');
    if (finishedEl && rnNew.finished_jobs != null) {
        finishedEl.textContent = `완료 Job: ${rnNew.finished_jobs.toLocaleString()}`;
    }
    if (_charts['chart-ray-node-count'] && rnNew.status === 'ok' && rnNew.types?.length) {
        const toP = arr => (arr || []).map(([ts, v]) => ({ x: ts, y: v !== null ? parseFloat(v) : null }));
        const nowTs = Date.now();
        rnNew.types.slice(0, 5).forEach((t, i) => {
            if (_charts['chart-ray-node-count'].data.datasets[i]) {
                _charts['chart-ray-node-count'].data.datasets[i].data = toP(t.data);
            }
        });
        _charts['chart-ray-node-count'].options.scales.x.min = nowTs - 60 * 60 * 1000;
        _charts['chart-ray-node-count'].options.scales.x.max = nowTs;
        _charts['chart-ray-node-count'].update('none');
        _renderRayLegend('legend-ray-node', _charts['chart-ray-node-count'].data.datasets, v => v + ' nodes');
    }

    // ── AutoML ────────────────────────────────────────────────────
    const automlError       = automl.error ?? true;
    const automlJobs        = automl.jobs  || [];
    const automlDisplayJobs = isAdminView ? automlJobs : automlJobs.filter(j => j.submitted_by === currentEmail);
    const timeAgo = (dateStr) => {
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return `${diff}초 전`;
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        return `${Math.floor(diff / 86400)}일 전`;
    };
    const statusBadge = (status) => {
        const colors = { SUCCEEDED: { bg: '#d4edda', color: '#155724' }, RUNNING: { bg: '#e8f4ff', color: '#1a56a8' }, FAILED: { bg: '#f8d7da', color: '#721c24' }, STOPPED: { bg: '#fff3cd', color: '#856404' }, QUEUED: { bg: '#f5e6ff', color: '#6f42c1' }, PENDING: { bg: '#e9ecef', color: '#495057' } };
        const c = colors[status] || { bg: '#e9ecef', color: '#495057' };
        return `<span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${c.bg}; color:${c.color};">${esc(status)}</span>`;
    };
    const noConnTd = (cols) => `<tr><td colspan="${cols}" style="text-align:center; padding:32px 0; font-size:20px; font-weight:700; color:#ef4444; letter-spacing:0.5px;">No connection</td></tr>`;
    const noDataTd = (cols) => `<tr><td colspan="${cols}" style="text-align:center; padding:32px 0; font-size:20px; font-weight:700; color:#d1d5db; letter-spacing:0.5px;">No data</td></tr>`;

    setText('stat-automl-total',   automlError ? '-' : automlDisplayJobs.length);
    setText('stat-automl-running', automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'RUNNING').length);
    setText('stat-automl-success', automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'SUCCEEDED').length);
    setText('stat-automl-failed',  automlError ? '-' : automlDisplayJobs.filter(j => j.status === 'FAILED').length);
    const tbodyAutoml = document.getElementById('tbody-automl');
    if (tbodyAutoml) {
        tbodyAutoml.innerHTML = automlError
            ? noConnTd(3)
            : automlDisplayJobs.length === 0 ? noDataTd(3)
            : automlDisplayJobs.map(j => `
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
    }

    // ── KServe ────────────────────────────────────────────────────
    const kserveError            = kserve.error     ?? true;
    const kserveEndpoints        = kserve.endpoints || [];
    const kserveDisplayEndpoints = isAdminView ? kserveEndpoints : kserveEndpoints.filter(e => e.namespace === currentNs);

    setText('stat-kserve-total',    kserveError ? '-' : kserveDisplayEndpoints.length);
    setText('stat-kserve-ready',    kserveError ? '-' : kserveDisplayEndpoints.filter(e => e.ready).length);
    setText('stat-kserve-notready', kserveError ? '-' : kserveDisplayEndpoints.filter(e => !e.ready).length);
    const tbodyKserve = document.getElementById('tbody-kserve');
    if (tbodyKserve) {
        tbodyKserve.innerHTML = kserveError
            ? noConnTd(isAdminView ? 3 : 2)
            : kserveDisplayEndpoints.length === 0 ? noDataTd(isAdminView ? 3 : 2)
            : kserveDisplayEndpoints.map(e => `
                <tr>
                    <td style="font-size:14px; font-weight:500;">${esc(e.name)}</td>
                    ${isAdminView ? `<td style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${esc(e.namespace)}</td>` : ''}
                    <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${e.ready ? '#d4edda' : '#f8d7da'}; color:${e.ready ? '#155724' : '#721c24'};">${e.ready ? 'Ready' : 'Not Ready'}</span></td>
                </tr>`).join('');
    }

    // ── MLflow 통계 ───────────────────────────────────────────────
    const mlflowStats = newData.mlflow || {};
    setText('stat-mlflow-exp',    mlflowStats.experiments ?? '-');
    setText('stat-mlflow-models', mlflowStats.models      ?? '-');
    setText('stat-mlflow-runs',   mlflowStats.runs        ?? '-');

    // ── 노트북 자원 사용량 테이블 ─────────────────────────────────
    const notebookStatus = newData.notebook_resources?.status ?? 'error';
    const notebookRows   = newData.notebook_resources?.rows   ?? [];
    const tbodyNb = document.getElementById('tbody-notebook-res');
    if (tbodyNb) {
        tbodyNb.innerHTML = notebookStatus === 'error'
            ? noConnTd(isAdminView ? 5 : 4)
            : notebookRows.length === 0 ? noDataTd(isAdminView ? 5 : 4)
            : notebookRows.map(r => `
                <tr>
                    <td style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);">${esc(r.time)}</td>
                    ${isAdminView ? `<td style="font-size:13px;">${esc(r.ns)}</td>` : ''}
                    <td style="font-size:12px; font-family:var(--font-mono);">${esc(r.pod)}</td>
                    <td style="font-size:13px; font-family:var(--font-mono); text-align:right;">${esc(String(r.cpu))}</td>
                    <td style="font-size:13px; font-family:var(--font-mono); text-align:right;">${esc(String(r.mem))}</td>
                </tr>`).join('');
    }

    // ── 실행 중인 노트북 테이블 ───────────────────────────────────
    const runningNbStatus = newData.running_notebooks?.status    ?? 'error';
    const runningNbs      = newData.running_notebooks?.notebooks ?? [];
    const tbodyRunningNb  = document.getElementById('tbody-running-nb');
    if (tbodyRunningNb) {
        tbodyRunningNb.innerHTML = runningNbStatus === 'error'
            ? noConnTd(isAdminView ? 4 : 3)
            : runningNbs.length === 0 ? noDataTd(isAdminView ? 4 : 3)
            : runningNbs.map(n => `
                <tr>
                    ${isAdminView ? `<td style="font-size:12px; font-family:var(--font-mono);"><span data-tip="${esc(n.namespace)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.namespace)}</span></td>` : ''}
                    <td style="font-size:13px; font-weight:500;"><span data-tip="${esc(n.owner_name)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.owner_name)}</span></td>
                    <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:#d4edda; color:#155724;">Running</span></td>
                    <td style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);"><span data-tip="${esc(n.pod)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.pod)}</span></td>
                </tr>`).join('');
    }

    // ── MLflow 모델 테이블 ────────────────────────────────────────
    const mlflowModels       = newData.mlflow_models?.models ?? [];
    const mlflowModelsStatus = newData.mlflow_models?.status ?? 'error';
    const tbodyMlflowModels  = document.getElementById('tbody-mlflow-models');
    if (tbodyMlflowModels && mlflowModelsStatus !== 'error') {
        tbodyMlflowModels.innerHTML = mlflowModels.map(m => {
            const stageStyle = m.stage === 'Production' ? 'background:#e8f4ff; color:#1a56a8;' : m.stage === 'Staging' ? 'background:#f5e6ff; color:#6f42c1;' : 'background:#e9ecef; color:#495057;';
            return `<tr>
                <td>${esc(m.name)}</td>
                <td style="text-align:center; font-family:var(--font-mono); font-weight:600;">${m.versions}</td>
                <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; ${stageStyle}">${esc(m.stage)}</span></td>
            </tr>`;
        }).join('');
    }

    // ── MLflow 실험별 Run 수 테이블 ───────────────────────────────
    const mlflowExpRunsStatus = newData.mlflow_experiment_runs?.status       ?? 'error';
    const mlflowExpRuns       = newData.mlflow_experiment_runs?.experiments  ?? [];
    const tbodyExpRuns        = document.getElementById('tbody-mlflow-exp-runs');
    if (tbodyExpRuns && mlflowExpRunsStatus !== 'error') {
        tbodyExpRuns.innerHTML = mlflowExpRuns.map(e => `
            <tr>
                <td>${esc(e.name)}</td>
                <td style="text-align:right; font-family:var(--font-mono); font-weight:600;">${e.runs}</td>
            </tr>`).join('');
    }

    // ── KServe 시계열 차트 ────────────────────────────────────────
    const KSERVE_COLORS = [
        { border: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
        { border: '#10b981', bg: 'rgba(16,185,129,0.12)' },
        { border: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
        { border: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
        { border: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
    ];
    const KSERVE_WINDOW_MS  = 30 * 60 * 1000;
    const now               = Date.now();

    const kserveRps     = newData.kserve_rps          || { status: 'error', series: [] };
    const kserveLatency = newData.kserve_latency_p95  || { status: 'error', series: [] };

    [
        { key: 'chart-kserve-rps',     src: kserveRps,     fill: true  },
        { key: 'chart-kserve-latency', src: kserveLatency, fill: false },
    ].forEach(({ key, src, fill }) => {
        const chart = _charts[key];
        if (!chart || src.status === 'error' || !src.series?.length) return;
        chart.data.datasets = src.series.map((s, i) => {
            const color = KSERVE_COLORS[i % KSERVE_COLORS.length];
            return { label: s.name, data: s.data.map(([ts, v]) => ({ x: ts, y: v })), borderColor: color.border, backgroundColor: fill ? color.bg : color.border, borderWidth: 2, pointRadius: 3, pointBackgroundColor: color.border, tension: 0.4, fill };
        });
        chart.options.scales.x.min = now - KSERVE_WINDOW_MS;
        chart.options.scales.x.max = now;
        chart.update('none');
    });

    const kserveErrorRate = newData.kserve_error_rate || { status: 'error', models: [] };
    const errChart = _charts['chart-kserve-error-rate'];
    if (errChart && kserveErrorRate.status !== 'error' && kserveErrorRate.models?.length) {
        const values = kserveErrorRate.models.map(m => m.error_rate);
        errChart.data.labels                        = kserveErrorRate.models.map(m => m.name);
        errChart.data.datasets[0].data              = values;
        errChart.data.datasets[0].backgroundColor   = values.map(v => v >= 5 ? '#ef4444' : v >= 1 ? '#f59e0b' : '#10b981');
        errChart.update('none');
    }

    const kserveTop5 = newData.kserve_top5_latency || { status: 'error', models: [] };
    const top5Chart  = _charts['chart-top5-latency'];
    if (top5Chart && kserveTop5.status !== 'error' && kserveTop5.models?.length) {
        top5Chart.data.labels               = kserveTop5.models.map(m => m.name);
        top5Chart.data.datasets[0].data     = kserveTop5.models.map(m => m.latency_ms);
        top5Chart.update('none');
    }

    // ── PVC 도넛 ──────────────────────────────────────────────────
    const pvcGroups  = newData.pvc?.groups ?? [];
    const pvcChart   = _charts['chart-pvc-donut'];
    if (pvcChart && pvcGroups.length) {
        const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
        const PHASE_COLORS = { Bound: '#3b82f6', Pending: '#f59e0b', Lost: '#ef4444' };
        const isMineView   = document.getElementById('pvc-view-mine')?.style.display === '';

        let newLabels, newValues, newColors;
        if (isAdminView && !isMineView) {
            newLabels = pvcGroups.map(g => g.ns);
            newValues = pvcGroups.map(g => g.total_gb ?? 0);
            newColors = CHART_COLORS.slice(0, newLabels.length);
        } else {
            const myGroup   = pvcGroups.find(g => g.ns === currentNs);
            const gbByPhase = { Bound: 0, Pending: 0, Lost: 0 };
            (myGroup?.pvcs ?? []).forEach(p => {
                if (p.phase in gbByPhase) gbByPhase[p.phase] += p.allocated_gb ?? 0;
            });
            const phases  = ['Bound', 'Pending', 'Lost'].filter(k => gbByPhase[k] > 0);
            newLabels = phases;
            newValues = phases.map(k => gbByPhase[k]);
            newColors = phases.map(k => PHASE_COLORS[k]);
        }
        if (newValues.length && !newValues.every(v => v === 0)) {
            pvcChart.data.labels                    = newLabels;
            pvcChart.data.datasets[0].data          = newValues;
            pvcChart.data.datasets[0].backgroundColor = newColors;
            pvcChart.update('none');
        }
    }

    updateAlarmIndicators(newData);
}

// _ALARM_SECTIONS, _renderAlarmSidebar, _updateAlarmBadge,
// _openAlarmSidebar, _closeAlarmSidebar → monitoring-alarm.js

// 주기적 모니터링 데이터 리프레시 함수 - 실패해도 기존 데이터 유지하며 재시도
async function refreshMonitoringPage() {
    try {
        const newData = await API.get('/api/monitoring/summary');
        updateMonitoringInPlace(newData);
        _lastSuccessTime = new Date();
    } catch (e) {
        console.warn('[monitoring] 리프레시 실패, 기존 데이터 유지:', e);
    }
}
