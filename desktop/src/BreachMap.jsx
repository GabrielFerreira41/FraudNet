// BreachMap.jsx — Widget flottant Threat Intelligence (bas-droite)

const { useState: useBMState, useEffect: useBMEffect, useRef: useBMRef, useCallback: useBMCallback } = React;

const API_BM = "http://localhost:8000";

// ── Palettes ──────────────────────────────────────────────────────────────────
const SEV = {
  critical: { color:"#be1f26", bg:"#fef2f2", border:"#fca5a5", label:"Critique", dot:"#be1f26" },
  high:     { color:"#92400e", bg:"#fffbeb", border:"#fcd34d", label:"Élevée",   dot:"#d97706" },
  medium:   { color:"#9a3412", bg:"#fff7ed", border:"#fed7aa", label:"Moyenne",  dot:"#ea580c" },
  low:      { color:"#166534", bg:"#f0fdf4", border:"#86efac", label:"Faible",   dot:"#16a34a" },
};

const TYPE_LABELS = {
  credential_leak:"Fuite credentials",  card_data_theft:"Vol données cartes",
  ransomware:"Ransomware",              unauthorized_access:"Accès non autorisé",
  phishing:"Phishing bancaire",         insider:"Menace interne",
  cloud_misconfiguration:"Config cloud",swift_attack:"Attaque SWIFT",
  atm_skimming:"Skimming ATM",          crypto_exchange_hack:"Hack exchange crypto",
  unknown:"Inconnu",
};

const FLAGS = {
  "United States":"🇺🇸","USA":"🇺🇸","United Kingdom":"🇬🇧","UK":"🇬🇧",
  "France":"🇫🇷","Germany":"🇩🇪","Canada":"🇨🇦","Australia":"🇦🇺",
  "India":"🇮🇳","China":"🇨🇳","Japan":"🇯🇵","Russia":"🇷🇺","Brazil":"🇧🇷",
  "South Korea":"🇰🇷","Italy":"🇮🇹","Spain":"🇪🇸","Netherlands":"🇳🇱",
  "Sweden":"🇸🇪","Singapore":"🇸🇬","Israel":"🇮🇱","Mexico":"🇲🇽",
  "Argentina":"🇦🇷","Indonesia":"🇮🇩","South Africa":"🇿🇦","Ukraine":"🇺🇦",
  "Poland":"🇵🇱","Turkey":"🇹🇷","Saudi Arabia":"🇸🇦","UAE":"🇦🇪",
  "United Arab Emirates":"🇦🇪","Finland":"🇫🇮","Norway":"🇳🇴",
  "Denmark":"🇩🇰","Belgium":"🇧🇪","Switzerland":"🇨🇭","Austria":"🇦🇹",
  "New Zealand":"🇳🇿","Taiwan":"🇹🇼","Hong Kong":"🇭🇰","Thailand":"🇹🇭",
  "Vietnam":"🇻🇳","Philippines":"🇵🇭","Malaysia":"🇲🇾","Pakistan":"🇵🇰",
  "Nigeria":"🇳🇬","Kenya":"🇰🇪","Egypt":"🇪🇬","Morocco":"🇲🇦",
  "Colombia":"🇨🇴","Chile":"🇨🇱","Peru":"🇵🇪","Portugal":"🇵🇹",
  "Romania":"🇷🇴","Czech Republic":"🇨🇿","Greece":"🇬🇷","Hungary":"🇭🇺",
  "Ireland":"🇮🇪","Global":"🌍","Unknown":"🌍",
};
const flag = c => FLAGS[c] || "🌍";

function fmtRec(n) {
  if (!n) return "—";
  if (n >= 1e6) return `${(n/1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(0)} K`;
  return String(n);
}

function dotR(r) { return r >= 10e6 ? 12 : r >= 1e6 ? 9 : r >= 100e3 ? 6 : 5; }

const SCAN_STEPS = [
  "Connexion aux flux RSS bancaires…",
  "Scraping BleepingComputer…",
  "Scraping TheHackersNews…",
  "Envoi à Mistral AI…",
  "Extraction — banque, pays, type…",
  "Géocodage des incidents…",
  "Compilation du rapport…",
];

