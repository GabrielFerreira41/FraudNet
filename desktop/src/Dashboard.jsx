// Dashboard.jsx — Vue Données · FraudNet

const { useState: useStateD, useEffect: useEffectD, useRef: useRefD, useMemo: useMemoD } = React;

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
  etudiant:    "Étudiant",
  famille:     "Famille",
  entreprise:  "Entreprise",
  jeune_actif: "Jeune actif",
  retraite:    "Retraité",
};
const ARCH_COLORS = {
  etudiant:    "#3b82f6",
  famille:     "#10b981",
  entreprise:  "#8b5cf6",
  jeune_actif: "#f59e0b",
  retraite:    "#ef4444",
};
const PROVINCE_NAMES = {
  QC: "Québec", ON: "Ontario", BC: "Colombie-Britannique",
  AB: "Alberta", MB: "Manitoba", SK: "Saskatchewan",
  NB: "Nouveau-Brunswick", NS: "Nouvelle-Écosse", PE: "Î.-P.-É.",
  NL: "Terre-Neuve", YT: "Yukon", NT: "T.N.-O.", NU: "Nunavut",
};

function fmtNum(n) { return n?.toLocaleString("fr-CA") ?? "—"; }
function fmtCAD(n) {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n/1e6).toFixed(1)} M$`;
  if (n >= 1e3) return `${(n/1e3).toFixed(0)} k$`;
  return `${n.toFixed(0)} $`;
}
function pct(v, total) {
  return total ? `${((v/total)*100).toFixed(1)} %` : "—";
}
function pctW(v, total) {
  return total ? `${((v/total)*100).toFixed(1)}%` : "0%";
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "fixed", left: tip.x + 14, top: tip.y - 10,
      background: "#0c1b34", color: "white", padding: "8px 12px",
      borderRadius: 5, fontSize: 11, pointerEvents: "none", zIndex: 9999,
      boxShadow: "0 6px 20px rgba(0,0,0,.35)", lineHeight: 1.7,
      minWidth: 140, maxWidth: 220,
      border: "1px solid rgba(255,255,255,.1)",
    }}>
      {tip.title && (
        <div style={{ fontWeight: 700, marginBottom: 5, borderBottom: "1px solid rgba(255,255,255,.15)",
          paddingBottom: 4, fontSize: 11, letterSpacing: "0.05em" }}>
          {tip.title}
        </div>
      )}
      {(tip.lines || []).map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span style={{ color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>{l.label}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
            color: l.red ? "#f87171" : "white" }}>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

function ChartCard({ title, sub, children, span }) {
  return (
    <div style={{
      background: "var(--card)", padding: "16px 18px",
      border: "1px solid var(--border)",
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ display: "block", width: 12, height: 2, background: "var(--red)", flexShrink: 0 }}/>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--ink-3)", fontWeight: 600 }}>{title}</span>
        {sub && <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--ink-3)",
          fontStyle: "italic" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ value, label, sub, alert, loading }) {
  return (
    <div style={{
      background: alert ? "rgba(190,31,38,.03)" : "var(--card)",
      padding: "16px 20px",
      border: `1px solid ${alert ? "rgba(190,31,38,.2)" : "var(--border)"}`,
    }}>
      {loading
        ? <div style={{ height: 32, background: "var(--border)", borderRadius: 3, marginBottom: 8,
            animation: "pulse 1.5s ease-in-out infinite alternate" }}/>
        : <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
            color: alert ? "#be1f26" : "var(--navy)", lineHeight: 1 }}>{value}</div>
      }
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Swatch({ color, opacity = 1, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 11, height: 6, background: color, opacity, borderRadius: 2, flexShrink: 0 }}/>
      <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}

function Skeleton({ h = 80 }) {
  return <div style={{ height: h, background: "var(--border)", borderRadius: 4, opacity: 0.5,
    animation: "pulse 1.5s ease-in-out infinite alternate" }}/>;
}

// ── D3 Timeline ──────────────────────────────────────────────────────────────

function TimelineChart({ data, onTip }) {
  const ref = useRefD(null);

  useEffectD(() => {
    if (!data?.length || !ref.current || typeof d3 === "undefined") return;
    const el = ref.current;
    const m  = { top: 8, right: 42, bottom: 22, left: 38 };
    const W  = el.clientWidth - m.left - m.right;
    const H  = 110 - m.top - m.bottom;

    const svg = d3.select(el).attr("height", 110);
    svg.selectAll("*").remove();
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const x      = d3.scaleBand().domain(data.map(d => d.week)).range([0, W]).padding(0.18);
    const yTx    = d3.scaleLinear().domain([0, d3.max(data, d => d.n_tx) * 1.15]).range([H, 0]).nice();
    const yFraud = d3.scaleLinear().domain([0, Math.max(1, d3.max(data, d => d.n_fraud) * 1.5)]).range([H, 0]).nice();

    g.append("g").call(d3.axisLeft(yTx).ticks(4).tickSize(-W).tickFormat(""))
      .call(ax => { ax.select(".domain").remove(); ax.selectAll("line").attr("stroke","var(--border)").attr("stroke-width",0.5); });

    g.selectAll(".bar").data(data).join("rect")
      .attr("x", d => x(d.week)).attr("y", d => yTx(d.n_tx))
      .attr("width", x.bandwidth()).attr("height", d => H - yTx(d.n_tx))
      .attr("fill", "var(--navy)").attr("opacity", 0.12);

    const area = d3.area()
      .x(d => x(d.week) + x.bandwidth()/2).y0(H).y1(d => yFraud(d.n_fraud))
      .curve(d3.curveMonotoneX);
    g.append("path").datum(data).attr("fill","#be1f26").attr("opacity",0.12).attr("d",area);

    const line = d3.line()
      .x(d => x(d.week) + x.bandwidth()/2).y(d => yFraud(d.n_fraud))
      .curve(d3.curveMonotoneX);
    g.append("path").datum(data).attr("fill","none").attr("stroke","#be1f26").attr("stroke-width",2).attr("d",line);

    g.selectAll(".dot").data(data).join("circle")
      .attr("cx", d => x(d.week) + x.bandwidth()/2)
      .attr("cy", d => yFraud(d.n_fraud))
      .attr("r", d => d.n_fraud > 0 ? 4 : 2)
      .attr("fill", d => d.n_fraud > 0 ? "#be1f26" : "var(--border)")
      .attr("stroke","white").attr("stroke-width",1.5)
      .style("cursor","pointer");

    // Hover: invisible wide bars
    g.selectAll(".hover-zone").data(data).join("rect")
      .attr("x", d => x(d.week)).attr("y", 0)
      .attr("width", x.bandwidth()).attr("height", H)
      .attr("fill","transparent")
      .on("mousemove", function(event, d) {
        const [px, py] = d3.pointer(event, document.body);
        onTip && onTip({
          x: px, y: py,
          title: `Sem. ${d.week}`,
          lines: [
            { label: "Transactions", value: fmtNum(d.n_tx) },
            { label: "Fraudes", value: String(d.n_fraud), red: d.n_fraud > 0 },
            { label: "Volume", value: fmtCAD(d.montant_total) },
          ],
        });
      })
      .on("mouseleave", () => onTip && onTip(null));

    g.append("g").attr("transform",`translate(0,${H})`)
      .call(d3.axisBottom(x).tickValues(data.filter((_,i)=>i%2===0).map(d=>d.week)).tickFormat(d=>d.slice(5)))
      .call(ax => { ax.select(".domain").remove(); ax.selectAll("line").remove();
        ax.selectAll("text").style("font-size","9px").style("fill","var(--ink-3)"); });

    g.append("g").call(d3.axisLeft(yTx).ticks(4).tickFormat(d=>d>=1000?`${d/1000}k`:d))
      .call(ax => { ax.select(".domain").remove(); ax.selectAll("line").remove();
        ax.selectAll("text").style("font-size","9px").style("fill","var(--ink-3)"); });

    g.append("g").attr("transform",`translate(${W},0)`)
      .call(d3.axisRight(yFraud).ticks(4))
      .call(ax => { ax.select(".domain").remove(); ax.selectAll("line").remove();
        ax.selectAll("text").style("font-size","9px").style("fill","#be1f26"); });

  }, [data]);

  return <svg ref={ref} style={{ width:"100%", display:"block" }}/>;
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function DonutChart({ data, onTip }) {
  if (!data?.length) return null;
  const total = data.reduce((s,d) => s + d.n, 0);
  if (!total) return <div style={{ fontSize:12, color:"var(--ink-3)" }}>Aucune fraude</div>;

  const cx=65, cy=65, R=56, r=34;
  let angle = -Math.PI/2;

  const arcs = data.map(d => {
    const a0 = angle;
    const sw = (d.n/total)*2*Math.PI;
    angle += sw;
    const a1 = angle;
    const lg = sw > Math.PI ? 1 : 0;
    const path = `M${cx+R*Math.cos(a0)} ${cy+R*Math.sin(a0)} A${R} ${R} 0 ${lg} 1 ${cx+R*Math.cos(a1)} ${cy+R*Math.sin(a1)} L${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)} A${r} ${r} 0 ${lg} 0 ${cx+r*Math.cos(a0)} ${cy+r*Math.sin(a0)}Z`;
    return { ...d, path };
  });

  return (
    <div style={{ display:"flex", alignItems:"center", gap:18 }}>
      <svg width={130} height={130} viewBox="0 0 130 130" style={{ flexShrink:0 }}>
        {arcs.map(a => (
          <path key={a.type} d={a.path} fill={FRAUD_COLORS[a.type]||"#ccc"}
            style={{ cursor:"pointer", transition:"opacity .15s" }}
            onMouseMove={e => onTip && onTip({
              x:e.clientX, y:e.clientY,
              title: FRAUD_LABELS[a.type]||a.type,
              lines:[
                { label:"Cas", value: String(a.n) },
                { label:"Part", value: pct(a.n,total) },
              ],
            })}
            onMouseLeave={() => onTip && onTip(null)}/>
        ))}
        <text x={cx} y={cy-6} textAnchor="middle" fontSize={16} fontWeight={700}
          fontFamily="'JetBrains Mono',monospace" fill="var(--navy)">{total}</text>
        <text x={cx} y={cy+9} textAnchor="middle" fontSize={9}
          fontFamily="Inter,sans-serif" fill="var(--ink-3)">fraudes</text>
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {arcs.map(a => (
          <div key={a.type} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:FRAUD_COLORS[a.type], flexShrink:0 }}/>
            <span style={{ fontSize:11, color:"var(--ink-2)", flex:1 }}>{FRAUD_LABELS[a.type]||a.type}</span>
            <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"var(--navy)", width:20, textAlign:"right" }}>{a.n}</span>
            <span style={{ fontSize:10, color:"var(--ink-3)", width:42, textAlign:"right" }}>{pct(a.n,total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Age group bars ────────────────────────────────────────────────────────────

function AgeGroupChart({ data, onTip }) {
  if (!data?.length) return null;
  const maxTx    = Math.max(...data.map(d => d.n_tx));
  const maxRate  = Math.max(...data.map(d => d.fraud_rate), 0.0001);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {data.map(d => {
        const ratePct = (d.fraud_rate * 100).toFixed(3);
        return (
          <div key={d.age_group}
            style={{ cursor:"default" }}
            onMouseMove={e => onTip && onTip({
              x:e.clientX, y:e.clientY,
              title: `Tranche ${d.age_group} ans`,
              lines:[
                { label:"Transactions", value: fmtNum(d.n_tx) },
                { label:"Fraudes", value: String(d.n_fraud), red: true },
                { label:"Taux de fraude", value: `${ratePct} %`, red: true },
                { label:"Montant moyen", value: fmtCAD(d.montant_moyen) },
              ],
            })}
            onMouseLeave={() => onTip && onTip(null)}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:12, fontFamily:"'JetBrains Mono',monospace",
                fontWeight:600, color:"var(--navy)", width:46 }}>{d.age_group}</span>
              <div style={{ display:"flex", gap:12 }}>
                <span style={{ fontSize:10, color:"var(--ink-3)" }}>{fmtNum(d.n_tx)} tx</span>
                {d.n_fraud > 0 && (
                  <span style={{ fontSize:10, color:"#be1f26", fontWeight:700 }}>
                    {d.n_fraud} fraudes
                  </span>
                )}
              </div>
            </div>
            <div style={{ height:7, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
              <div style={{ width:pctW(d.n_tx, maxTx), height:"100%",
                background:"var(--navy)", opacity:0.45, borderRadius:4 }}/>
            </div>
            <div style={{ height:3, marginTop:2, background:"var(--border)", borderRadius:2 }}>
              <div style={{ width:pctW(d.fraud_rate, maxRate), height:"100%",
                background:"#be1f26", borderRadius:2 }}/>
            </div>
          </div>
        );
      })}
      <div style={{ display:"flex", gap:14, marginTop:4 }}>
        <Swatch color="var(--navy)" opacity={0.45} label="Volume tx"/>
        <Swatch color="var(--red)" label="Taux de fraude relatif"/>
      </div>
    </div>
  );
}

// ── Fraud × Archetype Heatmap ─────────────────────────────────────────────────

function FraudHeatmap({ data, onTip }) {
  if (!data?.length) return null;

  const fraudTypes = Object.keys(FRAUD_LABELS);
  const archetypes = Object.keys(ARCH_LABELS);

  const lookup = {};
  data.forEach(d => { lookup[`${d.fraud_type}__${d.archetype}`] = d.n; });
  const maxN = Math.max(...data.map(d => d.n), 1);

  const CW = 70, CH = 22, ML = 102;

  return (
    <div style={{ overflowX:"auto" }}>
      <svg width={ML + archetypes.length * CW + 8} height={CH * fraudTypes.length + 32}
        style={{ display:"block" }}>
        {/* Column headers */}
        {archetypes.map((a, ci) => (
          <text key={a} x={ML + ci*CW + CW/2} y={14}
            textAnchor="middle" fontSize={9} fontFamily="Inter,sans-serif"
            fill="var(--ink-2)" fontWeight={600}>
            {ARCH_LABELS[a]}
          </text>
        ))}
        {/* Rows */}
        {fraudTypes.map((ft, ri) => (
          <g key={ft}>
            {/* Row label */}
            <text x={ML - 6} y={32 + ri*CH + CH*0.62}
              textAnchor="end" fontSize={9} fontFamily="Inter,sans-serif"
              fill="var(--ink-2)">
              {FRAUD_LABELS[ft]}
            </text>
            {/* Cells */}
            {archetypes.map((a, ci) => {
              const n = lookup[`${ft}__${a}`] || 0;
              const intensity = n / maxN;
              const bg = n === 0 ? "var(--border)"
                : `rgba(${ft === "test_carte" ? "200,96,32" : ft === "carte_volee" ? "190,31,38" : ft === "structuration" ? "107,63,160" : ft === "prise_de_compte" ? "212,118,10" : "139,26,26"}, ${0.12 + intensity * 0.88})`;
              const textColor = intensity > 0.5 ? "white" : n > 0 ? FRAUD_COLORS[ft] : "var(--ink-3)";
              return (
                <g key={a}
                  onMouseMove={e => n > 0 && onTip && onTip({
                    x:e.clientX, y:e.clientY,
                    title: `${FRAUD_LABELS[ft]}`,
                    lines:[
                      { label:"Profil", value: ARCH_LABELS[a] },
                      { label:"Cas", value: String(n), red: true },
                      { label:"Part", value: pct(n, data.reduce((s,d)=>s+d.n,0)) },
                    ],
                  })}
                  onMouseLeave={() => onTip && onTip(null)}
                  style={{ cursor: n > 0 ? "pointer" : "default" }}>
                  <rect x={ML + ci*CW + 1} y={28 + ri*CH}
                    width={CW - 2} height={CH - 2} rx={2}
                    fill={bg}/>
                  {n > 0 && (
                    <text x={ML + ci*CW + CW/2} y={28 + ri*CH + CH*0.65}
                      textAnchor="middle" fontSize={10} fontWeight={700}
                      fontFamily="'JetBrains Mono',monospace" fill={textColor}>
                      {n}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Canada Real Map (D3 + GeoJSON) ───────────────────────────────────────────

function CanadaMap({ data, onTip }) {
  const svgRef  = useRefD(null);
  const [geo, setGeo] = useStateD(null);
  const [geoErr, setGeoErr] = useStateD(false);

  useEffectD(() => {
    fetch('./canada-provinces.json')
      .then(r => r.json())
      .then(setGeo)
      .catch(() => setGeoErr(true));
  }, []);

  useEffectD(() => {
    if (!geo || !svgRef.current || typeof d3 === 'undefined') return;

    const el  = svgRef.current;
    const W   = el.clientWidth  || 640;
    const H   = 280;
    const PAD = 14;

    const svg = d3.select(el).attr('height', H);
    svg.selectAll('*').remove();

    // ── Projection (Lambert Conformal Conic — standard for Canada) ──
    const projection = d3.geoConicConformal()
      .parallels([49, 77])
      .rotate([96, 0])
      .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], geo);
    const path = d3.geoPath().projection(projection);

    // ── Data lookup ──
    const lookup = {};
    if (data) data.forEach(d => { lookup[d.province] = d; });
    const maxTx    = data ? Math.max(...data.map(d => d.n_tx),    1) : 1;
    const maxFraud = data ? Math.max(...data.map(d => d.n_fraud), 1) : 1;
    const maxRate  = data ? Math.max(...data.map(d => d.n_fraud / Math.max(d.n_tx, 1)), 1e-6) : 1e-6;

    const rTx    = d3.scaleSqrt().domain([0, maxTx]).range([0, 28]);
    const rFraud = d3.scaleSqrt().domain([0, maxFraud]).range([0, 18]);

    // ── Province fills ──
    svg.selectAll('path')
      .data(geo.features)
      .join('path')
      .attr('d', path)
      .attr('fill', feat => {
        const pd = lookup[feat.properties.abbr];
        if (!pd) return '#eceae5';
        if (pd.n_fraud === 0) return 'rgba(12,27,52,0.10)';
        const intensity = (pd.n_fraud / pd.n_tx) / maxRate;
        return `rgba(190,31,38,${(0.08 + intensity * 0.72).toFixed(3)})`;
      })
      .attr('stroke', 'white')
      .attr('stroke-width', 0.7)
      .attr('stroke-linejoin', 'round')
      .style('cursor', feat => lookup[feat.properties.abbr] ? 'pointer' : 'default')
      .on('mousemove', function(event, feat) {
        const pd = lookup[feat.properties.abbr];
        if (!pd || !onTip) return;
        const rate = pd.n_fraud / Math.max(pd.n_tx, 1);
        onTip({
          x: event.clientX, y: event.clientY,
          title: feat.properties.name,
          lines: [
            { label: 'Transactions', value: fmtNum(pd.n_tx) },
            { label: 'Fraudes',      value: String(pd.n_fraud), red: pd.n_fraud > 0 },
            { label: 'Taux',         value: `${(rate * 100).toFixed(4)} %`, red: pd.n_fraud > 0 },
          ],
        });
      })
      .on('mouseleave', () => onTip && onTip(null));

    // ── Compute province centroids ──
    const centroids = {};
    geo.features.forEach(feat => {
      try {
        const c = projection(d3.geoCentroid(feat));
        if (c && isFinite(c[0]) && isFinite(c[1])) {
          centroids[feat.properties.abbr] = c;
        }
      } catch (_) {}
    });

    // ── Transaction density circles (blue) ──
    if (data) {
      data.forEach(pd => {
        const c = centroids[pd.province];
        if (!c) return;
        const r = rTx(pd.n_tx);
        svg.append('circle')
          .attr('cx', c[0]).attr('cy', c[1]).attr('r', r)
          .attr('fill', 'rgba(59,130,246,0.18)')
          .attr('stroke', 'rgba(59,130,246,0.65)')
          .attr('stroke-width', 1.5)
          .style('pointer-events', 'none');
      });

      // ── Fraud density circles (red) ──
      data.filter(pd => pd.n_fraud > 0).forEach(pd => {
        const c = centroids[pd.province];
        if (!c) return;
        const r = rFraud(pd.n_fraud);
        svg.append('circle')
          .attr('cx', c[0]).attr('cy', c[1]).attr('r', r)
          .attr('fill', 'rgba(190,31,38,0.30)')
          .attr('stroke', '#be1f26')
          .attr('stroke-width', 2)
          .style('pointer-events', 'none');

        svg.append('text')
          .attr('x', c[0]).attr('y', c[1] + r + 10)
          .attr('text-anchor', 'middle')
          .attr('font-size', 8).attr('font-weight', 700)
          .attr('font-family', "'JetBrains Mono',monospace")
          .attr('fill', '#be1f26')
          .text(`${pd.n_fraud} fraudes`)
          .style('pointer-events', 'none');
      });

      // ── Province abbreviation labels ──
      data.forEach(pd => {
        const c = centroids[pd.province];
        if (!c) return;
        svg.append('text')
          .attr('x', c[0]).attr('y', c[1] + 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', 10).attr('font-weight', 700)
          .attr('font-family', "'JetBrains Mono',monospace")
          .attr('fill', 'var(--navy)')
          .text(pd.province)
          .style('pointer-events', 'none');

        svg.append('text')
          .attr('x', c[0]).attr('y', c[1] + 15)
          .attr('text-anchor', 'middle')
          .attr('font-size', 7.5).attr('font-family', 'Inter,sans-serif')
          .attr('fill', 'var(--ink-3)')
          .text(fmtNum(pd.n_tx))
          .style('pointer-events', 'none');
      });
    }

    // ── Legend ──
    const lx = W - 130, ly = H - 22;
    svg.append('text').attr('x', lx).attr('y', ly - 6)
      .attr('font-size', 8).attr('fill', 'var(--ink-3)').attr('font-family', 'Inter,sans-serif')
      .text('Densité de fraude →');
    const gradId = 'mapGradReal';
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', gradId);
    grad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(12,27,52,0.10)');
    grad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(190,31,38,0.80)');
    svg.append('rect').attr('x', lx).attr('y', ly)
      .attr('width', 80).attr('height', 5).attr('rx', 2).attr('fill', `url(#${gradId})`);
    svg.append('text').attr('x', lx).attr('y', ly + 14)
      .attr('font-size', 7).attr('fill', 'var(--ink-3)').attr('font-family', 'Inter,sans-serif')
      .text('Faible');
    svg.append('text').attr('x', lx + 80).attr('y', ly + 14)
      .attr('font-size', 7).attr('fill', '#be1f26').attr('font-family', 'Inter,sans-serif')
      .attr('text-anchor', 'end').text('Élevé');

    // ── Bubble legend ──
    const bx = 14, by = H - 38;
    [
      { r: rTx(maxTx * 0.5), color: 'rgba(59,130,246,0.5)', stroke: 'rgba(59,130,246,0.8)', label: 'Volume tx' },
      { r: rFraud(maxFraud),  color: 'rgba(190,31,38,0.35)', stroke: '#be1f26',              label: 'Fraudes'    },
    ].forEach((item, i) => {
      const cx2 = bx + i * 80 + item.r;
      svg.append('circle').attr('cx', cx2).attr('cy', by + item.r)
        .attr('r', item.r).attr('fill', item.color).attr('stroke', item.stroke).attr('stroke-width', 1.5);
      svg.append('text').attr('x', cx2 + item.r + 4).attr('y', by + item.r + 4)
        .attr('font-size', 7.5).attr('fill', 'var(--ink-3)').attr('font-family', 'Inter,sans-serif')
        .text(item.label);
    });

  }, [geo, data]);

  if (geoErr) return (
    <div style={{ height:280, display:'flex', alignItems:'center', justifyContent:'center',
      color:'var(--ink-3)', fontSize:12 }}>
      Impossible de charger la carte (canada-provinces.json introuvable)
    </div>
  );

  if (!geo) return <Skeleton h={280}/>;

  return <svg ref={svgRef} style={{ width:'100%', display:'block' }}/>;
}

