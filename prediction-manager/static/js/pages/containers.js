function _bindContainerActions() {
    document.querySelectorAll('.container-action-btn').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const name = btn.dataset.name;
            const namespace = btn.dataset.namespace;
            if (action === 'stop') stopContainer(name, namespace);
            else if (action === 'start') startContainer(name, namespace);
            else if (action === 'delete') deleteContainer(name, namespace);
        });
    });
}

async function renderContainers() {
    const containers = await API.get('/api/containers');
    setTimeout(_bindContainerActions, 0);

    return `
    <div class="pm-page-header" style="display:flex;justify-content:space-between;align-items:center">
        <div>
            <div class="pm-page-title">컨테이너 관리</div>
            <div class="pm-page-desc">Kubeflow Notebook 컨테이너를 생성하고 관리합니다</div>
        </div>
        <button class="pm-btn pm-btn-primary" onclick="navigate('containers-new')">+ 새 컨테이너 생성</button>
    </div>

    <table class="pm-table">
        <thead>
            <tr><th>이름</th><th>상태</th><th>이미지</th><th>CPU</th><th>메모리</th><th>GPU</th><th>생성일</th><th></th></tr>
        </thead>
        <tbody>
            ${containers.map(c => {
                const badge = c.status === 'Running' ? 'success' : c.status === 'Stopped' ? 'danger' : 'warning';
                const openLabel = c.open_label || (c.notebook_type === 'vscode' ? 'VSCode' : c.notebook_type === 'rstudio' ? 'RStudio' : 'Jupyter');
                return `
                <tr>
                    <td style="font-weight:500">${esc(c.name)}</td>
                    <td><span class="pm-badge pm-badge-${badge}">${esc(c.status)}</span></td>
                    <td class="pm-table-mono" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.image)}">${esc(c.image.split('/').pop())}</td>
                    <td>${esc(c.cpu)} Core</td>
                    <td>${esc(c.memory)}</td>
                    <td>${c.gpu > 0 ? `<span class="pm-badge pm-badge-info">GPU ${esc(c.gpu)}</span>` : '<span style="color:var(--text-muted)">-</span>'}</td>
                    <td style="color:var(--text-muted)">${esc(c.created.split('T')[0])}</td>
                    <td style="text-align:right">
                        <div style="display:flex;gap:4px;justify-content:flex-end">
                            ${c.status === 'Running' ? `
                                <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" class="pm-btn pm-btn-sm pm-btn-primary pm-open-app-btn" title="${esc(openLabel)} 열기">
                                    <span class="pm-open-default">열기</span>
                                    <span class="pm-open-type">${esc(openLabel)}</span>
                                </a>
                                <button class="pm-btn pm-btn-sm pm-btn-ghost container-action-btn" data-action="stop" data-name="${esc(c.name)}" data-namespace="${esc(c.namespace)}">중지</button>
                            ` : `
                                <button class="pm-btn pm-btn-sm pm-btn-success container-action-btn" data-action="start" data-name="${esc(c.name)}" data-namespace="${esc(c.namespace)}">시작</button>
                            `}
                            <button class="pm-btn pm-btn-sm pm-btn-danger container-action-btn" data-action="delete" data-name="${esc(c.name)}" data-namespace="${esc(c.namespace)}">삭제</button>
                        </div>
                    </td>
                </tr>`;
            }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">생성된 컨테이너가 없습니다</td></tr>'}
        </tbody>
    </table>
    `;
}

let _cfState = null;

