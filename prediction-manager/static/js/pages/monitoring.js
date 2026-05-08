async function renderMonitoring() {
    let data;
    try {
        data = await API.get('/api/monitoring/summary');
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
            <div style="position:relative; width:120px; height:120px;">
                <canvas id="${id}" width="120" height="120" data-pct="${pct ?? 0}" data-accent="${accent}"></canvas>
                <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <span style="font-size:18px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(valueStr ?? '-')}</span>
                    ${subStr ? `<span style="font-size:10px; color:var(--text-muted); font-family:var(--font-mono);">${esc(subStr)}</span>` : ''}
                </div>
            </div>
            <div style="font-size:12px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase;">${esc(label)}</div>
        </div>`;

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

    // 유령 데이터 (TODO: API 연동)
    const mockRay = {
        ready: true,
        running_jobs: [
            { job_id: 'raysubmit_abc123', name: 'lgbm-search',    submitted_by: 'admin@example.com', started_at: '2025-05-07 09:10' },
            { job_id: 'raysubmit_def456', name: 'xgb-tune-v2',    submitted_by: 'user@example.com',  started_at: '2025-05-07 10:30' },
        ],
    };
    const mockAutomlJobs = [
        { name: 'xgb-tune-v1', status: 'SUCCEEDED', submitted_by: 'user@example.com', submitted_at: '2025-05-06 11:20' },
        { name: 'lgbm-search', status: 'RUNNING',   submitted_by: 'admin@example.com', submitted_at: '2025-05-07 09:10' },
        { name: 'rf-baseline', status: 'FAILED',    submitted_by: 'user@example.com', submitted_at: '2025-05-07 08:00' },
    ];
    const mockKserve = [
        { name: 'iris-classifier',   namespace: 'kubeflow-user-a', ready: true  },
        { name: 'fraud-detector',    namespace: 'kubeflow-user-b', ready: true  },
        { name: 'churn-predictor',   namespace: 'kubeflow-user-a', ready: false },
    ];

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

    const automlRows = mockAutomlJobs.map(j => `
        <tr>
            <td style="font-size:14px; font-weight:500;">${esc(j.name)}</td>
            <td>${statusBadge(j.status)}</td>
            <td style="font-size:13px; color:var(--text-muted);">${esc(j.submitted_by)}</td>
            <td style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${esc(j.submitted_at)}</td>
        </tr>`).join('');

    const kserveRows = mockKserve.map(e => `
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

    <div style="display:grid; grid-template-columns:1fr 1fr; grid-template-rows:auto auto; gap:16px; margin-bottom:24px;">

        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px; grid-row: span 2;">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:20px;">GPU</div>
            <div style="display:flex; justify-content:space-around; margin-bottom:20px;">
                ${donutChart('chart-gpu-util', 'GPU 사용률', gpuUtil !== null ? gpuUtil + '%' : null, '', gpuUtil, '#f59e0b')}
                ${donutChart('chart-gpu-mem', 'GPU 메모리', gpuMemUsed !== null ? gpuMemUsed.toFixed(1) + ' GB' : null, gpuMemTotal !== null ? gpuMemTotal + ' GB' : '', gpuMemPct, '#ef4444')}
            </div>
            <div style="display:grid; grid-template-columns:7fr 3fr; gap:10px; margin-top:100px;">
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

        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px;">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">시스템</div>
            <div style="display:flex; justify-content:space-around;">
                ${donutChart('chart-cpu', 'CPU', cpuCores !== null ? cpuCores.toFixed(2) + ' core' : null, cpuTotal !== null ? cpuTotal + ' core' : '', cpuPct, '#3b82f6')}
                ${donutChart('chart-mem', '메모리', memUsedGb !== null ? memUsedGb.toFixed(1) + ' GB' : null, memTotalGb !== null ? memTotalGb + ' GB' : '', memPct, '#8b5cf6')}
            </div>
        </div>

        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px;">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">Ray 클러스터</div>
            <div style="display:flex; align-items:center; gap:24px; margin-bottom:16px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:12px; height:12px; border-radius:50%; background:${mockRay.ready ? '#22c55e' : '#ef4444'};"></div>
                    <span style="font-size:15px; font-weight:600; color:${mockRay.ready ? '#15803d' : '#b91c1c'};">${mockRay.ready ? 'Ready' : 'Not Ready'}</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; background:#f3f4f6; border-radius:8px; padding:8px 20px;">
                    <span style="font-size:24px; font-weight:700; color:#111827; font-family:var(--font-mono);">${mockRay.running_jobs.length}</span>
                    <span style="font-size:11px; color:var(--text-muted);">실행 중 Job</span>
                </div>
            </div>
            ${mockRay.running_jobs.length > 0 ? `
            <table class="pm-table">
                <thead><tr><th>Job ID</th><th>이름</th><th>시작 시간</th></tr></thead>
                <tbody>
                    ${mockRay.running_jobs.map(j => `
                    <tr>
                        <td style="font-family:var(--font-mono); font-size:13px; color:var(--text-muted);">${esc(j.job_id)}</td>
                        <td style="font-size:14px; font-weight:500;">${esc(j.name)}</td>
                        <td style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${esc(j.started_at)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>` : `<div style="font-size:13px; color:var(--text-muted); padding:8px 0;">실행 중인 job 없음</div>`}
        </div>

    </div>


    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px; margin-bottom:24px;">
        <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">AutoML 최근 Job</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:16px;">
            ${[
                { label: '전체', value: mockAutomlJobs.length, color: '#6b7280', bg: '#f3f4f6' },
                { label: '실행중', value: mockAutomlJobs.filter(j => j.status === 'RUNNING').length, color: '#1a56a8', bg: '#e8f4ff' },
                { label: '성공', value: mockAutomlJobs.filter(j => j.status === 'SUCCEEDED').length, color: '#155724', bg: '#d4edda' },
                { label: '실패', value: mockAutomlJobs.filter(j => j.status === 'FAILED').length, color: '#721c24', bg: '#f8d7da' },
            ].map(s => `
                <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                    <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                </div>`).join('')}
        </div>
        <table class="pm-table">
            <thead><tr><th>이름</th><th>상태</th><th>제출자</th><th>제출 시간</th></tr></thead>
            <tbody>${automlRows}</tbody>
        </table>
    </div>

    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px; margin-bottom:24px;">
        <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">KServe Endpoint</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:16px;">
            ${[
                { label: '전체', value: mockKserve.length, color: '#6b7280', bg: '#f3f4f6' },
                { label: 'Ready', value: mockKserve.filter(e => e.ready).length, color: '#155724', bg: '#d4edda' },
                { label: 'Not Ready', value: mockKserve.filter(e => !e.ready).length, color: '#721c24', bg: '#f8d7da' },
            ].map(s => `
                <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                    <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                </div>`).join('')}
        </div>
        <table class="pm-table">
            <thead><tr><th>이름</th><th>Namespace</th><th>상태</th></tr></thead>
            <tbody>${kserveRows}</tbody>
        </table>
    </div>
    `;
}

function setupMonitoringPage() {
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
                cutout: '72%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                animation: { duration: 600 },
            },
        });
    });
}
