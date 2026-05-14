// GraphView.jsx — Réseau de fraude · FraudNet

const { useState: useStateG, useEffect: useEffectG, useRef: useRefG, useMemo: useMemoG } = React;

const API = "http://localhost:8000";

const FRAUD_COLORS = {
  test_carte:      "#c86020",
  carte_volee:     "#be1f26",
  structuration:   "#6b3fa0",
  prise_de_compte: "#d4760a",
  reseau_mules:    "#8b1a1a",
};
const FRAUD_LABELS = {
  test_carte:      "Test de carte",
  carte_volee:     "Carte volée",
  structuration:   "Structuration",
  prise_de_compte: "Prise de compte",
  reseau_mules:    "Réseau de mules",
};
const ARCH_LABELS = {
  etudiant: "Étudiant", famille: "Famille", entreprise: "Entreprise",
  jeune_actif: "Jeune actif", retraite: "Retraité",
  professionnel: "Professionnel", voyageur: "Voyageur",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeColor(n) {
  if (n.type === "merchant") return "#7c5828";
  if (!n.fraud) return "#1e3a5f";
  if (n.fraud_types?.length === 1) return FRAUD_COLORS[n.fraud_types[0]] || "#be1f26";
  return "#be1f26";
}
function nodeStroke(n) {
  if (n.type === "merchant") return "#b08840";
  if (!n.fraud) return "#4878a8";
  return "#f08090";
}
function edgeColor(e) {
  if (!e.fraud) return "rgba(30,58,95,.15)";
  return (FRAUD_COLORS[e.fraud_type] || "#be1f26") + "99";
}
function edgeWidth(e) {
  if (!e.fraud) return 0.8;
  const m = e.montant || 100;
  return Math.max(1, Math.min(5, 1 + Math.log10(m / 10)));
}
function fmtCAD(v) {
  return v?.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }) ?? "—";
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{
      position: "absolute", top: 14, left: 14,
      background: "var(--card)", border: "1px solid var(--border)",
      padding: "12px 14px", minWidth: 168, fontSize: 11,
    }}>
      <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 10 }}>
        Nœuds
      </div>
      {Object.entries(FRAUD_LABELS).map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <svg width={14} height={14}><circle cx={7} cy={7} r={5} fill={FRAUD_COLORS[k]} stroke={FRAUD_COLORS[k] + "aa"} strokeWidth={1.5}/></svg>
          <span style={{ color: "var(--ink-2)" }}>{v}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <svg width={14} height={14}><circle cx={7} cy={7} r={5} fill="#1e3a5f" stroke="#4878a8" strokeWidth={1.5}/></svg>
        <span style={{ color: "var(--ink-2)" }}>Compte pair</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <svg width={14} height={14}><rect x={2} y={2} width={10} height={10} fill="#7c5828" stroke="#b08840" strokeWidth={1.5} transform="rotate(45 7 7)"/></svg>
        <span style={{ color: "var(--ink-2)" }}>Marchand</span>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 7 }}>
          Arêtes
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ width: 18, height: 2.5, background: "#be1f26aa" }}/>
          <span style={{ color: "var(--ink-2)" }}>Transaction fraude</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 18, height: 1, background: "rgba(30,58,95,.4)" }}/>
          <span style={{ color: "var(--ink-2)" }}>Transaction légitime</span>
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 7 }}>
          Épaisseur ∝ montant
        </div>
      </div>
    </div>
  );
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel({ graphData, selectedNode, filteredNodes, filteredEdges }) {
  if (!graphData) return null;

  if (selectedNode) {
    return <NodeDetail node={selectedNode} edges={filteredEdges} nodes={filteredNodes}/>;
  }

  // Global network stats
  const fraudNodes  = filteredNodes.filter(n => n.type === "account" && n.fraud);
  const peerNodes   = filteredNodes.filter(n => n.type === "account" && !n.fraud);
  const merchants   = filteredNodes.filter(n => n.type === "merchant");
  const fraudEdges  = filteredEdges.filter(e => e.fraud);

  // Fraud type distribution
  const ftCounts = {};
  fraudNodes.forEach(n => (n.fraud_types || []).forEach(ft => {
    ftCounts[ft] = (ftCounts[ft] || 0) + 1;
  }));
  const ftMax = Math.max(1, ...Object.values(ftCounts));

  // Archetype distribution
  const archCounts = {};
  filteredNodes.filter(n => n.type === "account").forEach(n => {
    const k = n.archetype || "?";
    archCounts[k] = (archCounts[k] || 0) + 1;
  });

  // Top merchants
  const topMerchants = merchants
    .filter(n => n.n_fraud_tx > 0)
    .sort((a, b) => b.n_fraud_tx - a.n_fraud_tx)
    .slice(0, 5);
  const maxFraudTx = Math.max(1, topMerchants[0]?.n_fraud_tx || 1);

  // Total fraud montant
  const totalMontant = fraudEdges.reduce((s, e) => s + (e.montant || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Network summary */}
      <div>
        <SectionLabel>Réseau filtré</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Comptes frauduleux", value: fraudNodes.length, alert: true },
            { label: "Comptes pairs",       value: peerNodes.length },
            { label: "Marchands",           value: merchants.length },
            { label: "Arêtes fraude",       value: fraudEdges.length, alert: true },
          ].map((s, i) => (
            <div key={i} style={{
              padding: "7px 9px", borderRadius: 5,
              background: s.alert ? "rgba(190,31,38,.05)" : "#f7f4ee",
              border: `1px solid ${s.alert ? "rgba(190,31,38,.15)" : "var(--border)"}`,
            }}>
              <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15,
                color: s.alert ? "#be1f26" : "var(--navy)" }}>{s.value}</div>
            </div>
          ))}
        </div>
        {totalMontant > 0 && (
          <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 5,
            background: "rgba(190,31,38,.05)", border: "1px solid rgba(190,31,38,.15)" }}>
            <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 2 }}>Montant total fraudé</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: "#be1f26" }}>
              {fmtCAD(totalMontant)}
            </div>
          </div>
        )}
      </div>

      {/* Fraud type breakdown */}
      {Object.keys(ftCounts).length > 0 && (
        <div>
          <SectionLabel>Types de fraude</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(ftCounts).sort((a, b) => b[1] - a[1]).map(([ft, n]) => (
              <div key={ft}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: FRAUD_COLORS[ft] || "#be1f26", fontWeight: 600 }}>
                    {FRAUD_LABELS[ft] || ft}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--navy)", fontWeight: 600 }}>{n}</span>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {topMerchants.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--ink-3)", width: 14, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontSize: 11, flex: 1, color: "var(--navy)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                <div style={{ width: 48, height: 4, background: "var(--border)", borderRadius: 2 }}>
                  <div style={{ width: `${Math.round(m.n_fraud_tx / maxFraudTx * 100)}%`,
                    height: "100%", background: "#7c5828", borderRadius: 2 }}/>
                </div>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "#7c5828",
                  width: 24, textAlign: "right" }}>{m.n_fraud_tx}</span>
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
                fontSize: 10, padding: "3px 8px", borderRadius: 10,
                background: "#f7f4ee", border: "1px solid var(--border)", color: "var(--ink-2)",
              }}>
                {ARCH_LABELS[arch] || arch} <span style={{ fontFamily: "var(--mono)", color: "var(--navy)", fontWeight: 600 }}>{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--ink-3)", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        Cliquer un nœud pour voir ses connexions
      </div>
    </div>
  );
}

