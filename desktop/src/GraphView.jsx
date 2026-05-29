// GraphView.jsx — Réseau de fraude · FraudNet

const { useState: useStateG, useEffect: useEffectG, useRef: useRefG, useMemo: useMemoG } = React;

const API = "http://localhost:8000";

const FRAUD_COLORS = {
  carte_volee:      "#be1f26",
  test_carte:       "#c86020",
  prise_de_compte:  "#d4760a",
  reseau_mules:     "#8b1a1a",
  structuration:    "#6b3fa0",
  sim_swap:         "#0369a1",
  phishing:         "#0f766e",
  fraude_aines:     "#b45309",
  skimming:         "#4338ca",
  fraude_ecommerce: "#be185d",
};
const FRAUD_LABELS = {
  carte_volee:      "Carte volée",
  test_carte:       "Test de carte",
  prise_de_compte:  "Prise de compte",
  reseau_mules:     "Réseau de mules",
  structuration:    "Structuration",
  sim_swap:         "SIM Swap",
  phishing:         "Hameçonnage",
  fraude_aines:     "Arnaque aînés",
  skimming:         "Écrémage GAB",
  fraude_ecommerce: "Fraude e-commerce",
};
const ARCH_LABELS = {
  etudiant:    "Étudiant",
  famille:     "Famille",
  entreprise:  "Entreprise",
  jeune_actif: "Jeune actif",
  retraite:    "Retraité",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeColor(n) {
  if (n.type === "merchant") return "#7c5828";
  if (!n.fraud) return "#2d5a8e";
  if (n.fraud_types?.length === 1) return FRAUD_COLORS[n.fraud_types[0]] || "#be1f26";
  return "#be1f26";
}
function nodeStroke(n) {
  if (n.type === "merchant") return "#c4973c";
  if (!n.fraud) return "#6ea3d4";
  return "#f08090";
}
function edgeColor(e) {
  if (!e.fraud) return "rgba(45,90,142,.12)";
  return (FRAUD_COLORS[e.fraud_type] || "#be1f26") + "88";
}
function edgeWidth(e) {
  if (!e.fraud) return 0.8;
  const m = e.montant || 100;
  return Math.max(1.2, Math.min(4.5, 1 + Math.log10(m / 10)));
}
function fmtCAD(v) {
  return v?.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }) ?? "—";
}
function fmtNum(n) { return n?.toLocaleString("fr-CA") ?? "—"; }

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
      color: "var(--ink-3)", fontWeight: 700, marginBottom: 10,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ display: "block", width: 10, height: 1.5, background: "var(--red)", flexShrink: 0 }}/>
      {children}
    </div>
  );
}

function StatMini({ label, value, alert }) {
  return (
    <div style={{
      padding: "8px 10px",
      background: alert ? "rgba(190,31,38,.05)" : "var(--bg)",
      border: `1px solid ${alert ? "rgba(190,31,38,.2)" : "var(--border)"}`,
    }}>
      <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 3, fontWeight: 500 }}>{label}</div>
      <div style={{
        fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14,
        color: alert ? "#be1f26" : "var(--navy)",
      }}>{value ?? "—"}</div>
    </div>
  );
}

// ── Legend (inside right panel) ───────────────────────────────────────────────

