// PitchView.jsx — Vue explicative & narrative · FraudNet

const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

// ── Animation primitives ─────────────────────────────────────────────────

function Reveal({ children, delay = 0 }) {
  const ref  = useRefP(null);
  const [vis, setVis] = useStateP(false);
  useEffectP(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(16px)",
      transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${delay}s, transform 0.7s cubic-bezier(.16,1,.3,1) ${delay}s`,
    }}>
      {children}
    </div>
  );
}

function Counter({ to, prefix = "", suffix = "", duration = 1600 }) {
  const [n, setN] = useStateP(0);
  const ref = useRefP(null);
  const [started, setStarted] = useStateP(false);

  useEffectP(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStarted(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffectP(() => {
    if (!started) return;
    const t0 = performance.now();
    const tick = t => {
      const p = Math.min((t - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(e * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started, to]);

  return <span ref={ref}>{prefix}{n}{suffix}</span>;
}

function Typewriter({ text, startDelay = 500, charDelay = 32 }) {
  const [idx, setIdx] = useStateP(0);
  useEffectP(() => {
    const t = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        i++;
        setIdx(i);
        if (i >= text.length) clearInterval(id);
      }, charDelay);
      return () => clearInterval(id);
    }, startDelay);
    return () => clearTimeout(t);
  }, []);
  return (
    <span>
      {text.slice(0, idx)}
      {idx < text.length && (
        <span style={{ animation: "blink 0.75s step-end infinite", marginLeft: 1 }}>|</span>
      )}
    </span>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────

const STATS_P = [
  { to: 704,  suffix: " M$", label: "Pertes signalées · 2025",        desc: "Fraude bancaire au Canada, en hausse de 10 % / 2024." },
  { to: 240, prefix: "+", suffix: " %",  label: "Hausse depuis 2020", desc: "De 170 M$ à 704 M$ en cinq ans." },
  { to: 95,   suffix: " %",  label: "Faux positifs · systèmes actuels", desc: "Règles statiques : des milliers d'alertes inutiles." },
  { to: 12,   suffix: " G$", label: "Pertes réelles estimées",         desc: "Seuls 5 à 10 % des cas sont signalés au CAFC." },
];

const AGENTS_P = [
  { num:"01", cat:"BEHAVIOR", tech:"TRANSFORMER · LSTM",  name:"Séquence", desc:"Ruptures de comportement dans l'historique des transactions.",     tags:["CARTE VOLÉE","PRISE DE COMPTE"] },
  { num:"02", cat:"NETWORK",  tech:"GRAPH NEURAL NET",    name:"Graphe",   desc:"Structures invisibles dans les flux entre comptes et marchands.",   tags:["MULES","STRUCTURATION"] },
  { num:"03", cat:"RULES",    tech:"LIGHTGBM · FEATURES", name:"Baseline", desc:"Modèle tabulaire rapide, interprétable, référence calibrée.",       tags:["TEST DE CARTE","PAIEMENT MOBILE"] },
  { num:"04", cat:"FUSION",   tech:"STACKING · ENSEMBLE", name:"Ensemble", desc:"Fusion des trois agents, compensation des angles morts.",           tags:["VIREMENT","COUVERTURE"] },
];

const STEPS_P = [
  { n:"01", title:"Simulateur", desc:"Profils, transactions et scénarios de fraude injectés synthétiquement." },
  { n:"02", title:"Fan-out",    desc:"Chaque transaction est routée aux 4 agents en parallèle." },
  { n:"03", title:"Scoring",    desc:"Chaque agent renvoie un score 0–100 avec ses signaux." },
  { n:"04", title:"Arbitrage",  desc:"Fusion pondérée + SHAP : une décision explicable." },
  { n:"05", title:"Action",     desc:"Approuver · examiner · bloquer." },
];

const DONE_P = [
  "Simulateur — 228 661 transactions, 6 scénarios de fraude",
  "Feature pipeline — 31 features (vélocité, comportement, temporel…)",
  "Base Neo4j — chargement CSV + endpoints API",
  "API FastAPI — /health, /accounts, /graph/network",
  "Console Desktop — Vue Données + Réseau Neo4j + Vue Projet",
];
const TODO_P = [
  { label: "Agent 03 · LightGBM Baseline",     ongoing: true  },
  { label: "Agent 01 · LSTM Séquence",          ongoing: false },
  { label: "Agent 02 · GraphSAGE Réseau",       ongoing: false },
  { label: "Agent 04 · Stacking Ensemble",      ongoing: false },
  { label: "Meta-raisonneur · fusion SHAP",     ongoing: false },
  { label: "LLM Raisonneur · Claude API",       ongoing: false },
];

// ── Layout helpers ────────────────────────────────────────────────────────

function PLabel({ children }) {
  return (
    <div className="section-label" style={{ marginBottom: 28 }}>
      <span>{children}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 60 }}/>;
}

// ── Main view ─────────────────────────────────────────────────────────────

function PitchView() {
  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "72px 36px 96px" }}>

      {/* ── Hero ── */}
      <div style={{ textAlign: "center", marginBottom: 80, animation: "fadeUp 0.8s cubic-bezier(.16,1,.3,1) both" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 30 }}>
          <span style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
            Projet Portfolio · Data Science
          </span>
          <span style={{ background: "var(--red)", color: "#fff", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, padding: "3px 8px", borderRadius: 2 }}>
            En cours
          </span>
        </div>

        <div style={{ fontSize: "4.8rem", fontWeight: 700, color: "var(--navy)", lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 10 }}>
          FraudNet
        </div>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: 30 }}>
          M · A · R · S
        </div>

        <div style={{ fontSize: 15, color: "var(--ink-2)", maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.7, minHeight: 48 }}>
          <Typewriter
            text="Quatre agents spécialisés raisonnent en parallèle sur chaque transaction, puis délibèrent. Une décision en moins d'un battement de cils."
            startDelay={500}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 24, fontSize: 11, color: "var(--ink-3)", flexWrap: "wrap" }}>
          <span>Gabriel Ferreira · Data Scientist</span>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span>Montréal, Canada</span>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <span style={{ fontFamily: "var(--mono)" }}>gabipaul41@gmail.com</span>
        </div>
      </div>

      {/* ── Le problème ── */}
      <Reveal>
        <PLabel>Pourquoi ce projet · Centre Antifraude du Canada 2025</PLabel>
      </Reveal>

      <Reveal delay={0.05}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, background: "var(--border)", border: "1px solid var(--border)", marginBottom: 2 }}>
          {STATS_P.map(s => (
            <div key={s.label} style={{ background: "var(--card)", padding: "28px 22px 22px" }}>
              <div style={{ fontSize: "3rem", fontWeight: 700, color: "var(--navy)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                <Counter to={s.to} prefix={s.prefix || ""} suffix=""/>
                <span style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--red)" }}>{s.suffix}</span>
              </div>
              <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginTop: 10 }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.45 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderTop: "none", padding: "22px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 10 }}>Le problème</div>
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.65 }}>
                Les systèmes anti-fraude actuels reposent sur des <strong style={{ color: "var(--navy)" }}>règles statiques</strong> qui génèrent jusqu'à 95 % de fausses alertes. Chaque nouvelle technique de fraude nécessite une intervention manuelle pour être couverte.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 10 }}>La réponse MARS</div>
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.65 }}>
                MARS croise <strong style={{ color: "var(--navy)" }}>quatre raisonnements complémentaires</strong> — comportemental, relationnel, règles, fusion — sur chaque transaction, puis arbitre. Capter 0,1 % des pertes réelles représente déjà <strong style={{ color: "var(--navy)" }}>12 M$ sauvés</strong> par an.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      <Divider/>

      {/* ── Pipeline ── */}
      <Reveal>
        <PLabel>Quatre raisonnements, une décision · pipeline MARS</PLabel>
      </Reveal>

      <Reveal delay={0.05}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, background: "var(--border)", border: "1px solid var(--border)" }}>
          {AGENTS_P.map(a => (
            <div key={a.num} style={{ background: "var(--card)", padding: "24px" }}>
              <div style={{ fontSize: "3rem", fontWeight: 700, color: "var(--border-strong)", lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 12 }}>{a.num}</div>
              <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{a.cat}</div>
              <div style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginTop: 1 }}>{a.tech}</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--navy)", margin: "10px 0 8px" }}>{a.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{a.desc}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 14 }}>
                {a.tags.map(t => (
                  <span key={t} style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-2)", background: "var(--bg)", border: "1px solid var(--border)", padding: "3px 7px" }}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <div style={{ background: "var(--navy)", padding: "22px 28px", marginTop: 2, display: "flex", alignItems: "center", gap: 40 }}>
          <div>
            <div style={{ fontSize: 8.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", fontWeight: 600 }}>∞ / Arbitre</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff", marginTop: 4 }}>
              Une décision, <em style={{ color: "var(--red)" }}>explicable.</em>
            </div>
          </div>
          <div style={{ display: "flex", gap: 32, borderLeft: "1px solid rgba(255,255,255,.12)", paddingLeft: 40, marginLeft: "auto" }}>
            {[["Score","0 — 100"],["Action","Approuver · Bloquer"],["Pourquoi","SHAP, top 3 features"]].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Divider/>

      {/* ── Étapes ── */}
      <Reveal>
        <PLabel>Comment ça marche · 5 étapes</PLabel>
      </Reveal>

      <Reveal delay={0.05}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 2, background: "var(--border)", border: "1px solid var(--border)" }}>
          {STEPS_P.map((s, i) => (
            <div key={s.n} style={{ background: "var(--card)", padding: "22px 18px" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--red)", lineHeight: 1, letterSpacing: "-0.02em", marginBottom: 10 }}>{s.n}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", marginBottom: 7 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.55 }}>{s.desc}</div>
              {i < STEPS_P.length - 1 && (
                <div style={{ marginTop: 16, fontSize: 16, color: "var(--border-strong)" }}>→</div>
              )}
            </div>
          ))}
        </div>
      </Reveal>

      <Divider/>

      {/* ── Statut ── */}
      <Reveal>
        <PLabel>Statut du projet · Mai 2026</PLabel>
      </Reveal>

      <Reveal delay={0.05}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: "var(--border)", border: "1px solid var(--border)" }}>
          <div style={{ background: "var(--card)", padding: "26px 24px" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 18 }}>Complété</div>
            {DONE_P.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 11, alignItems: "flex-start" }}>
                <span style={{ color: "#22c55e", fontWeight: 700, flexShrink: 0, fontSize: 13 }}>✓</span>
                <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45 }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--card)", padding: "26px 24px" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 18 }}>En cours · Planifié</div>
            {TODO_P.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 11, alignItems: "flex-start" }}>
                <span style={{ color: s.ongoing ? "var(--red)" : "var(--border-strong)", fontWeight: 700, flexShrink: 0, fontSize: 11, marginTop: 1 }}>
                  {s.ongoing ? "●" : "○"}
                </span>
                <span style={{ fontSize: 12, color: s.ongoing ? "var(--navy)" : "var(--ink-2)", fontWeight: s.ongoing ? 600 : 400, lineHeight: 1.45 }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

    </div>
  );
}

Object.assign(window, { PitchView });