function NodeDetail({ node, edges, nodes }) {
  const isAcc   = node.type === "account";
  const accent  = isAcc ? (node.fraud ? "#be1f26" : "#1e3a5f") : "#7c5828";
  const nodeId  = node.id;

  // Connexions directes
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

  const fraudConnEdges = connEdges.filter(e => e.fraud);
  const legitConnEdges = connEdges.filter(e => !e.fraud);
  const totalFraudMontant = fraudConnEdges.reduce((s, e) => s + (e.montant || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{
        padding: "10px 12px", borderRadius: 6,
        background: accent + "10", border: `1px solid ${accent}30`,
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase",
          fontWeight: 600, color: accent, marginBottom: 4 }}>
          {isAcc ? (node.fraud ? "Compte frauduleux" : "Compte pair") : "Marchand"}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
          {isAcc ? node.full_name : node.label}
        </div>
        {isAcc && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            {ARCH_LABELS[node.archetype] || node.archetype} · {node.province}
          </div>
        )}
        {!isAcc && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            {node.categorie}
          </div>
        )}
      </div>

      {/* Fraud types */}
      {isAcc && node.fraud && node.fraud_types?.length > 0 && (
        <div>
          <SectionLabel>Types de fraude</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {node.fraud_types.map(ft => (
              <span key={ft} style={{
                fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                background: (FRAUD_COLORS[ft] || "#be1f26") + "15",
                color: FRAUD_COLORS[ft] || "#be1f26",
                border: `1px solid ${(FRAUD_COLORS[ft] || "#be1f26")}40`,
              }}>{FRAUD_LABELS[ft] || ft}</span>
            ))}
          </div>
        </div>
      )}

      {/* Connection stats */}
      <div>
        <SectionLabel>Connexions</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          <StatMini label="Tx frauduleuses" value={fraudConnEdges.length} alert={fraudConnEdges.length > 0}/>
          <StatMini label="Tx légitimes"    value={legitConnEdges.length}/>
          <StatMini label="Nœuds connectés" value={connIds.size}/>
          {isAcc && <StatMini label="Total tx" value={node.n_tx} mono/>}
          {!isAcc && <StatMini label="Tx fraude total" value={node.n_fraud_tx} alert={node.n_fraud_tx > 0}/>}
        </div>
        {totalFraudMontant > 0 && (
          <div style={{ marginTop: 7, padding: "6px 9px", borderRadius: 5,
            background: "rgba(190,31,38,.05)", border: "1px solid rgba(190,31,38,.15)" }}>
            <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 1 }}>Montant fraudé via ce nœud</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: "#be1f26" }}>
              {fmtCAD(totalFraudMontant)}
            </div>
          </div>
        )}
      </div>

      {/* Connected nodes */}
      {connNodes.length > 0 && (
        <div>
          <SectionLabel>Nœuds directement liés ({connNodes.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 200, overflowY: "auto" }}>
            {connNodes.map(n => {
              const linkEdges = connEdges.filter(e => {
                const s = e.source?.id ?? e.source;
                const t = e.target?.id ?? e.target;
                return (s === nodeId && t === n.id) || (t === nodeId && s === n.id);
              });
              const fraudLink = linkEdges.some(e => e.fraud);
              const montant   = linkEdges.reduce((s, e) => s + (e.montant || 0), 0);
              const col       = n.type === "merchant" ? "#7c5828" : (n.fraud ? "#be1f26" : "#1e3a5f");
              return (
                <div key={n.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 4,
                  background: fraudLink ? "rgba(190,31,38,.04)" : "#f7f4ee",
                  border: `1px solid ${fraudLink ? "rgba(190,31,38,.15)" : "var(--border)"}`,
                }}>
                  <svg width={10} height={10}>
                    {n.type === "merchant"
                      ? <rect x={1} y={1} width={8} height={8} fill={col} transform="rotate(45 5 5)"/>
                      : <circle cx={5} cy={5} r={4} fill={col}/>
                    }
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

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
      color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
      {children}
    </div>
  );
}
function StatMini({ label, value, alert }) {
  return (
    <div style={{
      padding: "6px 8px", borderRadius: 4,
      background: alert ? "rgba(190,31,38,.05)" : "#f7f4ee",
      border: `1px solid ${alert ? "rgba(190,31,38,.15)" : "var(--border)"}`,
    }}>
      <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 1 }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13,
        color: alert ? "#be1f26" : "var(--navy)" }}>{value ?? "—"}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function GraphView() {
  const svgRef = useRefG(null);
  const [graphData, setGraphData]       = useStateG(null);
  const [loading, setLoading]           = useStateG(true);
  const [error, setError]               = useStateG(false);
  const [fraudType, setFraudType]       = useStateG("all");
  const [archetype, setArchetype]       = useStateG("all");
  const [province, setProvince]         = useStateG("all");
  const [montantMin, setMontantMin]     = useStateG(0);
  const [showPeers, setShowPeers]       = useStateG(true);
  const [showLegit, setShowLegit]       = useStateG(true);
  const [maxPeers, setMaxPeers]         = useStateG(25);
  const [selectedNode, setSelectedNode] = useStateG(null);

  useEffectG(() => {
    setLoading(true);
    setError(false);
    setSelectedNode(null);
    fetch(`${API}/graph/network?max_peers=${maxPeers}`, { signal: AbortSignal.timeout(30000) })
      .then(r => r.json())
      .then(data => { setGraphData(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [maxPeers]);

  // Filtered nodes & edges
  const { filteredNodes, filteredEdges } = useMemoG(() => {
    if (!graphData) return { filteredNodes: [], filteredEdges: [] };

    const nodes = graphData.nodes.filter(n => {
      if (!showPeers && n.type === "account" && !n.fraud) return false;
      if (province !== "all" && n.type === "account" && n.province !== province) return false;
      if (archetype !== "all" && n.type === "account" && n.archetype !== archetype) return false;
      if (fraudType !== "all" && n.type === "account" && n.fraud && !n.fraud_types?.includes(fraudType)) return false;
      return true;
    }).map(n => ({ ...n }));

    const nodeIds = new Set(nodes.map(n => n.id));

    const edges = graphData.edges
      .filter(e => {
        const s = e.source?.id ?? e.source;
        const t = e.target?.id ?? e.target;
        if (!nodeIds.has(s) || !nodeIds.has(t)) return false;
        if (!showLegit && !e.fraud) return false;
        if (fraudType !== "all" && e.fraud && e.fraud_type !== fraudType) return false;
        if (e.fraud && (e.montant || 0) < montantMin) return false;
        return true;
      }).map(e => ({ ...e }));

    return { filteredNodes: nodes, filteredEdges: edges };
  }, [graphData, fraudType, archetype, province, montantMin, showPeers, showLegit]);

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
      d3.zoom().scaleExtent([0.1, 6])
        .on("zoom", ev => g.attr("transform", ev.transform))
    );

    const nodes = filteredNodes;
    const edges = filteredEdges;

    const sim = d3.forceSimulation(nodes)
      .force("link",    d3.forceLink(edges).id(d => d.id).distance(95).strength(0.35))
      .force("charge",  d3.forceManyBody().strength(-300))
      .force("center",  d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => d.type === "merchant" ? 28 : 22));

    // Edges
    const link = g.append("g").selectAll("line")
      .data(edges).join("line")
      .attr("stroke",       d => edgeColor(d))
      .attr("stroke-width", d => edgeWidth(d))
      .attr("stroke-opacity", d => {
        if (!highlightIds) return d.fraud ? 0.65 : 0.9;
        const s = d.source?.id ?? d.source;
        const t = d.target?.id ?? d.target;
        return (highlightIds.has(s) && highlightIds.has(t)) ? 0.9 : 0.06;
      });

    // Nodes
    const node = g.append("g").selectAll("g")
      .data(nodes).join("g")
      .style("cursor", "pointer")
      .attr("opacity", d => !highlightIds ? 1 : (highlightIds.has(d.id) ? 1 : 0.12))
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (ev, d) => {
        ev.stopPropagation();
        setSelectedNode(prev => prev?.id === d.id ? null : d);
      });

    svg.on("click", () => setSelectedNode(null));

    // Account circles
    const accR = d => Math.max(8, Math.min(20, (d.n_tx || 100) / 28));
    node.filter(d => d.type === "account")
      .append("circle")
      .attr("r",            accR)
      .attr("fill",         d => nodeColor(d))
      .attr("stroke",       d => nodeStroke(d))
      .attr("stroke-width", 1.5);

    // Pulse ring on selected fraud
    node.filter(d => d.type === "account" && d.fraud)
      .append("circle")
      .attr("r",             d => accR(d) + 5)
      .attr("fill",          "none")
      .attr("stroke",        d => nodeColor(d))
      .attr("stroke-width",  0.8)
      .attr("stroke-opacity", d => highlightIds?.has(d.id) ? 0.5 : 0.18);

    // Merchant diamonds
    node.filter(d => d.type === "merchant")
      .append("rect")
      .attr("x", -12).attr("y", -12).attr("width", 24).attr("height", 24)
      .attr("transform", "rotate(45)")
      .attr("fill",         "#7c5828")
      .attr("stroke",       "#b08840")
      .attr("stroke-width", 1.5);

    // Labels
    node.append("text")
      .attr("dy", d => d.type === "merchant" ? 24 : -15)
      .attr("text-anchor", "middle")
      .style("font-size",    "9.5px")
      .style("fill",         "var(--ink-2)")
      .style("font-family",  "Inter, sans-serif")
      .style("font-weight",  d => selectedNode?.id === d.id ? "700" : "400")
      .style("pointer-events", "none")
      .text(d => {
        const lbl = d.type === "account" ? d.label : d.label;
        return lbl.length > 14 ? lbl.slice(0, 13) + "…" : lbl;
      });

    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => sim.stop();
  }, [filteredNodes, filteredEdges, selectedNode]);

  const selStyle = {
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--navy)", padding: "5px 9px", fontSize: 11,
    fontFamily: "var(--font)", cursor: "pointer", outline: "none", borderRadius: 4,
  };
  const toggleStyle = (active) => ({
    fontSize: 11, padding: "5px 10px", borderRadius: 4, cursor: "pointer",
    fontFamily: "var(--font)", fontWeight: active ? 600 : 400,
    background: active ? "var(--navy)" : "var(--card)",
    color: active ? "#fff" : "var(--ink-2)",
    border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Filter bar */}
      <div style={{
        background: "var(--card)", borderBottom: "1px solid var(--border)",
        padding: "8px 20px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--ink-3)", fontWeight: 600, marginRight: 4 }}>
          Réseau · Neo4j
        </div>

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

        <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }}/>

        <button onClick={() => setShowPeers(v => !v)} style={toggleStyle(showPeers)}>
          Comptes pairs
        </button>
        <button onClick={() => setShowLegit(v => !v)} style={toggleStyle(showLegit)}>
          Arêtes légitimes
        </button>

        <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }}/>

        <select
          value={maxPeers}
          onChange={e => setMaxPeers(Number(e.target.value))}
          style={selStyle}
          title="Nombre de comptes pairs chargés depuis l'API"
        >
          <option value={25}>25 pairs</option>
          <option value={50}>50 pairs</option>
          <option value={100}>100 pairs</option>
          <option value={200}>200 pairs</option>
          <option value={500}>500 pairs</option>
        </select>

        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)",
          fontFamily: "var(--mono)" }}>
          {filteredNodes.length} nœuds · {filteredEdges.length} arêtes
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Graph canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#edeae3" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", flexDirection: "column", gap: 10, color: "var(--ink-3)" }}>
              <div style={{ fontSize: 28, opacity: 0.3 }}>◌</div>
              <span style={{ fontSize: 12 }}>Chargement du réseau…</span>
            </div>
          )}
          {!loading && error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", flexDirection: "column", gap: 8, color: "var(--ink-3)" }}>
              <div style={{ fontSize: 28, opacity: 0.3 }}>⊘</div>
              <div style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>API non disponible</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)", marginTop: 4 }}>
                uvicorn src.api.main:app --port 8000
              </div>
            </div>
          )}
          {!loading && !error && (
            <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}/>
          )}
          {graphData && !loading && <Legend/>}
          {selectedNode && (
            <div style={{
              position: "absolute", top: 14, right: 14,
              fontSize: 11, color: "var(--ink-3)",
              background: "var(--card)", border: "1px solid var(--border)",
              padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            }} onClick={() => setSelectedNode(null)}>
              × Désélectionner
            </div>
          )}
        </div>

        {/* Stats / detail panel */}
        <div style={{
          width: 260, flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--card)",
          overflowY: "auto",
          padding: "16px 14px",
        }}>
          {graphData && !loading
            ? <StatsPanel
                graphData={graphData}
                selectedNode={selectedNode}
                filteredNodes={filteredNodes}
                filteredEdges={filteredEdges}
              />
            : <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginTop: 40 }}>
                Chargement…
              </div>
          }
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GraphView });
