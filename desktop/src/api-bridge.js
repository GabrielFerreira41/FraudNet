// Pont vers la FastAPI FraudNet — utilisé par les composants React
// Si l'API n'est pas disponible, les composants tombent sur la simulation.

const API_BASE = "http://localhost:8000";

window.FraudNetAPI = {
  _cache: {},

  async _get(path, ttl = 30000) {
    const now = Date.now();
    if (this._cache[path] && now - this._cache[path].ts < ttl) {
      return this._cache[path].data;
    }
    try {
      const r = await fetch(API_BASE + path);
      if (!r.ok) return null;
      const data = await r.json();
      this._cache[path] = { data, ts: now };
      return data;
    } catch {
      return null;
    }
  },

  async health()  { return this._get("/health", 10000); },
  async stats()   { return this._get("/stats",  30000); },
  async metrics() { return this._get("/metrics", 60000); },
  async sample(n = 5) { return this._get(`/transactions/sample?n=${n}`, 60000); },

  async score(transactionId) {
    try {
      const r = await fetch(`${API_BASE}/score/${transactionId}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },

  async accounts()            { return this._get("/accounts", 60000); },
  async accountDetail(id)     {
    try {
      const r = await fetch(`${API_BASE}/accounts/${id}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  async graphNetwork()        { return this._get("/graph/network", 120000); },
};
