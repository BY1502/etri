const pages = {
    home: renderHome,
    images: renderImages,
    containers: renderContainers,
    'containers-new': renderContainersNew,
    datasets: renderDatasets,
    automl: renderAutoML,
    models: renderModels,
    admin: renderAdmin,
};

function notifyParentRoute(page) {
    if (window.parent === window) return;
    try {
        window.parent.postMessage({ type: 'prediction-manager-route', page }, window.location.origin);
    } catch (e) {
        console.error('parent route sync failed:', e);
    }
}

async function navigate(page) {
    window.location.hash = `#/${page}`;
    notifyParentRoute(page);
    const app = document.getElementById('app');
    app.innerHTML = '<div class="pm-spinner">로딩 중...</div>';

    try {
        const html = await pages[page]();
        app.innerHTML = html;
        if (page === 'admin' && typeof setupAdminPage === 'function') {
            setupAdminPage();
        }
        if (page === 'automl' && typeof setupAutoMLPage === 'function') {
            setupAutoMLPage();
        }
        if (page === 'models' && typeof setupModelsPage === 'function') {
            setupModelsPage();
        }
        if (page === 'datasets' && typeof setupDatasetsPage === 'function') {
            setupDatasetsPage();
        }
        if (page === 'containers-new' && typeof setupContainersNewPage === 'function') {
            setupContainersNewPage();
        }
    } catch (e) {
        app.innerHTML = `
        <div style="padding:40px;text-align:center">
            <div style="font-size:16px;font-weight:600;color:var(--danger);margin-bottom:8px">오류 발생</div>
            <div style="font-size:13px;color:var(--text-secondary)">${e.message}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:8px;font-family:var(--font-mono)">
                API: ${API.base} | ${window.location.pathname}
            </div>
        </div>`;
    }

    document.querySelectorAll('.pm-nav a').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
}

async function checkAdminMenu() {
    try {
        const info = await API.get('/api/user-info');
        if (info.is_admin) {
            const adminMenu = document.getElementById('adminMenu');
            if (adminMenu) adminMenu.style.display = '';
        }
    } catch (e) {
        console.error('user-info failed:', e);
    }
}

window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#/', '') || 'home';
    if (pages[page]) navigate(page);
});

// 탭 클릭 시 같은 페이지여도 항상 재렌더링
document.querySelectorAll('.pm-nav a').forEach(el => {
    el.addEventListener('click', (e) => {
        const page = el.dataset.page;
        if (page && pages[page]) {
            e.preventDefault();
            navigate(page);
        }
    });
});

// standalone 모드: FeDiT 타일에서 진입할 때 상단 네비바 숨김
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('standalone') === '1') {
    const navbar = document.querySelector('.pm-navbar');
    if (navbar) navbar.style.display = 'none';
    document.body.classList.add('standalone-mode');
}

checkAdminMenu();
navigate(window.location.hash.replace('#/', '') || 'home');