// ── Hourly Chart ──────────────────────────────────────────────────────────────

function HourlyChart({ data, onTip }) {
  if (!data?.length) return null;
  const maxTx    = Math.max(...data.map(d => d.n_tx));
  const maxFraud = Math.max(...data.map(d => d.n_fraud), 1);
  const W = 380, H = 76, bw = W / 24;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 14}`}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={0} y1={H*(1-f)} x2={W} y2={H*(1-f)}
            stroke="var(--border)" strokeWidth={0.4}/>
        ))}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={i*bw} y={H-(d.n_tx/maxTx)*H}
              width={bw-0.4} height={(d.n_tx/maxTx)*H}
              fill="var(--navy)" opacity={0.12}/>
            {d.n_fraud > 0 && (
              <rect x={i*bw+bw*0.15} y={H-(d.n_fraud/maxFraud)*H}
                width={bw*0.7} height={(d.n_fraud/maxFraud)*H}
                fill="#be1f26" opacity={0.8}/>
            )}
            <rect x={i*bw} y={0} width={bw} height={H} fill="transparent"
              onMouseMove={e => onTip && onTip({
                x:e.clientX, y:e.clientY,
                title:`${d.heure}h00 – ${d.heure+1}h00`,
                lines:[
                  { label:"Transactions", value: fmtNum(d.n_tx) },
                  { label:"Fraudes", value: String(d.n_fraud), red: d.n_fraud > 0 },
                  { label:"Montant moy.", value: fmtCAD(d.montant_moyen) },
                ],
              })}
              onMouseLeave={() => onTip && onTip(null)}
              style={{ cursor:"default" }}/>
          </g>
        ))}
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={0.6}/>
        {[0,3,6,9,12,15,18,21].map(h => (
          <text key={h} x={h*bw+bw/2} y={H+12}
            textAnchor="middle" fontSize={6.5} fill="var(--ink-3)" fontFamily="Inter,sans-serif">
            {h}h
          </text>
        ))}
      </svg>
      <div style={{ display:"flex", gap:14, marginTop:4 }}>
        <Swatch color="var(--navy)" opacity={0.12} label="Volume total"/>
        <Swatch color="var(--red)" opacity={0.8} label="Fraudes"/>
      </div>
    </div>
  );
}

// ── Amount Chart ──────────────────────────────────────────────────────────────

function AmountChart({ data, onTip }) {
  if (!data?.length) return null;
  const totalTx    = data.reduce((s,d) => s+d.n_tx, 0);
  const totalFraud = data.reduce((s,d) => s+d.n_fraud, 0);
  const maxPct = Math.max(...data.map(d => d.n_tx/totalTx*100));
  const H = 76, slotW = 52, gap = 6;
  const W = data.length * (slotW + gap) - gap;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H+20}`}>
        {[0.5, 1].map(f => (
          <line key={f} x1={0} y1={H*(1-f)} x2={W} y2={H*(1-f)}
            stroke="var(--border)" strokeWidth={0.4}/>
        ))}
        {data.map((d, i) => {
          const x     = i*(slotW+gap);
          const pTx   = totalTx    > 0 ? d.n_tx    / totalTx    * 100 : 0;
          const pFrd  = totalFraud > 0 ? d.n_fraud / totalFraud * 100 : 0;
          const hTx   = (pTx  / maxPct) * H;
          const hFrd  = (pFrd / maxPct) * H;
          const bw    = slotW * 0.44;
          return (
            <g key={d.bucket}
              onMouseMove={e => onTip && onTip({
                x:e.clientX, y:e.clientY,
                title: d.bucket,
                lines:[
                  { label:"Tx",    value: fmtNum(d.n_tx) },
                  { label:"% total", value: `${pTx.toFixed(1)} %` },
                  { label:"Fraudes", value: String(d.n_fraud), red: d.n_fraud > 0 },
                  { label:"% fraudes", value: `${pFrd.toFixed(1)} %`, red: d.n_fraud > 0 },
                ],
              })}
              onMouseLeave={() => onTip && onTip(null)}
              style={{ cursor:"default" }}>
              <rect x={x}        y={H-hTx}  width={bw} height={hTx}  fill="var(--navy)" opacity={0.4}/>
              <rect x={x+bw+3}   y={H-hFrd} width={bw} height={hFrd} fill="var(--red)"  opacity={0.8}/>
              {pTx > 0 && <text x={x+bw/2} y={H-hTx-3} textAnchor="middle"
                fontSize={5.5} fill="var(--ink-2)" fontFamily="Inter,sans-serif">{pTx.toFixed(0)}%</text>}
              {pFrd > 0 && <text x={x+bw+3+bw/2} y={H-hFrd-3} textAnchor="middle"
                fontSize={5.5} fill="var(--red)" fontFamily="Inter,sans-serif">{pFrd.toFixed(0)}%</text>}
              <text x={x+slotW/2} y={H+10} textAnchor="middle"
                fontSize={5.5} fill="var(--ink-3)" fontFamily="Inter,sans-serif">{d.bucket}</text>
            </g>
          );
        })}
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={0.6}/>
      </svg>
      <div style={{ display:"flex", gap:14, marginTop:4 }}>
        <Swatch color="var(--navy)" opacity={0.4}  label="Tx (% du total)"/>
        <Swatch color="var(--red)"  opacity={0.8}  label="Fraudes (% des fraudes)"/>
      </div>
    </div>
  );
}

