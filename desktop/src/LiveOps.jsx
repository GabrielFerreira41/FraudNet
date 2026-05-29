// LiveOps.jsx — MARS Analyzer · FraudNet

const { useState: useStateL, useEffect: useEffectL, useRef: useRefL } = React;

const API = "http://localhost:8000";

const MERCHANTS = [
  "Amazon Prime","App Store","Apple Store","ATM Desjardins","AWS","Air Canada",
  "Air Transat","Bell","Best Buy","Booking.com","Bureau en Gros","Canadian Tire",
  "Cineplex","Clinique locale","Costco","Dell","Dépanneur local","Epic Games",
  "Expedia","Google Cloud","H&M","Home Depot","IGA","IKEA","Jean Coutu",
  "Loblaws","Maxi","McDonald's","Metro","Netflix","Pharmaprix","Pizza Pizza",
  "Provigo","Rogers","Rona","Simons","Sport Chek","Spotify","St-Hubert",
  "Subway","Super C","Telus","Tim Hortons","Uber","VIA Rail","Videotron",
  "Virement e-Transfer","Winners","Zara",
];

const DECISION_STYLE = {
  BLOCK:       { bg: "#fef2f2", border: "#fca5a5", color: "#be1f26", label: "BLOQUÉ",      icon: "✕" },
  INVESTIGATE: { bg: "#fffbeb", border: "#fcd34d", color: "#92400e", label: "À EXAMINER",  icon: "⚠" },
  APPROVE:     { bg: "#f0fdf4", border: "#86efac", color: "#166534", label: "APPROUVÉ",    icon: "✓" },
};

const AGENT_META = {
  baseline: { name: "Baseline LightGBM", sub: "comportemental — 20 features", icon: "◈", weight: "50%" },
  sequence: { name: "Séquence LSTM",     sub: "auto-encodeur temporel",        icon: "◎", weight: "25%" },
  graph:    { name: "Graphe LightGBM",   sub: "propagation réseau",            icon: "◉", weight: "25%" },
};

const ARCH_LABELS = {
  jeune_actif: "Jeune actif", etudiant: "Étudiant", famille: "Famille",
  retraite: "Retraité", entreprise: "Entreprise",
};

// ── Utils ─────────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  if (!ts) return null;
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return "hier";
  if (d < 7)  return `il y a ${d} j`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
  return `il y a ${Math.floor(d / 30)} mois`;
}

function scoreColor(pct) {
  if (pct >= 70) return "#be1f26";
  if (pct >= 40) return "#d97706";
  return "#16a34a";
}

// ── Gauge ─────────────────────────────────────────────────────────────────────

