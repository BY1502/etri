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
            <div style="position:relative; width:160px; height:82px; overflow:hidden;">
                <canvas id="${id}" width="160" height="160" data-pct="${pct ?? 0}" data-accent="${accent}" style="position:absolute; top:0; left:0;"></canvas>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                <span style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(valueStr ?? '-')}</span>
                ${subStr ? `<span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${esc(subStr)}</span>` : ''}
            </div>
            <div style="font-size:13px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase;">${esc(label)}</div>
        </div>`;

    //API 데이터 ── 테스트 시 아래 변수에 직접 값을 넣어 확인 가능
    const gpuUtil = gpu.util_pct ?? null;
    const gpuMemUsed = gpu.mem_used_gb ?? null;
    const gpuMemTotal = gpu.mem_total_gb ?? null;
    const gpuMemPct = gpu.mem_pct ?? null;
    const gpuTemp = gpu.temp_c ?? null;
    const gpuPower = gpu.power_w ?? null;
    const cpuCores = sys.cpu_cores ?? null;
    const cpuTotal = sys.cpu_total_cores ?? null;
    const cpuPct = sys.cpu_pct ?? null;
    const memUsedGb = sys.mem_used_gb ?? null;
    const memTotalGb = sys.mem_total_gb ?? null;
    const memPct = sys.mem_pct ?? null;

    const ray             = data.ray              || {};
    const rayStatus       = ray.status            ?? 'error';
    const automl          = data.automl           || {};
    const automlError     = automl.error          ?? true;
    const automlJobs      = automl.jobs           || [];
    const kserve          = data.kserve           || {};
    const kserveError     = kserve.error          ?? true;
    const kserveEndpoints = kserve.endpoints      || [];
    const mlflowStats     = data.mlflow           || { status: 'error' };
    const mlflowModelsStatus = data.mlflow_models?.status ?? 'error';
    const mlflowModels       = data.mlflow_models?.models  ?? [];
    // const mlflowModelsStatus = 'ok';
    // const mlflowModels       = MOCK.mlflowModels ?? [];
    const notebookStatus  = data.notebook_resources?.status ?? 'error';
    const notebookRows    = data.notebook_resources?.rows   ?? [];
    const runningNbStatus = data.running_notebooks?.status   ?? 'error';
    const runningNbs      = data.running_notebooks?.notebooks ?? [];
    const pvcStatus       = data.pvc?.status  ?? 'error';
    const pvcGroups       = data.pvc?.groups  ?? [];

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

    const automlRows = automlJobs.map(j => `
        <tr>
            <td>
                <div style="font-size:14px; font-weight:500;">${esc(j.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(j.submitted_by)}</div>
            </td>
            <td>${statusBadge(j.status)}</td>
            <td>
                <div style="font-size:13px; font-weight:500;">${timeAgo(j.submitted_at)}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); margin-top:2px;">${esc(j.submitted_at)}</div>
            </td>
        </tr>`).join('');

    const kserveRows = kserveEndpoints.map(e => `
        <tr>
            <td style="font-size:14px; font-weight:500;">${esc(e.name)}</td>
            <td style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${esc(e.namespace)}</td>
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
                <div style="background:#f3f4f6; border-radius:8px; padding:14px 16px; text-align:center;">
                    <div style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">전력</div>
                    <div style="font-size:26px; font-weight:700; font-family:var(--font-mono); color:#111827;">${gpuPower !== null ? gpuPower + ' W' : '-'}</div>
                </div>
            </div>
        </div>
    </div>

    <div class="pm-monitor-card pm-fixed-card" style="margin-bottom:16px;">
        <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">사용자별 노트북 자원 사용량 (CPU cores / Memory GB)</div>
        <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
        <table class="pm-table">
            <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                <tr>
                    <th>Time</th>
                    <th>Namespace</th>
                    <th>Pod</th>
                    <th style="text-align:right;">Value #A (CPU cores)</th>
                    <th style="text-align:right;">Value #B (Memory GB)</th>
                </tr>
            </thead>
            <tbody>
                ${notebookStatus === 'error'
                    ? `<tr><td colspan="5" style="text-align:center; padding:20px 0; font-size:13px; color:#ef4444;">연결 오류</td></tr>`
                    : notebookStatus === 'empty' || notebookRows.length === 0
                        ? `<tr><td colspan="5" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">데이터 없음</td></tr>`
                        : notebookRows.map(r => `
                <tr>
                    <td style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);">${esc(r.time)}</td>
                    <td style="font-size:13px;">${esc(r.ns)}</td>
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
        <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">PVC 할당 용량 (GB) - 사용자별</div>
        <div style="flex:1; min-height:0; overflow-y:auto; padding-right:8px;">
        ${(() => {
            if (pvcStatus === 'error') {
                return `<div style="display:flex; align-items:center; justify-content:center; height:80px; font-size:13px; color:#ef4444;">연결 오류</div>`;
            }
            if (pvcStatus === 'empty' || pvcGroups.length === 0) {
                return `<div style="display:flex; align-items:center; justify-content:center; height:80px; font-size:13px; color:#9ca3af;">kubeflow-* 네임스페이스에 PVC가 없습니다</div>`;
            }
            return pvcGroups.map(group => {
                const maxGb = Math.max(...group.pvcs.map(p => p.allocated_gb), 1);
                const rows = group.pvcs.map(p => {
                    const pct = Math.round(p.allocated_gb / maxGb * 100);
                    return `
                    <div style="display:flex; align-items:center; gap:12px; padding:6px 0; border-bottom:1px solid #f3f4f6;">
                        <div style="flex:0 0 200px; font-size:12px; font-family:var(--font-mono); color:#374151; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(p.name)}">${esc(p.name)}</div>
                        <div style="flex:1; position:relative; background:#f3f4f6; height:10px; border-radius:5px; overflow:hidden;">
                            <div style="position:absolute; left:0; top:0; height:100%; width:${pct}%; background:#3b82f6; border-radius:5px; transition:width 0.4s;"></div>
                        </div>
                        <div style="flex:0 0 80px; font-size:12px; font-family:var(--font-mono); color:#6b7280; text-align:right;">${p.allocated_gb.toFixed(1)} GB</div>
                    </div>`;
                }).join('');
                return `
                <div style="margin-bottom:16px;">
                    <div style="margin-bottom:6px;">
                        <span style="font-size:13px; font-weight:600; color:#111827;">${esc(group.ns)}</span>
                    </div>
                    ${rows}
                </div>`;
            }).join('');
        })()}
        </div>
    </div>
    <div class="pm-monitor-card pm-fixed-card">
        <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">사용자별 PVC 개수</div>
        <div style="flex:1; min-height:0; overflow-y:auto; padding-right:8px;">
        ${(() => {
            if (pvcStatus === 'error') {
                return `<div style="display:flex; align-items:center; justify-content:center; height:80px; font-size:13px; color:#ef4444;">연결 오류</div>`;
            }
            if (pvcStatus === 'empty' || pvcGroups.length === 0) {
                return `<div style="display:flex; align-items:center; justify-content:center; height:80px; font-size:13px; color:#9ca3af;">kubeflow-* 네임스페이스에 PVC가 없습니다</div>`;
            }
            const counts = pvcGroups.map(g => ({ ns: g.ns, count: g.pvcs.length }));
            const max = Math.max(...counts.map(d => d.count));
            return counts.map(d => {
                const cells = Array.from({ length: max }, (_, i) => {
                    const filled = i < d.count;
                    return `<div style="flex:1; height:22px; border-radius:3px; background:${filled ? '#3b82f6' : '#dbeafe'};"></div>`;
                }).join('');
                return `
                <div style="margin-bottom:10px;">
                    <div style="margin-bottom:1px;">
                        <span style="font-size:12px; color:#374151;">${esc(d.ns)}</span>
                    </div>
                    <div style="display:flex; gap:3px; align-items:center;">
                        ${cells}
                        <span style="font-size:18px; font-weight:700; color:#3b82f6; font-family:var(--font-mono); min-width:28px; text-align:right; margin-left:6px;">${d.count}</span>
                    </div>
                </div>`;
            }).join('');
        })()}
        </div>
    </div>
    </div>

    <div class="pm-monitor-2col-bottom">
        <div class="pm-monitor-col">
        <div class="pm-monitor-card pm-fixed-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">Ray 클러스터 (활성 노드 / 완료 Job)</div>
            ${rayStatus === 'error'
                ? `<div style="display:flex; align-items:center; justify-content:center; height:80px; font-size:13px; color:#ef4444;">Prometheus 연결 오류</div>`
                : rayStatus === 'empty'
                    ? `<div style="display:flex; align-items:center; justify-content:center; height:80px; font-size:13px; color:#9ca3af;">Ray 메트릭 없음</div>`
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
                    { label: '전체',  value: automlError ? '-' : automlJobs.length, color: '#6b7280', bg: '#f3f4f6' },
                    { label: '실행중', value: automlError ? '-' : automlJobs.filter(j => j.status === 'RUNNING').length, color: '#1a56a8', bg: '#e8f4ff' },
                    { label: '성공',  value: automlError ? '-' : automlJobs.filter(j => j.status === 'SUCCEEDED').length, color: '#155724', bg: '#d4edda' },
                    { label: '실패',  value: automlError ? '-' : automlJobs.filter(j => j.status === 'FAILED').length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>이름 / 제출자</th><th>상태</th><th>제출 시간 / 경과</th></tr></thead>
                <tbody>${
                    automlError
                        ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">정보를 불러올 수 없습니다</td></tr>`
                        : automlJobs.length === 0
                            ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">제출된 job이 없습니다</td></tr>`
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
                    <col style="width:30%">
                    <col style="width:20%">
                    <col style="width:15%">
                    <col style="width:35%">
                </colgroup>
                <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                    <tr><th>사용자</th><th>owner_name</th><th>상태</th><th>Pod 이름</th></tr>
                </thead>
                <tbody>
                    ${runningNbStatus === 'error'
                        ? `<tr><td colspan="4" style="text-align:center; padding:20px 0; font-size:13px; color:#ef4444;">연결 오류</td></tr>`
                        : runningNbStatus === 'empty' || runningNbs.length === 0
                            ? `<tr><td colspan="4" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">실행 중인 노트북이 없습니다</td></tr>`
                            : runningNbs.map(n => `
                        <tr>
                            <td style="font-size:12px; font-family:var(--font-mono);"><span data-tip="${esc(n.namespace)}" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.namespace)}</span></td>
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
                    { label: '전체',     value: kserveError ? '-' : kserveEndpoints.length, color: '#6b7280', bg: '#f3f4f6' },
                    { label: 'Ready',   value: kserveError ? '-' : kserveEndpoints.filter(e => e.ready).length, color: '#155724', bg: '#d4edda' },
                    { label: 'Not Ready', value: kserveError ? '-' : kserveEndpoints.filter(e => !e.ready).length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="flex:1; min-height:0; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>이름</th><th>Namespace</th><th>상태</th></tr></thead>
                <tbody>${
                    kserveError
                        ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">정보를 불러올 수 없습니다</td></tr>`
                        : kserveEndpoints.length === 0
                            ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">등록된 endpoint가 없습니다</td></tr>`
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
                <table class="pm-table">
                    <thead style="position:sticky; top:0; background:#fff; z-index:1;">
                        <tr><th>실험명</th><th style="text-align:right;">Run 수</th></tr>
                    </thead>
                    <tbody>
                        ${MOCK.mlflowExperiments.map(e => `
                        <tr>
                            <td>${esc(e.name)}</td>
                            <td style="text-align:right; font-family:var(--font-mono); font-weight:600;">${e.runs}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
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
                    ? `<div style="color:var(--text-muted); font-size:13px; padding:16px 0;">데이터를 불러올 수 없습니다.</div>`
                    : mlflowModelsStatus === 'empty' || mlflowModels.length === 0
                        ? `<div style="color:var(--text-muted); font-size:13px; padding:16px 0;">등록된 모델이 없습니다.</div>`
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
                circumference: 280,
                cutout: '50%',
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
    const KSERVE_MODELS = MOCK.kserveModels;
    const KSERVE_WINDOW_MS = 30 * 60 * 1000;

    const top5El = document.getElementById('chart-top5-latency');
    if (top5El) {
        const top5Models = MOCK.top5Latency.models;
        const top5Values = MOCK.top5Latency.values;

        new Chart(top5El, {
            type: 'bar',
            data: {
                labels: top5Models,
                datasets: [{
                    label: 'p95 지연시간 (ms)',
                    data: top5Values,
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
                        ticks: {
                            font: { size: 11 },
                            color: '#9ca3af',
                            callback: v => v + ' ms',
                        },
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#6b7280' },
                    },
                },
            },
        });
    }

    const errorRateEl = document.getElementById('chart-kserve-error-rate');
    if (errorRateEl) {
        const errorRates = MOCK.kserveErrorRates;
        const barColors = errorRates.map(v =>
            v >= 5 ? '#ef4444' : v >= 1 ? '#f59e0b' : '#10b981'
        );

        new Chart(errorRateEl, {
            type: 'bar',
            data: {
                labels: KSERVE_MODELS,
                datasets: [{
                    label: '에러율 (%)',
                    data: errorRates,
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
                            label: ctx => ` ${ctx.parsed.y.toFixed(2)} %`,
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
                        ticks: {
                            font: { size: 11 },
                            color: '#9ca3af',
                            callback: v => v + '%',
                        },
                    },
                },
            },
        });
    }

    const latencyEl = document.getElementById('chart-kserve-latency');
    if (latencyEl) {
        const now = Date.now();
        // TODO: 실제 API 연동 시 아래 mock 데이터를 교체
        const latencyDatasets = KSERVE_MODELS.map((name, i) => {
            const color = KSERVE_COLORS[i % KSERVE_COLORS.length];
            const points = Array.from({ length: 13 }, (_, k) => ({
                x: now - (12 - k) * 2.5 * 60 * 1000,
                y: parseFloat((Math.random() * 1.5 + 0.1 + i * 0.3).toFixed(3)),
            }));
            return {
                label: name,
                data: points,
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
            data: { datasets: latencyDatasets },
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
                            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} s`,
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
                        ticks: {
                            font: { size: 11 },
                            color: '#9ca3af',
                            callback: v => v + ' s',
                        },
                    },
                },
            },
        });
    }

    const rpsEl = document.getElementById('chart-kserve-rps');
    if (rpsEl) {
        // TODO: 실제 API 연동 시 아래 mock 데이터를 교체
        const now = Date.now();
        const mockDatasets = KSERVE_MODELS.map((name, i) => {
            const color = KSERVE_COLORS[i % KSERVE_COLORS.length];
            const points = Array.from({ length: 13 }, (_, k) => ({
                x: now - (12 - k) * 2.5 * 60 * 1000,
                y: parseFloat((Math.random() * 40 + 5 + i * 10).toFixed(2)),
            }));
            return {
                label: name,
                data: points,
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
            data: { datasets: mockDatasets },
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
                            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} req/s`,
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
                        ticks: {
                            font: { size: 11 },
                            color: '#9ca3af',
                            callback: v => v + ' req/s',
                        },
                    },
                },
            },
        });
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

        const trendResult = _monitoringData?.gpu_trend || {};
        if (trendResult.status === 'error') { chartPlaceholder('연결 오류'); return; }
        if (trendResult.status === 'empty' || !trendResult.data?.length) { chartPlaceholder('데이터 없음'); return; }
        const trendPoints = trendResult.data.map(([ts, v]) => ({ x: ts, y: v }));

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
}
