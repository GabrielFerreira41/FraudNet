// Dashboard.jsx — Vue Données · FraudNet

const { useState } = React;

// ── Dataset constants ────────────────────────────────────────────────────

const DS = {
  accounts:     "1 000",
  transactions: "228 661",
  frauds:       "105",
  fraud_rate:   "0.046",
  features:     31,
  weeks:        13,
};

const FRAUD_SCENARIOS = [
  { label: "Carte volée",           count: 36 },
  { label: "Test de carte",         count: 22 },
  { label: "Prise de compte",       count: 20 },
  { label: "Paiement mobile",       count: 12 },
  { label: "Structuration / Mules", count:  9 },
  { label: "Virement couverture",   count:  6 },
];

const FEATURES = [
  { n: 8, cat: "Vélocité",     ex: "velocite_1h, velocite_24h, nb_tx_1h…" },
  { n: 7, cat: "Comportement", ex: "est_rafale, ecart_montant_30tx…" },
  { n: 6, cat: "Temporel",     ex: "heure_sin, heure_cos, is_weekend…" },
  { n: 5, cat: "Contexte",     ex: "score_anomalie_tx, dist_km…" },
  { n: 5, cat: "Identité",     ex: "age_compte_jours, province_enc…" },
];

const AGENTS = [
  { num:"01", cat:"BEHAVIOR", tech:"TRANSFORMER · LSTM",  name:"Séquence", desc:"Lit la transaction dans le fil de l'historique. Repère les ruptures de comportement.",  tags:["CARTE VOLÉE","PRISE DE COMPTE"],  status:"planned" },
  { num:"02", cat:"NETWORK",  tech:"GRAPH NEURAL NET",    name:"Graphe",   desc:"Cartographie les flux entre comptes et bénéficiaires. Voit les structures invisibles.", tags:["MULES","STRUCTURATION"],          status:"planned" },
  { num:"03", cat:"RULES",    tech:"LIGHTGBM · FEATURES", name:"Baseline", desc:"Modèle tabulaire rapide et interprétable. Référence solide, calibrée par scénario.",    tags:["TEST DE CARTE","PAIEMENT MOBILE"],status:"in-progress" },
  { num:"04", cat:"FUSION",   tech:"STACKING · ENSEMBLE", name:"Ensemble", desc:"Combine les trois précédents. Compense les angles morts, calibre la latence.",          tags:["VIREMENT","COUVERTURE"],          status:"planned" },
];

// ── Chart data ───────────────────────────────────────────────────────────

// % of daily transaction volume per hour
const TX_H = [1.4,1.1,0.8,0.7,0.8,1.4, 3.0,5.4,7.1,7.8,8.2,8.4, 7.9,7.7,7.4,7.1,6.7,5.7, 4.4,3.7,3.1,2.4,1.8,1.2];
// Distribution of ~105 fraud events across 24 hours (nighttime over-indexed)
const FD_H = [7,8,9,8,7,5, 3,2,1,1,2,2, 2,2,1,1,2,3, 4,5,6,7,7,6];

// % of all tx vs % of fraudulent tx by amount range
const AMOUNT_BINS = [
  { label: "< 25$",    all: 34, fraud: 24 },
  { label: "25–100$",  all: 30, fraud: 20 },
  { label: "100–500$", all: 22, fraud: 22 },
  { label: "500–2k$",  all:  9, fraud: 21 },
  { label: "> 2k$",    all:  5, fraud: 13 },
];

const ARCHETYPES = [
  { label: "Travailleur actif", n: 423 },
  { label: "Retraité",          n: 178 },
  { label: "Étudiant",          n: 145 },
  { label: "Entrepreneur",      n: 121 },
  { label: "Professionnel",     n:  93 },
  { label: "Touriste",          n:  40 },
];