function ScoreGauge({ value, size = 96 }) {
  const pct   = Math.round(value * 100);
  const color = scoreColor(pct);
  const s     = size;
  return (
    <svg width={s} height={s * 0.6} viewBox="0 0 120 66">
      <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#e4ddd3" strokeWidth={10} strokeLinecap="round"/>
      <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${pct * 1.571} 157.1`}/>
      <text x={60} y={56} textAnchor="middle" fontSize={24} fontWeight={700}
        fontFamily="'JetBrains Mono',monospace" fill={color}>{pct}</text>
      <text x={60} y={65} textAnchor="middle" fontSize={8} fill="#8596af">/ 100</text>
    </svg>
  );
}

// ── Person Card ───────────────────────────────────────────────────────────────

function PersonCard({ ctx, txMontant }) {
  if (!ctx) return (
    <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center",
      color: "#8596af", fontSize: 13, fontStyle: "italic", minHeight: 180 }}>
      Compte inconnu
    </div>
  );

  const ratio      = txMontant && ctx.montant_moyen ? txMontant / ctx.montant_moyen : null;
  const ratioAlert = ratio && ratio > 3;
  const maxBar     = ctx.merchants_habituels?.[0]?.n_tx || 1;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>

      {/* Header stripe */}
      <div style={{ background: "#0c1b34", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 22, background: "#be1f26",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0,
        }}>
          {ctx.prenom?.[0]}{ctx.nom?.[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
            {ctx.prenom} {ctx.nom}
          </div>
          <div style={{ color: "#8596af", fontSize: 11, marginTop: 3 }}>
            {ARCH_LABELS[ctx.archetype] || ctx.archetype} · {ctx.ville}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "#8596af", fontSize: 9, letterSpacing: 0.4, marginBottom: 2 }}>REVENU / MOIS</div>
          <div style={{ color: "#fff", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13 }}>
            {ctx.revenu_mensuel?.toLocaleString("fr-CA")} $
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Badges */}
        {(ctx.est_vulnerable || ctx.n_fraud_connus > 0) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ctx.est_vulnerable && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px",
                background: "rgba(217,119,6,.1)", color: "#92400e",
                border: "1px solid rgba(217,119,6,.25)" }}>
                ⚠ Profil vulnérable
              </span>
            )}
            {ctx.n_fraud_connus > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px",
                background: "rgba(190,31,38,.08)", color: "#be1f26",
                border: "1px solid rgba(190,31,38,.2)" }}>
                {ctx.n_fraud_connus} fraude{ctx.n_fraud_connus > 1 ? "s" : ""} connue{ctx.n_fraud_connus > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* Spending stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {[
            { label: "Moy. tx",  value: `${ctx.montant_moyen} $` },
            { label: "Médiane",  value: `${ctx.montant_median} $` },
            { label: "Max",      value: `${ctx.montant_max} $` },
          ].map((s, i) => (
            <div key={i} style={{ background: "#f7f4ee", border: "1px solid #e4ddd3",
              padding: "7px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#8596af", marginBottom: 3, letterSpacing: 0.3 }}>{s.label}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: "#0c1b34" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Ratio pill */}
        {ratio && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
            background: ratioAlert ? "rgba(190,31,38,.05)" : "rgba(22,163,74,.05)",
            border: `1px solid ${ratioAlert ? "rgba(190,31,38,.2)" : "rgba(22,163,74,.2)"}` }}>
            <span style={{ fontSize: 11, color: "#3d4e6a" }}>Cette tx représente</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13,
              color: ratioAlert ? "#be1f26" : "#16a34a" }}>
              {ratio.toFixed(1)}×
            </span>
            <span style={{ fontSize: 11, color: "#3d4e6a" }}>la moyenne</span>
            <span style={{ fontSize: 10, color: "#8596af", marginLeft: "auto" }}>
              {ctx.n_transactions} tx au total
            </span>
          </div>
        )}

        {/* Merchant habits */}
        {ctx.merchants_habituels?.length > 0 && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 0.6, color: "#8596af", fontWeight: 700,
              marginBottom: 8, textTransform: "uppercase" }}>
              Marchands habituels
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {ctx.merchants_habituels.slice(0, 4).map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#0c1b34", flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.nom}
                  </span>
                  <div style={{ width: 60, height: 4, background: "#e4ddd3" }}>
                    <div style={{ width: `${Math.round(m.n_tx / maxBar * 100)}%`,
                      height: "100%", background: "#0c1b34" }}/>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                    color: "#8596af", flexShrink: 0 }}>
                    {m.n_tx}tx
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last tx */}
        {ctx.derniere_tx && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
            background: "#f7f4ee", border: "1px solid #e4ddd3" }}>
            <span style={{ fontSize: 9, color: "#8596af", fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>
              DERNIÈRE TX
            </span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
              fontWeight: 600, color: "#0c1b34" }}>
              {ctx.derniere_tx.montant} $
            </span>
            <span style={{ fontSize: 11, color: "#3d4e6a", flex: 1, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              chez {ctx.derniere_tx.commercant}
            </span>
            <span style={{ fontSize: 10, color: "#8596af", flexShrink: 0 }}>
              {relativeTime(ctx.derniere_tx.timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Model Card ────────────────────────────────────────────────────────────────

function ModelCard({ result }) {
  const ds  = DECISION_STYLE[result.decision] || DECISION_STYLE.APPROVE;
  const pct = Math.round(result.score_mars * 100);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>

      {/* Decision header */}
      <div style={{ background: ds.bg, borderBottom: `1px solid ${ds.border}`,
        padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
        <ScoreGauge value={result.score_mars} size={88}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: ds.color, letterSpacing: 0.5 }}>
              {ds.icon} {ds.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#3d4e6a" }}>
            Score MARS : <span style={{ fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 700, color: scoreColor(pct) }}>{pct} / 100</span>
          </div>
          <div style={{ fontSize: 11, color: "#8596af", marginTop: 3 }}>
            Confiance {Math.round(result.confidence * 100)} %
          </div>
          {result.contradiction && (
            <div style={{ fontSize: 10, color: "#d97706", fontWeight: 600, marginTop: 4 }}>
              ⚠ Contradiction entre agents
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Risk signals */}
        {result.risk_factors?.length > 0 && (
          <div>
            <div style={sectionLabel}>Signaux détectés</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {result.risk_factors.map((f, i) => (
                <span key={i} style={{ fontSize: 10, padding: "3px 8px", fontWeight: 500,
                  background: "rgba(190,31,38,.07)", color: "#be1f26",
                  border: "1px solid rgba(190,31,38,.18)" }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Agent scores */}
        <div>
          <div style={sectionLabel}>Scores par agent</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(result.agent_scores).map(([k, v]) => {
              if (v == null) return null;
              const p    = Math.round(v * 100);
              const col  = scoreColor(p);
              const meta = AGENT_META[k] || { name: k, sub: "", icon: "·", weight: "" };
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, color: "#8596af", width: 18, textAlign: "center",
                    flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#0c1b34" }}>{meta.name}</span>
                        {meta.weight && (
                          <span style={{ fontSize: 9, color: "#8596af", marginLeft: 6,
                            background: "#f7f4ee", border: "1px solid #e4ddd3",
                            padding: "1px 5px" }}>
                            {meta.weight}
                          </span>
                        )}
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
                        fontWeight: 700, color: col }}>{p} %</span>
                    </div>
                    <div style={{ fontSize: 9, color: "#8596af", marginBottom: 4 }}>{meta.sub}</div>
                    <div style={{ height: 4, background: "#e4ddd3", overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, height: "100%", background: col,
                        transition: "width .6s ease" }}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mistral Card ──────────────────────────────────────────────────────────────

function MistralCard({ narrative }) {
  const { data, loading, error } = narrative;

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #e4ddd3",
        display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, background: "#0c1b34",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: "#fff", flexShrink: 0 }}>
          ✦
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0c1b34" }}>Analyse Mistral AI</div>
          <div style={{ fontSize: 10, color: "#8596af" }}>Raisonnement narratif automatique</div>
        </div>
        {data?.source && (
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#8596af",
            background: "#f7f4ee", border: "1px solid #e4ddd3", padding: "2px 8px" }}>
            {data.source === "mistral" ? "Mistral AI" : "règles locales"}
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "16px 18px" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#8596af" }}>
            <span style={{ fontSize: 16, animation: "spin 1.2s linear infinite", display: "inline-block" }}>◐</span>
            <span style={{ fontSize: 13 }}>Mistral analyse la transaction…</span>
          </div>
        )}
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2",
            border: "1px solid #fca5a5", fontSize: 12, color: "#be1f26" }}>
            {error}
          </div>
        )}
        {data && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.fraud_type_suspected && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px",
                alignSelf: "flex-start",
                background: "rgba(217,119,6,.1)", color: "#92400e",
                border: "1px solid rgba(217,119,6,.25)" }}>
                Type suspecté : {data.fraud_type_suspected.replace(/_/g, " ")}
              </span>
            )}
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, color: "#3d4e6a" }}>
              {data.justification}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Raw features (collapse) ───────────────────────────────────────────────────

function RawFeatures({ features }) {
  const [open, setOpen] = useStateL(false);
  const highlight = ["ratio_montant", "velocite_1h", "nouveau_commercant",
                     "nouveau_device", "est_rafale", "heure_inhabituelle", "n_comptes_par_device"];
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ fontSize: 11, color: "#8596af",
        background: "none", border: "1px solid #e4ddd3", padding: "4px 12px",
        cursor: "pointer", fontFamily: "inherit" }}>
        {open ? "▴ Masquer les features" : "▾ Features calculées"}
      </button>
      {open && (
        <div style={{ marginTop: 10, background: "#f7f4ee", border: "1px solid #e4ddd3",
          padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
          {Object.entries(features).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, color: highlight.includes(k) ? "#0c1b34" : "#8596af",
                fontWeight: highlight.includes(k) ? 600 : 400 }}>{k}</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
                color: highlight.includes(k) ? "#be1f26" : "#3d4e6a" }}>
                {typeof v === "number" ? (v % 1 === 0 ? v : v.toFixed(3)) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Results area ──────────────────────────────────────────────────────────────

function ResultArea({ result, narrative }) {
  if (!result) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16, padding: 48, color: "#8596af" }}>
      <div style={{ fontSize: 48, opacity: 0.2 }}>◈</div>
      <p style={{ margin: 0, fontSize: 13, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
        Saisissez les détails d'un virement et cliquez sur <strong>Analyser</strong> pour voir
        l'analyse MARS complète.
      </p>
    </div>
  );

  const ctx = result.account_context;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Row 1 : Person + Model cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <PersonCard ctx={ctx} txMontant={result.features?.montant}/>
        <ModelCard result={result}/>
      </div>

      {/* ── Row 2 : Mistral card ── */}
      <MistralCard narrative={narrative}/>

      {/* ── Row 3 : Raw features (collapsed) ── */}
      <RawFeatures features={result.features}/>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function LiveOps() {
  const [accounts, setAccounts]   = useStateL([]);
  const [form, setForm]           = useStateL({
    account_id: "", montant: "", commercant: "Amazon Prime", device: "mobile", timestamp: "",
  });
  const [loading, setLoading]     = useStateL(false);
  const [result, setResult]       = useStateL(null);
  const [error, setError]         = useStateL(null);
  const [narrative, setNarrative] = useStateL({ data: null, loading: false, error: null });
  const lastTxRef                 = useRefL(null);

  useEffectL(() => {
    fetch(`${API}/accounts/lookup`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setAccounts(data);
        if (data.length) setForm(f => ({ ...f, account_id: data[0].account_id }));
      })
      .catch(() => {});
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const triggerNarrative = async (body) => {
    setNarrative({ data: null, loading: true, error: null });
    try {
      const r = await fetch(`${API}/analyze/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
      setNarrative({ data: await r.json(), loading: false, error: null });
    } catch (e) {
      setNarrative({ data: null, loading: false, error: e.message });
    }
  };

  const handleAnalyze = async () => {
    if (!form.montant || !form.commercant) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setNarrative({ data: null, loading: false, error: null });

    const body = {
      account_id: form.account_id || null,
      montant:    parseFloat(form.montant),
      commercant: form.commercant,
      device:     form.device,
      timestamp:  form.timestamp || null,
    };
    lastTxRef.current = body;

    try {
      const r = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
      const data = await r.json();
      setResult(data);
      // Auto-generate narrative immediately after scoring
      triggerNarrative(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRandomTx = async (wantFraud) => {
    try {
      const r  = await fetch(`${API}/transactions/sample?n=10`);
      const d  = await r.json();
      const ids = wantFraud ? d.fraud : d.legitimate;
      if (!ids?.length) return;
      const tid = ids[Math.floor(Math.random() * ids.length)];
      const r2  = await fetch(`${API}/transactions/${tid}/details`);
      if (!r2.ok) return;
      const tx = await r2.json();
      setForm({ account_id: tx.account_id || "", montant: String(tx.montant),
        commercant: tx.commercant, device: tx.device, timestamp: "" });
      setResult(null);
      setNarrative({ data: null, loading: false, error: null });
    } catch {}
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, background: "#f7f4ee" }}>

      {/* ── Form panel ── */}
      <div style={{
        width: 320, flexShrink: 0, borderRight: "1px solid #e4ddd3",
        background: "#fff", display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid #e4ddd3" }}>
          <div style={{ fontSize: 9, letterSpacing: 0.9, color: "#8596af", fontWeight: 700,
            marginBottom: 4, textTransform: "uppercase" }}>
            MARS Analyzer
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0c1b34" }}>Tester un virement</div>
          <p style={{ margin: "5px 0 0", fontSize: 11, color: "#3d4e6a", lineHeight: 1.5 }}>
            5 agents ML analysent en temps réel.
          </p>
        </div>

        {/* Fields */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          <div>
            <label style={labelStyle}>Compte</label>
            <select value={form.account_id} onChange={e => setField("account_id", e.target.value)}
              style={inputStyle}>
              <option value="">— Compte inconnu —</option>
              {accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Montant (CAD)</label>
            <input type="number" min="0.01" step="0.01" placeholder="ex: 450.00"
              value={form.montant} onChange={e => setField("montant", e.target.value)}
              style={inputStyle}/>
          </div>

          <div>
            <label style={labelStyle}>Marchand</label>
            <select value={form.commercant} onChange={e => setField("commercant", e.target.value)}
              style={inputStyle}>
              {MERCHANTS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Appareil</label>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {["mobile", "tablette", "desktop"].map(d => (
                <button key={d} onClick={() => setField("device", d)} style={{
                  flex: 1, padding: "7px 0", fontSize: 11,
                  fontWeight: form.device === d ? 700 : 400,
                  background: form.device === d ? "#0c1b34" : "#fff",
                  color: form.device === d ? "#fff" : "#3d4e6a",
                  border: `1px solid ${form.device === d ? "#0c1b34" : "#e4ddd3"}`,
                  cursor: "pointer", transition: "all .15s", fontFamily: "inherit",
                }}>{d}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Horodatage
              <span style={{ color: "#8596af", fontWeight: 400, marginLeft: 4 }}>(optionnel)</span>
            </label>
            <input type="datetime-local" value={form.timestamp}
              onChange={e => setField("timestamp", e.target.value)} style={inputStyle}/>
          </div>

          {/* Analyze button */}
          <button onClick={handleAnalyze} disabled={loading || !form.montant} style={{
            padding: "11px", fontSize: 13, fontWeight: 700,
            background: loading || !form.montant ? "#cfc8be" : "#be1f26",
            color: "#fff", border: "none",
            cursor: loading || !form.montant ? "default" : "pointer",
            letterSpacing: 0.5, transition: "background .15s", fontFamily: "inherit",
          }}>
            {loading ? "Analyse en cours…" : "▶  Analyser"}
          </button>

          {/* Quick load */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => loadRandomTx(true)}  style={ghostBtn}>Fraude aléatoire</button>
            <button onClick={() => loadRandomTx(false)} style={ghostBtn}>Légitime aléatoire</button>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#be1f26", background: "#fef2f2",
              border: "1px solid #fca5a5", padding: "10px 12px" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ── Results area ── */}
      <ResultArea result={result} narrative={narrative}/>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = {
  background: "#fff",
  border: "1px solid #e4ddd3",
};

const sectionLabel = {
  fontSize: 9, letterSpacing: 0.7, color: "#8596af", fontWeight: 700,
  textTransform: "uppercase", marginBottom: 10,
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#3d4e6a",
  letterSpacing: 0.3, marginBottom: 6,
};

const inputStyle = {
  width: "100%", padding: "8px 10px", fontSize: 12,
  border: "1px solid #e4ddd3", background: "#fff", color: "#0c1b34",
  boxSizing: "border-box", fontFamily: "inherit", outline: "none",
};

const ghostBtn = {
  flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 600,
  background: "#fff", color: "#3d4e6a", border: "1px solid #e4ddd3",
  cursor: "pointer", fontFamily: "inherit",
};

Object.assign(window, { LiveOps });