function LegendPanel() {
  return (
    <div>
      <SectionLabel>Légende</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.12em", marginBottom: 4 }}>Nœuds comptes frauduleux</div>
        {Object.entries(FRAUD_LABELS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width={12} height={12} style={{ flexShrink: 0 }}>
              <circle cx={6} cy={6} r={5} fill={FRAUD_COLORS[k]} stroke={FRAUD_COLORS[k] + "88"} strokeWidth={1}/>
            </svg>
            <span style={{ fontSize: 10, color: "var(--ink-2)" }}>{v}</span>
          </div>
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }}/>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={12} height={12} style={{ flexShrink: 0 }}>
            <circle cx={6} cy={6} r={5} fill="#2d5a8e" stroke="#6ea3d4" strokeWidth={1}/>
          </svg>
          <span style={{ fontSize: 10, color: "var(--ink-2)" }}>Compte pair (légitime)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={12} height={12} style={{ flexShrink: 0 }}>
            <rect x={2} y={2} width={8} height={8} fill="#7c5828" stroke="#c4973c"
              strokeWidth={1} transform="rotate(45 6 6)"/>
          </svg>
          <span style={{ fontSize: 10, color: "var(--ink-2)" }}>Marchand ciblé</span>
        </div>
      </div>

      <div style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.12em", marginBottom: 6 }}>Arêtes</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 2.5, background: "#be1f26aa", flexShrink: 0 }}/>
          <span style={{ fontSize: 10, color: "var(--ink-2)" }}>Transaction frauduleuse</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 1, background: "rgba(45,90,142,.4)", flexShrink: 0 }}/>
          <span style={{ fontSize: 10, color: "var(--ink-2)" }}>Transaction légitime</span>
        </div>
      </div>
      <div style={{ fontSize: 9, color: "var(--ink-3)", fontStyle: "italic" }}>
        Épaisseur ∝ montant
      </div>
    </div>
  );
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel({ graphData, selectedNode, filteredNodes, filteredEdges }) {
  if (selectedNode) {
    return <NodeDetail node={selectedNode} edges={filteredEdges} nodes={filteredNodes}/>;
  }

  const fraudNodes  = filteredNodes.filter(n => n.type === "account" && n.fraud);
  const peerNodes   = filteredNodes.filter(n => n.type === "account" && !n.fraud);
  const merchants   = filteredNodes.filter(n => n.type === "merchant");
  const fraudEdges  = filteredEdges.filter(e => e.fraud);
  const totalMontant = fraudEdges.reduce((s, e) => s + (e.montant || 0), 0);

  const ftCounts = {};
  fraudNodes.forEach(n => (n.fraud_types || []).forEach(ft => {
    ftCounts[ft] = (ftCounts[ft] || 0) + 1;
  }));
  const ftMax = Math.max(1, ...Object.values(ftCounts));

  const archCounts = {};
  filteredNodes.filter(n => n.type === "account").forEach(n => {
    const k = n.archetype || "?";
    archCounts[k] = (archCounts[k] || 0) + 1;
  });

  const topMerchants = merchants
    .filter(n => n.n_fraud_tx > 0)
    .sort((a, b) => b.n_fraud_tx - a.n_fraud_tx)
    .slice(0, 5);
  const maxFraudTx = Math.max(1, topMerchants[0]?.n_fraud_tx || 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Network summary */}
      <div>
        <SectionLabel>Réseau filtré</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <StatMini label="Comptes frauduleux" value={fraudNodes.length} alert/>
          <StatMini label="Comptes pairs"       value={peerNodes.length}/>
          <StatMini label="Marchands"           value={merchants.length}/>
          <StatMini label="Arêtes fraude"       value={fraudEdges.length} alert/>
        </div>
        {totalMontant > 0 && (
          <div style={{ padding: "9px 10px", background: "rgba(190,31,38,.04)",
            border: "1px solid rgba(190,31,38,.18)" }}>
            <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 3, fontWeight: 500 }}>
              Montant total fraudé
            </div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "#be1f26" }}>
              {fmtCAD(totalMontant)}
            </div>
          </div>
        )}
      </div>

      {/* Fraud type breakdown */}
      {Object.keys(ftCounts).length > 0 && (
        <div>
          <SectionLabel>Types de fraude détectés</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(ftCounts).sort((a, b) => b[1] - a[1]).map(([ft, n]) => (
              <div key={ft}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: FRAUD_COLORS[ft] || "#be1f26", fontWeight: 600 }}>
                    {FRAUD_LABELS[ft] || ft}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--navy)", fontWeight: 700 }}>
                    {n}
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--border)", borderRadius: 2 }}>
                  <div style={{ width: `${Math.round(n / ftMax * 100)}%`, height: "100%",
                    background: FRAUD_COLORS[ft] || "#be1f26", borderRadius: 2 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <div>
          <SectionLabel>Marchands les plus ciblés</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {topMerchants.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--ink-3)", width: 14, textAlign: "right",
                  fontFamily: "var(--mono)" }}>{i + 1}</span>
                <span style={{ fontSize: 11, flex: 1, color: "var(--navy)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                <div style={{ width: 44, height: 4, background: "var(--border)", borderRadius: 2, flexShrink: 0 }}>
                  <div style={{ width: `${Math.round(m.n_fraud_tx / maxFraudTx * 100)}%`,
                    height: "100%", background: "#7c5828", borderRadius: 2 }}/>
                </div>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#7c5828",
                  width: 22, textAlign: "right", flexShrink: 0 }}>{m.n_fraud_tx}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archetype distribution */}
      {Object.keys(archCounts).length > 0 && (
        <div>
          <SectionLabel>Profils clients</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {Object.entries(archCounts).sort((a, b) => b[1] - a[1]).map(([arch, n]) => (
              <span key={arch} style={{
                fontSize: 10, padding: "3px 9px",
                background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink-2)",
              }}>
                {ARCH_LABELS[arch] || arch}&nbsp;
                <span style={{ fontFamily: "var(--mono)", color: "var(--navy)", fontWeight: 700 }}>{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--ink-3)", paddingTop: 6,
        borderTop: "1px solid var(--border)", fontStyle: "italic" }}>
        Cliquer un nœud pour voir ses connexions
      </div>
    </div>
  );
}

