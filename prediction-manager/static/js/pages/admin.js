let _adminRefreshTimer = null;

async function renderAdmin() {
    const users = await API.get('/api/admin/users');
    let gpuHw = {};
    let cap = null;
    try { gpuHw = await API.get('/api/admin/gpu-info'); } catch (e) {}
    try { cap = await API.get('/api/admin/cluster-capacity'); } catch (e) {}

    const rows = users.map(u => {
        const orphan = u.orphan ? '<span class="admin-tag admin-tag-orphan">Profile만 존재</span>' : '';
        const noProfile = !u.namespace ? '<span class="admin-tag admin-tag-warn">Profile 없음</span>' : '';
        const adminTag = u.is_admin ? '<span class="admin-tag admin-tag-admin">ADMIN</span>' : '';
        const disabledTag = u.enabled === false ? '<span class="admin-tag admin-tag-warn">비활성</span>' : '';
        const ns = u.namespace || '-';

        return `
        <tr data-ns="${esc(u.namespace || '')}" data-email="${esc(u.email)}">
            <td>
                <div class="admin-ns">${esc(u.email)} ${adminTag}${orphan}${noProfile}${disabledTag}</div>
                <div class="admin-email">${esc(ns)} ${esc(u.first_name || '')} ${esc(u.last_name || '')}</div>
            </td>
            <td>
                <input class="admin-input" data-field="cpu" value="${esc(u.quota.cpu)}" ${u.namespace ? '' : 'disabled'} />
                <div class="admin-used">사용: ${esc(u.used.cpu)}</div>
            </td>
            <td>
                <input class="admin-input" data-field="memory" value="${esc(u.quota.memory)}" placeholder="예: 16Gi" ${u.namespace ? '' : 'disabled'} />
                <div class="admin-used">사용: ${esc(u.used.memory)}</div>
            </td>
            <td>
                <input class="admin-input" data-field="gpu" value="${esc(u.quota.gpu)}" ${u.namespace ? '' : 'disabled'} />
                <div class="admin-used">사용: ${esc(u.used.gpu)}</div>
            </td>
            <td>
                <input class="admin-input" data-field="pvc" value="${esc(u.quota.pvc)}" ${u.namespace ? '' : 'disabled'} />
                <div class="admin-used">사용: ${esc(u.used.pvc)}</div>
            </td>
            <td>
                <input class="admin-input" data-field="storage" value="${esc(u.quota.storage || '50Gi')}" placeholder="예: 50Gi" ${u.namespace ? '' : 'disabled'} />
                <div class="admin-used">사용: ${esc(u.used.storage || '0')}</div>
            </td>
            <td class="admin-actions">
                ${u.namespace ? `<button class="pm-btn pm-btn-primary save-btn" data-ns="${esc(u.namespace)}">저장</button>` : ''}
                ${u.namespace ? `<button class="pm-btn perm-btn" data-ns="${esc(u.namespace)}" data-email="${esc(u.email)}">권한</button>` : ''}
                <button class="pm-btn pwd-btn" data-email="${esc(u.email)}" ${u.enabled === false || u.enabled === null ? 'disabled' : ''}>비밀번호</button>
                <button class="pm-btn pm-btn-danger delete-btn" data-email="${esc(u.email)}" ${u.is_admin ? 'disabled' : ''}>삭제</button>
            </td>
        </tr>`;
    }).join('');

    return `
        <style>
        .admin-table { width:100%; border-collapse:collapse; }
        .admin-table th { padding:12px 14px; text-align:left; background:#f8f9fa; border-bottom:2px solid var(--border); font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; }
        .admin-table td { padding:14px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }
        .admin-table tr:hover td { background:#fafbfc; }
        .admin-ns { font-weight:600; font-size:13px; }
        .admin-email { font-size:11px; color:var(--text-muted); margin-top:2px; }
        .admin-input { width:100%; padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px; font-family:var(--font-mono); }
        .admin-input:focus { border-color:var(--accent); outline:none; }
        .admin-input:disabled { background:#f5f5f5; color:#999; }
        .admin-used { font-size:10px; color:var(--text-muted); margin-top:4px; font-family:var(--font-mono); }
        .admin-actions { white-space:nowrap; }
        .admin-actions button { margin-right:4px; padding:6px 12px; font-size:12px; }
        .admin-tag { display:inline-block; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; margin-left:6px; vertical-align:middle; }
        .admin-tag-admin { background:#e8f4ff; color:#0066cc; }
        .admin-tag-orphan { background:#fff3cd; color:#856404; }
        .admin-tag-warn { background:#f8d7da; color:#721c24; }
        .admin-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
        .pm-btn-danger { background:#dc3545; color:white; border-color:#dc3545; }
        .pm-btn-danger:hover:not(:disabled) { background:#c82333; }
        .modal-bg { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
        .modal-bg.hidden { display:none; }
        .modal { background:white; padding:24px; border-radius:8px; min-width:420px; max-width:560px; }
        .modal h3 { margin:0 0 16px 0; }
        .modal label { display:block; font-size:12px; color:var(--text-secondary); margin-top:12px; margin-bottom:4px; }
        .modal input { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:13px; box-sizing:border-box; }
        .modal-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
        .modal-error { color:#dc3545; font-size:12px; margin-top:8px; min-height:18px; }
        </style>

        <div class="pm-page-header">
            <h1>사용자 관리</h1>
            <p>Keycloak 사용자 + Kubeflow Profile 통합 관리. 할당량 변경 / 비밀번호 재설정 / 사용자 추가-삭제.</p>
        </div>
        ${gpuHw.model ? `
        <div style="background:#fff8e1; border:1px solid #ffe082; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:12px;">
            <b>GPU 하드웨어</b>: ${gpuHw.model} · ${gpuHw.vram_gb}GB VRAM
            <div style="color:var(--text-muted); margin-top:4px; font-size:11px;">
                ⓘ GPU 수만큼 동시 작업 가능하지만, ${gpuHw.vram_gb}GB 메모리는 공유되므로 큰 모델을 동시에 올리면 OOM 가능
            </div>
        </div>` : ''}
        <div id="capacity-panel">${cap ? _renderCapacity(cap) : ''}</div>
        <div id="mlflow-usage-panel"></div>

        <div class="admin-toolbar">
            <div style="font-size:13px; color:var(--text-muted);">총 ${users.length}명 (관리자 ${users.filter(u => u.is_admin).length}명)</div>
            <button class="pm-btn pm-btn-primary" id="add-user-btn">+ 사용자 추가</button>
        </div>

        <div class="pm-card">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th style="width:28%">사용자</th>
                        <th style="width:13%">CPU (cores)</th>
                        <th style="width:15%">메모리</th>
                        <th style="width:10%">GPU</th>
                        <th style="width:8%">PVC 수</th>
                        <th style="width:10%">스토리지</th>
                        <th style="width:20%">작업</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>

        <div class="modal-bg hidden" id="add-modal">
            <div class="modal">
                <h3>새 사용자 추가</h3>
                <label>이메일 *</label>
                <input id="m-email" type="email" placeholder="user@example.com" />
                <div class="modal-row">
                    <div><label>이름</label><input id="m-fname" placeholder="홍" /></div>
                    <div><label>성</label><input id="m-lname" placeholder="길동" /></div>
                </div>
                <label>초기 비밀번호 *</label>
                <input id="m-pwd" type="text" placeholder="첫 로그인 시 변경 강제" />
                <div class="modal-row" style="margin-top:8px;">
                    <div><label>CPU</label><input id="m-cpu" value="4" /></div>
                    <div><label>메모리 (Gi/Mi 단위)</label><input id="m-mem" value="16Gi" placeholder="예: 16Gi" /></div>
                </div>
                <div class="modal-row">
                    <div><label>GPU</label><input id="m-gpu" value="1" /></div>
                    <div><label>PVC 수</label><input id="m-pvc" value="3" /></div>
                </div>
                <div class="modal-row">
                    <div><label>스토리지 (Gi/Mi 단위)</label><input id="m-storage" value="50Gi" placeholder="예: 50Gi" /></div>
                    <div></div>
                </div>
                <div class="modal-error" id="m-err"></div>
                <div class="modal-actions">
                    <button class="pm-btn" id="m-cancel">취소</button>
                    <button class="pm-btn pm-btn-primary" id="m-create">생성</button>
                </div>
            </div>
        </div>

        <div class="modal-bg hidden" id="perm-modal">
            <div class="modal" style="min-width:520px;">
                <h3>권한 관리</h3>
                <div id="perm-target" style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;"></div>
                <div id="perm-list" style="max-height:280px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px 0;"></div>
                <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border);">
                    <div style="font-weight:600; font-size:13px; margin-bottom:8px;">사용자 추가</div>
                    <div style="display:grid; grid-template-columns:2fr 1fr auto; gap:8px; align-items:center;">
                        <input id="perm-email" type="email" placeholder="user@example.com" style="padding:8px 12px; border:1px solid var(--border); border-radius:6px;" />
                        <select id="perm-role" style="padding:8px 12px; border:1px solid var(--border); border-radius:6px;">
                            <option value="edit">편집 (edit)</option>
                            <option value="view">보기 (view)</option>
                        </select>
                        <button class="pm-btn pm-btn-primary" id="perm-add">추가</button>
                    </div>
                </div>
                <div class="modal-error" id="perm-err"></div>
                <div class="modal-actions">
                    <button class="pm-btn" id="perm-close">닫기</button>
                </div>
            </div>
        </div>

        <div class="modal-bg hidden" id="pwd-modal">
            <div class="modal">
                <h3>비밀번호 재설정</h3>
                <div id="pwd-target" style="font-size:13px; color:var(--text-secondary); margin-bottom:8px;"></div>
                <label>새 비밀번호 *</label>
                <input id="p-pwd" type="text" />
                <label style="margin-top:12px;">
                    <input id="p-temp" type="checkbox" checked /> 첫 로그인 시 변경 강제
                </label>
                <div class="modal-error" id="p-err"></div>
                <div class="modal-actions">
                    <button class="pm-btn" id="p-cancel">취소</button>
                    <button class="pm-btn pm-btn-primary" id="p-submit">재설정</button>
                </div>
            </div>
        </div>
    `;
}