function injectBMStyles() {
  if (document.getElementById("bm-styles")) return;
  const s = document.createElement("style");
  s.id = "bm-styles";
  s.textContent = `
    @keyframes bm-pulse    { from{opacity:.5} to{opacity:.04} }
    @keyframes bm-blink    { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes bm-fadein   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
    @keyframes bm-spin     { to{transform:rotate(360deg)} }
    @keyframes bm-slide-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  `;
  document.head.appendChild(s);
}

// ── Carte D3 ──────────────────────────────────────────────────────────────────
function WorldMap({ breaches, selected, onSelect }) {
  const svgRef  = useBMRef(null);
  const wrapRef = useBMRef(null);
  const [topo,    setTopo]    = useBMState(null);
  const [dims,    setDims]    = useBMState({ w: 600, h: 400 });
  const [tooltip, setTooltip] = useBMState(null);

  useBMEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json()).then(setTopo).catch(() => {});
  }, []);

  useBMEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useBMEffect(() => {
    if (!topo || !svgRef.current || !window.topojson) return;
    const { w, h } = dims;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", w).attr("height", h);
    const proj = d3.geoNaturalEarth1().scale(w / 6.3).translate([w / 2, h / 2]);
    const path = d3.geoPath(proj);

    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#0c1b34");
    svg.append("path").datum(d3.geoGraticule()())
      .attr("d", path).attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,.04)").attr("stroke-width", .5);

    const countries = window.topojson.feature(topo, topo.objects.countries);
    svg.selectAll(".ctr").data(countries.features).join("path")
      .attr("class", "ctr").attr("d", path)
      .attr("fill", "rgba(255,255,255,.07)")
      .attr("stroke", "rgba(255,255,255,.13)").attr("stroke-width", .35);

    breaches.forEach((b, i) => {
      const cfg = SEV[b.severity] || SEV.medium;
      const pt  = proj([b.lng, b.lat]);
      if (!pt) return;
      const [px, py] = pt;
      const r = dotR(b.records);
      const isSel = selected?.id === b.id;

      const g = svg.append("g")
        .attr("transform", `translate(${px},${py})`)
        .style("cursor", "pointer")
        .on("click", () => onSelect(b))
        .on("mouseenter", evt => setTooltip({ b, x: evt.clientX, y: evt.clientY }))
        .on("mouseleave", ()  => setTooltip(null));

      g.append("circle").attr("r", r * 2.2).attr("fill", cfg.bg)
        .style("opacity", .4)
        .style("animation", `bm-pulse ${1.8 + (i % 5) * .2}s ease-in-out infinite alternate`);
      g.append("circle").attr("r", isSel ? r + 2 : r)
        .attr("fill", cfg.dot)
        .attr("stroke", isSel ? "#fff" : "rgba(255,255,255,.3)")
        .attr("stroke-width", isSel ? 2 : 1);
    });
  }, [topo, dims, breaches, selected]);

  return (
    <div ref={wrapRef} style={{ flex: 1, position: "relative", minHeight: 0, background: "#0c1b34" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}/>

      {/* Légende */}
      {breaches.length > 0 && (
        <div style={{
          position: "absolute", bottom: 10, left: 10,
          background: "rgba(12,27,52,.85)", border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 5, padding: "7px 10px",
        }}>
          {Object.entries(SEV).map(([, cfg]) => (
            <div key={cfg.label} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2, fontSize:10 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:cfg.dot, flexShrink:0 }}/>
              <span style={{ color:"rgba(255,255,255,.55)" }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 13, top: tooltip.y - 13,
          background: "#0c1b34", border: `1px solid ${SEV[tooltip.b.severity]?.border || "#555"}`,
          borderRadius: 6, padding: "9px 12px", fontSize: 11, color: "#fff",
          pointerEvents: "none", zIndex: 9999, minWidth: 170,
          boxShadow: "0 6px 20px rgba(0,0,0,.4)",
        }}>
          <div style={{ fontWeight:700, marginBottom:3 }}>
            {flag(tooltip.b.country)} {tooltip.b.company}
          </div>
          <div style={{ color:"rgba(255,255,255,.5)", marginBottom:4, fontSize:10 }}>
            {TYPE_LABELS[tooltip.b.type] || tooltip.b.type}
          </div>
          <span style={{ color: SEV[tooltip.b.severity]?.dot }}>
            ● {SEV[tooltip.b.severity]?.label}
          </span>
          {tooltip.b.records > 0 && (
            <span style={{ color:"rgba(255,255,255,.4)", fontFamily:"JetBrains Mono,monospace", marginLeft:8 }}>
              {fmtRec(tooltip.b.records)}
            </span>
          )}
        </div>
      )}

      {!topo && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", color:"rgba(255,255,255,.25)", fontSize:11 }}>
          Chargement de la carte…
        </div>
      )}
    </div>
  );
}