// ── Device Pie ────────────────────────────────────────────────────────────────

function DevicePie({ data, onTip }) {
  if (!data?.length) return null;
  const total = data.reduce((s,d) => s+d.n_tx, 0);
  const COLORS = { mobile:"#3b82f6", desktop:"#8b5cf6", tablette:"#10b981" };
  const cx=55, cy=55, R=50;
  let angle = -Math.PI/2;

  const arcs = data.map(d => {
    const a0 = angle;
    const sw = (d.n_tx/total)*2*Math.PI;
    angle += sw;
    const a1 = angle;
    const lg = sw > Math.PI ? 1 : 0;
    const path = `M${cx} ${cy} L${cx+R*Math.cos(a0)} ${cy+R*Math.sin(a0)} A${R} ${R} 0 ${lg} 1 ${cx+R*Math.cos(a1)} ${cy+R*Math.sin(a1)}Z`;
    return { ...d, path, midAngle:(a0+a1)/2 };
  });

  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <svg width={110} height={110} viewBox="0 0 110 110" style={{ flexShrink:0 }}>
        {arcs.map(a => (
          <path key={a.device} d={a.path} fill={COLORS[a.device]||"#ccc"}
            stroke="white" strokeWidth={1.5}
            style={{ cursor:"pointer" }}
            onMouseMove={e => onTip && onTip({
              x:e.clientX, y:e.clientY,
              title: a.device.charAt(0).toUpperCase()+a.device.slice(1),
              lines:[
                { label:"Transactions", value: fmtNum(a.n_tx) },
                { label:"Part",         value: pct(a.n_tx,total) },
                { label:"Fraudes",      value: String(a.n_fraud), red: a.n_fraud > 0 },
              ],
            })}
            onMouseLeave={() => onTip && onTip(null)}/>
        ))}
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
        {arcs.map(a => (
          <div key={a.device} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:COLORS[a.device], flexShrink:0 }}/>
            <span style={{ fontSize:11, color:"var(--ink-2)", flex:1, textTransform:"capitalize" }}>
              {a.device}
            </span>
            <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"var(--navy)", fontWeight:600 }}>
              {pct(a.n_tx,total)}
            </span>
            {a.n_fraud > 0 && (
              <span style={{ fontSize:10, color:"#be1f26", fontFamily:"'JetBrains Mono',monospace" }}>
                {a.n_fraud}✕
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Archetype Bubble-Bar ──────────────────────────────────────────────────────

function ArchetypeChart({ data, onTip }) {
  if (!data?.length) return null;
  const maxRate = Math.max(...data.map(d => d.fraud_rate), 0.0001);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
      {data.sort((a,b) => b.fraud_rate - a.fraud_rate).map(d => {
        const color = ARCH_COLORS[d.archetype] || "var(--navy)";
        const ratePct = (d.fraud_rate*100).toFixed(3);
        return (
          <div key={d.archetype}
            onMouseMove={e => onTip && onTip({
              x:e.clientX, y:e.clientY,
              title: ARCH_LABELS[d.archetype]||d.archetype,
              lines:[
                { label:"Transactions",  value: fmtNum(d.n_tx) },
                { label:"Fraudes",       value: String(d.n_fraud), red: d.n_fraud > 0 },
                { label:"Taux fraude",   value: `${ratePct} %`, red: true },
                { label:"Montant moy.",  value: fmtCAD(d.montant_moyen) },
              ],
            })}
            onMouseLeave={() => onTip && onTip(null)}
            style={{ cursor:"default" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:color, flexShrink:0 }}/>
                <span style={{ fontSize:11, color:"var(--navy)", fontWeight:500 }}>
                  {ARCH_LABELS[d.archetype]||d.archetype}
                </span>
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"var(--ink-3)" }}>
                  {fmtNum(d.n_tx)}
                </span>
                <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace",
                  color: d.fraud_rate > 0.0005 ? "#be1f26" : "var(--ink-3)", fontWeight:600, width:54, textAlign:"right" }}>
                  {ratePct} %
                </span>
              </div>
            </div>
            <div style={{ height:6, background:"var(--border)", borderRadius:3 }}>
              <div style={{ width:pctW(d.n_tx, Math.max(...data.map(x=>x.n_tx))), height:"100%",
                background:color, opacity:0.5, borderRadius:3 }}/>
            </div>
            <div style={{ height:2, marginTop:2, background:"var(--border)", borderRadius:1 }}>
              <div style={{ width:pctW(d.fraud_rate, maxRate), height:"100%",
                background:"#be1f26", borderRadius:1 }}/>
            </div>
          </div>
        );
      })}
      <div style={{ display:"flex", gap:14, marginTop:2 }}>
        <Swatch color="var(--navy)" opacity={0.5} label="Volume tx"/>
        <Swatch color="var(--red)" label="Taux de fraude relatif"/>
      </div>
    </div>
  );
}