const PROVINCES = [
  { label: "Ontario",          code: "ON", n: 314 },
  { label: "Québec",           code: "QC", n: 221 },
  { label: "Colombie-Brit.",   code: "BC", n: 148 },
  { label: "Alberta",          code: "AB", n: 130 },
  { label: "Manitoba",         code: "MB", n:  68 },
  { label: "Saskatchewan",     code: "SK", n:  56 },
  { label: "Autres",           code: "—",  n:  63 },
];

// ── Base components ──────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div className="section-label">
      <span>{children}</span>
    </div>
  );
}

function KpiCard({ num, suffix, label, desc }) {
  return (
    <div className="kpi-card">
      <div className="kpi-num">
        {num}{suffix && <span className="kpi-suffix">{suffix}</span>}
      </div>
      <div className="kpi-sub">{label}</div>
      {desc && <div className="kpi-desc">{desc}</div>}
    </div>
  );
}

function FraudBar({ label, count, max }) {
  return (
    <div className="fraud-row">
      <div className="fraud-label">{label}</div>
      <div className="fraud-track">
        <div className="fraud-fill" style={{ width: Math.round(count / max * 100) + "%" }}/>
      </div>
      <div className="fraud-count">{count}</div>
    </div>
  );
}

function AgentCard({ num, cat, tech, name, desc, tags, status }) {
  return (
    <div className="agent-card">
      <div className="agent-num">{num}</div>
      <div className="agent-category">{cat}</div>
      <div className="agent-tech">{tech}</div>
      <div className="agent-name">{name}</div>
      <div className="agent-desc">{desc}</div>
      <div className="agent-tags">
        {tags.map(t => <span key={t} className="agent-tag">{t}</span>)}
      </div>
      <div className={`agent-status ${status}`}>
        {status === "in-progress" ? "● En cours" : "○ Planifié"}
      </div>
    </div>
  );
}

// ── Chart components ─────────────────────────────────────────────────────