function _validateMemory(s) {
    if (!s || !String(s).trim()) return '메모리 값이 비어있습니다';
    const v = String(s).trim();
    // 숫자+단위(Gi/Mi/Ki/Ti 또는 G/M/K/T) 형식만 허용
    if (!/^[\d.]+\s*(Gi|Mi|Ki|Ti|G|M|K|T)$/i.test(v)) {
        return `"${v}" 형식이 틀립니다. 예: 16Gi, 32Gi, 500Mi (반드시 단위 포함)`;
    }
    return null;
}

function _parseMemGB(s) {
    if (!s) return 0;
    const m = String(s).match(/^([\d.]+)\s*(Gi|Mi|Ki|G|M|K|Ti|T)?$/i);
    if (!m) return parseFloat(s) || 0;
    const n = parseFloat(m[1]);
    const u = (m[2] || '').toLowerCase();
    if (u === 'gi' || u === 'g') return n;
    if (u === 'mi' || u === 'm') return n / 1024;
    if (u === 'ki' || u === 'k') return n / (1024 * 1024);
    if (u === 'ti' || u === 't') return n * 1024;
    return n;
}

async function _checkOvercommit(excludeNs, newQuota) {
    try {
        const cap = await API.get('/api/admin/cluster-capacity');
        const users = await API.get('/api/admin/users');
        let cpu = 0, mem = 0, gpu = 0;
        for (const u of users) {
            if (u.namespace === excludeNs) continue;
            cpu += parseFloat(u.quota.cpu) || 0;
            mem += _parseMemGB(u.quota.memory);
            gpu += parseInt(u.quota.gpu) || 0;
        }
        cpu += parseFloat(newQuota.cpu) || 0;
        mem += _parseMemGB(newQuota.memory);
        gpu += parseInt(newQuota.gpu) || 0;
        const msgs = [];
        if (cpu > cap.total.cpu) msgs.push(`CPU: ${cpu.toFixed(1)} / ${cap.total.cpu}`);
        if (mem > cap.total.memory_gb) msgs.push(`메모리: ${mem.toFixed(1)}GB / ${cap.total.memory_gb}GB`);
        if (gpu > cap.total.gpu_slots) msgs.push(`GPU: ${gpu} / ${cap.total.gpu_slots}`);
        return msgs.length ? msgs.join('\n') : null;
    } catch (e) { return null; }
}