// ── Top Merchant Bars ─────────────────────────────────────────────────────────

function MerchantChart({ data, onTip }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.n_tx));
  const maxF = Math.max(...data.map(d => d.n_fraud), 1);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
      {data.map((d, i) => (
        <div key={i}
          onMouseMove={e => onTip && onTip({
            x:e.clientX, y:e.clientY,
            title: d.commercant,
            lines:[
              { label:"Transactions",  value: fmtNum(d.n_tx) },
              { label:"Fraudes",       value: String(d.n_fraud), red: d.n_fraud > 0 },
              { label:"Montant moy.",  value: fmtCAD(d.montant_moyen) },
            ],
          })}
          onMouseLeave={() => onTip && onTip(null)}
          style={{ cursor:"default" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:11, color:"var(--navy)", flex:1, overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.commercant}</span>
            <div style={{ display:"flex", gap:10, flexShrink:0 }}>
              <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"var(--ink-3)" }}>
                {fmtNum(d.n_tx)}
              </span>
              {d.n_fraud > 0 && (
                <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace",
                  color:"#be1f26", fontWeight:600 }}>{d.n_fraud} ✕</span>
              )}
            </div>
          </div>
          <div style={{ height:5, background:"var(--border)", borderRadius:3 }}>
            <div style={{ width:pctW(d.n_tx, max), height:"100%",
              background: d.n_fraud > 0 ? "#be1f26" : "var(--navy)",
              opacity: d.n_fraud > 0 ? 0.6 : 0.35, borderRadius:3 }}/>
          </div>
          {d.n_fraud > 0 && (
            <div style={{ height:2, marginTop:1, background:"var(--border)", borderRadius:1 }}>
              <div style={{ width:pctW(d.n_fraud, maxF), height:"100%",
                background:"#be1f26", borderRadius:1 }}/>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Category Chart ────────────────────────────────────────────────────────────

function CategoryChart({ data, onTip }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.n_tx));

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"7px 20px" }}>
      {data.map((d, i) => (
        <div key={i}
          onMouseMove={e => onTip && onTip({
            x:e.clientX, y:e.clientY,
            title: d.categorie,
            lines:[
              { label:"Transactions",  value: fmtNum(d.n_tx) },
              { label:"Fraudes",       value: String(d.n_fraud), red: d.n_fraud > 0 },
              { label:"Montant moy.",  value: fmtCAD(d.montant_moyen) },
            ],
          })}
          onMouseLeave={() => onTip && onTip(null)}
          style={{ cursor:"default" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
            <span style={{ fontSize:10, color:"var(--navy)", textTransform:"capitalize",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
              {d.categorie}
            </span>
            {d.n_fraud > 0 && (
              <span style={{ fontSize:9, color:"#be1f26", fontWeight:700, flexShrink:0, marginLeft:4 }}>
                {d.n_fraud}✕
              </span>
            )}
          </div>
          <div style={{ height:5, background:"var(--border)", borderRadius:3 }}>
            <div style={{ width:pctW(d.n_tx, max), height:"100%",
              background: d.n_fraud > 0 ? "#be1f26" : "var(--navy)",
              opacity: d.n_fraud > 0 ? 0.55 : 0.3, borderRadius:3 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:6 }}>
      <span style={{ fontSize:9, letterSpacing:"0.12em", color:"#8596af", fontWeight:700,
        textTransform:"uppercase", whiteSpace:"nowrap" }}>{label}</span>
      <div style={{ flex:1, height:1, background:"var(--border)" }}/>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

function Dashboard() {
  const [stats, setStats]               = useStateD(null);
  const [loading, setLoading]           = useStateD(true);
  const [archetype, setArchetype]       = useStateD("all");
  const [province, setProvince]         = useStateD("all");
  const [fraudType, setFraudType]       = useStateD("all");
  const [datasets, setDatasets]         = useStateD([]);
  const [selectedDataset, setSelectedDataset] = useStateD("main");
  const [tip, setTip]                   = useStateD(null);

  useEffectD(() => {
    fetch(`${API}/generate/datasets`)
      .then(r => r.json())
      .then(setDatasets)
      .catch(() => {});
  }, []);

  useEffectD(() => {
    setLoading(true);
    const p = new URLSearchParams({ archetype, province, fraud_type: fraudType, dataset: selectedDataset });
    fetch(`${API}/stats/dataset?${p}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [archetype, province, fraudType, selectedDataset]);

  const selStyle = {
    background:"var(--card)", border:"1px solid var(--border)",
    color:"var(--navy)", padding:"6px 10px", fontSize:11,
    fontFamily:"var(--font)", cursor:"pointer", outline:"none", borderRadius:4,
  };

  const isFiltered = archetype !== "all" || province !== "all" || fraudType !== "all" || selectedDataset !== "main";
  const kpis = stats?.kpis;

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", minHeight:0 }}>
      <Tooltip tip={tip}/>

      {/* Filter bar */}
      <div style={{
        background:"var(--card)", borderBottom:"1px solid var(--border)",
        padding:"8px 24px", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap",
      }}>
        <span style={{ fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase",
          color:"var(--ink-3)", fontWeight:600, marginRight:4 }}>Vue Données</span>

        {datasets.length > 1 && (
          <select value={selectedDataset} onChange={e => setSelectedDataset(e.target.value)}
            style={{ ...selStyle, fontWeight: 600, borderColor: selectedDataset !== "main" ? "var(--navy)" : "var(--border)" }}>
            {datasets.map(ds => (
              <option key={ds.id} value={ds.id}>
                {ds.is_main ? "Dataset principal" : ds.name}
                {ds.stats?.n_transactions ? ` (${ds.stats.n_transactions.toLocaleString("fr-CA")} tx)` : ""}
              </option>
            ))}
          </select>
        )}

        <select value={archetype} onChange={e => setArchetype(e.target.value)} style={selStyle}>
          <option value="all">Tous les profils</option>
          {Object.entries(ARCH_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={province} onChange={e => setProvince(e.target.value)} style={selStyle}>
          <option value="all">Toutes provinces</option>
          {["QC","ON","BC","AB","MB","SK"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={fraudType} onChange={e => setFraudType(e.target.value)} style={selStyle}>
          <option value="all">Tous types de fraude</option>
          {Object.entries(FRAUD_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {isFiltered && (
          <button onClick={() => { setArchetype("all"); setProvince("all"); setFraudType("all"); setSelectedDataset("main"); }}
            style={{ ...selStyle, color:"#be1f26", borderColor:"rgba(190,31,38,.3)" }}>
            × Réinitialiser
          </button>
        )}
        {loading && <span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:8 }}>Chargement…</span>}
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 24px",
        display:"flex", flexDirection:"column", gap:10 }}>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 }}>
          <KpiCard loading={loading} value={fmtNum(kpis?.n_transactions)} label="Transactions"
            sub={`${kpis?.n_accounts ?? "—"} comptes`}/>
          <KpiCard loading={loading} value={fmtNum(kpis?.n_fraud)} label="Fraudes"
            sub="labellées" alert/>
          <KpiCard loading={loading}
            value={kpis ? `${(kpis.fraud_rate*100).toFixed(3)} %` : "—"}
            label="Taux de fraude" alert={kpis?.fraud_rate > 0.001}/>
          <KpiCard loading={loading} value={kpis ? fmtCAD(kpis.total_montant) : "—"}
            label="Volume total" sub="toutes tx"/>
          <KpiCard loading={loading} value={kpis ? fmtCAD(kpis.montant_moyen) : "—"}
            label="Montant moyen" sub="par transaction"/>
          <KpiCard loading={loading}
            value={loading ? "—" : isFiltered ? "Filtré" : "Complet"}
            label="Dataset"
            sub={isFiltered
              ? [archetype !== "all" && ARCH_LABELS[archetype], province !== "all" && province,
                 fraudType !== "all" && FRAUD_LABELS[fraudType]].filter(Boolean).join(" · ")
              : "13 semaines"}/>
        </div>

        {/* — Activité transactionnelle ——————————————————————————————————————— */}
        <SectionDivider label="Activité transactionnelle"/>

        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12 }}>
          <ChartCard title="Volume hebdomadaire & fraudes" sub="barres = tx · ligne rouge = fraudes">
            {loading ? <Skeleton h={110}/> : <TimelineChart data={stats?.weekly} onTip={setTip}/>}
          </ChartCard>
          <ChartCard title="Répartition par type de fraude">
            {loading ? <Skeleton h={130}/> : <DonutChart data={stats?.by_type} onTip={setTip}/>}
          </ChartCard>
        </div>

        {/* — Comportement & risques ————————————————————————————————————————— */}
        <SectionDivider label="Comportement & risques"/>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.4fr", gap:12 }}>
          <ChartCard title="Distribution horaire" sub="24h · volume et fraudes">
            {loading ? <Skeleton h={100}/> : <HourlyChart data={stats?.hourly} onTip={setTip}/>}
          </ChartCard>
          <ChartCard title="Distribution des montants" sub="% tx vs % fraudes">
            {loading ? <Skeleton h={100}/> : <AmountChart data={stats?.by_amount} onTip={setTip}/>}
          </ChartCard>
          <ChartCard title="Heatmap fraude" sub="type × profil client">
            {loading ? <Skeleton h={150}/> : <FraudHeatmap data={stats?.heatmap} onTip={setTip}/>}
          </ChartCard>
        </div>

        {/* — Géographie canadienne —————————————————————————————————————————— */}
        <SectionDivider label="Géographie canadienne"/>

        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, alignItems:"start" }}>
          <ChartCard title="Carte du Canada" sub="cercles bleus = volume tx · cercles rouges = fraudes">
            {loading ? <Skeleton h={280}/> : <CanadaMap data={stats?.by_province} onTip={setTip}/>}
          </ChartCard>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <ChartCard title="Par tranche d'âge" sub="volume · taux de fraude">
              {loading ? <Skeleton h={150}/> : <AgeGroupChart data={stats?.by_age_group} onTip={setTip}/>}
            </ChartCard>
            <ChartCard title="Par appareil">
              {loading ? <Skeleton h={110}/> : <DevicePie data={stats?.by_device} onTip={setTip}/>}
            </ChartCard>
          </div>
        </div>

        {/* — Profils & marchands ————————————————————————————————————————————— */}
        <SectionDivider label="Profils & marchands"/>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.2fr", gap:12 }}>
          <ChartCard title="Profils clients" sub="volume · taux de fraude">
            {loading ? <Skeleton h={140}/> : <ArchetypeChart data={stats?.by_archetype} onTip={setTip}/>}
          </ChartCard>
          <ChartCard title="Top marchands à risque" sub="volume + fraudes détectées">
            {loading ? <Skeleton h={140}/> : <MerchantChart data={stats?.by_merchant} onTip={setTip}/>}
          </ChartCard>
          <ChartCard title="Par catégorie marchande" sub="volume tx + cas de fraude">
            {loading ? <Skeleton h={140}/> : <CategoryChart data={stats?.by_category} onTip={setTip}/>}
          </ChartCard>
        </div>

      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
