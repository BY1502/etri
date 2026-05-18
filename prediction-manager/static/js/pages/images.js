let baseOptions = [];

const packagePresets = [
    { id: 'raytune', label: 'Ray Tune + Optuna', desc: 'AutoML / 하이퍼파라미터 튜닝', pip: '"ray[tune,client]==2.54.1" optuna' },
    { id: 'mlflow', label: 'MLflow', desc: '실험 관리 / 모델 버전 관리', pip: '"mlflow>=3.0"' },
    { id: 'sklearn', label: 'scikit-learn', desc: '전통적 ML 알고리즘', pip: 'scikit-learn' },
    { id: 'xgboost', label: 'XGBoost + LightGBM', desc: '그래디언트 부스팅', pip: 'xgboost lightgbm' },
    { id: 'tensorboard', label: 'TensorBoard', desc: '학습 시각화', pip: 'tensorboard' },
    { id: 'pandas', label: 'Pandas + Matplotlib', desc: '데이터 분석 / 시각화', pip: 'pandas numpy matplotlib seaborn' },
    { id: 'opencv', label: 'OpenCV', desc: '이미지/영상 처리', pip: 'opencv-python-headless' },
    { id: 'huggingface', label: 'HuggingFace', desc: 'NLP / LLM', pip: 'transformers datasets' },
    { id: 'ipython', label: 'IPython + ipywidgets', desc: 'Jupyter 확장', pip: 'ipython ipywidgets' },
];

function _bindImageActions() {
    document.querySelectorAll('.image-delete-btn').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => deleteImage(
            btn.dataset.name,
            btn.dataset.tag,
            btn.dataset.protected === '1',
            btn.dataset.desc || '',
        ));
    });
}

async function renderImages() {
    const images = await API.get('/api/images');
    baseOptions = await API.get('/api/images/base-options');
    setTimeout(_bindImageActions, 0);

    const rows = images.flatMap(img => {
        const tags = img.tags || [];
        const common = {
            name: img.name,
            type: img.type || 'user',
            category: img.category || '',
            description: img.description || '',
            protected: !!img.protected,
            owner_namespace: img.owner_namespace || '',
            compatible_types: img.compatible_types || [],
            can_delete: !!img.can_delete,
            can_use: img.can_use !== false,
        };
        if ((img.type || 'user') === 'system') {
            return [{
                ...common,
                tag: tags.length === 1 ? tags[0] : `태그 ${tags.length}개`,
                tags,
                grouped: tags.length > 1,
            }];
        }
        return tags.map(tag => ({
            ...common,
            tag,
            tags: [tag],
            grouped: false,
        }));
    });

    return `
    <div class="pm-page-header" style="display:flex;justify-content:space-between;align-items:center">
        <div>
            <div class="pm-page-title">Docker 이미지 관리</div>
            <div class="pm-page-desc">ML/DL 개발 환경 이미지를 빌드하고 관리합니다</div>
        </div>
        <button class="pm-btn pm-btn-primary" onclick="showBuildForm()">+ 새 이미지 빌드</button>
    </div>

    <table class="pm-table">
        <thead><tr><th>이미지 이름</th><th>구분</th><th>소유</th><th>호환</th><th>태그</th><th>레지스트리</th><th></th></tr></thead>
        <tbody>
            ${rows.map(r => {
                const badgeMap = {
                    system:  { color:'#dbeafe', text:'#1e40af', label:'시스템' },
                    user:    { color:'#dcfce7', text:'#166534', label:'사용자' },
                    orphan:  { color:'#fef3c7', text:'#92400e', label:'미분류' },
                };
                const b = badgeMap[r.type] || badgeMap.user;
                const catLabel = r.category ? ` · ${r.category}` : '';
                const tooltip = r.description || '';
                const ownerLabel = r.owner_namespace || (r.type === 'system' ? 'system' : '-');
                const runtimeLabelMap = { jupyter: 'Jupyter', vscode: 'VSCode', rstudio: 'RStudio' };
                const runtimeLabel = r.compatible_types.length
                    ? r.compatible_types.map(t => runtimeLabelMap[t] || t).join(', ')
                    : '-';
                const tagTitle = r.grouped ? r.tags.join(', ') : '';
                const registryLabel = r.grouped
                    ? `localhost:5000/${r.name}`
                    : `localhost:5000/${r.name}:${r.tag}`;
                let actionLabel = `<span style="color:var(--text-muted); font-size:12px;" title="${esc(tooltip)}">시스템</span>`;
                if (!r.protected && r.can_delete) {
                    actionLabel = `<button class="pm-btn pm-btn-sm pm-btn-danger image-delete-btn" data-name="${esc(r.name)}" data-tag="${esc(r.tag)}" data-protected="0" data-desc="${esc(tooltip)}">삭제</button>`;
                } else if (!r.protected && r.can_use) {
                    actionLabel = `<span style="color:var(--success); font-size:12px;" title="호환 유형의 컨테이너 생성에서 사용할 수 있습니다. 삭제는 생성자만 가능합니다.">사용 가능</span>`;
                } else if (!r.protected) {
                    actionLabel = `<span style="color:var(--text-muted); font-size:12px;">관리 불가</span>`;
                }
                return `
                <tr>
                    <td style="font-weight:500">${esc(r.name)}</td>
                    <td>
                        <span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; background:${b.color}; color:${b.text};" title="${esc(tooltip)}">${esc(b.label)}${esc(catLabel)}</span>
                    </td>
	                    <td style="font-size:12px; color:var(--text-muted);">${esc(ownerLabel)}</td>
	                    <td style="font-size:12px; color:var(--text-secondary);">${esc(runtimeLabel)}</td>
	                    <td><span class="pm-badge pm-badge-info" title="${esc(tagTitle)}">${esc(r.tag)}</span></td>
	                    <td class="pm-table-mono" style="color:var(--text-muted)">${esc(registryLabel)}</td>
                    <td style="text-align:right">
                        ${actionLabel}
                    </td>
                </tr>`;
            }).join('') || '<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:30px">등록된 이미지가 없습니다</td></tr>'}
        </tbody>
    </table>
    `;
}