function _renderCapacity(c) {
    const card = (label, used, allocated, total, unit, over, accent) => {
        const allocPct = total > 0 ? Math.min(100, Math.round(allocated / total * 100)) : 0;
        const usedPct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
        const allocOverPct = total > 0 && allocated > total ? Math.min(100, Math.round((allocated - total) / total * 100)) : 0;
        const borderColor = over ? '#dc3545' : '#e5e7eb';
        const borderStyle = over ? '2px' : '1px';
        const usedColor = over ? '#dc3545' : '#22c55e';
        return `
        <div style="background:#fff; border:${borderStyle} solid ${borderColor}; border-radius:10px; padding:14px 16px; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <span style="font-size:11px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase;">${label}</span>
            <div style="text-align:right; line-height:1.2;">
              <div style="font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.3px;">전체</div>
              <div style="font-size:12px; font-weight:600; font-family:var(--font-mono); color:#374151;">${total}${unit}</div>
            </div>
          </div>
          <div style="display:flex; align-items:baseline; gap:4px; margin-bottom:2px;">
            <span style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:#111827;">${used}</span>
            <span style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono);">/ ${allocated}${unit} 할당</span>
          </div>
          <div style="font-size:10px; color:var(--text-muted); margin-bottom:10px;">현재 사용 / 사용자 할당 합</div>
          <div style="position:relative; background:#f3f4f6; height:8px; border-radius:4px; overflow:hidden;">
            <div style="position:absolute; left:0; top:0; height:100%; width:${allocPct}%; background:${accent}; opacity:0.25;"></div>
            <div style="position:absolute; left:0; top:0; height:100%; width:${usedPct}%; background:${usedColor};"></div>
            ${over ? `<div style="position:absolute; right:0; top:0; height:100%; width:${allocOverPct}%; background:repeating-linear-gradient(45deg, #dc3545, #dc3545 3px, #fca5a5 3px, #fca5a5 6px); opacity:0.7;"></div>` : ''}
          </div>
          <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-top:4px;">
            <span>사용률 ${total > 0 ? Math.round(used / total * 100) : 0}%</span>
            <span style="${over ? 'color:#dc3545; font-weight:600;' : ''}">할당률 ${total > 0 ? Math.round(allocated / total * 100) : 0}%${over ? ' 초과' : ''}</span>
          </div>
        </div>`;
    };
    const anyOver = c.over_committed.cpu || c.over_committed.memory || c.over_committed.gpu || c.over_committed.storage;
    return `
    <div style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <div style="font-size:13px; font-weight:600; color:#111827;">클러스터 리소스</div>
          <div style="font-size:11px; color:var(--text-muted);">현재 사용 / 사용자 할당 합 / 하드웨어 총량</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; font-size:10px; color:var(--text-muted);">
          <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:6px; background:#22c55e; border-radius:2px;"></span>사용</span>
          <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:6px; background:#93c5fd; opacity:0.6; border-radius:2px;"></span>할당</span>
          <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:6px; background:repeating-linear-gradient(45deg,#dc3545,#dc3545 2px,#fca5a5 2px,#fca5a5 4px); border-radius:2px;"></span>초과</span>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
        ${card('CPU', c.used.cpu, c.allocated.cpu, c.total.cpu, ' core', c.over_committed.cpu, '#3b82f6')}
        ${card('메모리', c.used.memory_gb, c.allocated.memory_gb, c.total.memory_gb, ' GB', c.over_committed.memory, '#8b5cf6')}
        ${card('GPU', c.used.gpu_slots, c.allocated.gpu_slots, c.total.gpu_slots, '', c.over_committed.gpu, '#f59e0b')}
        ${card('스토리지', c.used.storage_gb, c.allocated.storage_gb, c.total.storage_gb, ' GB', c.over_committed.storage, '#10b981')}
      </div>
      ${anyOver ? `
      <div style="margin-top:10px; padding:8px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; font-size:11px; color:#991b1b;">
        <b>초과 할당 경고</b> · 할당량 합이 하드웨어 총량을 초과했습니다. 실제 사용 시 Pod 스케줄 실패·OOM 위험.
      </div>` : ''}
    </div>`;
}