function ChartCard({ title, sub, children }) {
  return (
    <div style={{ background: "var(--card)", padding: "20px 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ display: "block", width: 14, height: 2, background: "var(--red)", flexShrink: 0 }}/>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{title}</span>
        {sub && <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.06em", fontStyle: "italic" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Swatch({ color, opacity, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 10, height: 6, background: color, opacity, flexShrink: 0 }}/>
      <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}

// Chart 1 — Fraudes & volume par heure de la journée
function HourlyChart() {
  const txMax = Math.max(...TX_H);
  const fdMax = Math.max(...FD_H);
  const W = 240, H = 72;
  const bw = W / 24;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 16}`} style={{ overflow: "visible" }}>
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={0} y1={H * (1 - f)} x2={W} y2={H * (1 - f)}
            stroke="var(--border)" strokeWidth={0.4}/>
        ))}
        {/* Total volume bars */}
        {TX_H.map((v, i) => (
          <rect key={`t${i}`}
            x={i * bw} y={H - (v / txMax) * H}
            width={bw - 0.3} height={(v / txMax) * H}
            fill="var(--navy)" opacity={0.13}
          />
        ))}
        {/* Fraud bars */}
        {FD_H.map((v, i) => (
          <rect key={`f${i}`}
            x={i * bw + bw * 0.2} y={H - (v / fdMax) * H}
            width={bw * 0.6} height={(v / fdMax) * H}
            fill="var(--red)" opacity={0.72}
          />
        ))}
        {/* Baseline */}
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border-strong)" strokeWidth={0.6}/>
        {/* Hour labels */}
        {[0, 4, 8, 12, 16, 20].map(h => (
          <text key={h} x={h * bw + bw / 2} y={H + 13}
            textAnchor="middle" fontSize={5.5} fill="var(--ink-3)"
            fontFamily="Inter, sans-serif"
          >{h}h</text>
        ))}
        {/* Night annotation */}
        <text x={3 * bw} y={8} fontSize={5} fill="var(--red)" opacity={0.7} fontFamily="Inter, sans-serif">nuit</text>
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        <Swatch color="var(--red)"   opacity={0.72} label="Fraudes (105)"/>
        <Swatch color="var(--navy)"  opacity={0.18} label="Volume total (normalisé)"/>
      </div>
    </div>
  );
}

// Chart 2 — Distribution des montants : toutes tx vs fraudes
function AmountChart() {
  const maxAll = Math.max(...AMOUNT_BINS.map(b => b.all));
  const H = 80, slotW = 44, gap = 8;
  const W = AMOUNT_BINS.length * (slotW + gap) - gap;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`}>
        {[0.5, 1].map(f => (
          <line key={f} x1={0} y1={H * (1 - f)} x2={W} y2={H * (1 - f)}
            stroke="var(--border)" strokeWidth={0.4}/>
        ))}
        {AMOUNT_BINS.map((b, i) => {
          const x     = i * (slotW + gap);
          const allH  = (b.all   / maxAll) * H;
          const frdH  = (b.fraud / maxAll) * H;
          const barW  = slotW * 0.44;
          return (
            <g key={b.label}>
              {/* All tx */}
              <rect x={x}          y={H - allH} width={barW} height={allH} fill="var(--navy)" opacity={0.45}/>
              {/* Fraud */}
              <rect x={x + barW + 2} y={H - frdH} width={barW} height={frdH} fill="var(--red)"   opacity={0.70}/>
              {/* % labels */}
              <text x={x + barW / 2}       y={H - allH - 3} textAnchor="middle" fontSize={5.5} fill="var(--ink-2)" fontFamily="Inter, sans-serif">{b.all}%</text>
              <text x={x + barW + 2 + barW / 2} y={H - frdH - 3} textAnchor="middle" fontSize={5.5} fill="var(--red)" opacity={0.85} fontFamily="Inter, sans-serif">{b.fraud}%</text>
              {/* Bucket label */}
              <text x={x + slotW / 2} y={H + 11} textAnchor="middle" fontSize={5.5} fill="var(--ink-3)" fontFamily="Inter, sans-serif">{b.label}</text>
            </g>
          );
        })}
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border-strong)" strokeWidth={0.6}/>
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        <Swatch color="var(--navy)" opacity={0.45} label="Toutes transactions"/>
        <Swatch color="var(--red)"  opacity={0.70} label="Frauduleuses"/>
      </div>
    </div>
  );
}

