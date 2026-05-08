// Vue Neo4j — réseau de fraude visualisé avec D3 force-directed graph
const { useState: useStateG, useEffect: useEffectG, useRef: useRefG, useMemo: useMemoG } = React;

const FRAUD_TYPE_COLOR = {
  test_carte:      "oklch(0.78 0.16 70)",
  carte_volee:     "oklch(0.55 0.22 25)",
  structuration:   "oklch(0.60 0.16 285)",
  prise_de_compte: "oklch(0.68 0.18 50)",
  reseau_mules:    "oklch(0.45 0.22 15)",
};
const FRAUD_TYPE_LABEL = {
  test_carte:      "Test de carte",
  carte_volee:     "Carte volée",
  structuration:   "Structuration",
  prise_de_compte: "Prise de compte",
  reseau_mules:    "Réseau de mules",
};
const CATEGORIE_COLOR = {
  electronique: "oklch(0.65 0.14 220)",
  divertissement: "oklch(0.68 0.14 285)",
  musique: "oklch(0.70 0.12 200)",
  mode: "oklch(0.70 0.14 170)",
  transfert: "oklch(0.60 0.10 240)",
  autre: "oklch(0.65 0.12 70)",
};

function buildCypher(fraudType, province) {
  const whereClause = [
    "t.isFraud = true",
    fraudType !== "all" ? `t.fraudType = '${fraudType}'` : null,
    province !== "all" ? `a.province = '${province}'` : null,
  ].filter(Boolean).join(" AND ");
  return `MATCH (a:Account)-[:MADE]->(t:Transaction)-[:AT]->(m:Merchant)\nWHERE ${whereClause}\nRETURN a, t, m LIMIT 100`;
}