function NodeDetail({ node, edges, nodes }) {
  const isAcc  = node.type === "account";
  const accent = isAcc ? (node.fraud ? "#be1f26" : "#2d5a8e") : "#7c5828";
  const nodeId = node.id;

  const connEdges = edges.filter(e => {
    const s = e.source?.id ?? e.source;
    const t = e.target?.id ?? e.target;
    return s === nodeId || t === nodeId;
  });
  const connIds = new Set(connEdges.map(e => {
    const s = e.source?.id ?? e.source;
    const t = e.target?.id ?? e.target;
    return s === nodeId ? t : s;
  }));
  const connNodes = nodes.filter(n => connIds.has(n.id));
  const fraudConnEdges  = connEdges.filter(e => e.fraud);
  const legitConnEdges  = connEdges.filter(e => !e.fraud);
  const totalFraudMontant = fraudConnEdges.reduce((s, e) => s + (e.montant || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Header */}
      <div style={{
        padding: "12px 14px",
        background: accent + "0e", border: `1px solid ${accent}28`,
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
          fontWeight: 700, color: accent, marginBottom: 5 }}>
          {isAcc ? (node.fraud ? "Compte frauduleux" : "Compte pair") : "Marchand"}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", lineHeight: 1.2 }}>
          {isAcc ? node.full_name : node.label}
        </div>
        {isAcc && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
            {ARCH_LABELS[node.archetype] || node.archetype} · {node.province}
          </div>
        )}
        {!isAcc && node.categorie && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{node.categorie}</div>
        )}
      </div>

      {/* Fraud types */}
      {isAcc && node.fraud && node.fraud_types?.length > 0 && (
        <div>
          <SectionLabel>Types de fraude</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {node.fraud_types.map(ft => (
              <span key={ft} style={{
                fontSize: 10, fontWeight: 600, padding: "4px 9px",
                background: (FRAUD_COLORS[ft] || "#be1f26") + "12",
                color: FRAUD_COLORS[ft] || "#be1f26",
                border: `1px solid ${(FRAUD_COLORS[ft] || "#be1f26")}35`,
              }}>{FRAUD_LABELS[ft] || ft}</span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div>
        <SectionLabel>Connexions</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StatMini label="Tx frauduleuses" value={fraudConnEdges.length} alert={fraudConnEdges.length > 0}/>
          <StatMini label="Tx légitimes"    value={legitConnEdges.length}/>
          <StatMini label="Nœuds liés"      value={connIds.size}/>
          {isAcc  && <StatMini label="Total tx"        value={fmtNum(node.n_tx)}/>}
          {!isAcc && <StatMini label="Fraudes au total" value={node.n_fraud_tx} alert={node.n_fraud_tx > 0}/>}
        </div>
        {totalFraudMontant > 0 && (
          <div style={{ marginTop: 8, padding: "9px 10px",
            background: "rgba(190,31,38,.04)", border: "1px solid rgba(190,31,38,.18)" }}>
            <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 3 }}>Montant fraudé via ce nœud</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: "#be1f26" }}>
              {fmtCAD(totalFraudMontant)}
            </div>
          </div>
        )}
      </div>

      {/* Connected nodes */}
      {connNodes.length > 0 && (
        <div>
          <SectionLabel>Nœuds directement liés ({connNodes.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto" }}>
            {connNodes.map(n => {
              const linkEdges = connEdges.filter(e => {
                const s = e.source?.id ?? e.source;
                const t = e.target?.id ?? e.target;
                return (s === nodeId && t === n.id) || (t === nodeId && s === n.id);
              });
              const fraudLink = linkEdges.some(e => e.fraud);
              const montant   = linkEdges.reduce((s, e) => s + (e.montant || 0), 0);
              const col       = n.type === "merchant" ? "#7c5828" : (n.fraud ? "#be1f26" : "#2d5a8e");
              return (
                <div key={n.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 9px",
                  background: fraudLink ? "rgba(190,31,38,.04)" : "var(--bg)",
                  border: `1px solid ${fraudLink ? "rgba(190,31,38,.18)" : "var(--border)"}`,
                }}>
                  <svg width={10} height={10} style={{ flexShrink: 0 }}>
                    {n.type === "merchant"
                      ? <rect x={1} y={1} width={8} height={8} fill={col} transform="rotate(45 5 5)"/>
                      : <circle cx={5} cy={5} r={4} fill={col}/>}
                  </svg>
                  <span style={{ fontSize: 11, flex: 1, color: "var(--navy)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.type === "account" ? n.full_name : n.label}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink-3)", flexShrink: 0 }}>
                    {fmtCAD(montant)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function GraphView() {
  const svgRef = useRefG(null);
  const [graphData, setGraphData]         = useStateG(null);
  const [loading, setLoading]             = useStateG(true);
  const [error, setError]                 = useStateG(false);
  const [fraudType, setFraudType]         = useStateG("all");
  const [archetype, setArchetype]         = useStateG("all");
  const [province, setProvince]           = useStateG("all");
  const [montantMin, setMontantMin]       = useStateG(0);
  const [showPeers, setShowPeers]         = useStateG(true);
  const [showLegit, setShowLegit]         = useStateG(true);
  const [showMerchants, setShowMerchants] = useStateG(true);
  const [maxPeers, setMaxPeers]           = useStateG(25);
  const [maxFraud, setMaxFraud]           = useStateG(50);
  const [pendingPeers, setPendingPeers]   = useStateG(25);
  const [pendingFraud, setPendingFraud]   = useStateG(50);
  const [selectedNode, setSelectedNode]   = useStateG(null);
  const [activeTab, setActiveTab]         = useStateG("stats"); // "stats" | "legend"

  const applyNetwork = () => {
    setMaxPeers(pendingPeers);
    setMaxFraud(pendingFraud);
  };

  useEffectG(() => {
    setLoading(true);
    setError(false);
    setSelectedNode(null);
    fetch(`${API}/graph/network?max_peers=${maxPeers}&max_fraud=${maxFraud}`, {
      signal: AbortSignal.timeout(30000),
    })
      .then(r => r.json())
      .then(data => { setGraphData(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [maxPeers, maxFraud]);

  const { filteredNodes, filteredEdges } = useMemoG(() => {
    if (!graphData) return { filteredNodes: [], filteredEdges: [] };

    const nodes = graphData.nodes.filter(n => {
      if (!showMerchants && n.type === "merchant") return false;
      if (!showPeers && n.type === "account" && !n.fraud) return false;
      if (province !== "all" && n.type === "account" && n.province !== province) return false;
      if (archetype !== "all" && n.type === "account" && n.archetype !== archetype) return false;
      if (fraudType !== "all" && n.type === "account" && n.fraud && !n.fraud_types?.includes(fraudType)) return false;
      return true;
    }).map(n => ({ ...n }));

    const nodeIds = new Set(nodes.map(n => n.id));

    const edges = graphData.edges.filter(e => {
      const s = e.source?.id ?? e.source;
      const t = e.target?.id ?? e.target;
      if (!nodeIds.has(s) || !nodeIds.has(t)) return false;
      if (!showLegit && !e.fraud) return false;
      if (fraudType !== "all" && e.fraud && e.fraud_type !== fraudType) return false;
      if (e.fraud && (e.montant || 0) < montantMin) return false;
      return true;
    }).map(e => ({ ...e }));

    return { filteredNodes: nodes, filteredEdges: edges };
  }, [graphData, fraudType, archetype, province, montantMin, showPeers, showLegit, showMerchants]);

  // D3 simulation
  useEffectG(() => {
    if (!filteredNodes.length || !svgRef.current || typeof d3 === "undefined") return;

    const highlightIds = selectedNode
      ? (() => {
          const id = selectedNode.id;
          const neighbors = new Set([id]);
          filteredEdges.forEach(e => {
            const s = e.source?.id ?? e.source;
            const t = e.target?.id ?? e.target;
            if (s === id) neighbors.add(t);
            if (t === id) neighbors.add(s);
          });
          return neighbors;
        })()
      : null;

    const svg    = d3.select(svgRef.current);
    const width  = svgRef.current.clientWidth  || 800;
    const height = svgRef.current.clientHeight || 580;
    svg.selectAll("*").remove();

    const g = svg.append("g");
    svg.call(
      d3.zoom().scaleExtent([0.08, 8])
        .on("zoom", ev => g.attr("transform", ev.transform))
    );

    const nodes = filteredNodes;
    const edges = filteredEdges;

    const sim = d3.forceSimulation(nodes)
      .force("link",    d3.forceLink(edges).id(d => d.id).distance(120).strength(0.3))
      .force("charge",  d3.forceManyBody().strength(-420))
      .force("center",  d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => d.type === "merchant" ? 34 : 26));

    // Edges
    const link = g.append("g").selectAll("line")
      .data(edges).join("line")
      .attr("stroke",         d => edgeColor(d))
      .attr("stroke-width",   d => edgeWidth(d))
      .attr("stroke-opacity", d => {
        if (!highlightIds) return 1;
        const s = d.source?.id ?? d.source;
        const t = d.target?.id ?? d.target;
        return (highlightIds.has(s) && highlightIds.has(t)) ? 1 : 0.05;
      });

    // Nodes
    const node = g.append("g").selectAll("g")
      .data(nodes).join("g")
      .style("cursor", "pointer")
      .attr("opacity", d => !highlightIds ? 1 : (highlightIds.has(d.id) ? 1 : 0.1))
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (ev, d) => {
        ev.stopPropagation();
        setSelectedNode(prev => prev?.id === d.id ? null : d);
        setActiveTab("stats");
      });

    svg.on("click", () => setSelectedNode(null));

    const accR = d => Math.max(9, Math.min(22, (d.n_tx || 100) / 26));

    // Account circles
    node.filter(d => d.type === "account")
      .append("circle")
      .attr("r",            accR)
      .attr("fill",         d => nodeColor(d))
      .attr("stroke",       d => nodeStroke(d))
      .attr("stroke-width", 2);

    // Outer ring on fraud accounts
    node.filter(d => d.type === "account" && d.fraud)
      .append("circle")
      .attr("r",             d => accR(d) + 6)
      .attr("fill",          "none")
      .attr("stroke",        d => nodeColor(d))
      .attr("stroke-width",  1)
      .attr("stroke-opacity", d => highlightIds?.has(d.id) ? 0.55 : 0.2)
      .attr("stroke-dasharray", "3 2");

    // Merchant diamonds
    node.filter(d => d.type === "merchant")
      .append("rect")
      .attr("x", -13).attr("y", -13).attr("width", 26).attr("height", 26)
      .attr("transform", "rotate(45)")
      .attr("fill",         "#7c5828")
      .attr("stroke",       "#c4973c")
      .attr("stroke-width", 1.5);

    // Labels
    node.append("text")
      .attr("dy", d => d.type === "merchant" ? 26 : -16)
      .attr("text-anchor", "middle")
      .style("font-size",    "10px")
      .style("fill",         "var(--ink-2)")
      .style("font-family",  "Inter, sans-serif")
      .style("font-weight",  "500")
      .style("pointer-events", "none")
      .text(d => {
        const lbl = d.label || "";
        return lbl.length > 13 ? lbl.slice(0, 12) + "…" : lbl;
      });

    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => sim.stop();
  }, [filteredNodes, filteredEdges, selectedNode]);

  // ── Styles ──

  const selStyle = {
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--navy)", padding: "6px 10px", fontSize: 11,
    fontFamily: "var(--font)", cursor: "pointer", outline: "none",
  };

  const toggleStyle = active => ({
    fontSize: 11, padding: "6px 12px", cursor: "pointer",
    fontFamily: "var(--font)", fontWeight: active ? 600 : 400,
    background: active ? "var(--navy)" : "var(--card)",
    color: active ? "#fff" : "var(--ink-2)",
    border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Filter bar ── */}
      <div style={{
        background: "var(--card)", borderBottom: "1px solid var(--border)",
        padding: "10px 20px", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>

        {/* Title */}
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--ink-3)", fontWeight: 700, marginRight: 6, flexShrink: 0 }}>
          Réseau · Neo4j
        </span>

        {/* Filters group */}
        <select value={fraudType} onChange={e => { setFraudType(e.target.value); setSelectedNode(null); }} style={selStyle}>
          <option value="all">Tous les types</option>
          {Object.entries(FRAUD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={archetype} onChange={e => { setArchetype(e.target.value); setSelectedNode(null); }} style={selStyle}>
          <option value="all">Tous les profils</option>
          {Object.entries(ARCH_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={province} onChange={e => { setProvince(e.target.value); setSelectedNode(null); }} style={selStyle}>
          <option value="all">Toutes provinces</option>
          {["QC","ON","BC","AB"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={montantMin} onChange={e => setMontantMin(Number(e.target.value))} style={selStyle}>
          <option value={0}>Tous montants</option>
          <option value={100}>&gt; 100 $</option>
          <option value={500}>&gt; 500 $</option>
          <option value={1000}>&gt; 1 000 $</option>
          <option value={5000}>&gt; 5 000 $</option>
        </select>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }}/>

        {/* Visibility toggles */}
        <button onClick={() => setShowPeers(v => !v)}     style={toggleStyle(showPeers)}>Pairs</button>
        <button onClick={() => setShowLegit(v => !v)}     style={toggleStyle(showLegit)}>Légitimes</button>
        <button onClick={() => setShowMerchants(v => !v)} style={toggleStyle(showMerchants)}>Marchands</button>

        {/* Node / edge count (auto right) */}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)",
          fontFamily: "var(--mono)", flexShrink: 0 }}>
          {filteredNodes.length} nœuds · {filteredEdges.length} arêtes
        </span>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Graph canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#f5f2eb" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", flexDirection: "column", gap: 12, color: "var(--ink-3)" }}>
              <div style={{ fontSize: 32, opacity: 0.25 }}>◌</div>
              <span style={{ fontSize: 12 }}>Chargement du réseau…</span>
            </div>
          )}
          {!loading && error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", flexDirection: "column", gap: 10, color: "var(--ink-3)" }}>
              <div style={{ fontSize: 32, opacity: 0.25 }}>⊘</div>
              <div style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>API non disponible</div>
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", marginTop: 4 }}>
                uvicorn src.api.main:app --port 8000
              </div>
            </div>
          )}
          {!loading && !error && (
            <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}/>
          )}

          {/* Zoom hint */}
          {graphData && !loading && !selectedNode && (
            <div style={{ position: "absolute", bottom: 14, left: 14,
              fontSize: 10, color: "rgba(0,0,0,.35)", pointerEvents: "none" }}>
              Scroll pour zoomer · glisser pour déplacer · clic pour sélectionner
            </div>
          )}

          {selectedNode && (
            <button onClick={() => setSelectedNode(null)}
              style={{ position: "absolute", bottom: 14, left: 14,
                fontSize: 11, color: "var(--navy)", background: "var(--card)",
                border: "1px solid var(--border)", padding: "5px 12px", cursor: "pointer" }}>
              × Désélectionner
            </button>
          )}
        </div>

        {/* ── Right panel ── */}
        <div style={{
          width: 300, flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--card)",
          display: "flex", flexDirection: "column",
          minHeight: 0,
        }}>

          {/* Panel header — network size + tabs */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>

            {/* Network size controls */}
            <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
              color: "var(--ink-3)", fontWeight: 700, marginBottom: 10,
              display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "block", width: 10, height: 1.5, background: "var(--red)" }}/>
              Taille du réseau
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Comptes frauduleux", val: pendingFraud, set: setPendingFraud, min: 5, max: 200 },
                { label: "Comptes pairs",       val: pendingPeers, set: setPendingPeers, min: 0, max: 200 },
              ].map(({ label, val, set, min, max }) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--ink-2)", fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--navy)", fontWeight: 700 }}>
                      {val}
                    </span>
                  </div>
                  <input type="range" min={min} max={max} step={5} value={val}
                    onChange={e => set(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--navy)", cursor: "pointer" }}/>
                </div>
              ))}
            </div>

            <button onClick={applyNetwork} style={{
              width: "100%", padding: "8px", fontFamily: "var(--font)",
              background: (pendingFraud !== maxFraud || pendingPeers !== maxPeers) ? "var(--navy)" : "var(--bg)",
              color: (pendingFraud !== maxFraud || pendingPeers !== maxPeers) ? "#fff" : "var(--ink-2)",
              border: `1px solid ${(pendingFraud !== maxFraud || pendingPeers !== maxPeers) ? "var(--navy)" : "var(--border)"}`,
              cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            }}>
              {loading ? "Chargement…" : "Recharger le réseau"}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            {[
              { id: "stats",  label: selectedNode ? "Détail nœud" : "Statistiques" },
              { id: "legend", label: "Légende" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: "9px 0", fontSize: 10, fontWeight: activeTab === tab.id ? 700 : 400,
                  fontFamily: "var(--font)", cursor: "pointer", border: "none",
                  borderBottom: `2px solid ${activeTab === tab.id ? "var(--navy)" : "transparent"}`,
                  background: "transparent",
                  color: activeTab === tab.id ? "var(--navy)" : "var(--ink-3)",
                  letterSpacing: "0.04em",
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {graphData && !loading ? (
              activeTab === "legend"
                ? <LegendPanel/>
                : <StatsPanel
                    graphData={graphData}
                    selectedNode={selectedNode}
                    filteredNodes={filteredNodes}
                    filteredEdges={filteredEdges}
                  />
            ) : (
              <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginTop: 40 }}>
                {loading ? "Chargement…" : "Aucune donnée"}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GraphView });