// ── Log agent ─────────────────────────────────────────────────────────────────
function AgentLog({ logs }) {
  const ref = useBMRef(null);
  useBMEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  return (
    <div ref={ref} style={{
      fontFamily: "JetBrains Mono,monospace", fontSize: 10,
      color: "#4ade80", lineHeight: 1.6,
      background: "#0c1b34", borderRadius: 4, padding: "7px 10px",
      height: 72, overflowY: "auto",
      border: "1px solid #e4ddd3",
    }}>
      {logs.map((l, i) => (
        <div key={i} style={{ opacity: i === logs.length - 1 ? 1 : .4 }}>
          <span style={{ color:"rgba(74,222,128,.3)" }}>&gt; </span>{l}
          {i === logs.length - 1 && (
            <span style={{ animation:"bm-blink 1s step-end infinite" }}>█</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Stats sévérité ────────────────────────────────────────────────────────────
function StatsRow({ breaches }) {
  const counts = { critical:0, high:0, medium:0, low:0 };
  breaches.forEach(b => { if (b.severity in counts) counts[b.severity]++; });
  return (
    <div style={{ display:"flex", gap:4 }}>
      {Object.entries(SEV).map(([k, cfg]) => (
        <div key={k} style={{
          flex:1, background:cfg.bg, border:`1px solid ${cfg.border}`,
          borderRadius:4, padding:"4px 2px", textAlign:"center",
        }}>
          <div style={{ fontSize:15, fontWeight:700, color:cfg.color,
            fontFamily:"JetBrains Mono,monospace" }}>{counts[k]}</div>
          <div style={{ fontSize:7.5, color:cfg.color, textTransform:"uppercase",
            letterSpacing:".05em", opacity:.75 }}>{cfg.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Carte incident ────────────────────────────────────────────────────────────
function BreachCard({ b, selected, onClick, index }) {
  const cfg   = SEV[b.severity] || SEV.medium;
  const isSel = selected?.id === b.id;
  return (
    <div onClick={() => onClick(b)} style={{
      background: isSel ? cfg.bg : "#fff",
      border: `1px solid ${isSel ? cfg.border : "#e4ddd3"}`,
      borderRadius: 4, padding: "6px 8px", cursor: "pointer",
      marginBottom: 4, transition: "border-color .12s, background .12s",
      animation: "bm-fadein .2s ease both",
      animationDelay: `${index * .05}s`,
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
        <span style={{ fontSize:13, flexShrink:0, lineHeight:1.3 }}>{flag(b.country)}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:1 }}>
            <span style={{ fontSize:11, fontWeight:600, color:"#0c1b34",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {b.company}
            </span>
            <span style={{
              marginLeft:"auto", flexShrink:0, fontSize:7.5, fontWeight:700,
              color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.border}`,
              padding:"1px 4px", borderRadius:3, textTransform:"uppercase",
            }}>
              {cfg.label}
            </span>
          </div>
          <div style={{ fontSize:10, color:"#8596af" }}>
            {b.country} · {b.date}
            {b.records > 0 && (
              <span style={{ color:cfg.color, fontFamily:"JetBrains Mono,monospace",
                fontWeight:600, marginLeft:6 }}>
                {fmtRec(b.records)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Widget flottant ───────────────────────────────────────────────────────────
function BreachWidget() {
  useBMEffect(() => injectBMStyles(), []);

  const [open,     setOpen]     = useBMState(false);
  const [breaches, setBreaches] = useBMState([]);
  const [selected, setSelected] = useBMState(null);
  const [scanning, setScanning] = useBMState(false);
  const [logs,     setLogs]     = useBMState(["En attente de démarrage…"]);
  const [lastScan, setLastScan] = useBMState(null);
  const [error,    setError]    = useBMState(null);

  const addLog = useBMCallback(msg => setLogs(p => [...p.slice(-40), msg]), []);

  const runScan = useBMCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setError(null);
    setLogs(["Démarrage du scan…"]);
    let si = 0;
    const iv = setInterval(() => {
      if (si < SCAN_STEPS.length) { addLog(SCAN_STEPS[si]); si++; }
    }, 900);
    try {
      const r = await fetch(`${API_BM}/breach-scan`, { signal: AbortSignal.timeout(65_000) });
      clearInterval(iv);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data  = await r.json();
      const found = data.breaches || [];
      setBreaches(found);
      setLastScan(new Date().toLocaleTimeString("fr-CA"));
      addLog(`✓ ${found.length} incident(s) détecté(s). Carte mise à jour.`);
      if (found.length) setSelected(found[0]);
    } catch {
      clearInterval(iv);
      setError("API inaccessible — vérifiez que uvicorn tourne sur :8000.");
      addLog("✗ Erreur de connexion à l'API.");
    } finally {
      setScanning(false);
    }
  }, [scanning, addLog]);

  const criticalCount = breaches.filter(b => b.severity === "critical").length;
  const hasBreaches   = breaches.length > 0;

  return (
    <div style={{
      position: "fixed", right: 24, bottom: 0, zIndex: 1000,
      display: "flex", flexDirection: "column", alignItems: "flex-end",
    }}>

      {/* ── Panneau étendu ── */}
      {open && (
        <div style={{
          width: "min(860px, calc(100vw - 48px))",
          height: 480,
          background: "#fff",
          border: "1px solid #e4ddd3",
          borderRadius: "8px 8px 0 0",
          boxShadow: "0 -6px 40px rgba(12,27,52,.2), 0 0 0 1px rgba(12,27,52,.06)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "bm-slide-up .18s ease both",
        }}>

          {/* Header panneau */}
          <div style={{
            padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 8,
            borderBottom: "1px solid #e4ddd3",
            background: "#faf9f7",
            flexShrink: 0,
          }}>
            <span style={{ display:"block", width:12, height:2, background:"#be1f26", flexShrink:0 }}/>
            <span style={{ fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase",
              color:"#8596af", fontWeight:600 }}>
              Threat Intelligence · Fuites Financières Mondiales
            </span>
            {lastScan && (
              <span style={{ fontSize:9, color:"#8596af", fontStyle:"italic" }}>
                · scan {lastScan}
              </span>
            )}
            <div style={{ marginLeft:"auto", display:"flex", gap:7, alignItems:"center" }}>
              <button
                onClick={runScan}
                disabled={scanning}
                style={{
                  background: scanning ? "#cfc8be" : "#be1f26",
                  color:"#fff", border:"none", borderRadius:3,
                  padding:"5px 13px", fontSize:11, fontWeight:700,
                  cursor: scanning ? "default" : "pointer",
                  display:"flex", alignItems:"center", gap:5,
                  transition:"background .15s",
                }}
              >
                {scanning ? (
                  <>
                    <span style={{
                      display:"inline-block", width:8, height:8,
                      border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff",
                      borderRadius:"50%", animation:"bm-spin .7s linear infinite",
                    }}/>
                    Scan…
                  </>
                ) : "▶  Lancer scan"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background:"none", border:"1px solid #e4ddd3",
                  color:"#8596af", borderRadius:3, padding:"4px 10px",
                  fontSize:13, lineHeight:1, cursor:"pointer",
                  transition:"background .12s",
                }}
                title="Réduire"
              >▼</button>
            </div>
          </div>

          {/* Corps : carte + sidebar */}
          <div style={{ flex:1, minHeight:0, display:"flex" }}>

            {/* Carte monde */}
            <WorldMap breaches={breaches} selected={selected} onSelect={setSelected}/>

            {/* Sidebar */}
            <div style={{
              width: 252, flexShrink:0,
              borderLeft: "1px solid #e4ddd3",
              display: "flex", flexDirection: "column",
              background: "#fff", overflowY: "hidden",
            }}>
              {/* Log */}
              <div style={{ padding:"10px 12px 0", flexShrink:0 }}>
                <div style={{ fontSize:9, letterSpacing:".7px", color:"#8596af",
                  fontWeight:700, textTransform:"uppercase", marginBottom:5 }}>Agent Log</div>
                <AgentLog logs={logs}/>
              </div>

              {/* Stats sévérité */}
              {hasBreaches && (
                <div style={{ padding:"7px 12px 0", flexShrink:0 }}>
                  <StatsRow breaches={breaches}/>
                </div>
              )}

              {/* Erreur */}
              {error && (
                <div style={{ margin:"6px 12px 0", fontSize:11, color:"#be1f26",
                  background:"#fef2f2", border:"1px solid #fca5a5",
                  padding:"7px 10px", borderRadius:4 }}>
                  {error}
                </div>
              )}

              {/* Liste incidents */}
              <div style={{ padding:"7px 12px 0", overflowY:"auto", flex:1 }}>
                {hasBreaches ? (
                  <>
                    <div style={{ fontSize:9, letterSpacing:".7px", color:"#8596af",
                      fontWeight:700, textTransform:"uppercase", marginBottom:5 }}>
                      Incidents — {breaches.length}
                    </div>
                    {breaches.map((b, i) => (
                      <BreachCard key={b.id || i} b={b} index={i}
                        selected={selected} onClick={setSelected}/>
                    ))}
                    <div style={{ height:6 }}/>
                  </>
                ) : !scanning && (
                  <div style={{ textAlign:"center", color:"#8596af", fontSize:11, paddingTop:24 }}>
                    Lancez un scan pour détecter<br/>les fuites financières mondiales
                  </div>
                )}
              </div>

              {/* Détail sélectionné */}
              {selected && (() => {
                const cfg = SEV[selected.severity] || SEV.medium;
                return (
                  <div style={{ borderTop:"1px solid #e4ddd3", padding:"8px 12px", flexShrink:0 }}>
                    <div style={{ fontSize:9, letterSpacing:".7px", color:"#8596af",
                      fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Détail</div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#0c1b34", marginBottom:2 }}>
                      {flag(selected.country)} {selected.company}
                    </div>
                    <div style={{ fontSize:10, color:"#3d4e6a", lineHeight:1.5, marginBottom:5 }}>
                      {selected.description}
                    </div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {[
                        [TYPE_LABELS[selected.type] || selected.type, cfg],
                        [cfg.label, cfg],
                        ...(selected.records > 0 ? [[fmtRec(selected.records) + " comptes", cfg]] : []),
                      ].map(([v, c], i) => (
                        <span key={i} style={{ fontSize:9, fontWeight:700, color:c.color,
                          background:c.bg, border:`1px solid ${c.border}`,
                          padding:"1px 5px", borderRadius:3 }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Onglet trigger ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "#0c1b34",
          border: "none",
          borderRadius: open ? "0" : "6px 6px 0 0",
          padding: "9px 18px",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: 9,
          color: "#fff",
          fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
          boxShadow: open ? "none" : "0 -3px 16px rgba(12,27,52,.25)",
          transition: "border-radius .1s",
          whiteSpace: "nowrap",
        }}
      >
        {/* Dot statut */}
        <span style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: criticalCount > 0 ? "#be1f26"
                    : hasBreaches      ? "#d97706"
                    : "rgba(255,255,255,.25)",
          animation: criticalCount > 0 ? "bm-pulse .9s ease-in-out infinite alternate" : "none",
        }}/>

        <span>THREAT INTEL</span>

        {/* Badge compteur */}
        {hasBreaches && (
          <span style={{
            background: criticalCount > 0 ? "#be1f26" : "#d97706",
            color: "#fff", fontSize: 9, fontWeight: 700,
            borderRadius: 10, padding: "1px 6px",
            minWidth: 18, textAlign: "center", lineHeight: 1.6,
          }}>
            {breaches.length}
          </span>
        )}

        {/* Flèche */}
        <span style={{ fontSize: 9, opacity: 0.45, marginLeft: 2 }}>
          {open ? "▼" : "▲"}
        </span>
      </button>
    </div>
  );
}

window.BreachWidget     = BreachWidget;
window.BreachMapSection = BreachWidget; // alias pour compatibilité mount check
