// GraphView.jsx — Réseau Neo4j · FraudNet

const { useState: useStateG, useEffect: useEffectG, useRef: useRefG } = React;

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

// ── Legend ──────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{
      position: "absolute", top: 16, left: 16,
      background: "var(--card)", border: "1px solid var(--border)",
      padding: "14px 16px", minWidth: 172,
    }}>
      <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 10 }}>
        Légende
      </div>
      {[
        { shape: "circle",  fill: "#be1f26", stroke: "#e85060", label: "Compte frauduleux" },
        { shape: "circle",  fill: "#1e3a5f", stroke: "#4878a8", label: "Compte pair" },
        { shape: "diamond", fill: "#7c5828", stroke: "#b08840", label: "Marchand impliqué" },
      ].map(({ shape, fill, stroke, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <svg width={18} height={18} style={{ flexShrink: 0 }}>
            {shape === "circle"
              ? <circle cx={9} cy={9} r={6} fill={fill} stroke={stroke} strokeWidth={1.5}/>
              : <rect x={4} y={4} width={10} height={10} fill={fill} stroke={stroke} strokeWidth={1.5} transform="rotate(45 9 9)"/>
            }
          </svg>
          <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{label}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 7 }}>
          Relations
        </div>
        {[
          { color: "rgba(190,31,38,.55)", label: "Transaction frauduleuse", h: 2 },
          { color: "rgba(30,58,95,.2)",   label: "Transaction légitime",    h: 1 },
        ].map(({ color, label, h }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <div style={{ width: 20, height: h, background: color, flexShrink: 0 }}/>
            <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Node detail panel ────────────────────────────────────────────────────

function NodePanel({ node, onClose }) {
  if (!node) return null;
  const isAcc  = node.type === "account";
  const accent = isAcc ? (node.fraud ? "#be1f26" : "#1e3a5f") : "#7c5828";
  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16, width: 252,
      background: "var(--card)", border: "1px solid var(--border)", overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        background: accent + "10",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, color: accent }}>
            {isAcc ? (node.fraud ? "Compte frauduleux" : "Compte pair") : "Marchand"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", marginTop: 3 }}>
            {isAcc ? node.full_name : node.label}
          </div>
        </div>
        <button onClick={onClose} style={{ fontSize: 18, color: "var(--ink-3)", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        {isAcc ? (
          <>
            <PRow label="Archétype"    value={node.archetype} />
            <PRow label="Province"     value={node.province} />
            <PRow label="Transactions" value={node.n_tx?.toLocaleString("fr-CA")} mono />
            {node.fraud && node.fraud_types?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>
                  Types de fraude
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {node.fraud_types.map(ft => (
                    <span key={ft} style={{
                      fontSize: 9, fontWeight: 600, padding: "3px 7px",
                      background: (FRAUD_COLORS[ft] || "#be1f26") + "18",
                      color: FRAUD_COLORS[ft] || "#be1f26",
                      border: `1px solid ${(FRAUD_COLORS[ft] || "#be1f26")}40`,
                    }}>
                      {FRAUD_LABELS[ft] || ft}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <PRow label="Catégorie"       value={node.categorie} />
            <PRow label="Tx frauduleuses" value={node.n_fraud_tx} mono />
          </>
        )}
      </div>
    </div>
  );
}

function PRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", fontFamily: mono ? "var(--mono)" : "inherit" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

function GraphView() {
  const svgRef = useRefG(null);
  const [graphData, setGraphData]       = useStateG(null);
  const [loading, setLoading]           = useStateG(true);
  const [error, setError]               = useStateG(false);
  const [fraudType, setFraudType]       = useStateG("all");
  const [province, setProvince]         = useStateG("all");
  const [showPeers, setShowPeers]       = useStateG(true);
  const [selectedNode, setSelectedNode] = useStateG(null);
  const [counts, setCounts]             = useStateG({ nodes: 0, edges: 0 });

  useEffectG(() => {
    fetch("http://localhost:8000/graph/network", { signal: AbortSignal.timeout(30000) })
      .then(r => r.json())
      .then(data => { setGraphData(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffectG(() => {
    if (!graphData || !svgRef.current || typeof d3 === "undefined") return;

    const nodes = graphData.nodes.filter(n => {
      if (!showPeers && n.type === "account" && !n.fraud) return false;
      if (province !== "all" && n.type === "account" && n.province !== province) return false;
      if (fraudType !== "all" && n.type === "account" && n.fraud && !n.fraud_types?.includes(fraudType)) return false;
      return true;
    }).map(n => ({ ...n }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = graphData.edges
      .filter(e => nodeIds.has(e.source?.id ?? e.source) && nodeIds.has(e.target?.id ?? e.target))
      .filter(e => fraudType === "all" || !e.fraud || e.fraud_type === fraudType)
      .map(e => ({ ...e }));

    setCounts({ nodes: nodes.length, edges: edges.length });

    const svg    = d3.select(svgRef.current);
    const width  = svgRef.current.clientWidth  || 900;
    const height = svgRef.current.clientHeight || 580;
    svg.selectAll("*").remove();

    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.15, 5]).on("zoom", ev => g.attr("transform", ev.transform)));

    const sim = d3.forceSimulation(nodes)
      .force("link",    d3.forceLink(edges).id(d => d.id).distance(90).strength(0.4))
      .force("charge",  d3.forceManyBody().strength(-280))
      .force("center",  d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => d.type === "merchant" ? 26 : 20));

    const link = g.append("g").selectAll("line")
      .data(edges).join("line")
      .attr("stroke",         d => d.fraud ? (FRAUD_COLORS[d.fraud_type] || "#be1f26") : "rgba(30,58,95,.18)")
      .attr("stroke-width",   d => d.fraud ? 1.8 : 0.8)
      .attr("stroke-opacity", d => d.fraud ? 0.6 : 1);

    const node = g.append("g").selectAll("g")
      .data(nodes).join("g")
      .style("cursor", "pointer")
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (ev, d) => { ev.stopPropagation(); setSelectedNode(d); });

    svg.on("click", () => setSelectedNode(null));

    // Account circles
    node.filter(d => d.type === "account")
      .append("circle")
      .attr("r", d => Math.max(8, Math.min(18, (d.n_tx || 100) / 30)))
      .attr("fill",         d => d.fraud ? "#be1f26" : "#1e3a5f")
      .attr("stroke",       d => d.fraud ? "#e85060" : "#4878a8")
      .attr("stroke-width", 1.5);

    // Pulse ring on fraud nodes
    node.filter(d => d.type === "account" && d.fraud)
      .append("circle")
      .attr("r", d => Math.max(8, Math.min(18, (d.n_tx || 100) / 30)) + 5)
      .attr("fill", "none")
      .attr("stroke", "#be1f26")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.22);

    // Merchant diamonds
    node.filter(d => d.type === "merchant")
      .append("rect")
      .attr("x", -11).attr("y", -11).attr("width", 22).attr("height", 22)
      .attr("transform", "rotate(45)")
      .attr("fill",         "#7c5828")
      .attr("stroke",       "#b08840")
      .attr("stroke-width", 1.5);

    // Labels
    node.append("text")
      .attr("dy", d => d.type === "merchant" ? 22 : d.fraud ? -16 : -14)
      .attr("text-anchor", "middle")
      .style("font-size", "9.5px")
      .style("fill", "var(--ink-2)")
      .style("font-family", "Inter, sans-serif")
      .style("pointer-events", "none")
      .text(d => d.label.length > 13 ? d.label.slice(0, 12) + "…" : d.label);

    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => sim.stop();
  }, [graphData, fraudType, province, showPeers]);

  const selStyle = {
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--navy)", padding: "6px 10px", fontSize: 12,
    fontFamily: "var(--font)", cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Filter bar */}
      <div style={{
        background: "var(--card)", borderBottom: "1px solid var(--border)",
        padding: "9px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div className="section-label" style={{ marginBottom: 0 }}>
          <span>Réseau de fraude · Neo4j</span>
        </div>
        <div style={{ flex: 1 }}/>
        <select value={fraudType} onChange={e => setFraudType(e.target.value)} style={selStyle}>
          <option value="all">Tous les types</option>
          {Object.entries(FRAUD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={province} onChange={e => setProvince(e.target.value)} style={selStyle}>
          <option value="all">Toutes provinces</option>
          {["ON","QC","BC","AB"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", fontSize: 12, color: "var(--ink-2)" }}>
          <input type="checkbox" checked={showPeers} onChange={e => setShowPeers(e.target.checked)}/>
          Comptes pairs
        </label>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#edeae3" }}>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10, color: "var(--ink-3)" }}>
            <div style={{ fontSize: 28, opacity: 0.3 }}>◌</div>
            <span style={{ fontSize: 12 }}>Chargement du réseau…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "var(--ink-3)" }}>
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
        {selectedNode && <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)}/>}

        {graphData && !loading && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            background: "var(--card)", border: "1px solid var(--border)",
            padding: "5px 18px", display: "flex", gap: 16, alignItems: "center",
          }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              <strong style={{ fontFamily: "var(--mono)", color: "var(--navy)" }}>{counts.nodes}</strong> nœuds
            </span>
            <span style={{ width: 1, height: 10, background: "var(--border)" }}/>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              <strong style={{ fontFamily: "var(--mono)", color: "var(--navy)" }}>{counts.edges}</strong> relations
            </span>
            <span style={{ width: 1, height: 10, background: "var(--border)" }}/>
            <span style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em" }}>Drag · Scroll pour zoomer</span>
          </div>
        )}

      </div>
    </div>
  );
}

Object.assign(window, { GraphView });