function showBuildForm() {
    // Remove existing modal if any
    document.getElementById('buildOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'buildOverlay';
    overlay.className = 'pm-modal-overlay show';
    overlay.innerHTML = `
    <div class="pm-modal" style="max-width:780px">
        <div class="pm-modal-header">
            <div class="pm-modal-title">새 이미지 빌드</div>
            <button class="pm-modal-close" onclick="document.getElementById('buildOverlay').remove()">&times;</button>
        </div>
        <div class="pm-modal-body" style="max-height:70vh;overflow:auto">
            <!-- Base Image -->
            <div class="pm-section">
                <div class="pm-section-title">📦 베이스 이미지</div>
                <div class="pm-grid-4" id="baseCards"></div>
            </div>

            <!-- Tag -->
            <div class="pm-section">
                <div class="pm-section-title">🏷️ 버전</div>
                <select class="pm-input" id="baseTag" style="font-family:var(--font-mono)"></select>
                <input class="pm-input pm-input-mono" id="customFrom" placeholder="예: myregistry/image:tag" style="display:none;margin-top:8px">
            </div>

            <!-- Image Name -->
            <div class="pm-section">
                <div class="pm-section-title">✏️ 이미지 이름</div>
                <div style="display:flex;gap:10px">
                    <input class="pm-input pm-input-mono" id="imageName" placeholder="예: my-ml-pytorch" style="flex:1">
                    <input class="pm-input pm-input-mono" id="imageTag" value="v1.0" style="width:100px">
                </div>
            </div>

            <!-- Package Presets -->
            <div class="pm-section">
                <div class="pm-section-title">📚 패키지 선택</div>
                <div class="pm-grid-2" id="pkgCards"></div>
            </div>

            <!-- Custom pip -->
            <div class="pm-section">
                <div class="pm-section-title">⌨️ 추가 pip 패키지</div>
                <input class="pm-input pm-input-mono" id="customPip" placeholder="공백 구분: flask redis celery">
            </div>

            <!-- Dockerfile Editor -->
            <div class="pm-section">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="pm-toggle" onclick="togglePreview()">
                        <span id="previewArrow">▶</span> Dockerfile 편집
                    </div>
                    <div id="dockerEditorActions" style="display:none;">
                        <span id="dockerfileEdited" style="display:none; font-size:11px; color:#856404; background:#fff3cd; padding:2px 8px; border-radius:4px; margin-right:8px;">수동 편집됨</span>
                        <button class="pm-btn pm-btn-sm" id="resetDockerfileBtn" onclick="resetDockerfile()" style="font-size:11px;">폼으로 재생성</button>
                    </div>
                </div>
                <textarea id="dockerPreview" style="display:none; width:100%; min-height:320px; font-family:var(--font-mono); font-size:12px; padding:12px; border:1px solid var(--border); border-radius:6px; background:#ffffff; color:#1f2937; line-height:1.5; resize:vertical; box-sizing:border-box;" spellcheck="false"></textarea>
            </div>

            <!-- Build -->
            <button class="pm-btn pm-btn-primary pm-btn-full" id="buildBtn" onclick="startBuild()" style="padding:14px">
                🔨 이미지 빌드
            </button>

            <!-- Progress -->
            <div id="buildArea" style="display:none">
                <div class="pm-progress"><div class="pm-progress-bar" id="buildProgressBar" style="width:0%"></div></div>
                <div class="pm-progress-text" id="buildProgressText"></div>
                <pre id="buildLogPre" style="background:#1e1e1e;color:#4ec9b0;font-family:var(--font-mono);font-size:11px;padding:12px;border-radius:8px;max-height:200px;overflow:auto;margin-top:10px;white-space:pre-wrap"></pre>
            </div>
        </div>
    </div>
    `;
    document.body.appendChild(overlay);

    // Render base image cards
    const baseContainer = document.getElementById('baseCards');
    const icons = { pytorch: '🔥', tensorflow: '🧠', cuda: '💚', python: '🐍', custom: '⚙️' };
    baseOptions.forEach((o, i) => {
        const card = document.createElement('div');
        card.className = 'pm-card' + (i === 0 ? ' selected' : '');
        card.dataset.value = o.value;
        card.innerHTML = `<div class="pm-card-icon">${icons[o.value] || '📦'}</div><div class="pm-card-label">${o.label}</div>`;
        card.onclick = () => {
            baseContainer.querySelectorAll('.pm-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            updateTagsNew(o.value);
            onDockerfileFormChange();
        };
        baseContainer.appendChild(card);
    });
    updateTagsNew(baseOptions[0]?.value);

    // Render package cards
    const pkgContainer = document.getElementById('pkgCards');
    const defaultPkgs = new Set(['raytune', 'mlflow', 'pandas', 'sklearn', 'ipython']);
    packagePresets.forEach(pkg => {
        const card = document.createElement('div');
        card.className = 'pm-check-card' + (defaultPkgs.has(pkg.id) ? ' selected' : '');
        card.dataset.id = pkg.id;
        card.innerHTML = `
            <div class="pm-checkbox">${defaultPkgs.has(pkg.id) ? '✓' : ''}</div>
            <div>
                <div class="pm-check-label">${pkg.label}</div>
                <div class="pm-check-desc">${pkg.desc}</div>
            </div>
        `;
        card.onclick = () => {
            card.classList.toggle('selected');
            card.querySelector('.pm-checkbox').textContent = card.classList.contains('selected') ? '✓' : '';
            onDockerfileFormChange();
        };
        pkgContainer.appendChild(card);
    });

    // 폼 변경 시 자동 갱신, 수동 편집 감지
    ['baseTag', 'customFrom', 'customPip'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', onDockerfileFormChange);
    });
    const textarea = document.getElementById('dockerPreview');
    if (textarea) {
        textarea.addEventListener('input', markDockerfileEdited);
    }
    dockerfileEdited = false;
}

function updateTagsNew(value) {
    const opt = baseOptions.find(o => o.value === value);
    const tagSelect = document.getElementById('baseTag');
    const customInput = document.getElementById('customFrom');
    if (value === 'custom') {
        tagSelect.style.display = 'none';
        customInput.style.display = '';
    } else {
        tagSelect.style.display = '';
        customInput.style.display = 'none';
        tagSelect.innerHTML = (opt?.tags || []).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    }
}

let dockerfileEdited = false;

function _buildRequestBody() {
    const base = document.querySelector('#baseCards .pm-card.selected')?.dataset.value || 'pytorch';
    const selectedPkgs = [...document.querySelectorAll('#pkgCards .pm-check-card.selected')]
        .map(el => packagePresets.find(p => p.id === el.dataset.id)?.pip).filter(Boolean);
    const customPip = document.getElementById('customPip')?.value?.trim() || '';
    let pipList = selectedPkgs.flatMap(s => s.split(' '));
    if (customPip) pipList = pipList.concat(customPip.split(' ').filter(Boolean));

    return {
        base_image: base,
        base_tag: document.getElementById('baseTag').value,
        custom_from: document.getElementById('customFrom').value || null,
        pip_packages: pipList,
        apt_packages: [],
        run_commands: [],
        image_name: document.getElementById('imageName').value || 'preview',
        image_tag: document.getElementById('imageTag').value || 'v1.0',
        include_jupyter: true,
    };
}

async function togglePreview() {
    const el = document.getElementById('dockerPreview');
    const arrow = document.getElementById('previewArrow');
    const actions = document.getElementById('dockerEditorActions');
    if (el.style.display === 'none') {
        el.style.display = '';
        arrow.textContent = '▼';
        actions.style.display = '';
        if (!dockerfileEdited) {
            el.value = await fetchDockerfilePreview();
        }
    } else {
        el.style.display = 'none';
        arrow.textContent = '▶';
        actions.style.display = 'none';
    }
}

async function fetchDockerfilePreview() {
    try {
        const resp = await API.post('/api/images/preview-dockerfile', _buildRequestBody());
        return resp.dockerfile || '';
    } catch (e) {
        return '# Dockerfile 생성 실패: ' + e.message;
    }
}

async function onDockerfileFormChange() {
    // 폼이 바뀔 때 미편집 상태면 자동 갱신
    if (dockerfileEdited) return;
    const el = document.getElementById('dockerPreview');
    if (el && el.style.display !== 'none') {
        el.value = await fetchDockerfilePreview();
    }
}

function markDockerfileEdited() {
    dockerfileEdited = true;
    const tag = document.getElementById('dockerfileEdited');
    if (tag) tag.style.display = '';
}

async function resetDockerfile() {
    if (dockerfileEdited && !confirm('수동으로 편집한 내용이 사라집니다. 폼 기반으로 재생성할까요?')) return;
    dockerfileEdited = false;
    document.getElementById('dockerfileEdited').style.display = 'none';
    const el = document.getElementById('dockerPreview');
    el.value = await fetchDockerfilePreview();
}

async function startBuild() {
    const base = document.querySelector('#baseCards .pm-card.selected')?.dataset.value || 'pytorch';
    const selectedPkgs = [...document.querySelectorAll('#pkgCards .pm-check-card.selected')]
        .map(el => packagePresets.find(p => p.id === el.dataset.id)?.pip).filter(Boolean);
    const customPip = document.getElementById('customPip')?.value?.trim() || '';

    let pipList = selectedPkgs.flatMap(s => s.split(' '));
    if (customPip) pipList = pipList.concat(customPip.split(' ').filter(Boolean));

    const dockerfileEl = document.getElementById('dockerPreview');
    const override = (dockerfileEdited && dockerfileEl?.value?.trim()) ? dockerfileEl.value : null;

    const req = {
        base_image: base,
        base_tag: document.getElementById('baseTag').value,
        custom_from: document.getElementById('customFrom').value || null,
        pip_packages: pipList,
        apt_packages: [],
        run_commands: [],
        image_name: document.getElementById('imageName').value,
        image_tag: document.getElementById('imageTag').value,
        include_jupyter: true,
        dockerfile_override: override,
    };

    if (!req.image_name) { alert('이미지 이름을 입력하세요'); return; }

    const btn = document.getElementById('buildBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 빌드 중...';

    const buildArea = document.getElementById('buildArea');
    buildArea.style.display = '';
    const logEl = document.getElementById('buildLogPre');
    const barEl = document.getElementById('buildProgressBar');
    const textEl = document.getElementById('buildProgressText');
    logEl.textContent = 'Starting build...\n';

    const resp = await API.post('/api/images/build', req);
    let progress = 0;

    const es = API.sse(`/api/images/build-log/${resp.build_id}`, (data) => {
        if (data.log) {
            logEl.textContent += data.log;
            logEl.scrollTop = logEl.scrollHeight;
            progress = Math.min(progress + 1, 90);
            barEl.style.width = progress + '%';
            if (data.log.includes('Step')) textEl.textContent = data.log.trim().split('\n').pop();
        }
        if (data.status) {
            if (data.status === 'success') {
                barEl.style.width = '100%';
                barEl.classList.add('done');
                textEl.innerHTML = `<span style="color:var(--success)">✅ 빌드 완료: ${esc(req.image_name)}:${esc(req.image_tag)}</span>`;
                btn.textContent = '✅ 빌드 완료!';
                logEl.textContent += `\n=== SUCCESS ===\n`;
                setTimeout(() => {
                    document.getElementById('buildOverlay')?.remove();
                    navigate('images');
                }, 2000);
            } else {
                barEl.style.background = 'var(--danger)';
                textEl.innerHTML = `<span style="color:var(--danger)">❌ 빌드 실패: ${esc(data.message)}</span>`;
                btn.textContent = '❌ 실패';
                btn.disabled = false;
                logEl.textContent += `\n=== ERROR: ${data.message} ===\n`;
            }
            es.close();
        }
    });
}

async function deleteImage(name, tag, isProtected, desc) {
    let msg;
    let force = '';
    if (isProtected) {
        msg = `⚠ 시스템 이미지입니다\n\n${name}:${tag}\n\n용도: ${desc}\n\n삭제하면 관련 기능이 즉시 중단됩니다. 정말 계속하시겠습니까?`;
        if (!confirm(msg)) return;
        const confirm2 = prompt(`확인을 위해 "${name}" 을(를) 그대로 입력하세요:`);
        if (confirm2 !== name) { alert('이름이 일치하지 않아 취소됐습니다.'); return; }
        force = '&force=true';
    } else {
        msg = `이미지 ${name}:${tag}를 삭제하시겠습니까?`;
        if (!confirm(msg)) return;
    }
    try {
        const r = await fetch(API.base + `/api/images/${name}?tag=${tag}${force}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) {
            alert('삭제 실패: ' + (data.detail || r.status));
            return;
        }
        navigate('images');
    } catch (e) {
        alert('삭제 실패: ' + e.message);
    }
}