function _fmtBytes(n) {
    if (n >= 1024**3) return (n / 1024**3).toFixed(2) + ' GiB';
    if (n >= 1024**2) return (n / 1024**2).toFixed(1) + ' MiB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB';
    return n + ' B';
}

async function _refreshMLflowUsage() {
    const el = document.getElementById('mlflow-usage-panel');
    if (!el) return;
    let u;
    try {
        u = await API.get('/api/admin/mlflow/usage');
    } catch (e) {
        el.innerHTML = '';
        return;
    }
    const pct = u.used_pct || 0;
    const barColor = pct >= 85 ? '#dc3545' : pct >= 70 ? '#f59e0b' : '#10b981';
    const totalMlflow = (u.artifact_bytes || 0) + (u.db_bytes || 0);
    const hostPct = u.used_pct || 0;
    const hostBarColor = hostPct >= 85 ? '#dc3545' : hostPct >= 70 ? '#f59e0b' : '#10b981';
    el.innerHTML = `
    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
        <div>
          <div style="font-size:13px; font-weight:600; color:#111827;">MLflow 저장소</div>
          <div style="font-size:11px; color:var(--text-muted);">30일 retention 정책 · 매주 일요일 03:00 자동 정리</div>
        </div>
        <button class="pm-btn pm-btn-sm" id="mlflow-gc-btn" title="30일 이상 지난 deleted run 영구 정리">지금 정리</button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
        <div style="background:#fafbfd; border-radius:8px; padding:10px 12px;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.3px;">MLflow 데이터</div>
          <div style="font-size:18px; font-weight:700; font-family:var(--font-mono); color:#111827; margin-top:4px;">${esc(_fmtBytes(totalMlflow))}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:8px;">artifact ${esc(_fmtBytes(u.artifact_bytes))} + DB ${esc(_fmtBytes(u.db_bytes))}</div>
        </div>
        <div style="background:#fafbfd; border-radius:8px; padding:10px 12px;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.3px;">Run</div>
          <div style="font-size:18px; font-weight:700; font-family:var(--font-mono); color:#111827; margin-top:4px;">${esc(u.runs_active)}<span style="font-size:11px; color:var(--text-muted); font-weight:400;"> / ${esc(u.runs_active + u.runs_deleted)}</span></div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:8px;">활성 / 전체 (deleted ${esc(u.runs_deleted)}개)</div>
        </div>
        <div style="background:#fafbfd; border-radius:8px; padding:10px 12px;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.3px;">Experiment / Model</div>
          <div style="font-size:18px; font-weight:700; font-family:var(--font-mono); color:#111827; margin-top:4px;">${esc(u.experiments_active)} / ${esc(u.registered_models)}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:8px;">활성 Experiment / Registry 모델</div>
        </div>
        <div style="background:#fafbfd; border-radius:8px; padding:10px 12px;" title="local-path StorageClass 특성상 PVC는 호스트 디렉토리를 bind-mount 하므로 파티션 전체 사용률로 나타남">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.3px;">호스트 파티션</div>
          <div style="font-size:18px; font-weight:700; font-family:var(--font-mono); color:${hostBarColor}; margin-top:4px;">${esc(hostPct)}%</div>
          <div style="background:#f3f4f6; height:6px; border-radius:3px; overflow:hidden; margin-top:6px;">
            <div style="width:${Math.min(100, hostPct)}%; height:100%; background:${hostBarColor};"></div>
          </div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${esc(_fmtBytes(u.used_bytes))} / ${esc(_fmtBytes(u.total_bytes))} (전체 노드)</div>
        </div>
      </div>
    </div>`;
    document.getElementById('mlflow-gc-btn')?.addEventListener('click', async () => {
        const days = parseInt(prompt('몇 일 이상 지난 deleted run 을 정리할까요?\n(0 = 즉시 전부, 30 = 기본값)', '30'));
        if (isNaN(days) || days < 0) return;
        if (!confirm(`${days}일 이상 지난 deleted run 을 영구 제거합니다. 계속할까요?`)) return;
        const btn = document.getElementById('mlflow-gc-btn');
        btn.disabled = true; btn.textContent = '정리 중...';
        try {
            const r = await API.post('/api/admin/mlflow/gc', { older_than_days: days });
            alert('정리 완료:\n\n' + (r.output || '').slice(-1500));
            await _refreshMLflowUsage();
        } catch (e) {
            alert('정리 실패: ' + e.message);
        } finally {
            btn.disabled = false; btn.textContent = '지금 정리';
        }
    });
}

