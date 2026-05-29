"use strict";
const { useState: useStateMS, useEffect: useEffectMS, useRef: useRefMS } = React;

const MS_METRICS = [
  { key: "auc_pr",    label: "AUC-PR",    color: "#818cf8", desc: "Métrique principale fraude" },
  { key: "auc_roc",   label: "AUC-ROC",   color: "#38bdf8", desc: "Discrimination globale" },
  { key: "f1",        label: "F1 Score",  color: "#4ade80", desc: "Équilibre précision/recall" },
  { key: "recall",    label: "Recall",    color: "#fb923c", desc: "Fraudes détectées" },
  { key: "precision", label: "Précision", color: "#f87171", desc: "Alertes correctes" },
];

function MetricCard({ metric, value, prev }) {
  if (value == null) return null;
  const trend = prev != null ? value - prev : null;
  const trendColor  = trend === null ? "#999" : trend >= 0 ? "#4ade80" : "#f87171";
  const trendSymbol = trend === null ? "" : trend >= 0 ? "▲" : "▼";
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        {metric.label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: metric.color, fontFamily: "JetBrains Mono, monospace" }}>
        {value.toFixed(4)}
      </div>
      {trend !== null && (
        <div style={{ fontSize: 11, color: trendColor, marginTop: 4 }}>
          {trendSymbol} {Math.abs(trend * 100).toFixed(2)}% vs précédent
        </div>
      )}
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{metric.desc}</div>
    </div>
  );
}

