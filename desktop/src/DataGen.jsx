// DataGen.jsx — Vue Génération de données · FraudNet

const { useState: useStateG2, useEffect: useEffectG2, useRef: useRefG2, useCallback: useCallbackG2 } = React;

const API = "http://localhost:8000";

const ARCH_META = {
  etudiant:    { label: "Étudiant",    color: "#3b82f6", emoji: "🎓" },
  jeune_actif: { label: "Jeune actif", color: "#f59e0b", emoji: "💼" },
  famille:     { label: "Famille",     color: "#10b981", emoji: "🏠" },
  entreprise:  { label: "Entreprise",  color: "#8b5cf6", emoji: "🏢" },
  retraite:    { label: "Retraité",    color: "#ef4444", emoji: "🌴" },
};

const FRAUD_META = {
  carte_volee:     { label: "Carte volée",     color: "#be1f26" },
  test_carte:      { label: "Test de carte",   color: "#c86020" },
  prise_de_compte: { label: "Prise de compte", color: "#d4760a" },
  reseau_mules:    { label: "Réseau de mules", color: "#8b1a1a" },
  structuration:   { label: "Structuration",   color: "#6b3fa0" },
};

const DEFAULT_ARCH = { etudiant: 20, jeune_actif: 25, famille: 25, entreprise: 20, retraite: 10 };
const DEFAULT_FRAUD = { carte_volee: 30, test_carte: 25, prise_de_compte: 20, reseau_mules: 15, structuration: 10 };

function fmtNum(n) { return n?.toLocaleString("fr-CA") ?? "—"; }
function fmtSec(n) { return n < 60 ? `${n} s` : `${Math.ceil(n/60)} min`; }

// ── Primitives ───────────────────────────────────────────────────────────────

function Section({ title, icon, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ display: "block", width: 12, height: 2, background: "var(--red)", flexShrink: 0 }}/>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--ink-3)", fontWeight: 600 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>{children}</span>
      {hint && <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{hint}</span>}
    </div>
  );
}

function SliderInput({ value, onChange, min, max, step = 1, unit = "", color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: color || "var(--navy)", height: 4, cursor: "pointer" }}/>
      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
        color: "var(--navy)", width: 56, textAlign: "right", flexShrink: 0 }}>
        {value}{unit}
      </span>
    </div>
  );
}

function ArchBar({ archKey, value, total, onChange }) {
  const meta  = ARCH_META[archKey];
  const pct   = total > 0 ? Math.round(value / total * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--navy)", display: "flex", gap: 6, alignItems: "center" }}>
          <span>{meta.emoji}</span>
          <span style={{ fontWeight: 500 }}>{meta.label}</span>
        </span>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700, color: meta.color }}>{pct} %</span>
      </div>
      <input type="range" min={0} max={100} step={1} value={value}
        onChange={e => onChange(archKey, Number(e.target.value))}
        style={{ width: "100%", accentColor: meta.color, height: 4, cursor: "pointer" }}/>
    </div>
  );
}

function FraudTypeRow({ fKey, weight, enabled, onToggle, onWeight }) {
  const meta = FRAUD_META[fKey];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10,
      opacity: enabled ? 1 : 0.4, transition: "opacity .2s" }}>
      <input type="checkbox" checked={enabled} onChange={() => onToggle(fKey)}
        style={{ accentColor: meta.color, flexShrink: 0 }}/>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: meta.color, flexShrink: 0 }}/>
      <span style={{ fontSize: 11, color: "var(--navy)", flex: 1, fontWeight: 500 }}>
        {meta.label}
      </span>
      {enabled && (
        <>
          <input type="range" min={5} max={60} step={5} value={weight}
            onChange={e => onWeight(fKey, Number(e.target.value))}
            style={{ width: 90, accentColor: meta.color, height: 4, cursor: "pointer" }}
            disabled={!enabled}/>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
            color: meta.color, fontWeight: 700, width: 32, textAlign: "right" }}>
            {weight} %
          </span>
        </>
      )}
    </div>
  );
}

