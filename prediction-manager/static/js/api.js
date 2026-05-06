// HTML 이스케이프 유틸 — 사용자 데이터를 innerHTML에 삽입하기 전 반드시 통과시킬 것.
// 5가지 엔티티 모두 처리 (HTML body + attribute 컨텍스트 양쪽 안전).
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const API = {
    base: window.location.pathname.replace(/\/$/, ''),
    namespace: new URLSearchParams(window.location.search).get('ns'),

    _headers(extra) {
        const h = { ...(extra || {}) };
        if (this.namespace) h['x-pm-namespace'] = this.namespace;
        return h;
    },

    _withNs(path) {
        if (!this.namespace) return this.base + path;
        const sep = path.includes('?') ? '&' : '?';
        return this.base + path + sep + 'ns=' + encodeURIComponent(this.namespace);
    },

    async get(path) {
        const resp = await fetch(this._withNs(path), { headers: this._headers() });
        return resp.json();
    },

    async post(path, data) {
        const resp = await fetch(this._withNs(path), {
            method: 'POST',
            headers: this._headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data),
        });
        return resp.json();
    },

    async del(path) {
        const resp = await fetch(this._withNs(path), { method: 'DELETE', headers: this._headers() });
        return resp.json();
    },

    async patch(path) {
        const resp = await fetch(this._withNs(path), { method: 'PATCH', headers: this._headers() });
        return resp.json();
    },

    async put(path, data) {
        const resp = await fetch(this._withNs(path), {
            method: 'PUT',
            headers: this._headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data),
        });
        return resp.json();
    },

    sse(path, onMessage) {
        // EventSource는 헤더를 지원 안 해서 쿼리 파라미터로만 전달
        const es = new EventSource(this._withNs(path));
        es.onmessage = (e) => onMessage(JSON.parse(e.data));
        es.onerror = () => es.close();
        return es;
    }
};