function Legend() {
  return (
    <div style={{
      position: "absolute", top: 16, left: 16,
      background: "var(--bg-2)", border: "1px solid var(--line)",
      borderRadius: 8, padding: "12px 14px", minWidth: 160,
    }}>
      <div style={{ fontSize: 9, letterSpacing: 0.8, color: "var(--ink-40)", fontWeight: 700, marginBottom: 10 }}>
        LÉGENDE
      </div>
      {[
        { shape: "circle", color: "oklch(0.55 0.22 25)", label: "Compte frauduleux" },
        { shape: "circle", color: "oklch(0.55 0.12 220)", label: "Compte légitime pair" },
        { shape: "diamond", color: "oklch(0.65 0.14 70)", label: "Marchand impliqué" },
      ].map(({ shape, color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <svg width={16} height={16}>
            {shape === "circle"
              ? <circle cx={8} cy={8} r={6} fill={color} stroke="var(--bg-1)" strokeWidth={1} />
              : <rect x={3} y={3} width={10} height={10} fill={color} stroke="var(--bg-1)" strokeWidth={1}
                  transform="rotate(45 8 8)" />
            }
          </svg>
          <span style={{ fontSize: 11, color: "var(--ink-60)" }}>{label}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
        <div style={{ fontSize: 9, letterSpacing: 0.8, color: "var(--ink-40)", fontWeight: 700, marginBottom: 7 }}>
          RELATION
        </div>
        {[
          { color: "rgba(220,80,60,0.7)", label: "Transaction frauduleuse", thick: true },
          { color: "rgba(100,150,220,0.35)", label: "Transaction légitime", thick: false },
        ].map(({ color, label, thick }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 20, height: thick ? 2 : 1, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 11, color: "var(--ink-60)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeDetail({ node, onClose }) {
  if (!node) return null;
  const isAccount  = node.type === "account";
  const isFraud    = isAccount && node.fraud;
  const mainColor  = isFraud ? "var(--alert)" : isAccount ? "var(--accent-blue)" : "var(--warn)";

  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16, width: 260,
      background: "var(--bg-2)", border: "1px solid var(--line)",
      borderRadius: 10, overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: "1px solid var(--line)",
        background: `color-mix(in oklch, ${mainColor} 8%, var(--bg-2))`,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: mainColor, letterSpacing: 0.3 }}>
            {isAccount ? (isFraud ? "COMPTE FRAUDULEUX" : "COMPTE LÉGITIME") : "MARCHAND"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-90)", marginTop: 2 }}>
            {isAccount ? node.full_name : node.label}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "transparent", border: "none", color: "var(--ink-40)",
          cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1,
        }}>×</button>
      </div>
      <div style={{ padding: "10px 14px 12px" }}>
        {isAccount ? (
          <>
            <Row label="Archétype"  value={node.archetype?.replace("_", " ")} />
            <Row label="Province"   value={node.province} />
            <Row label="Transactions" value={node.n_tx?.toLocaleString("fr-CA")} mono />
            {isFraud && node.fraud_types?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, letterSpacing: 0.7, color: "var(--ink-40)", fontWeight: 700, marginBottom: 5 }}>
                  TYPES DE FRAUDE
                </div>
                {node.fraud_types.map(ft => (
                  <div key={ft} style={{
                    display: "inline-block", marginRight: 4, marginBottom: 4,
                    fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                    background: `color-mix(in oklch, ${FRAUD_TYPE_COLOR[ft] || "var(--alert)"} 14%, var(--bg-2))`,
                    color: FRAUD_TYPE_COLOR[ft] || "var(--alert)",
                  }}>{FRAUD_TYPE_LABEL[ft] || ft}</div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <Row label="Catégorie"    value={node.categorie} />
            <Row label="Transactions fraude" value={node.n_fraud_tx} mono color="var(--alert)" />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: "var(--ink-40)" }}>{label}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: 11, fontWeight: 500, color: color || "var(--ink-70)" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function GraphView() {
  const svgRef                  = useRefG(null);
  const [graphData, setGraphData] = useStateG(null);
  const [loading, setLoading]   = useStateG(true);
  const [fraudType, setFraudType] = useStateG("all");
  const [province, setProvince] = useStateG("all");
  const [showPeers, setShowPeers] = useStateG(true);
  const [selectedNode, setSelectedNode] = useStateG(null);
  const [nodeCount, setNodeCount] = useStateG(0);
  const [edgeCount, setEdgeCount] = useStateG(0);

  useEffectG(() => {
    if (window.FraudNetAPI) {
      window.FraudNetAPI.graphNetwork().then(data => {
        if (data) setGraphData(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  useEffectG(() => {
    if (!graphData || !svgRef.current || typeof d3 === "undefined") return;

    // Filter nodes
    const nodes = graphData.nodes.filter(n => {
      if (!showPeers && n.type === "account" && !n.fraud) return false;
      if (province !== "all" && n.type === "account" && n.province !== province) return false;
      if (fraudType !== "all" && n.type === "account" && n.fraud && !n.fraud_types.includes(fraudType)) return false;
      return true;
    }).map(n => ({ ...n })); // deep copy for D3 mutation

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = graphData.edges
      .filter(e => nodeIds.has(e.source?.id ?? e.source) && nodeIds.has(e.target?.id ?? e.target))
      .filter(e => fraudType === "all" || !e.fraud || e.fraud_type === fraudType)
      .map(e => ({ ...e }));

    setNodeCount(nodes.length);
    setEdgeCount(edges.length);

    const svg     = d3.select(svgRef.current);
    const width   = svgRef.current.clientWidth  || 900;
    const height  = svgRef.current.clientHeight || 600;

    svg.selectAll("*").remove();

    const container = svg.append("g");

    svg.call(
      d3.zoom().scaleExtent([0.2, 4])
        .on("zoom", event => container.attr("transform", event.transform))
    );

    const simulation = d3.forceSimulation(nodes)
      .force("link",      d3.forceLink(edges).id(d => d.id).distance(90).strength(0.4))
      .force("charge",    d3.forceManyBody().strength(-280))
      .force("center",    d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.type === "merchant" ? 28 : 22));

    // Edges
    const link = container.append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", d => {
        if (!d.fraud) return "rgba(100,150,220,0.25)";
        return FRAUD_TYPE_COLOR[d.fraud_type] ?? "rgba(220,80,60,0.55)";
      })
      .attr("stroke-width", d => d.fraud ? 1.8 : 0.8)
      .attr("stroke-opacity", d => d.fraud ? 0.65 : 0.35);

    // Node groups
    const node = container.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3.drag()
          .on("start", (ev, d) => { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on("end",   (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (ev, d) => { ev.stopPropagation(); setSelectedNode(d); });

    svg.on("click", () => setSelectedNode(null));

    // Account circles
    node.filter(d => d.type === "account")
      .append("circle")
      .attr("r", d => Math.max(9, Math.min(20, d.n_tx / 25)))
      .attr("fill", d => d.fraud ? "oklch(0.48 0.22 25)" : "oklch(0.45 0.12 220)")
      .attr("stroke", d => d.fraud ? "oklch(0.68 0.22 25)" : "oklch(0.65 0.12 220)")
      .attr("stroke-width", d => d.fraud ? 2 : 1.2);

    // Pulse ring on fraud nodes
    node.filter(d => d.type === "account" && d.fraud)
      .append("circle")
      .attr("r", d => Math.max(9, Math.min(20, d.n_tx / 25)) + 5)
      .attr("fill", "none")
      .attr("stroke", "oklch(0.68 0.22 25)")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.3);

    // Merchant diamonds
    node.filter(d => d.type === "merchant")
      .append("rect")
      .attr("x", -13).attr("y", -13).attr("width", 26).attr("height", 26)
      .attr("transform", "rotate(45)")
      .attr("fill", d => CATEGORIE_COLOR[d.categorie] ?? "oklch(0.65 0.14 70)")
      .attr("stroke", "oklch(0.78 0.14 70)")
      .attr("stroke-width", 1.5)
      .attr("rx", 2);

    // Labels
    node.append("text")
      .attr("dy", d => d.type === "merchant" ? 24 : d.fraud ? -18 : -15)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", "var(--ink-60)")
      .style("font-family", "Inter, sans-serif")
      .style("pointer-events", "none")
      .text(d => d.label.length > 14 ? d.label.slice(0, 13) + "…" : d.label);

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => simulation.stop();
  }, [graphData, fraudType, province, showPeers]);

  const selectStyle = {
    background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--ink-70)",
    borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", outline: "none",
  };

  const cypherText = buildCypher(fraudType, province);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-1)" }}>

      {/* Sub-header controls */}
      <div style={{
        padding: "10px 22px", borderBottom: "1px solid var(--line)",
        background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          flex: 1, fontFamily: "var(--mono)", fontSize: 11,
          color: "var(--accent-teal)", background: "var(--bg-3)",
          borderRadius: 6, padding: "6px 12px",
          border: "1px solid var(--line)", whiteSpace: "pre", overflow: "hidden",
          textOverflow: "ellipsis",
        }}>{cypherText.replace("\n", "  ")}</div>

        <select value={fraudType} onChange={e => setFraudType(e.target.value)} style={selectStyle}>
          <option value="all">Tous les types</option>
          {Object.entries(FRAUD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={province} onChange={e => setProvince(e.target.value)} style={selectStyle}>
          <option value="all">Toutes provinces</option>
          {["ON","QC","BC","AB"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox" checked={showPeers} onChange={e => setShowPeers(e.target.checked)}
            style={{ accentColor: "var(--accent-teal)", width: 14, height: 14 }}
          />
          <span style={{ fontSize: 12, color: "var(--ink-60)" }}>Comptes pairs</span>
        </label>
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--ink-40)", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3 }}>◌</div>
            Chargement du réseau…
          </div>
        ) : !graphData ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--ink-40)", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3 }}>⊘</div>
            <div>API non disponible</div>
            <div style={{ fontSize: 12 }}>Lance <code style={{ fontFamily: "var(--mono)", color: "var(--accent-teal)" }}>uvicorn src.api.main:app --port 8000</code></div>
          </div>
        ) : (
          <svg
            ref={svgRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        )}

        {graphData && !loading && <Legend />}

        {selectedNode && (
          <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {/* Bottom status bar */}
        {graphData && !loading && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-2)", border: "1px solid var(--line)",
            borderRadius: 20, padding: "4px 16px",
            display: "flex", gap: 14, alignItems: "center",
          }}>
            <span style={{ fontSize: 11, color: "var(--ink-50)" }}>
              <span className="mono" style={{ fontWeight: 700, color: "var(--ink-80)" }}>{nodeCount}</span> nœuds
            </span>
            <span style={{ width: 1, height: 12, background: "var(--line)" }} />
            <span style={{ fontSize: 11, color: "var(--ink-50)" }}>
              <span className="mono" style={{ fontWeight: 700, color: "var(--ink-80)" }}>{edgeCount}</span> relations
            </span>
            <span style={{ width: 1, height: 12, background: "var(--line)" }} />
            <span style={{ fontSize: 10, color: "var(--ink-40)", letterSpacing: 0.5 }}>
              Déplacer · Scroll pour zoomer
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { GraphView });