async function _refreshCapacityPanel() {
    try {
        const cap = await API.get('/api/admin/cluster-capacity');
        const el = document.getElementById('capacity-panel');
        if (el) el.innerHTML = _renderCapacity(cap);
    } catch (e) {}
}

async function _refreshUserRow(ns) {
    try {
        const users = await API.get('/api/admin/users');
        const u = users.find(x => x.namespace === ns);
        if (!u) return;
        const row = document.querySelector(`tr[data-ns="${ns}"]`);
        if (!row) return;
        const setUsed = (field, val) => {
            const input = row.querySelector(`[data-field=${field}]`);
            if (!input) return;
            const usedDiv = input.parentElement.querySelector('.admin-used');
            if (usedDiv) usedDiv.textContent = `사용: ${val}`;
        };
        setUsed('cpu', u.used.cpu);
        setUsed('memory', u.used.memory);
        setUsed('gpu', u.used.gpu);
        setUsed('pvc', u.used.pvc);
    } catch (e) {}
}

function setupAdminPage() {
    if (_adminRefreshTimer) { clearInterval(_adminRefreshTimer); _adminRefreshTimer = null; }
    // 10초마다 클러스터 용량 + 사용량 refresh
    _adminRefreshTimer = setInterval(async () => {
        if (!document.getElementById('capacity-panel')) { clearInterval(_adminRefreshTimer); return; }
        await _refreshCapacityPanel();
        // 각 row 사용량도 갱신
        document.querySelectorAll('tr[data-ns]').forEach(r => _refreshUserRow(r.dataset.ns));
    }, 10000);

    // MLflow 사용량 패널 초기 로드
    _refreshMLflowUsage();

    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ns = btn.dataset.ns;
            const row = document.querySelector(`tr[data-ns="${ns}"]`);
            const data = {
                cpu: row.querySelector('[data-field=cpu]').value,
                memory: row.querySelector('[data-field=memory]').value,
                gpu: row.querySelector('[data-field=gpu]').value,
                pvc: row.querySelector('[data-field=pvc]').value,
                storage: row.querySelector('[data-field=storage]').value,
            };
            // 메모리 단위 검증
            const memErr = _validateMemory(data.memory);
            if (memErr) { alert(`메모리 입력 오류: ${memErr}`); return; }
            const storageErr = _validateMemory(data.storage);
            if (storageErr) { alert(`스토리지 입력 오류: ${storageErr}`); return; }
            // 오버커밋 경고
            const warn = await _checkOvercommit(ns, data);
            if (warn && !confirm(`⚠ 클러스터 용량 초과 경고\n\n${warn}\n\n그래도 저장하시겠습니까?`)) return;
            btn.disabled = true;
            btn.textContent = '저장 중...';
            try {
                const result = await API.put(`/api/admin/users/${ns}/quota`, data);
                if (result.status === 'updated') {
                    btn.textContent = '저장됨';
                    await _refreshCapacityPanel();
                    await _refreshUserRow(ns);
                    setTimeout(() => { btn.textContent = '저장'; btn.disabled = false; }, 2000);
                } else {
                    throw new Error(result.detail || '저장 실패');
                }
            } catch (e) {
                btn.textContent = '오류';
                alert('할당량 변경 실패: ' + e.message);
                setTimeout(() => { btn.textContent = '저장'; btn.disabled = false; }, 2000);
            }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const email = btn.dataset.email;
            if (!confirm(`정말 ${email} 사용자를 삭제하시겠습니까?\n\nProfile + namespace + 모든 노트북/PVC/모델이 영구 삭제됩니다.`)) return;
            if (!confirm(`다시 한번 확인합니다. ${email}의 모든 데이터가 삭제됩니다. 계속하시겠습니까?`)) return;
            btn.disabled = true;
            btn.textContent = '삭제 중...';
            try {
                const result = await fetch(API.base + `/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
                const data = await result.json();
                if (data.status === 'deleted') {
                    location.reload();
                } else {
                    throw new Error(data.detail || '삭제 실패');
                }
            } catch (e) {
                alert('삭제 실패: ' + e.message);
                btn.textContent = '삭제';
                btn.disabled = false;
            }
        });
    });

    const pwdModal = document.getElementById('pwd-modal');
    document.querySelectorAll('.pwd-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const email = btn.dataset.email;
            document.getElementById('pwd-target').textContent = email;
            document.getElementById('p-pwd').value = '';
            document.getElementById('p-temp').checked = true;
            document.getElementById('p-err').textContent = '';
            pwdModal.classList.remove('hidden');
            pwdModal.dataset.email = email;
        });
    });
    document.getElementById('p-cancel').addEventListener('click', () => pwdModal.classList.add('hidden'));
    document.getElementById('p-submit').addEventListener('click', async () => {
        const email = pwdModal.dataset.email;
        const password = document.getElementById('p-pwd').value;
        const temporary = document.getElementById('p-temp').checked;
        const errEl = document.getElementById('p-err');
        if (!password) { errEl.textContent = '비밀번호를 입력하세요'; return; }
        try {
            const r = await API.post(`/api/admin/users/${encodeURIComponent(email)}/reset-password`, { password, temporary });
            if (r.status === 'reset') {
                pwdModal.classList.add('hidden');
                alert('비밀번호 재설정 완료');
            } else {
                errEl.textContent = r.detail || '실패';
            }
        } catch (e) {
            errEl.textContent = e.message;
        }
    });

    const permModal = document.getElementById('perm-modal');

    async function refreshPermList(namespace) {
        const listEl = document.getElementById('perm-list');
        listEl.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:12px;">로딩 중...</div>';
        try {
            const contributors = await API.get(`/api/admin/users/${namespace}/contributors`);
            if (!contributors.length) {
                listEl.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:12px;">부여된 권한이 없습니다</div>';
                return;
            }
            listEl.innerHTML = contributors.map(c => {
                const orphanBadge = c.orphan
                    ? `<span style="margin-left:6px; padding:1px 6px; background:#fde2e2; color:#b91c1c; border-radius:3px; font-size:10px; font-weight:600;">삭제된 사용자</span>`
                    : '';
                const bg = c.orphan ? 'background:#fff5f5;' : '';
                return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #f0f0f0; ${bg}">
                    <div>
                        <div style="font-size:13px; font-weight:500;">${esc(c.email)}${orphanBadge}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${c.role === 'edit' ? '편집 권한' : '보기 권한'}</div>
                    </div>
                    <button class="pm-btn pm-btn-danger perm-del-btn" data-email="${esc(c.email)}" style="padding:4px 10px; font-size:11px;">제거</button>
                </div>`;
            }).join('');
            listEl.querySelectorAll('.perm-del-btn').forEach(b => {
                b.addEventListener('click', async () => {
                    const email = b.dataset.email;
                    if (!confirm(`${email}의 권한을 제거하시겠습니까?`)) return;
                    try {
                        const r = await fetch(API.base + `/api/admin/users/${namespace}/contributors/${encodeURIComponent(email)}`, { method: 'DELETE' });
                        const data = await r.json();
                        if (data.status === 'deleted') {
                            refreshPermList(namespace);
                        } else {
                            alert(data.detail || '제거 실패');
                        }
                    } catch (e) { alert(e.message); }
                });
            });
        } catch (e) {
            listEl.innerHTML = `<div style="padding:12px; color:#dc3545; font-size:12px;">${esc(e.message)}</div>`;
        }
    }

    document.querySelectorAll('.perm-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ns = btn.dataset.ns;
            const email = btn.dataset.email;
            permModal.dataset.ns = ns;
            document.getElementById('perm-target').innerHTML = `<b>${esc(ns)}</b> (owner: ${esc(email)})에 접근할 수 있는 사용자`;
            document.getElementById('perm-email').value = '';
            document.getElementById('perm-err').textContent = '';
            permModal.classList.remove('hidden');
            refreshPermList(ns);
        });
    });
    document.getElementById('perm-close').addEventListener('click', () => permModal.classList.add('hidden'));
    document.getElementById('perm-add').addEventListener('click', async () => {
        const ns = permModal.dataset.ns;
        const email = document.getElementById('perm-email').value.trim();
        const role = document.getElementById('perm-role').value;
        const errEl = document.getElementById('perm-err');
        errEl.textContent = '';
        if (!email) { errEl.textContent = '이메일을 입력하세요'; return; }
        try {
            const r = await API.post(`/api/admin/users/${ns}/contributors`, { email, role });
            if (r.status === 'created') {
                document.getElementById('perm-email').value = '';
                refreshPermList(ns);
            } else {
                errEl.textContent = r.detail || '추가 실패';
            }
        } catch (e) {
            errEl.textContent = e.message;
        }
    });

    const addModal = document.getElementById('add-modal');
    document.getElementById('add-user-btn').addEventListener('click', () => {
        ['m-email','m-fname','m-lname','m-pwd'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('m-err').textContent = '';
        addModal.classList.remove('hidden');
    });
    document.getElementById('m-cancel').addEventListener('click', () => addModal.classList.add('hidden'));
    document.getElementById('m-create').addEventListener('click', async () => {
        const errEl = document.getElementById('m-err');
        const data = {
            email: document.getElementById('m-email').value.trim(),
            first_name: document.getElementById('m-fname').value.trim(),
            last_name: document.getElementById('m-lname').value.trim(),
            password: document.getElementById('m-pwd').value,
            cpu: document.getElementById('m-cpu').value || '4',
            memory: document.getElementById('m-mem').value || '16Gi',
            gpu: document.getElementById('m-gpu').value || '1',
            pvc: document.getElementById('m-pvc').value || '3',
            storage: document.getElementById('m-storage').value || '50Gi',
        };
        if (!data.email || !data.password) { errEl.textContent = '이메일과 비밀번호는 필수입니다'; return; }
        const memErr = _validateMemory(data.memory);
        if (memErr) { errEl.textContent = memErr; return; }
        const storageErr = _validateMemory(data.storage);
        if (storageErr) { errEl.textContent = `스토리지: ${storageErr}`; return; }
        // 오버커밋 경고
        const warn = await _checkOvercommit(null, data);
        if (warn && !confirm(`⚠ 클러스터 용량 초과 경고\n\n${warn}\n\n그래도 추가하시겠습니까?`)) return;
        const btn = document.getElementById('m-create');
        btn.disabled = true; btn.textContent = '생성 중...';
        try {
            const r = await API.post('/api/admin/users', data);
            if (r.status === 'created') {
                addModal.classList.add('hidden');
                location.reload();
            } else {
                errEl.textContent = r.detail || '생성 실패';
                btn.disabled = false; btn.textContent = '생성';
            }
        } catch (e) {
            errEl.textContent = e.message;
            btn.disabled = false; btn.textContent = '생성';
        }
    });
}