// Chart 3 & 4 — Horizontal bar (reusable)
function HBarList({ data, maxN }) {
  const m = maxN || Math.max(...data.map(d => d.n));
  return (
    <div>
      {data.map(d => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          {d.code && (
            <span style={{ width: 22, fontSize: 9.5, fontWeight: 700, color: "var(--ink-3)", fontFamily: "var(--mono)", flexShrink: 0 }}>{d.code}</span>
          )}
          <div style={{ flex: 1, fontSize: 11, color: "var(--navy)", minWidth: 100, maxWidth: d.code ? 120 : 148 }}>{d.label}</div>
          <div style={{ flex: 2, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: (d.n / m * 100) + "%", background: "var(--navy)", opacity: 0.6 }}/>
          </div>
          <div style={{ width: 34, textAlign: "right", fontSize: 11, fontWeight: 600, color: "var(--navy)", fontFamily: "var(--mono)" }}>{d.n}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

function Dashboard() {
  const maxFraud = Math.max(...FRAUD_SCENARIOS.map(s => s.count));

  return (
    <div className="main">

      {/* ── KPIs ── */}
      <SectionLabel>Le Dataset · Source CAFC synthétique</SectionLabel>
      <div className="kpi-grid">
        <KpiCard num={DS.accounts}     label="Comptes"          desc="Profils synthétiques canadiens, 21 colonnes"/>
        <KpiCard num={DS.transactions} label="Transactions"     desc={`${DS.weeks} semaines simulées, stockées en Parquet`}/>
        <KpiCard num={DS.frauds}       label="Fraudes labellées" desc="6 scénarios injectés via fraud_injector"/>
        <KpiCard num={DS.fraud_rate} suffix="%" label="Taux de fraude" desc="Représentatif des datasets bancaires réels"/>
      </div>

      <div className="section-gap"/>

      {/* ── Scénarios + Features ── */}
      <SectionLabel>Répartition des scénarios · {DS.frauds} fraudes injectées</SectionLabel>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2, background:"var(--border)", border:"1px solid var(--border)" }}>
        <div style={{ background:"var(--card)", padding:"24px 24px 28px" }}>
          <div className="fraud-list">
            {FRAUD_SCENARIOS.map(s => <FraudBar key={s.label} label={s.label} count={s.count} max={maxFraud}/>)}
          </div>
          <div style={{ marginTop:16, fontSize:11, color:"var(--ink-3)" }}>
            Total · <strong style={{ color:"var(--navy)" }}>{DS.frauds} fraudes</strong> sur {DS.transactions} transactions
          </div>
        </div>
        <div className="feat-panel">
          <div className="feat-panel-title">Features engineered · {DS.features} au total</div>
          {FEATURES.map(f => (
            <div key={f.cat} className="feat-row">
              <div className="feat-n">{f.n}</div>
              <div>
                <div className="feat-cat">{f.cat}</div>
                <div className="feat-ex">{f.ex}</div>
              </div>
            </div>
          ))}
          <div className="feat-total"><strong>{DS.features} features</strong> — prêtes pour le modèle ML</div>
        </div>
      </div>

      <div className="section-gap"/>

      {/* ── MARS Pipeline ── */}
      <SectionLabel>Pipeline MARS · 4 agents + 1 arbitre</SectionLabel>
      <div className="agents-grid">
        {AGENTS.map(a => <AgentCard key={a.num} {...a}/>)}
      </div>
      <div className="arbiter">
        <div className="arbiter-lhs">
          <div className="arbiter-eyebrow">∞ / Arbitre</div>
          <div className="arbiter-title">Une décision, <em>explicable.</em></div>
        </div>
        <div className="arbiter-meta">
          <div><div className="arbiter-field-label">Score</div><div className="arbiter-field-value">0 — 100</div></div>
          <div><div className="arbiter-field-label">Action</div><div className="arbiter-field-value">Approuver · Bloquer</div></div>
          <div><div className="arbiter-field-label">Pourquoi</div><div className="arbiter-field-value">SHAP, top 3 features</div></div>
        </div>
      </div>

      <div className="section-gap"/>

      {/* ── Charts ── */}
      <SectionLabel>Analyse du dataset · patterns & composition</SectionLabel>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2, background:"var(--border)", border:"1px solid var(--border)" }}>

        <ChartCard title="Fraudes & volume par heure" sub="Distribution sur 24h">
          <HourlyChart/>
          <div style={{ marginTop:10, fontSize:10.5, color:"var(--ink-3)", lineHeight:1.45 }}>
            Les fraudes sont sur-représentées la nuit (0–5h) quand le volume est faible — taux relatif 6–8× la moyenne.
          </div>
        </ChartCard>

        <ChartCard title="Distribution des montants" sub="Toutes tx vs fraudes">
          <AmountChart/>
          <div style={{ marginTop:10, fontSize:10.5, color:"var(--ink-3)", lineHeight:1.45 }}>
            Les fraudes sur-indexent les tranches 100–2k$ (carte volée, virement) et sous-indexent les petits montants.
          </div>
        </ChartCard>

        <ChartCard title="Archétypes de comptes" sub="1 000 comptes">
          <HBarList data={ARCHETYPES}/>
        </ChartCard>

        <ChartCard title="Répartition provinciale" sub="Distribution géographique">
          <HBarList data={PROVINCES}/>
        </ChartCard>

      </div>

    </div>
  );
}

Object.assign(window, { Dashboard });
