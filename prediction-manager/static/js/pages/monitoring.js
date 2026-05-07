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

    const bar = (pct, accent) => {
        if (pct === null || pct === undefined) return `
        <div style="height:8px; border-radius:4px; background:#f3f4f6; margin-top:10px;"></div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">-</div>`;
        const bg = pct >= 90 ? '#fee2e2' : pct >= 75 ? '#fef3c7' : '#f3f4f6';
        const fill = pct >= 90 ? '#dc3545' : pct >= 75 ? '#f59e0b' : accent;
        return `
        <div style="position:relative; background:${bg}; height:8px; border-radius:4px; overflow:hidden; margin-top:10px;">
            <div style="position:absolute; left:0; top:0; height:100%; width:${pct}%; background:${fill}; transition:width 0.3s;"></div>
        </div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">사용률 ${pct}%</div>`;
    };

    const card = (label, valueStr, subStr, pct, accent) => `
        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px;">
            <div style="font-size:11px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:8px;">${esc(label)}</div>
            <div style="display:flex; align-items:baseline; gap:4px;">
                <span style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(valueStr ?? '-')}</span>
                <span style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono);">${esc(subStr)}</span>
            </div>
            ${bar(pct, accent)}
        </div>`;

    const gpuUtil = gpu.util_pct ?? null;
    const gpuMemUsed = gpu.mem_used_gb ?? null;
    const gpuMemTotal = gpu.mem_total_gb ?? null;
    const gpuMemPct = gpu.mem_pct ?? null;
    const cpuCores = sys.cpu_cores ?? null;
    const cpuTotal = sys.cpu_total_cores ?? null;
    const cpuPct = sys.cpu_pct ?? null;
    const memUsedGb = sys.mem_used_gb ?? null;
    const memTotalGb = sys.mem_total_gb ?? null;
    const memPct = sys.mem_pct ?? null;

    return `
    <div class="pm-page-header">
        <h1>MLOps 모니터링</h1>
        <p>GPU/CPU, Ray, AutoML, KServe 상태를 모니터링 합니다.</p>
    </div>

    ${prometheusWarning}

    <div style="margin-bottom:20px;">
        <div class="pm-section-title">GPU</div>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;">
            ${card('GPU 사용률', gpuUtil !== null ? gpuUtil + '%' : null, '', gpuUtil, '#f59e0b')}
            ${card('GPU 메모리', gpuMemUsed !== null ? gpuMemUsed.toFixed(1) + ' GB' : null, gpuMemTotal !== null ? '/ ' + gpuMemTotal + ' GB' : '', gpuMemPct, '#ef4444')}
        </div>
    </div>

    <div>
        <div class="pm-section-title">시스템</div>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;">
            ${card('CPU', cpuCores !== null ? cpuCores.toFixed(2) + ' core' : null, cpuTotal !== null ? '/ ' + cpuTotal + ' core' : '', cpuPct, '#3b82f6')}
            ${card('메모리', memUsedGb !== null ? memUsedGb.toFixed(1) + ' GB' : null, memTotalGb !== null ? '/ ' + memTotalGb + ' GB' : '', memPct, '#8b5cf6')}
        </div>
    </div>
    `;
}