function EvolutionChart({ runs }) {
  const svgRef = useRefMS(null);
  const [tip, setTip] = useStateMS(null);

  useEffectMS(() => {
    if (!runs.length || !svgRef.current) return;
    const el = svgRef.current;
    while (el.firstChild) el.removeChild(el.firstChild);

    const W = el.clientWidth || 760, H = 260;
    const mg = { top: 16, right: 24, bottom: 44, left: 52 };
    const iW = W - mg.left - mg.right;
    const iH = H - mg.top - mg.bottom;

    const svg = d3.select(el).attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const xScale = d3.scaleLinear().domain([0, Math.max(runs.length - 1, 1)]).range([0, iW]);
    const yScale = d3.scaleLinear().domain([0, 1]).range([iH, 0]);

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-iW).tickFormat(""))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.06)"));

    g.append("g").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(runs.length, 10)).tickFormat(i => `#${Math.round(i) + 1}`))
      .call(ax => ax.select(".domain").attr("stroke", "rgba(255,255,255,0.2)"))
      .call(ax => ax.selectAll("text").attr("fill", "#94a3b8").attr("font-size", 11));
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".2f")))
      .call(ax => ax.select(".domain").attr("stroke", "rgba(255,255,255,0.2)"))
      .call(ax => ax.selectAll("text").attr("fill", "#94a3b8").attr("font-size", 11));

    const visibleMetrics = MS_METRICS.filter(m => runs.some(r => r[m.key] != null));

    visibleMetrics.forEach(metric => {
      const data = runs.map((r, i) => ({ i, v: r[metric.key] })).filter(d => d.v != null);
      if (!data.length) return;
      const line = d3.line().x(d => xScale(d.i)).y(d => yScale(d.v)).curve(d3.curveMonotoneX);

      g.append("path").datum(data)
        .attr("fill", "none").attr("stroke", metric.color)
        .attr("stroke-width", 2.5).attr("d", line);

      g.selectAll(null).data(data).enter().append("circle")
        .attr("cx", d => xScale(d.i)).attr("cy", d => yScale(d.v))
        .attr("r", 5).attr("fill", metric.color)
        .attr("stroke", "#0f172a").attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("mouseenter", function(event, d) {
          d3.select(this).attr("r", 7);
          const rect = el.getBoundingClientRect();
          setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 10, label: metric.label, value: d.v, run: d.i + 1, color: metric.color });
        })
        .on("mouseleave", function() { d3.select(this).attr("r", 5); setTip(null); });
    });

    const leg = svg.append("g").attr("transform", `translate(${mg.left},${H - 12})`);
    let ox = 0;
    visibleMetrics.forEach(m => {
      leg.append("circle").attr("cx", ox + 5).attr("cy", 0).attr("r", 5).attr("fill", m.color);
      leg.append("text").attr("x", ox + 14).attr("y", 4).attr("fill", "#94a3b8").attr("font-size", 11).text(m.label);
      ox += 100;
    });
  }, [runs]);

  return (
    <div style={{ position: "relative", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 10 }}>Évolution des métriques</div>
      <svg ref={svgRef} style={{ width: "100%", height: 260, display: "block" }} />
      {tip && (
        <div style={{
          position: "absolute", left: tip.x + 12, top: tip.y,
          background: "#1e293b", border: `1px solid ${tip.color}`,
          borderRadius: 8, padding: "8px 12px", pointerEvents: "none",
          fontSize: 12, color: "#e2e8f0", whiteSpace: "nowrap",
        }}>
          <span style={{ color: tip.color, fontWeight: 700 }}>{tip.label}</span>
          {" — Run #"}{tip.run} :{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{tip.value.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}

function fmt(v, key) {
  if (v == null) return "—";
  if (key === "n_fraud_test" || key === "n_test") return Number(v).toLocaleString("fr-CA");
  return Number(v).toFixed(4);
}

function RunsTable({ runs }) {
  const sorted = [...runs].reverse();
  const dataKeys = ["auc_pr","auc_roc","f1","recall","precision","threshold","n_test","n_fraud_test"];
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        Historique des runs ({runs.length})
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["#", "Date", "AUC-PR", "AUC-ROC", "F1", "Recall", "Précision", "Seuil", "n_test", "Fraudes"].map(h => (
                <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#64748b", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((run, i) => {
              const isLatest = i === 0;
              return (
                <tr key={run.run_id} style={{ background: isLatest ? "rgba(99,102,241,0.08)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "8px 14px", color: isLatest ? "#818cf8" : "#94a3b8", fontWeight: isLatest ? 700 : 400 }}>
                    {runs.length - i}{isLatest ? " ★" : ""}
                  </td>
                  <td style={{ padding: "8px 14px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {run.start_time ? new Date(run.start_time).toLocaleDateString("fr-CA") : "—"}
                  </td>
                  {dataKeys.map(k => {
                    const meta = MS_METRICS.find(m => m.key === k);
                    return (
                      <td key={k} style={{ padding: "8px 14px", color: meta ? meta.color : "#cbd5e1", fontFamily: "JetBrains Mono, monospace" }}>
                        {fmt(run[k], k)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.ModelStats = function ModelStats() {
  const [runs, setRuns]           = useStateMS([]);
  const [loading, setLoading]     = useStateMS(true);
  const [lastRefresh, setLastRefresh] = useStateMS(null);

  const fetchRuns = async () => {
    try {
      const r    = await fetch("http://localhost:8000/mlflow/runs");
      const data = await r.json();
      setRuns(Array.isArray(data) ? data : []);
    } catch (_) {
      setRuns([]);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffectMS(() => {
    fetchRuns();
    const id = setInterval(fetchRuns, 30000);
    return () => clearInterval(id);
  }, []);

  const latest = runs[runs.length - 1];
  const prev   = runs[runs.length - 2];

  const s = {
    page:   { padding: "24px 32px", maxWidth: 1100, margin: "0 auto" },
    header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
    title:  { fontSize: 20, fontWeight: 700, color: "#e2e8f0" },
    sub:    { fontSize: 12, color: "#64748b", marginTop: 4 },
    btn:    { padding: "7px 16px", borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#818cf8", fontSize: 12, cursor: "pointer" },
    kpiRow: { display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" },
  };

  if (loading) return (
    <div style={{ ...s.page, color: "#94a3b8", textAlign: "center", paddingTop: 80 }}>
      Chargement des runs MLflow…
    </div>
  );

  if (!runs.length) return (
    <div style={{ ...s.page, textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>📊</div>
      <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Aucun run MLflow trouvé</div>
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>Lance un entraînement pour commencer :</div>
      <pre style={{ display: "inline-block", padding: "12px 24px", background: "rgba(255,255,255,0.05)", borderRadius: 8, color: "#818cf8", fontSize: 13, textAlign: "left" }}>
        {"python -m src.detection.baseline.agent\npython -m src.detection.baseline.evaluate"}
      </pre>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Performance des Modèles</div>
          <div style={s.sub}>
            Experiment : <span style={{ color: "#818cf8" }}>fraudnet-baseline</span>
            {" · "}{runs.length} run{runs.length > 1 ? "s" : ""}
            {" · "}Actualisé {lastRefresh?.toLocaleTimeString("fr-CA") ?? "—"}
          </div>
        </div>
        <button style={s.btn} onClick={fetchRuns}>↻ Actualiser</button>
      </div>

      <div style={s.kpiRow}>
        {MS_METRICS.map(m => (
          <MetricCard key={m.key} metric={m} value={latest?.[m.key]} prev={prev?.[m.key]} />
        ))}
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Seuil optimal</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace" }}>
            {latest?.threshold != null ? latest.threshold.toFixed(4) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Score de décision BLOCK</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        {runs.length > 1
          ? <EvolutionChart runs={runs} />
          : <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 24, border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", fontSize: 13, textAlign: "center" }}>Lance un 2ᵉ run pour voir l'évolution des métriques.</div>
        }
      </div>

      <RunsTable runs={runs} />
    </div>
  );
};