async function renderContainersNew() {
    const [cfg, pvcs, podDefaults, userInfo] = await Promise.all([
        API.get('/api/containers/spawner-config').catch(() => ({})),
        API.get('/api/containers/pvcs').catch(() => []),
        API.get('/api/containers/pod-defaults').catch(() => []),
        API.get('/api/user-info').catch(() => ({namespace: ''})),
    ]);

    _cfState = {
        cfg, pvcs, podDefaults,
        namespace: userInfo.namespace || '',
        notebookType: 'jupyter',
        customImage: false,
        dataVolumes: [],
        envVars: [],
    };

    return `
    <style>
    /* ===== 컨테이너 생성 전체 페이지 ===== */
    .cc-page { max-width:760px; margin:0 auto; }
    .cc-page-head {
      display:flex; align-items:center; gap:10px;
      margin-bottom:24px; padding-bottom:14px; border-bottom:1px solid var(--border);
    }
    .cc-head-left {
      display:flex; align-items:center; gap:10px; min-width:0;
    }
    .cc-back {
      background:none; border:none; cursor:pointer;
      font-size:20px; padding:6px 12px;
      color:var(--text-secondary); border-radius:6px;
    }
    .cc-back:hover { background:var(--bg-hover); color:var(--text); }
    .cc-head-title { font-size:20px; font-weight:600; color:var(--text); }
    .cc-head-sub { font-size:12px; color:var(--text-muted); margin-top:2px; }
    .cc-namespace-pill {
      display:none; flex:0 1 auto; max-width:420px; padding:7px 10px; border:1px solid var(--border);
      border-radius:999px; background:#fff; color:var(--text-muted); font-size:11px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .cc-namespace-pill strong { color:var(--text-secondary); font-weight:600; }

    .cc-main-grid {
      display:grid; grid-template-columns:1fr;
      gap:14px; align-items:start;
    }
    .cc-stack { display:contents; }

    .cc-card {
      background:#fff; border:1px solid var(--border);
      border-radius:10px; padding:18px 20px;
    }
    .cc-card-primary { order:1; }
    .cc-resource-card { order:2; }
    .cc-stack:first-child .cc-card:not(.cc-card-primary) { order:3; }
    .cc-advanced { order:4; }
    .cc-card-title {
      font-size:14px; font-weight:600; color:var(--text); margin-bottom:14px;
      display:flex; align-items:center; justify-content:space-between; gap:10px;
    }
    .cc-card-title-spaced { margin-top:18px; padding-top:16px; border-top:1px solid var(--border); }
    .cc-card-title small { color:var(--text-muted); font-size:11px; font-weight:400; }

    .cc-field { margin-bottom:14px; }
    .cc-field:last-child { margin-bottom:0; }
    .cc-label { display:block; font-size:11px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px; }
    .cc-label .req { color:var(--danger); }
    .cc-input, .cc-select {
      width:100%; padding:9px 11px; border:1px solid var(--border);
      border-radius:6px; font-size:13px; box-sizing:border-box;
      font-family:inherit; background:#fff;
    }
    .cc-input:focus, .cc-select:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-bg); }
    .cc-mono { font-family:var(--font-mono); font-size:12px; }

    .cc-essential-grid { display:grid; grid-template-columns:1fr; gap:0; align-items:start; }
    .cc-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .cc-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
    .cc-resource-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }

    .cc-type-row {
      display:grid; grid-template-columns:repeat(3,1fr); gap:6px;
      padding:4px; background:#f5f7fa; border-radius:8px;
    }
    .cc-type-btn {
      padding:10px; text-align:center; border-radius:6px;
      cursor:pointer; font-size:12px; color:var(--text-secondary);
      background:transparent; border:none; font-weight:500;
    }
    .cc-type-btn:hover { background:#eef1f6; }
    .cc-type-btn.active { background:#fff; color:var(--accent); box-shadow:0 1px 3px rgba(0,0,0,0.06); }
    .cc-type-btn .icon { display:block; margin:0 auto 4px; }

    .cc-chip-row { display:flex; gap:4px; flex-wrap:wrap; }
    .cc-chip {
      padding:6px 12px; border:1px solid var(--border);
      border-radius:6px; font-size:12px; cursor:pointer;
      background:#fff; color:var(--text-secondary);
      font-family:var(--font-mono);
    }
    .cc-chip:hover { border-color:var(--accent); }
    .cc-chip.active { background:var(--accent-bg); border-color:var(--accent); color:var(--accent); font-weight:600; }

    .cc-item {
      border:1px solid var(--border); border-radius:6px;
      padding:10px 12px; margin-bottom:8px; background:#fafbfd;
    }
    .cc-item-head {
      display:flex; justify-content:space-between; align-items:center;
      margin-bottom:8px;
    }
    .cc-item-title { font-size:12px; font-weight:600; color:var(--text); }
    .cc-icon-btn {
      background:none; border:none; cursor:pointer;
      color:var(--text-muted); padding:2px 6px; border-radius:4px; font-size:14px;
    }
    .cc-icon-btn:hover { background:var(--bg-hover); color:var(--danger); }

    .cc-outline-btn {
      width:100%; padding:8px; background:#fff;
      border:1px dashed var(--border); border-radius:6px;
      color:var(--text-secondary); font-size:12px;
      cursor:pointer; font-family:inherit;
    }
    .cc-outline-btn:hover { border-color:var(--accent); color:var(--accent); }

    .cc-toggle {
      display:inline-flex; align-items:center; gap:8px; cursor:pointer;
      font-size:12px; color:var(--text);
    }
    .cc-toggle input { margin:0; }
    .cc-hint { font-size:11px; color:var(--text-muted); margin-top:4px; }
    .cc-inline-label { font-size:11px; color:var(--text-muted); margin-left:6px; }

    .cc-advanced {
      background:#fff; border:1px solid var(--border); border-radius:10px; overflow:hidden;
    }
    .cc-advanced summary {
      list-style:none; cursor:pointer; padding:16px 20px;
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      font-size:14px; font-weight:600; color:var(--text);
    }
    .cc-advanced summary::-webkit-details-marker { display:none; }
    .cc-advanced summary::after {
      content:'+'; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center;
      border-radius:50%; background:var(--bg); color:var(--text-secondary); font-size:16px; flex-shrink:0;
    }
    .cc-advanced[open] summary { border-bottom:1px solid var(--border); }
    .cc-advanced[open] summary::after { content:'-'; }
    .cc-advanced small { color:var(--text-muted); font-size:11px; font-weight:400; }
    .cc-advanced-body { padding:18px 20px; }

    .cc-footer {
      display:flex; gap:8px; justify-content:flex-end; align-items:center;
      padding:4px 0 20px;
    }
    .cc-error {
      color:var(--danger); font-size:12px; margin-right:auto;
      background:#fef2f2; padding:8px 12px; border-radius:6px;
    }
    .cc-error:empty { display:none; }
    .cc-btn {
      padding:9px 20px; border-radius:6px; border:1px solid var(--border);
      background:#fff; cursor:pointer; font-size:13px; font-weight:500;
    }
    .cc-btn:hover { background:var(--bg-hover); }
    .cc-btn-primary {
      background:var(--accent); color:#fff; border-color:var(--accent);
    }
    .cc-btn-primary:hover { background:var(--accent-light); }
    .cc-btn-primary:disabled { background:#c8cdd5; border-color:#c8cdd5; cursor:not-allowed; }

    @media (max-width: 980px) {
      .cc-main-grid, .cc-essential-grid { grid-template-columns:1fr; }
      .cc-namespace-pill { display:none; }
    }
    @media (max-width: 720px) {
      .cc-page-head { align-items:center; }
      .cc-row-2, .cc-row-3, .cc-resource-grid { grid-template-columns:1fr; }
      .cc-footer { flex-wrap:wrap; }
      .cc-footer .cc-error { width:100%; margin-right:0; }
      .cc-btn { flex:1; justify-content:center; }
    }
    </style>

    <div class="cc-page">

      <div class="cc-page-head">
        <div class="cc-head-left">
          <button class="cc-back" onclick="navigate('containers')" title="뒤로">←</button>
          <div>
            <div class="cc-head-title">새 컨테이너 생성</div>
            <div class="cc-head-sub">Namespace: ${esc(_cfState.namespace)}</div>
          </div>
        </div>
        <div class="cc-namespace-pill">Namespace <strong>${esc(_cfState.namespace)}</strong></div>
      </div>

      <div class="cc-main-grid">
        <div class="cc-stack">
          <div class="cc-card cc-card-primary">
            <div class="cc-card-title">
              <span>기본 정보</span>
            </div>
            <div class="cc-essential-grid">
              <div class="cc-field">
                <label class="cc-label">이름 <span class="req">*</span></label>
                <input class="cc-input cc-mono" id="cc-name" placeholder="my-notebook" />
              </div>

              <div class="cc-field">
                <label class="cc-label">유형</label>
                <div class="cc-type-row" id="cc-type-row">
                  <button type="button" class="cc-type-btn active" data-type="jupyter">
                    <svg class="icon" viewBox="0 0 60 60" width="22" height="22" aria-hidden="true">
                      <g fill="#F37626">
                        <circle cx="12" cy="10" r="3.2"/>
                        <circle cx="46" cy="50" r="3.2"/>
                        <path d="M30 46c-9.5 0-17.5-5.3-21.3-12.9-.4-.8.6-1.6 1.3-1C14.2 37.3 21.6 41 30 41s15.8-3.7 20-8.9c.7-.6 1.7.2 1.3 1C47.5 40.7 39.5 46 30 46z"/>
                        <path d="M30 14c9.5 0 17.5 5.3 21.3 12.9.4.8-.6 1.6-1.3 1C45.8 22.7 38.4 19 30 19s-15.8 3.7-20 8.9c-.7.6-1.7-.2-1.3-1C12.5 19.3 20.5 14 30 14z"/>
                      </g>
                    </svg>
                    JupyterLab
                  </button>
                  <button type="button" class="cc-type-btn" data-type="vscode">
                    <svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" fill="#0078D4"/>
                    </svg>
                    VS Code
                  </button>
                  <button type="button" class="cc-type-btn" data-type="rstudio">
                    <svg class="icon" viewBox="0 0 100 100" width="22" height="22" aria-hidden="true">
                      <defs>
                        <linearGradient id="rsg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stop-color="#4D8DCD"/>
                          <stop offset="1" stop-color="#75AADB"/>
                        </linearGradient>
                      </defs>
                      <ellipse cx="50" cy="40" rx="42" ry="28" fill="url(#rsg)"/>
                      <path d="M50 68v22M30 82c6 4 14 6 20 6s14-2 20-6" fill="none" stroke="#4D8DCD" stroke-width="6" stroke-linecap="round"/>
                      <path d="M28 30h20c6 0 10 4 10 8s-4 8-10 8h-8l10 12h-8l-10-12h-4v12h-8V30z" fill="#fff"/>
                    </svg>
                    RStudio
                  </button>
                </div>
              </div>
            </div>

            <div class="cc-field">
              <label class="cc-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>이미지</span>
                <label class="cc-toggle" style="font-weight:normal; text-transform:none; letter-spacing:0;">
                  <input type="checkbox" id="cc-custom-img-toggle"> 커스텀 URL
                </label>
              </label>
              <select class="cc-select cc-mono" id="cc-image-select"></select>
              <input class="cc-input cc-mono" id="cc-image-custom" placeholder="예: ghcr.io/.../jupyter-scipy:v1.10.0" style="display:none;" />
            </div>

            <div class="cc-field">
              <label class="cc-label">이미지 다운로드 정책</label>
              <select class="cc-select" id="cc-pull-policy">
                <option value="IfNotPresent">IfNotPresent - 로컬에 없을 때만 다운로드 (권장)</option>
                <option value="Always">Always - 항상 최신 이미지 다운로드 (latest 태그 쓸 때)</option>
                <option value="Never">Never - 다운로드 안 함, 로컬 이미지만 사용</option>
              </select>
            </div>
          </div>

          <div class="cc-card">
            <div class="cc-card-title">Workspace 볼륨</div>
            <label class="cc-toggle" style="margin-bottom:10px;">
              <input type="checkbox" id="cc-ws-disable"> 사용 안 함
            </label>
            <div id="cc-ws-body">
              <div class="cc-row-2">
                <div>
                  <span class="cc-inline-label" style="margin-left:0;">타입</span>
                  <select class="cc-select" id="cc-ws-type">
                    <option value="new">신규 생성</option>
                    <option value="existing">기존 PVC</option>
                  </select>
                </div>
                <div>
                  <span class="cc-inline-label" style="margin-left:0;">마운트 경로</span>
                  <input class="cc-input cc-mono" id="cc-ws-mount" value="/home/jovyan" />
                </div>
              </div>
              <div class="cc-row-3" id="cc-ws-new-fields" style="margin-top:8px;">
                <div>
                  <span class="cc-inline-label" style="margin-left:0;">이름 (자동)</span>
                  <input class="cc-input cc-mono" id="cc-ws-name" placeholder="자동" />
                </div>
                <div>
                  <span class="cc-inline-label" style="margin-left:0;">크기</span>
                  <input class="cc-input cc-mono" id="cc-ws-size" value="5Gi" />
                </div>
                <div>
                  <span class="cc-inline-label" style="margin-left:0;">Storage Class</span>
                  <input class="cc-input cc-mono" id="cc-ws-sc" value="local-path" />
                </div>
              </div>
              <div id="cc-ws-existing-fields" style="display:none; margin-top:8px;">
                <span class="cc-inline-label" style="margin-left:0;">기존 PVC</span>
                <select class="cc-select" id="cc-ws-pvc">
                  ${pvcs.map(p => `<option value="${esc(p.name)}">${esc(p.name)} (${esc(p.size)})</option>`).join('') || '<option value="">(PVC 없음)</option>'}
                </select>
              </div>
              <div id="cc-ws-am-wrap" style="margin-top:8px;">
                <span class="cc-inline-label" style="margin-left:0;">Access Mode</span>
                <select class="cc-select" id="cc-ws-am">
                  <option value="ReadWriteOnce">ReadWriteOnce</option>
                  <option value="ReadWriteMany">ReadWriteMany</option>
                  <option value="ReadOnlyMany">ReadOnlyMany</option>
                </select>
              </div>
            </div>
          </div>

          <div class="cc-card">
            <div class="cc-card-title">
              <span>데이터 볼륨 <span style="color:var(--text-muted); font-weight:normal; font-size:12px;" id="cc-dv-count">(0개)</span></span>
            </div>
            <div id="cc-dv-list"></div>
            <div class="cc-row-2" style="margin-top:8px;">
              <button class="cc-outline-btn" onclick="_ccAddDv('new')">+ 새 볼륨</button>
              <button class="cc-outline-btn" onclick="_ccAddDv('existing')">+ 기존 PVC 연결</button>
            </div>
          </div>
        </div>

        <div class="cc-stack">
          <div class="cc-card cc-resource-card">
            <div class="cc-card-title">리소스</div>
            <div class="cc-resource-grid">
              <div>
                <span class="cc-inline-label" style="margin-left:0;">CPU Min</span>
                <input class="cc-input cc-mono" id="cc-cpu-req" value="0.5" />
              </div>
              <div>
                <span class="cc-inline-label" style="margin-left:0;">CPU Max</span>
                <input class="cc-input cc-mono" id="cc-cpu-lim" value="0.6" />
              </div>
              <div>
                <span class="cc-inline-label" style="margin-left:0;">Memory Min</span>
                <input class="cc-input cc-mono" id="cc-mem-req" value="1Gi" />
              </div>
              <div>
                <span class="cc-inline-label" style="margin-left:0;">Memory Max</span>
                <input class="cc-input cc-mono" id="cc-mem-lim" value="1.2Gi" />
              </div>
            </div>
            <div class="cc-hint" style="margin-top:10px;">Max 미입력 시 Min × ${esc(cfg.cpu?.limitFactor || '1.2')} 자동 계산</div>

            <div class="cc-field" style="margin-top:14px;">
              <label class="cc-label">GPU</label>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div class="cc-chip-row" id="cc-gpu-chips">
                  <button type="button" class="cc-chip active" data-gpu="0">없음</button>
                  <button type="button" class="cc-chip" data-gpu="1">1</button>
                  <button type="button" class="cc-chip" data-gpu="2">2</button>
                  <button type="button" class="cc-chip" data-gpu="4">4</button>
                  <button type="button" class="cc-chip" data-gpu="8">8</button>
                </div>
                <select class="cc-select" id="cc-gpu-vendor" style="min-width:150px; flex:1;">
                  ${(cfg.gpus?.value?.vendors || []).map(v => `<option value="${esc(v.limitsKey)}">${esc(v.uiName)}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <details class="cc-advanced">
            <summary>
              <span>고급 설정</span>
              <small>런타임, 환경 변수, 스케줄링</small>
            </summary>
            <div class="cc-advanced-body">
              <div class="cc-card-title">런타임 동작</div>

              <div class="cc-field" style="margin-bottom:16px;">
                <label class="cc-toggle" style="font-size:13px;">
                  <input type="checkbox" id="cc-shm" checked>
                  <b>Shared Memory 활성화</b>
                </label>
                <div class="cc-hint" style="margin-left:22px; margin-top:2px;">
                  <code>/dev/shm</code> 메모리 파일시스템 마운트
                </div>
              </div>

              <div class="cc-field">
                <label class="cc-label">환경 변수</label>
                <div id="cc-env-list"></div>
                <button class="cc-outline-btn" style="margin-top:8px;" onclick="_cfAddEnvVar()">+ 환경 변수 추가</button>
              </div>

              ${(() => {
                const hasPd = podDefaults.length > 0;
                const hasAff = (cfg.affinityConfig?.options || []).length > 0;
                const hasTol = (cfg.tolerationGroup?.options || []).length > 0;
                if (!hasPd && !hasAff && !hasTol) {
                  // 전부 비어있으면 숨김 + 백엔드 전송용 hidden input만 둠
                  return `
                  <input type="hidden" id="cc-pd" value="">
                  <input type="hidden" id="cc-affinity" value="">
                  <input type="hidden" id="cc-toleration" value="">`;
                }
                return `
                <div class="cc-card-title cc-card-title-spaced">
                  <span>스케줄링 · 사전 설정</span>
                  <small>관리자 구성</small>
                </div>
                ${hasPd ? `
                  <div class="cc-field">
                    <label class="cc-label">사전 설정 (PodDefault)</label>
                    <select class="cc-select" id="cc-pd">
                      <option value="">(사용 안 함)</option>
                      ${podDefaults.map(pd => `<option value="${esc(pd.name)}">${esc(pd.name)}</option>`).join('')}
                    </select>
                  </div>
                ` : '<input type="hidden" id="cc-pd" value="">'}
                ${(hasAff || hasTol) ? `
                  <div class="cc-row-2" style="margin-top:12px;">
                    ${hasAff ? `
                      <div>
                        <label class="cc-label">배치 노드 (Affinity)</label>
                        <select class="cc-select" id="cc-affinity">
                          <option value="">(없음)</option>
                          ${(cfg.affinityConfig?.options || []).map(o => `<option value="${esc(o.configKey)}">${esc(o.displayName || o.configKey)}</option>`).join('')}
                        </select>
                      </div>
                    ` : '<input type="hidden" id="cc-affinity" value="">'}
                    ${hasTol ? `
                      <div>
                        <label class="cc-label">테인트 허용 (Toleration)</label>
                        <select class="cc-select" id="cc-toleration">
                          <option value="">(없음)</option>
                          ${(cfg.tolerationGroup?.options || []).map(o => `<option value="${esc(o.groupKey)}">${esc(o.displayName || o.groupKey)}</option>`).join('')}
                        </select>
                      </div>
                    ` : '<input type="hidden" id="cc-toleration" value="">'}
                  </div>
                ` : '<input type="hidden" id="cc-affinity" value=""><input type="hidden" id="cc-toleration" value="">'}
                `;
              })()}
            </div>
          </details>
        </div>
      </div>

      <div class="cc-footer">
        <div class="cc-error" id="cc-error"></div>
        <button class="cc-btn" onclick="navigate('containers')">취소</button>
        <button class="cc-btn cc-btn-primary" id="cc-submit" onclick="createContainer()">생성</button>
      </div>

    </div>
    `;
}

function setupContainersNewPage() {
    const cfg = _cfState.cfg;
    _cfRefreshImageOptions();
    document.getElementById('cc-pull-policy').value = cfg.imagePullPolicy?.value || 'IfNotPresent';
    document.getElementById('cc-cpu-req').value = cfg.cpu?.value || '0.5';
    document.getElementById('cc-mem-req').value = cfg.memory?.value || '1Gi';
    document.getElementById('cc-gpu-vendor').value = cfg.gpus?.value?.vendor || 'nvidia.com/gpu';
    _cfUpdateAutoLimits();

    document.querySelectorAll('#cc-type-row .cc-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#cc-type-row .cc-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _cfState.notebookType = btn.dataset.type;
            _cfRefreshImageOptions();
        });
    });

    document.getElementById('cc-custom-img-toggle').addEventListener('change', (e) => {
        _cfState.customImage = e.target.checked;
        document.getElementById('cc-image-select').style.display = e.target.checked ? 'none' : '';
        document.getElementById('cc-image-custom').style.display = e.target.checked ? '' : 'none';
    });

    document.querySelectorAll('#cc-gpu-chips .cc-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#cc-gpu-chips .cc-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });

    document.getElementById('cc-cpu-req').addEventListener('input', _cfUpdateAutoLimits);
    document.getElementById('cc-mem-req').addEventListener('input', _cfUpdateAutoLimits);

    document.getElementById('cc-ws-disable').addEventListener('change', (e) => {
        document.getElementById('cc-ws-body').style.display = e.target.checked ? 'none' : '';
    });
    document.getElementById('cc-ws-type').addEventListener('change', (e) => {
        const isNew = e.target.value === 'new';
        document.getElementById('cc-ws-new-fields').style.display = isNew ? '' : 'none';
        document.getElementById('cc-ws-existing-fields').style.display = isNew ? 'none' : '';
        document.getElementById('cc-ws-am-wrap').style.display = isNew ? '' : 'none';
    });

    _ccRenderDataVolumes();
    _cfRenderEnvVars();
}

function _cfRefreshImageOptions() {
    const cfg = _cfState.cfg;
    const sel = document.getElementById('cc-image-select');
    if (!sel) return;
    let opts = [], defaultVal = '';
    if (_cfState.notebookType === 'jupyter') {
        opts = cfg.image?.options || []; defaultVal = cfg.image?.value || '';
    } else if (_cfState.notebookType === 'vscode') {
        opts = cfg.imageGroupOne?.options || []; defaultVal = cfg.imageGroupOne?.value || '';
    } else if (_cfState.notebookType === 'rstudio') {
        opts = cfg.imageGroupTwo?.options || []; defaultVal = cfg.imageGroupTwo?.value || '';
    }
    sel.innerHTML = opts.map(o => `<option value="${esc(o)}" ${o === defaultVal ? 'selected' : ''}>${esc(o)}</option>`).join('') || '<option value="">(이미지 없음)</option>';
}

function _cfUpdateAutoLimits() {
    const cpuFactor = parseFloat(_cfState.cfg.cpu?.limitFactor || '1.2');
    const memFactor = parseFloat(_cfState.cfg.memory?.limitFactor || '1.2');
    const cpuReq = parseFloat(document.getElementById('cc-cpu-req').value) || 0;
    document.getElementById('cc-cpu-lim').value = (cpuReq * cpuFactor).toFixed(2);
    const memStr = document.getElementById('cc-mem-req').value.trim();
    const m = memStr.match(/^([\d.]+)\s*(Gi|Mi|Ki|Ti|G|M|K|T|)$/i);
    if (m) {
        document.getElementById('cc-mem-lim').value = (parseFloat(m[1]) * memFactor).toFixed(2) + (m[2] || 'Gi');
    }
}

function _ccAddDv(source) {
    _cfState.dataVolumes.push({
        source, name: '', size: '5Gi',
        storage_class: 'local-path', access_mode: 'ReadWriteOnce',
        mount_path: `/home/jovyan/datavol-${_cfState.dataVolumes.length + 1}`,
    });
    _ccRenderDataVolumes();
}

function _cfRemoveDataVolume(idx) {
    _cfState.dataVolumes.splice(idx, 1);
    _ccRenderDataVolumes();
}

function _ccRenderDataVolumes() {
    const el = document.getElementById('cc-dv-list');
    if (!el) return;
    document.getElementById('cc-dv-count').textContent = `(${_cfState.dataVolumes.length}개)`;
    if (!_cfState.dataVolumes.length) {
        el.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:4px 0;">아직 없음</div>';
        return;
    }
    el.innerHTML = _cfState.dataVolumes.map((v, i) => {
        const pvcOpts = _cfState.pvcs.map(p => `<option value="${esc(p.name)}" ${v.name === p.name ? 'selected' : ''}>${esc(p.name)} (${esc(p.size)})</option>`).join('');
        return `
        <div class="cc-item">
          <div class="cc-item-head">
            <span class="cc-item-title">${v.source === 'new' ? '신규' : '기존'} #${i + 1}</span>
            <button class="cc-icon-btn" onclick="_cfRemoveDataVolume(${i})">×</button>
          </div>
          ${v.source === 'new' ? `
            <div class="cc-row-2">
              <input class="cc-input cc-mono" placeholder="이름 (자동)" value="${esc(v.name)}" oninput="_cfSetDv(${i},'name',this.value)" />
              <input class="cc-input cc-mono" placeholder="크기" value="${esc(v.size)}" oninput="_cfSetDv(${i},'size',this.value)" />
            </div>
            <div class="cc-row-2" style="margin-top:6px;">
              <select class="cc-select" onchange="_cfSetDv(${i},'access_mode',this.value)">
                <option value="ReadWriteOnce" ${v.access_mode === 'ReadWriteOnce' ? 'selected' : ''}>ReadWriteOnce</option>
                <option value="ReadWriteMany" ${v.access_mode === 'ReadWriteMany' ? 'selected' : ''}>ReadWriteMany</option>
                <option value="ReadOnlyMany" ${v.access_mode === 'ReadOnlyMany' ? 'selected' : ''}>ReadOnlyMany</option>
              </select>
              <input class="cc-input cc-mono" placeholder="마운트 경로" value="${esc(v.mount_path)}" oninput="_cfSetDv(${i},'mount_path',this.value)" />
            </div>
          ` : `
            <div class="cc-row-2">
              <select class="cc-select" onchange="_cfSetDv(${i},'name',this.value)">
                <option value="">(PVC 선택)</option>${pvcOpts}
              </select>
              <input class="cc-input cc-mono" placeholder="마운트 경로" value="${esc(v.mount_path)}" oninput="_cfSetDv(${i},'mount_path',this.value)" />
            </div>
          `}
        </div>`;
    }).join('');
}

function _cfSetDv(idx, key, val) {
    _cfState.dataVolumes[idx][key] = val;
}

function _cfAddEnvVar() {
    _cfState.envVars.push({ name: '', value: '' });
    _cfRenderEnvVars();
}

function _cfRemoveEnvVar(idx) {
    _cfState.envVars.splice(idx, 1);
    _cfRenderEnvVars();
}

function _cfRenderEnvVars() {
    const el = document.getElementById('cc-env-list');
    if (!el) return;
    if (!_cfState.envVars.length) {
        el.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:4px 0;">없음</div>';
        return;
    }
    el.innerHTML = _cfState.envVars.map((v, i) => `
      <div style="display:grid; grid-template-columns:1fr 1fr auto; gap:6px; margin-bottom:6px;">
        <input class="cc-input cc-mono" placeholder="KEY" value="${esc(v.name)}" oninput="_cfState.envVars[${i}].name=this.value" />
        <input class="cc-input cc-mono" placeholder="값" value="${esc(v.value)}" oninput="_cfState.envVars[${i}].value=this.value" />
        <button class="cc-icon-btn" onclick="_cfRemoveEnvVar(${i})">×</button>
      </div>`).join('');
}

async function createContainer() {
    const errEl = document.getElementById('cc-error');
    errEl.textContent = '';
    const name = document.getElementById('cc-name').value.trim();
    if (!name) { errEl.textContent = '이름을 입력하세요'; return; }
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) { errEl.textContent = '이름: 소문자/숫자/하이픈, 시작·끝은 영숫자'; return; }

    const customImg = _cfState.customImage;
    const image = customImg
        ? document.getElementById('cc-image-custom').value.trim()
        : document.getElementById('cc-image-select').value;
    if (!image) { errEl.textContent = '이미지를 선택하거나 URL을 입력하세요'; return; }

    const gpuActive = document.querySelector('#cc-gpu-chips .cc-chip.active');
    const gpuNum = gpuActive ? parseInt(gpuActive.dataset.gpu) : 0;

    const wsDisabled = document.getElementById('cc-ws-disable').checked;
    const wsType = document.getElementById('cc-ws-type').value;
    const wsSource = wsDisabled ? 'none' : wsType;

    const body = {
        name,
        notebook_type: _cfState.notebookType,
        image: customImg ? '' : image,
        custom_image: customImg ? image : null,
        image_pull_policy: document.getElementById('cc-pull-policy').value,
        cpu_request: document.getElementById('cc-cpu-req').value.trim() || '0.5',
        cpu_limit: document.getElementById('cc-cpu-lim').value.trim() || '1',
        memory_request: document.getElementById('cc-mem-req').value.trim() || '1Gi',
        memory_limit: document.getElementById('cc-mem-lim').value.trim() || '2Gi',
        gpu_count: gpuNum,
        gpu_vendor: document.getElementById('cc-gpu-vendor').value || 'nvidia.com/gpu',
        workspace_source: wsSource,
        workspace_name: wsSource === 'existing'
            ? document.getElementById('cc-ws-pvc').value
            : document.getElementById('cc-ws-name').value.trim(),
        workspace_size: document.getElementById('cc-ws-size').value.trim() || '5Gi',
        workspace_storage_class: document.getElementById('cc-ws-sc').value.trim() || 'local-path',
        workspace_access_mode: document.getElementById('cc-ws-am').value,
        workspace_mount_path: document.getElementById('cc-ws-mount').value.trim() || '/home/jovyan',
        data_volumes: _cfState.dataVolumes,
        affinity_config: document.getElementById('cc-affinity').value,
        toleration_group: document.getElementById('cc-toleration').value,
        enable_shared_memory: document.getElementById('cc-shm').checked,
        pod_defaults: [document.getElementById('cc-pd').value].filter(Boolean),
        env_vars: _cfState.envVars.filter(v => v.name),
    };

    const btn = document.getElementById('cc-submit');
    btn.disabled = true;
    btn.textContent = '생성 중...';

    try {
        const r = await API.post('/api/containers', body);
        if (r.status === 'created') {
            navigate('containers');
        } else {
            errEl.textContent = r.detail || '생성 실패';
            btn.disabled = false;
            btn.textContent = '생성';
        }
    } catch (e) {
        errEl.textContent = '생성 실패: ' + e.message;
        btn.disabled = false;
        btn.textContent = '생성';
    }
}

async function stopContainer(name, namespace) {
    if (!confirm(`${name} 컨테이너를 중지하시겠습니까?`)) return;
    try {
        await API.patch(`/api/containers/${name}/stop`, namespace);
        navigate('containers');
    } catch (e) {
        alert('컨테이너 중지 실패: ' + e.message);
    }
}

async function startContainer(name, namespace) {
    try {
        await API.patch(`/api/containers/${name}/start`, namespace);
        navigate('containers');
    } catch (e) {
        alert('컨테이너 시작 실패: ' + e.message);
    }
}

async function deleteContainer(name, namespace) {
    if (!confirm(`${name} 컨테이너를 삭제하시겠습니까?\n워크스페이스 볼륨도 함께 삭제됩니다.`)) return;
    try {
        await API.del(`/api/containers/${name}`, namespace);
        navigate('containers');
    } catch (e) {
        alert('컨테이너 삭제 실패: ' + e.message);
    }
}
