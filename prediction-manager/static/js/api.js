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

    _headers(extra, namespaceOverride) {
        const h = { ...(extra || {}) };
        const ns = namespaceOverride || this.namespace;
        if (ns) h['x-pm-namespace'] = ns;
        return h;
    },

    _withNs(path, namespaceOverride) {
        const ns = namespaceOverride || this.namespace;
        if (!ns) return this.base + path;
        const sep = path.includes('?') ? '&' : '?';
        return this.base + path + sep + 'ns=' + encodeURIComponent(ns);
    },

    async _json(resp) {
        const text = await resp.text();
        let data = {};
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = { detail: text };
            }
        }
        if (!resp.ok) {
            const msg = data.detail || data.message || resp.statusText || '요청 실패';
            throw new Error(msg);
        }
        return data;
    },

    async get(path, namespaceOverride) {
        const resp = await fetch(this._withNs(path, namespaceOverride), { headers: this._headers(null, namespaceOverride) });
        return this._json(resp);
    },

    async post(path, data, namespaceOverride) {
        const resp = await fetch(this._withNs(path, namespaceOverride), {
            method: 'POST',
            headers: this._headers({ 'Content-Type': 'application/json' }, namespaceOverride),
            body: JSON.stringify(data),
        });
        return this._json(resp);
    },

    async del(path, namespaceOverride) {
        const resp = await fetch(this._withNs(path, namespaceOverride), { method: 'DELETE', headers: this._headers(null, namespaceOverride) });
        return this._json(resp);
    },

    async patch(path, namespaceOverride) {
        const resp = await fetch(this._withNs(path, namespaceOverride), { method: 'PATCH', headers: this._headers(null, namespaceOverride) });
        return this._json(resp);
    },

    async put(path, data, namespaceOverride) {
        const resp = await fetch(this._withNs(path, namespaceOverride), {
            method: 'PUT',
            headers: this._headers({ 'Content-Type': 'application/json' }, namespaceOverride),
            body: JSON.stringify(data),
        });
        return this._json(resp);
    },

    async getRaw(path) {
        const resp = await fetch(this._withNs(path), { headers: this._headers() });
        return resp.json();
    },

    async postRaw(path, data) {
        const resp = await fetch(this._withNs(path), {
            method: 'POST',
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
