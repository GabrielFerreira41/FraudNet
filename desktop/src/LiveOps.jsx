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
  BLOCK:       { bg: "#fef2f2", border: "#fca5a5", color: "#be1f26", label: "BLOQUÉ" },
  INVESTIGATE: { bg: "#fffbeb", border: "#fcd34d", color: "#92400e", label: "À EXAMINER" },
  APPROVE:     { bg: "#f0fdf4", border: "#86efac", color: "#166534", label: "APPROUVÉ" },
};

const AGENT_LABELS = {
  baseline:    { name: "Baseline",    sub: "LightGBM comportemental",   icon: "◈" },
  g1_device:   { name: "G1 Device",   sub: "GraphSAGE — réseau devices", icon: "◎" },
  g2_merchant: { name: "G2 Merchant", sub: "GAT bipartite — marchands",  icon: "◉" },
  g3_temporal: { name: "G3 Temporal", sub: "GCN — vélocité temporelle",  icon: "◐" },
};

const ARCH_LABELS = {
  jeune_actif: "Jeune actif", etudiant: "Étudiant", famille: "Famille",
  retraite: "Retraité", professionnel: "Professionnel", voyageur: "Voyageur", entrepreneur: "Entrepreneur",
};

function ScoreGauge({ value }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 70 ? "#be1f26" : pct >= 40 ? "#d97706" : "#16a34a";
  return (
    <svg width={100} height={56} viewBox="0 0 120 66">
      <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#e4ddd3" strokeWidth={10} strokeLinecap="round"/>
      <path
        d="M10,60 A50,50 0 0,1 110,60"
        fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${pct * 1.571} 157.1`}
      />
      <text x={60} y={57} textAnchor="middle" fontSize={22} fontWeight={700}
        fontFamily="'JetBrains Mono',monospace" fill={color}>{pct}</text>
      <text x={60} y={64} textAnchor="middle" fontSize={8} fill="#8596af">/ 100</text>
    </svg>
  );
}

function AgentBar({ id, score }) {
  const pct   = Math.round(score * 100);
  const color = pct >= 70 ? "#be1f26" : pct >= 40 ? "#d97706" : "#16a34a";
  const info  = AGENT_LABELS[id] || { name: id, sub: "", icon: "·" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16, color: "#8596af", width: 18, textAlign: "center" }}>{info.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0c1b34" }}>{info.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
        </div>
        <div style={{ fontSize: 10, color: "#8596af", marginBottom: 4 }}>{info.sub}</div>
        <div style={{ height: 4, background: "#e4ddd3", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width .6s ease" }}/>
        </div>
      </div>
    </div>
  );
}

function RiskTag({ label }) {
  return (
    <span style={{
      fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 500,
      background: "rgba(190,31,38,.08)", color: "#be1f26",
      border: "1px solid rgba(190,31,38,.2)"
    }}>{label}</span>
  );
}

function relativeTime(ts) {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return "hier";
  if (d < 7)  return `il y a ${d} j`;
  if (d < 30) return `il y a ${Math.floor(d/7)} sem.`;
  return `il y a ${Math.floor(d/30)} mois`;
}

function AccountContext({ ctx, txMontant }) {
  if (!ctx) return null;
  const ratio      = txMontant && ctx.montant_moyen ? (txMontant / ctx.montant_moyen) : null;
  const ratioAlert = ratio && ratio > 3;
  const maxBar     = (ctx.merchants_habituels || [])[0]?.n_tx || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Identity ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: "#0c1b34",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0, letterSpacing: 0.5,
        }}>
          {ctx.prenom?.[0]}{ctx.nom?.[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0c1b34", display: "flex", alignItems: "center", gap: 8 }}>
            {ctx.prenom} {ctx.nom}
            {ctx.est_vulnerable && (
              <span style={{ fontSize: 10, color: "#d97706", fontWeight: 600,
                background: "rgba(217,119,6,.1)", border: "1px solid rgba(217,119,6,.25)",
                padding: "1px 6px", borderRadius: 3 }}>
                ⚠ Vulnérable
              </span>
            )}
            {ctx.n_fraud_connus > 0 && (
              <span style={{ fontSize: 10, color: "#be1f26", fontWeight: 600,
                background: "rgba(190,31,38,.08)", border: "1px solid rgba(190,31,38,.2)",
                padding: "1px 6px", borderRadius: 3 }}>
                {ctx.n_fraud_connus} fraude{ctx.n_fraud_connus > 1 ? "s" : ""} connue{ctx.n_fraud_connus > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#8596af", marginTop: 2 }}>
            {ARCH_LABELS[ctx.archetype] || ctx.archetype} · {ctx.ville}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#8596af" }}>Revenu / mois</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: "#0c1b34" }}>
            {ctx.revenu_mensuel?.toLocaleString("fr-CA")} $
          </div>
        </div>
      </div>

      {/* ── Spending stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Montant moyen",  value: `${ctx.montant_moyen} $`,  alert: false },
          { label: "Montant médian", value: `${ctx.montant_median} $`, alert: false },
          { label: "Achat max",      value: `${ctx.montant_max} $`,    alert: false },
        ].map((s, i) => (
          <div key={i} style={{
            background: "#fff", border: "1px solid #e4ddd3",
            borderRadius: 6, padding: "7px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 9, color: "#8596af", marginBottom: 3, letterSpacing: 0.3 }}>{s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: "#0c1b34" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Ratio pill — only when meaningful */}
      {ratio && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px", borderRadius: 6,
          background: ratioAlert ? "rgba(190,31,38,.06)" : "rgba(22,163,74,.06)",
          border: `1px solid ${ratioAlert ? "rgba(190,31,38,.2)" : "rgba(22,163,74,.2)"}`,
        }}>
          <span style={{ fontSize: 11, color: "#3d4e6a" }}>
            Cette transaction représente
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13,
            color: ratioAlert ? "#be1f26" : "#16a34a",
          }}>
            {ratio.toFixed(1)}×
          </span>
          <span style={{ fontSize: 11, color: "#3d4e6a" }}>
            la moyenne du compte
          </span>
          <span style={{ fontSize: 10, color: "#8596af", marginLeft: "auto" }}>
            {ctx.n_transactions} tx au total
          </span>
        </div>
      )}

      {/* ── Merchant habits ── */}
      {ctx.merchants_habituels?.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 0.6, color: "#8596af", fontWeight: 600, marginBottom: 8 }}>
            MARCHANDS HABITUELS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ctx.merchants_habituels.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 11, color: "#0c1b34", width: 130,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {m.nom}
                </span>
                <div style={{ flex: 1, height: 5, background: "#e4ddd3", borderRadius: 3 }}>
                  <div style={{
                    width: `${Math.round((m.n_tx / maxBar) * 100)}%`,
                    height: "100%", background: "#0c1b34", borderRadius: 3,
                  }}/>
                </div>
                <span style={{
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8596af",
                  width: 72, textAlign: "right", flexShrink: 0,
                }}>
                  {m.n_tx} tx · {m.montant_moyen}$
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Last transaction ── */}
      {ctx.derniere_tx && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px", borderRadius: 6, background: "#fff", border: "1px solid #e4ddd3",
        }}>
          <span style={{ fontSize: 10, color: "#8596af", fontWeight: 600, letterSpacing: 0.5, flexShrink: 0 }}>
            DERNIÈRE TX
          </span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: "#0c1b34" }}>
            {ctx.derniere_tx.montant} $
          </span>
          <span style={{ fontSize: 12, color: "#3d4e6a" }}>chez {ctx.derniere_tx.commercant}</span>
          <span style={{ fontSize: 11, color: "#8596af" }}>· {ctx.derniere_tx.device}</span>
          <span style={{ fontSize: 10, color: "#8596af", marginLeft: "auto" }}>
            {relativeTime(ctx.derniere_tx.timestamp)}
          </span>
        </div>
      )}
    </div>
  );
}

/* Narrative — shows only justification + fraud type (risk factors are already above) */
function NarrativePanel({ narrative, loading, error }) {
  if (loading) return (
    <div style={{ padding: "14px 0", textAlign: "center", color: "#8596af", fontSize: 13 }}>
      <span style={{ marginRight: 8 }}>◐</span>Mistral analyse la transaction…
    </div>
  );
  if (error) return (
    <div style={{ padding: 12, background: "#fef2f2", borderRadius: 6, fontSize: 12, color: "#be1f26" }}>
      {error}
    </div>
  );
  if (!narrative) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {narrative.fraud_type_suspected && (
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
            background: "rgba(217,119,6,.1)", color: "#92400e",
            border: "1px solid rgba(217,119,6,.25)"
          }}>
            {narrative.fraud_type_suspected.replace(/_/g, " ")}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#8596af" }}>
          {narrative.source === "mistral" ? "Mistral AI" : "règles"}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#3d4e6a" }}>
        {narrative.justification}
      </p>
    </div>
  );
}

function RawFeatures({ features }) {
  const [open, setOpen] = useStateL(false);
  const highlight = ["ratio_montant", "velocite_1h", "nouveau_commercant", "nouveau_device",
                     "est_rafale", "heure_inhabituelle", "n_comptes_par_device"];
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, color: "#8596af", background: "none", border: "1px solid #e4ddd3",
          borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit"
        }}
      >
        {open ? "▴ Masquer les features" : "▾ Features calculées"}
      </button>
      {open && (
        <div style={{
          marginTop: 10, background: "#f7f4ee", borderRadius: 6, padding: 14,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px"
        }}>
          {Object.entries(features).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{
                fontSize: 11, color: highlight.includes(k) ? "#0c1b34" : "#8596af",
                fontWeight: highlight.includes(k) ? 600 : 400
              }}>{k}</span>
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
                color: highlight.includes(k) ? "#be1f26" : "#3d4e6a"
              }}>
                {typeof v === "number" ? (v % 1 === 0 ? v : v.toFixed(3)) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultPanel({ result, onNarrative, narrativeState }) {
  if (!result) return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16, padding: 40, color: "#8596af"
    }}>
      <div style={{ fontSize: 40, opacity: 0.3 }}>◈</div>
      <p style={{ margin: 0, fontSize: 13, textAlign: "center", maxWidth: 260 }}>
        Saisissez les détails d'un virement et cliquez sur <strong>Analyser</strong> pour voir
        l'analyse MARS complète.
      </p>
    </div>
  );

  const ds  = DECISION_STYLE[result.decision] || DECISION_STYLE.APPROVE;
  const ctx = result.account_context;
  const ratio = result.features?.ratio_montant;

  // Context sentence under the decision
  let contextLine = null;
  if (ctx && ratio) {
    const mult = ratio.toFixed(1);
    if (ratio > 3) {
      contextLine = `${mult}× la moyenne du compte (${ctx.montant_moyen} $)`;
    } else if (ratio < 0.3) {
      contextLine = `Montant faible — ${mult}× la moyenne du compte`;
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>

      {/* ① Decision banner */}
      <div style={{
        padding: "16px 20px", borderRadius: 10,
        background: ds.bg, border: `1.5px solid ${ds.border}`,
        display: "flex", alignItems: "center", gap: 18
      }}>
        <ScoreGauge value={result.score_mars}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: ds.color, letterSpacing: 1 }}>
            {ds.label}
          </div>
          {contextLine && (
            <div style={{ fontSize: 12, color: "#3d4e6a", marginTop: 3 }}>{contextLine}</div>
          )}
          <div style={{ fontSize: 11, color: "#8596af", marginTop: 4 }}>
            Confiance {Math.round(result.confidence * 100)}%
            {result.contradiction && (
              <span style={{ marginLeft: 10, color: "#d97706", fontWeight: 600 }}>
                ⚠ Contradiction entre agents
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ② Account context (compact) */}
      {ctx && (
        <div style={{ padding: "14px 16px", background: "#f7f4ee", borderRadius: 8, border: "1px solid #e4ddd3" }}>
          <AccountContext ctx={ctx} txMontant={result.features?.montant}/>
        </div>
      )}

      {/* ③ Risk factors */}
      {result.risk_factors.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 0.8, color: "#8596af", fontWeight: 600, marginBottom: 10 }}>
            SIGNAUX DÉTECTÉS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.risk_factors.map((f, i) => <RiskTag key={i} label={f}/>)}
          </div>
        </div>
      )}

      {/* ④ Agent scores */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: 0.8, color: "#8596af", fontWeight: 600, marginBottom: 14 }}>
          SCORES PAR AGENT
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.entries(result.agent_scores).map(([k, v]) => (
            <AgentBar key={k} id={k} score={v}/>
          ))}
        </div>
      </div>

      {/* ⑤ Narrative (justification only — no repeat of risk factors) */}
      <div style={{ borderTop: "1px solid #e4ddd3", paddingTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.8, color: "#8596af", fontWeight: 600 }}>
            ANALYSE NARRATIVE
          </div>
          {!narrativeState.data && !narrativeState.loading && (
            <button
              onClick={onNarrative}
              style={{
                fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 5,
                background: "#0c1b34", color: "#fff",
                border: "none", cursor: "pointer",
              }}
            >
              Générer avec Mistral
            </button>
          )}
        </div>
        <NarrativePanel
          narrative={narrativeState.data}
          loading={narrativeState.loading}
          error={narrativeState.error}
        />
      </div>

      {/* ⑥ Raw features (de-emphasized) */}
      <RawFeatures features={result.features}/>
    </div>
  );
}

function LiveOps() {
  const [accounts, setAccounts]       = useStateL([]);
  const [form, setForm]               = useStateL({
    account_id: "", montant: "", commercant: "Amazon Prime", device: "mobile", timestamp: "",
  });
  const [loading, setLoading]         = useStateL(false);
  const [result, setResult]           = useStateL(null);
  const [error, setError]             = useStateL(null);
  const [narrative, setNarrative]     = useStateL({ data: null, loading: false, error: null });
  const lastTxRef                     = useRefL(null);

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
      setResult(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNarrative = async () => {
    if (!lastTxRef.current) return;
    setNarrative({ data: null, loading: true, error: null });
    try {
      const r = await fetch(`${API}/analyze/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastTxRef.current),
      });
      if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
      setNarrative({ data: await r.json(), loading: false, error: null });
    } catch (e) {
      setNarrative({ data: null, loading: false, error: e.message });
    }
  };

  const loadRandomTx = async (wantFraud) => {
    try {
      const r = await fetch(`${API}/transactions/sample?n=10`);
      const d = await r.json();
      const ids = wantFraud ? d.fraud : d.legitimate;
      if (!ids?.length) return;
      const tid = ids[Math.floor(Math.random() * ids.length)];

      const r2 = await fetch(`${API}/transactions/${tid}/details`);
      if (!r2.ok) return;
      const tx = await r2.json();

      setForm({
        account_id: tx.account_id || "",
        montant:    String(tx.montant),
        commercant: tx.commercant,
        device:     tx.device,
        timestamp:  "",
      });
      setResult(null);
      setNarrative({ data: null, loading: false, error: null });
    } catch {}
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>

      {/* ── Formulaire ── */}
      <div style={{
        width: 340, flexShrink: 0, borderRight: "1px solid #e4ddd3",
        display: "flex", flexDirection: "column", overflowY: "auto"
      }}>
        <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid #e4ddd3" }}>
          <div style={{ fontSize: 10, letterSpacing: 0.8, color: "#8596af", fontWeight: 600, marginBottom: 4 }}>
            MARS ANALYZER
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0c1b34" }}>
            Tester un virement
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: "#3d4e6a", lineHeight: 1.5 }}>
            Pipeline MARS — 5 agents ML analysent en temps réel.
          </p>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <label style={labelStyle}>Compte</label>
            <select
              value={form.account_id}
              onChange={e => setField("account_id", e.target.value)}
              style={inputStyle}
            >
              <option value="">— Compte inconnu —</option>
              {accounts.map(a => (
                <option key={a.account_id} value={a.account_id}>{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Montant (CAD)</label>
            <input
              type="number" min="0.01" step="0.01"
              placeholder="ex: 450.00"
              value={form.montant}
              onChange={e => setField("montant", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Marchand</label>
            <select
              value={form.commercant}
              onChange={e => setField("commercant", e.target.value)}
              style={inputStyle}
            >
              {MERCHANTS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Appareil</label>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {["mobile", "tablette", "desktop"].map(d => (
                <button
                  key={d}
                  onClick={() => setField("device", d)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12,
                    fontWeight: form.device === d ? 700 : 400,
                    background: form.device === d ? "#0c1b34" : "#fff",
                    color: form.device === d ? "#fff" : "#3d4e6a",
                    border: `1px solid ${form.device === d ? "#0c1b34" : "#e4ddd3"}`,
                    cursor: "pointer", transition: "all .15s",
                  }}
                >{d}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Horodatage <span style={{ color: "#8596af", fontWeight: 400 }}>(optionnel)</span></label>
            <input
              type="datetime-local"
              value={form.timestamp}
              onChange={e => setField("timestamp", e.target.value)}
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !form.montant}
            style={{
              padding: "11px", borderRadius: 8, fontSize: 14, fontWeight: 700,
              background: loading || !form.montant ? "#cfc8be" : "#be1f26",
              color: "#fff", border: "none", cursor: loading || !form.montant ? "default" : "pointer",
              letterSpacing: 0.5, transition: "background .15s",
            }}
          >
            {loading ? "Analyse en cours…" : "Analyser"}
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => loadRandomTx(true)}  style={ghostBtn}>Fraude aléatoire</button>
            <button onClick={() => loadRandomTx(false)} style={ghostBtn}>Légitime aléatoire</button>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#be1f26", background: "#fef2f2", padding: 10, borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ── Résultats ── */}
      <ResultPanel result={result} onNarrative={handleNarrative} narrativeState={narrative}/>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#3d4e6a",
  letterSpacing: 0.3, marginBottom: 6,
};
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
  border: "1px solid #e4ddd3", background: "#fff", color: "#0c1b34",
  boxSizing: "border-box", fontFamily: "inherit", outline: "none",
};
const ghostBtn = {
  flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600,
  background: "#fff", color: "#3d4e6a", border: "1px solid #e4ddd3",
  borderRadius: 6, cursor: "pointer",
};

Object.assign(window, { LiveOps });