function StatBadge({ label, value, color, big }) {
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", padding: "10px 14px",
      display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: big ? 22 : 18, fontFamily: "'JetBrains Mono',monospace",
        fontWeight: 700, color: color || "var(--navy)", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function ProgressBar({ pct, step }) {
  const STEPS = ["accounts", "transactions", "fraud", "features", "saving", "done"];
  const labels = { accounts:"Comptes", transactions:"Transactions", fraud:"Fraude",
                   features:"Features", saving:"Sauvegarde", done:"Terminé" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)" }}>
          {labels[step] || step}
        </span>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700, color: "var(--navy)" }}>{pct} %</span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%",
          background: pct === 100 ? "#10b981" : "var(--navy)",
          borderRadius: 3, transition: "width .4s ease" }}/>
      </div>
      <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
        {STEPS.map((s, i) => {
          const idx   = STEPS.indexOf(step);
          const done  = i < idx || (s === "done" && pct === 100);
          const active = s === step && pct < 100;
          return (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%",
                background: done ? "#10b981" : active ? "var(--navy)" : "var(--border)",
                transition: "background .3s" }}/>
              <span style={{ fontSize: 7, color: active ? "var(--navy)" : done ? "#10b981" : "var(--ink-3)",
                fontWeight: active || done ? 700 : 400, textAlign: "center" }}>
                {labels[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DatasetCard({ ds, onSelect, selected }) {
  const s = ds.stats;
  return (
    <div onClick={() => onSelect(ds)}
      style={{ padding: "12px 14px", border: `1px solid ${selected ? "var(--navy)" : "var(--border)"}`,
        background: selected ? "rgba(12,27,52,.04)" : "var(--card)", cursor: "pointer",
        transition: "border-color .15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>{ds.name}</span>
          {ds.is_main && (
            <span style={{ marginLeft: 6, fontSize: 9, background: "rgba(12,27,52,.1)",
              color: "var(--navy)", padding: "1px 5px", borderRadius: 2, fontWeight: 600 }}>
              ACTIF
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: "var(--ink-3)" }}>
          {new Date(ds.created_at).toLocaleDateString("fr-CA")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {fmtNum(s.n_accounts)} comptes
        </span>
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {s.n_transactions ? fmtNum(s.n_transactions) + " tx" : "—"}
        </span>
        {s.n_fraud != null && (
          <span style={{ fontSize: 10, color: "#be1f26", fontWeight: 600 }}>
            {s.n_fraud} fraudes
          </span>
        )}
      </div>
    </div>
  );
}

// ── Mini archetype preview pie (SVG) ──────────────────────────────────────────

function ArchPie({ weights }) {
  const total = Object.values(weights).reduce((s, v) => s + v, 0) || 1;
  const cx = 40, cy = 40, R = 34;
  let angle = -Math.PI / 2;
  const slices = Object.entries(weights).filter(([, v]) => v > 0).map(([k, v]) => {
    const a0 = angle;
    const sw = (v / total) * 2 * Math.PI;
    angle += sw;
    const a1 = angle;
    const lg = sw > Math.PI ? 1 : 0;
    const path = `M${cx} ${cy} L${cx+R*Math.cos(a0)} ${cy+R*Math.sin(a0)} A${R} ${R} 0 ${lg} 1 ${cx+R*Math.cos(a1)} ${cy+R*Math.sin(a1)}Z`;
    return { key: k, path, color: ARCH_META[k]?.color || "#ccc" };
  });
  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      {slices.map(s => <path key={s.key} d={s.path} fill={s.color} stroke="white" strokeWidth={1}/>)}
    </svg>
  );
}

// ── Main DataGen ──────────────────────────────────────────────────────────────

function DataGen() {
  // Basic params
  const [nAccounts, setNAccounts]   = useStateG2(300);
  const [weeks, setWeeks]           = useStateG2(13);
  const [seed, setSeed]             = useStateG2(42);
  const [fraudRate, setFraudRate]   = useStateG2(3);

  // Archetype weights (raw, normalised on the fly)
  const [archWeights, setArchWeights] = useStateG2({ ...DEFAULT_ARCH });

  // Fraud types: enabled + weight sliders
  const [fraudEnabled, setFraudEnabled] = useStateG2(
    Object.fromEntries(Object.keys(FRAUD_META).map(k => [k, true]))
  );
  const [fraudWeights, setFraudWeights] = useStateG2({ ...DEFAULT_FRAUD });

  // Destination
  const [destination, setDestination] = useStateG2("new");
  const [datasetName, setDatasetName] = useStateG2("");

  // Generation job
  const [jobId, setJobId]     = useStateG2(null);
  const [job, setJob]         = useStateG2(null);
  const pollRef               = useRefG2(null);

  // Existing datasets
  const [datasets, setDatasets] = useStateG2([]);

  useEffectG2(() => {
    fetch(`${API}/generate/datasets`)
      .then(r => r.json())
      .then(setDatasets)
      .catch(() => {});
  }, []);

  // ── Derived estimates ──
  const archTotal = Object.values(archWeights).reduce((s, v) => s + v, 0) || 1;
  const archNorm  = Object.fromEntries(Object.entries(archWeights).map(([k, v]) => [k, v / archTotal]));

  // Avg tx/week per archetype (rough estimates from config)
  const TX_PER_WEEK = { etudiant: 7, jeune_actif: 16, famille: 10, entreprise: 5, retraite: 4 };
  const estTx = Math.round(
    Object.entries(archNorm).reduce((s, [k, w]) => s + w * nAccounts * (TX_PER_WEEK[k] || 8), 0) * weeks
  );
  const estFraud = Math.round(nAccounts * fraudRate / 100 * 1.5); // rough
  const estTime  = Math.max(1, Math.round(nAccounts * weeks * 0.0006));

  // ── Archetype slider handler ──
  function handleArchChange(key, val) {
    setArchWeights(prev => ({ ...prev, [key]: val }));
  }

  // ── Fraud type handlers ──
  function toggleFraudType(key) {
    setFraudEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function handleFraudWeight(key, val) {
    setFraudWeights(prev => ({ ...prev, [key]: val }));
  }

  // ── Generate ──
  async function handleGenerate() {
    if (jobId && job?.status === "running") return;

    // Build normalised archetype_weights (only send if non-default)
    const rawArch = Object.fromEntries(
      Object.entries(archWeights).map(([k, v]) => [k, v / archTotal])
    );

    // Build enabled fraud_types
    const enabledFraud = Object.entries(fraudEnabled)
      .filter(([, on]) => on)
      .reduce((acc, [k]) => { acc[k] = fraudWeights[k] || 10; return acc; }, {});

    const payload = {
      n_accounts:        nAccounts,
      weeks:             weeks,
      seed:              seed,
      fraud_rate:        fraudRate / 100,
      archetype_weights: rawArch,
      fraud_types:       enabledFraud,
      destination,
      dataset_name:      datasetName || `gen_${nAccounts}c_${weeks}w`,
    };

    try {
      const res = await fetch(`${API}/generate/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setJobId(data.job_id);
      setJob({ status: "running", progress: 0, step: "init", log: [], result: null, error: null });
    } catch (e) {
      alert("Impossible de contacter l'API.");
    }
  }

  // ── Polling ──
  useEffectG2(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res  = await fetch(`${API}/generate/status/${jobId}`);
        const data = await res.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current);
          // Refresh dataset list
          fetch(`${API}/generate/datasets`).then(r => r.json()).then(setDatasets).catch(() => {});
        }
      } catch (_) {}
    };
    poll();
    pollRef.current = setInterval(poll, 600);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  // ── Reload main dataset ──
  async function handleReload() {
    try {
      const res  = await fetch(`${API}/generate/reload`, { method: "POST" });
      const data = await res.json();
      alert(`✅ Prédicateur rechargé — ${fmtNum(data.transactions_indexed)} transactions indexées`);
    } catch (e) {
      alert("Erreur lors du rechargement.");
    }
  }

  const isRunning = job?.status === "running";
  const isDone    = job?.status === "done";
  const isError   = job?.status === "error";

  const selStyle = {
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--navy)", padding: "7px 10px", fontSize: 11,
    fontFamily: "var(--font)", cursor: "pointer", outline: "none", borderRadius: 4,
    width: "100%",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>

      {/* Header bar */}
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)",
        padding: "8px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--ink-3)", fontWeight: 600 }}>Vue Génération</span>
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          Estimation : ~{fmtNum(estTx)} tx · ~{estFraud} fraudes · ~{fmtSec(estTime)}
        </span>
      </div>

      {/* Two-column layout */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 24px",
        display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

        {/* LEFT — Paramètres */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 1. Base */}
          <Section title="Paramètres de base">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
              <div>
                <FieldLabel hint={`~${fmtNum(estTx)} tx`}>Nombre de comptes</FieldLabel>
                <SliderInput value={nAccounts} onChange={setNAccounts} min={50} max={2000} step={50}/>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {[100, 300, 500, 1000].map(v => (
                    <button key={v} onClick={() => setNAccounts(v)}
                      style={{ fontSize: 10, padding: "3px 8px", border: "1px solid var(--border)",
                        background: nAccounts === v ? "var(--navy)" : "var(--card)",
                        color: nAccounts === v ? "white" : "var(--ink-2)",
                        cursor: "pointer", borderRadius: 3 }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel hint={`${weeks} sem. ≈ ${Math.round(weeks/4.3)} mois`}>Durée de simulation</FieldLabel>
                <SliderInput value={weeks} onChange={setWeeks} min={2} max={52} unit=" sem."/>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {[4, 13, 26, 52].map(v => (
                    <button key={v} onClick={() => setWeeks(v)}
                      style={{ fontSize: 10, padding: "3px 8px", border: "1px solid var(--border)",
                        background: weeks === v ? "var(--navy)" : "var(--card)",
                        color: weeks === v ? "white" : "var(--ink-2)",
                        cursor: "pointer", borderRadius: 3 }}>
                      {v}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel>Seed (reproducibilité)</FieldLabel>
                <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))}
                  style={{ ...selStyle, width: "100%", fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 13, padding: "7px 10px", boxSizing: "border-box" }}/>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {[42, 0, 123, 999].map(v => (
                    <button key={v} onClick={() => setSeed(v)}
                      style={{ fontSize: 10, padding: "3px 8px", border: "1px solid var(--border)",
                        background: seed === v ? "var(--navy)" : "var(--card)",
                        color: seed === v ? "white" : "var(--ink-2)",
                        cursor: "pointer", borderRadius: 3 }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* 2. Archetypes */}
          <Section title="Répartition des profils clients">
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 16, alignItems: "center" }}>
              <ArchPie weights={archWeights}/>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.keys(ARCH_META).map(k => (
                  <ArchBar key={k} archKey={k} value={archWeights[k]}
                    total={archTotal} onChange={handleArchChange}/>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "var(--ink-3)", alignSelf: "center" }}>Présets :</span>
              {[
                { label: "Défaut", v: DEFAULT_ARCH },
                { label: "Jeunes", v: { etudiant:35, jeune_actif:35, famille:15, entreprise:10, retraite:5 } },
                { label: "Seniors", v: { etudiant:5, jeune_actif:10, famille:20, entreprise:15, retraite:50 } },
                { label: "Pro", v: { etudiant:5, jeune_actif:20, famille:15, entreprise:50, retraite:10 } },
              ].map(p => (
                <button key={p.label} onClick={() => setArchWeights(p.v)}
                  style={{ fontSize: 10, padding: "4px 10px", border: "1px solid var(--border)",
                    background: "var(--card)", color: "var(--ink-2)", cursor: "pointer", borderRadius: 3 }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(12,27,52,.04)",
              fontSize: 10, color: "var(--ink-3)", display: "flex", gap: 16, flexWrap: "wrap" }}>
              {Object.entries(archNorm).map(([k, w]) => {
                const n = Math.round(nAccounts * w);
                return n > 0 ? (
                  <span key={k}><span style={{ color: ARCH_META[k].color, fontWeight: 700 }}>
                    {ARCH_META[k].emoji} {n}</span> {ARCH_META[k].label}</span>
                ) : null;
              })}
            </div>
          </Section>

          {/* 3. Fraude */}
          <Section title="Paramètres de fraude">
            <div style={{ marginBottom: 16 }}>
              <FieldLabel hint={`~${estFraud} cas attendus`}>
                Taux de fraude cible
              </FieldLabel>
              <SliderInput value={fraudRate} onChange={setFraudRate} min={0.5} max={15} step={0.5}
                unit=" %" color="#be1f26"/>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {[1, 3, 5, 10].map(v => (
                  <button key={v} onClick={() => setFraudRate(v)}
                    style={{ fontSize: 10, padding: "3px 8px", border: "1px solid var(--border)",
                      background: fraudRate === v ? "#be1f26" : "var(--card)",
                      color: fraudRate === v ? "white" : "var(--ink-2)",
                      cursor: "pointer", borderRadius: 3 }}>
                    {v} %
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <FieldLabel hint="Cocher pour activer · glisser pour le poids relatif">
                Types de fraude injectés
              </FieldLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {Object.keys(FRAUD_META).map(k => (
                  <FraudTypeRow key={k} fKey={k}
                    weight={fraudWeights[k]} enabled={fraudEnabled[k]}
                    onToggle={toggleFraudType} onWeight={handleFraudWeight}/>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "var(--ink-3)" }}>
                Total activé : {Object.entries(fraudEnabled).filter(([,on])=>on)
                  .map(([k]) => `${FRAUD_META[k].label} (${fraudWeights[k]}%)`)
                  .join(" · ") || "Aucun"}
              </div>
            </div>
          </Section>

          {/* 4. Destination */}
          <Section title="Destination">
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              {[
                { v: "new",   label: "Nouveau dataset",   sub: "Fichiers isolés dans un sous-dossier" },
                { v: "merge", label: "Fusionner",          sub: "Ajoute au dataset principal (accounts + transactions)" },
              ].map(opt => (
                <div key={opt.v} onClick={() => setDestination(opt.v)}
                  style={{ flex: 1, padding: "12px 14px", cursor: "pointer",
                    border: `1px solid ${destination === opt.v ? "var(--navy)" : "var(--border)"}`,
                    background: destination === opt.v ? "rgba(12,27,52,.04)" : "var(--card)",
                    transition: "all .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%",
                      border: `2px solid ${destination === opt.v ? "var(--navy)" : "var(--border)"}`,
                      background: destination === opt.v ? "var(--navy)" : "transparent" }}/>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>
                      {opt.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--ink-3)", paddingLeft: 20 }}>{opt.sub}</span>
                </div>
              ))}
            </div>

            {destination === "new" && (
              <div>
                <FieldLabel>Nom du dataset</FieldLabel>
                <input type="text"
                  value={datasetName}
                  onChange={e => setDatasetName(e.target.value)}
                  placeholder={`gen_${nAccounts}c_${weeks}w`}
                  style={{ ...selStyle, width: "100%", boxSizing: "border-box",
                    fontFamily: "'JetBrains Mono',monospace" }}/>
                <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>
                  Sauvegardé dans <code style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                    data/generated/{datasetName || `gen_${nAccounts}c_${weeks}w`}/
                  </code>
                </div>
              </div>
            )}

            {destination === "merge" && (
              <div style={{ padding: "10px 14px", background: "rgba(190,31,38,.04)",
                border: "1px solid rgba(190,31,38,.15)", fontSize: 11, color: "var(--ink-2)" }}>
                ⚠ La fusion est additive — les doublons sont filtrés par transaction_id/account_id.
                Le prédicateur MARS devra être rechargé après la fusion.
              </div>
            )}
          </Section>

        </div>

        {/* RIGHT — Résumé + Génération + Datasets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Estimation summary */}
          <Section title="Estimation">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <StatBadge label="Comptes" value={fmtNum(nAccounts)} big/>
              <StatBadge label="Transactions ~" value={fmtNum(estTx)} big/>
              <StatBadge label="Fraudes ~" value={`~${estFraud}`} color="#be1f26"/>
              <StatBadge label="Durée ~" value={fmtSec(estTime)}/>
              <StatBadge label="Semaines" value={weeks}/>
              <StatBadge label="Seed" value={seed}/>
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", borderTop: "1px solid var(--border)",
              paddingTop: 10 }}>
              {Object.keys(FRAUD_META).filter(k => fraudEnabled[k]).length} type(s) de fraude · {
              Object.entries(fraudEnabled).filter(([,on])=>on).length > 0 ? (
                Object.entries(fraudEnabled).filter(([,on])=>on).map(([k]) => (
                  <span key={k} style={{ color: FRAUD_META[k].color, fontWeight: 600, marginRight: 6 }}>
                    {FRAUD_META[k].label}
                  </span>
                ))
              ) : <span>Aucun type activé</span>}
            </div>
          </Section>

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={isRunning}
            style={{ padding: "14px 20px", background: isRunning ? "var(--border)" : "var(--navy)",
              color: isRunning ? "var(--ink-3)" : "white", border: "none", cursor: isRunning ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", fontFamily: "var(--font)",
              transition: "background .2s" }}>
            {isRunning ? "Génération en cours…" : "▶  Générer le dataset"}
          </button>

          {/* Progress */}
          {job && (
            <Section title={isDone ? "✅ Terminé" : isError ? "❌ Erreur" : "Progression"}>
              {!isError && (
                <div style={{ marginBottom: 14 }}>
                  <ProgressBar pct={job.progress} step={job.step}/>
                </div>
              )}

              {isDone && job.result && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  <StatBadge label="Comptes" value={fmtNum(job.result.n_accounts)}/>
                  <StatBadge label="Transactions" value={fmtNum(job.result.n_transactions)}/>
                  <StatBadge label="Fraudes" value={job.result.n_fraud} color="#be1f26"/>
                  <StatBadge label="Features" value={job.result.n_features}/>
                </div>
              )}

              {isDone && job.result && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6 }}>
                    Distribution finale :
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(job.result.archetype_counts || {}).map(([k, n]) => (
                      <span key={k} style={{ fontSize: 10, padding: "2px 7px",
                        background: `${ARCH_META[k]?.color}22`, color: ARCH_META[k]?.color,
                        border: `1px solid ${ARCH_META[k]?.color}44`, borderRadius: 2, fontWeight: 600 }}>
                        {ARCH_META[k]?.emoji} {n} {ARCH_META[k]?.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Log */}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5,
                color: "var(--ink-3)", lineHeight: 1.8, maxHeight: 160, overflowY: "auto",
                background: "rgba(12,27,52,.03)", padding: "8px 10px" }}>
                {(job.log || []).map((l, i) => (
                  <div key={i} style={{ color: l.includes("✓") ? "#059669" : l.includes("ERREUR") ? "#be1f26" : "var(--ink-3)" }}>
                    {l}
                  </div>
                ))}
              </div>

              {isDone && destination === "merge" && (
                <button onClick={handleReload}
                  style={{ marginTop: 10, width: "100%", padding: "10px", background: "#059669",
                    color: "white", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  ↺ Recharger le prédicateur MARS
                </button>
              )}
            </Section>
          )}

          {/* Datasets */}
          <Section title="Datasets disponibles">
            {datasets.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Aucun dataset trouvé.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {datasets.map(ds => (
                  <DatasetCard key={ds.id} ds={ds} selected={false} onSelect={() => {}}/>
                ))}
              </div>
            )}
            <button onClick={() => {
              fetch(`${API}/generate/datasets`).then(r=>r.json()).then(setDatasets).catch(()=>{});
            }} style={{ marginTop: 10, width: "100%", padding: "7px", background: "var(--card)",
              border: "1px solid var(--border)", color: "var(--ink-2)", cursor: "pointer",
              fontSize: 10, fontFamily: "var(--font)" }}>
              ↺ Actualiser la liste
            </button>
          </Section>

        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DataGen });
