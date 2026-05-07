// Model Stats view: confusion matrix, per-scenario perf, ROC, historical trends
const { useMemo: useMemoStats } = React;

function BigStat({ label, value, delta, accent, sub }) {
  return (
    <div className="big-stat">
      <div style={{fontSize:11, letterSpacing:0.7, color:"var(--ink-50)", fontWeight:600}}>{label}</div>
      <div style={{display:"flex", alignItems:"baseline", gap:10, marginTop:8}}>
        <div className="mono" style={{fontSize:36, fontWeight:600, color: accent || "var(--ink-90)", lineHeight:1, letterSpacing:-0.5}}>
          {value}
        </div>
        {delta && (
          <span style={{fontSize:12, color: delta.startsWith("+")?"var(--ok)":"var(--alert)", fontWeight:600}}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div style={{fontSize:11, color:"var(--ink-50)", marginTop:6}}>{sub}</div>}
    </div>
  );
}

function ConfusionMatrix({ c }) {
  const total = c.TP + c.FP + c.FN + c.TN;
  const cells = [
    { label:"Vrais positifs", value:c.TP, sub:"fraude détectée", color:"var(--ok)", big:true },
    { label:"Faux négatifs", value:c.FN, sub:"fraude manquée", color:"var(--alert)", big:false },
    { label:"Faux positifs", value:c.FP, sub:"alerte erronée", color:"var(--warn)", big:false },
    { label:"Vrais négatifs", value:c.TN, sub:"légitime validée", color:"var(--ink-60)", big:true },
  ];
  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span>MATRICE DE CONFUSION</span>
        <span className="mono" style={{color:"var(--ink-40)", fontSize:10}}>n={total.toLocaleString("fr-CA")}</span>
      </div>
      <div style={{padding:"18px 20px"}}>
        <div style={{display:"grid", gridTemplateColumns:"80px 1fr 1fr", gridTemplateRows:"auto 1fr 1fr", gap:1, background:"var(--line)"}}>
          <div/>
          <div className="cm-header">Prédit fraude</div>
          <div className="cm-header">Prédit légitime</div>
          <div className="cm-side">Réel fraude</div>
          <div className="cm-cell" style={{background:"color-mix(in oklch, var(--ok) 14%, var(--bg-2))"}}>
            <div className="cm-value mono" style={{color:"var(--ok)"}}>{cells[0].value.toLocaleString("fr-CA")}</div>
            <div className="cm-label">Vrais positifs</div>
          </div>
          <div className="cm-cell" style={{background:"color-mix(in oklch, var(--alert) 14%, var(--bg-2))"}}>
            <div className="cm-value mono" style={{color:"var(--alert)"}}>{cells[1].value.toLocaleString("fr-CA")}</div>
            <div className="cm-label">Faux négatifs</div>
          </div>
          <div className="cm-side">Réel légitime</div>
          <div className="cm-cell" style={{background:"color-mix(in oklch, var(--warn) 14%, var(--bg-2))"}}>
            <div className="cm-value mono" style={{color:"var(--warn)"}}>{cells[2].value.toLocaleString("fr-CA")}</div>
            <div className="cm-label">Faux positifs</div>
          </div>
          <div className="cm-cell" style={{background:"var(--bg-2)"}}>
            <div className="cm-value mono" style={{color:"var(--ink-70)"}}>{cells[3].value.toLocaleString("fr-CA")}</div>
            <div className="cm-label">Vrais négatifs</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PerScenarioTable({ perScenario }) {
  return (
    <div className="panel-card" style={{gridColumn:"span 2"}}>
      <div className="panel-card-header">
        <span>PERFORMANCE PAR SCÉNARIO</span>
      </div>
      <div style={{padding:"4px 0 8px"}}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{width:"30%"}}>Scénario</th>
              <th>Difficulté</th>
              <th style={{textAlign:"right"}}>Volume</th>
              <th style={{textAlign:"right"}}>Montant moyen</th>
              <th style={{width:"18%"}}>Recall</th>
              <th style={{width:"18%"}}>Précision</th>
            </tr>
          </thead>
          <tbody>
            {perScenario.map(s => (
              <tr key={s.key}>
                <td><span style={{fontWeight:500}}>{s.label}</span></td>
                <td><span className="chip-static" data-level={s.difficulty}>{s.difficulty}</span></td>
                <td className="mono" style={{textAlign:"right"}}>{s.volume}</td>
                <td className="mono" style={{textAlign:"right"}}>${s.avgAmount.toLocaleString("fr-CA")}</td>
                <td>
                  <div style={{display:"flex", alignItems:"center", gap:8}}>
                    <div style={{flex:1, height:4, background:"var(--bg-3)", borderRadius:2, overflow:"hidden"}}>
                      <div style={{width:`${s.recall*100}%`, height:"100%", background: s.recall>=0.8?"var(--ok)":s.recall>=0.6?"var(--warn)":"var(--alert)"}}/>
                    </div>
                    <span className="mono" style={{fontSize:11, minWidth:36, textAlign:"right"}}>{(s.recall*100).toFixed(1)}%</span>
                  </div>
                </td>
                <td>
                  <div style={{display:"flex", alignItems:"center", gap:8}}>
                    <div style={{flex:1, height:4, background:"var(--bg-3)", borderRadius:2, overflow:"hidden"}}>
                      <div style={{width:`${s.precision*100}%`, height:"100%", background:"var(--accent-teal)"}}/>
                    </div>
                    <span className="mono" style={{fontSize:11, minWidth:36, textAlign:"right"}}>{(s.precision*100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendChart({ days, metric, label, color, format }) {
  const values = days.map(d => d[metric]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const w = 100, h = 50;
  const step = w / (values.length - 1);
  const pts = values.map((v,i) => `${i*step},${h - ((v-min)/range)*h}`).join(" ");
  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span>{label}</span>
        <span className="mono" style={{color, fontSize:13, fontWeight:600}}>{format(values[values.length-1])}</span>
      </div>
      <div style={{padding:"14px 20px 18px"}}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:"100%", height:90, overflow:"visible"}}>
          <defs>
            <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`url(#grad-${metric})`} stroke="none"/>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
        </svg>
        <div style={{display:"flex", justifyContent:"space-between", marginTop:6, fontSize:10, color:"var(--ink-40)"}}>
          <span>{days[0].label}</span>
          <span>{days[Math.floor(days.length/2)].label}</span>
          <span>{days[days.length-1].label}</span>
        </div>
      </div>
    </div>
  );
}

function ROCCurve({ roc }) {
  const w = 200, h = 180, pad = 14;
  const pts = roc.map(p => `${pad + p.fpr*(w-2*pad)},${h - pad - p.tpr*(h-2*pad)}`).join(" ");
  // AUC approximation (trapezoidal, correct axis)
  let auc = 0;
  for (let i=1; i<roc.length; i++) {
    auc += Math.abs(roc[i].fpr - roc[i-1].fpr) * (roc[i].tpr + roc[i-1].tpr) / 2;
  }
  auc = Math.min(1, Math.max(0, auc));
  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span>COURBE ROC</span>
        <span className="mono" style={{color:"var(--accent-teal)", fontSize:13, fontWeight:600}}>AUC {auc.toFixed(3)}</span>
      </div>
      <div style={{padding:"14px 20px 18px", display:"flex", justifyContent:"center"}}>
        <svg width={w} height={h}>
          {/* grid */}
          {[0,0.25,0.5,0.75,1].map(t => (
            <g key={t}>
              <line x1={pad} x2={w-pad} y1={h-pad-t*(h-2*pad)} y2={h-pad-t*(h-2*pad)} stroke="var(--line)" strokeDasharray="2,2"/>
              <line y1={pad} y2={h-pad} x1={pad+t*(w-2*pad)} x2={pad+t*(w-2*pad)} stroke="var(--line)" strokeDasharray="2,2"/>
            </g>
          ))}
          {/* diagonal */}
          <line x1={pad} y1={h-pad} x2={w-pad} y2={pad} stroke="var(--ink-40)" strokeDasharray="3,3" strokeWidth="1"/>
          {/* curve area */}
          <polyline points={`${pad},${h-pad} ${pts} ${w-pad},${h-pad}`} fill="color-mix(in oklch, var(--accent-teal) 18%, transparent)" stroke="none"/>
          <polyline points={pts} fill="none" stroke="var(--accent-teal)" strokeWidth="1.8"/>
          {/* axes */}
          <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="var(--ink-60)"/>
          <line x1={pad} y1={pad} x2={pad} y2={h-pad} stroke="var(--ink-60)"/>
          <text x={w/2} y={h-2} fill="var(--ink-50)" fontSize="9" textAnchor="middle" fontFamily="monospace">FPR</text>
          <text x={4} y={h/2} fill="var(--ink-50)" fontSize="9" textAnchor="middle" fontFamily="monospace" transform={`rotate(-90, 4, ${h/2})`}>TPR</text>
        </svg>
      </div>
    </div>
  );
}

function ScoreDistribution({ transactions }) {
  // 20 buckets 0-100
  const buckets = new Array(20).fill(0).map(()=>({fraud:0, legit:0}));
  transactions.forEach(t => {
    const b = Math.min(19, Math.floor(t.score / 5));
    if (t.isFraud) buckets[b].fraud++; else buckets[b].legit++;
  });
  const max = Math.max(1, ...buckets.map(b => b.fraud + b.legit));
  return (
    <div className="panel-card" style={{gridColumn:"span 2"}}>
      <div className="panel-card-header">
        <span>DISTRIBUTION DES SCORES DE RISQUE</span>
        <span className="mono" style={{fontSize:10, color:"var(--ink-40)"}}>seuil bloc: 70</span>
      </div>
      <div style={{padding:"20px 24px 18px"}}>
        <div style={{display:"flex", alignItems:"flex-end", gap:2, height:120, position:"relative"}}>
          {/* threshold line */}
          <div style={{position:"absolute", left:`${70}%`, top:0, bottom:0, width:1, background:"var(--alert)", opacity:0.6}}/>
          <div style={{position:"absolute", left:`${45}%`, top:0, bottom:0, width:1, background:"var(--warn)", opacity:0.4, borderLeft:"1px dashed var(--warn)"}}/>
          {buckets.map((b,i) => (
            <div key={i} style={{flex:1, display:"flex", flexDirection:"column-reverse", gap:1, height:"100%"}}>
              <div style={{height:`${(b.legit/max)*100}%`, background:"var(--ink-60)", opacity:0.7, minHeight:b.legit?1:0}}/>
              <div style={{height:`${(b.fraud/max)*100}%`, background:"var(--alert)", minHeight:b.fraud?1:0}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--ink-40)", marginTop:4, fontFamily:"monospace"}}>
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
        <div style={{display:"flex", gap:16, marginTop:10, fontSize:11, color:"var(--ink-60)"}}>
          <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,background:"var(--alert)"}}/>Fraude (n={transactions.filter(t=>t.isFraud).length})</span>
          <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,background:"var(--ink-60)",opacity:0.7}}/>Légitime (n={transactions.filter(t=>!t.isFraud).length})</span>
        </div>
      </div>
    </div>
  );
}

function ModelStats({ historical, transactions }) {
  const { days, confusion, perScenario, roc } = historical;
  const recall = confusion.TP / (confusion.TP + confusion.FN);
  const precision = confusion.TP / (confusion.TP + confusion.FP);
  const fpr = confusion.FP / (confusion.FP + confusion.TN);
  const f1 = 2 * (precision * recall) / (precision + recall);
  const totalSaved = days.reduce((s,d)=>s+d.saved, 0);

  return (
    <div style={{overflowY:"auto", height:"100%", padding:"18px 22px 28px"}}>
      <div style={{marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:10, letterSpacing:0.7, color:"var(--ink-50)", fontWeight:600}}>
            PIPELINE DE DÉTECTION · BASELINE LIGHTGBM + FEATURES TEMPORELLES/GRAPHE
          </div>
          <div style={{fontSize:20, fontWeight:600, marginTop:4}}>Performance du modèle · 30 derniers jours</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="chip" data-active>Prod v2.4.1</button>
          <button className="chip">v2.3.0</button>
          <button className="chip">v2.2.1</button>
        </div>
      </div>

      {/* Top KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:14, marginBottom:18}}>
        <BigStat label="RECALL" value={`${(recall*100).toFixed(1)}%`} delta="+2.3" accent="var(--ok)" sub={`cible > 85% · ${confusion.TP + confusion.FN} fraudes`}/>
        <BigStat label="PRÉCISION" value={`${(precision*100).toFixed(1)}%`} delta="+1.8" accent="var(--accent-teal)" sub={`cible > 70%`}/>
        <BigStat label="F1 SCORE" value={f1.toFixed(3)} delta="+0.04" sub="moyenne harmonique"/>
        <BigStat label="TAUX FP" value={`${(fpr*100).toFixed(2)}%`} delta="-0.4" accent="var(--warn)" sub={`cible < 5%`}/>
        <BigStat label="$ SAUVÉS · 30J" value={`$${(totalSaved/1000).toFixed(0)}k`} delta="+14%" accent="var(--ok)" sub={`${confusion.TP} transactions bloquées`}/>
      </div>

      {/* Middle row: trends */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14, marginBottom:18}}>
        <TrendChart days={days} metric="detected" label="FRAUDES DÉTECTÉES" color="oklch(0.72 0.12 160)" format={v=>v}/>
        <TrendChart days={days} metric="missed" label="FRAUDES MANQUÉES" color="oklch(0.65 0.15 25)" format={v=>v}/>
        <TrendChart days={days} metric="falsePositives" label="FAUX POSITIFS" color="oklch(0.78 0.14 70)" format={v=>v}/>
        <TrendChart days={days} metric="saved" label="$ SAUVÉS / JOUR" color="oklch(0.72 0.10 200)" format={v=>"$"+Math.round(v/1000)+"k"}/>
      </div>

      {/* Confusion + ROC */}
      <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr", gap:14, marginBottom:18}}>
        <ConfusionMatrix c={confusion}/>
        <ROCCurve roc={roc}/>
        <div className="panel-card">
          <div className="panel-card-header">
            <span>LATENCE DE SCORING</span>
            <span className="mono" style={{color:"var(--ok)", fontSize:13, fontWeight:600}}>p95: 142ms</span>
          </div>
          <div style={{padding:"16px 20px 18px"}}>
            <div style={{display:"flex", flexDirection:"column", gap:10, fontSize:12}}>
              {[
                {label:"p50", value:"68ms", pct:34},
                {label:"p90", value:"118ms", pct:59},
                {label:"p95", value:"142ms", pct:71, color:"var(--ok)"},
                {label:"p99", value:"187ms", pct:93, color:"var(--warn)"},
                {label:"cible", value:"200ms", pct:100, color:"var(--ink-40)"}
              ].map(r => (
                <div key={r.label} style={{display:"flex", alignItems:"center", gap:10}}>
                  <span className="mono" style={{width:38, color:"var(--ink-50)"}}>{r.label}</span>
                  <div style={{flex:1, height:6, background:"var(--bg-3)", borderRadius:3}}>
                    <div style={{width:`${r.pct}%`, height:"100%", background: r.color || "var(--accent-teal)", borderRadius:3}}/>
                  </div>
                  <span className="mono" style={{width:60, textAlign:"right", color: r.color || "var(--ink-80)"}}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Distribution + per-scenario */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18}}>
        <ScoreDistribution transactions={transactions.length > 40 ? transactions : seedDistribution()}/>
        <PerScenarioTable perScenario={perScenario}/>
      </div>

      {/* Feature importance */}
      <div className="panel-card" style={{marginBottom:18}}>
        <div className="panel-card-header">
          <span>IMPORTANCE DES FEATURES · GLOBAL (SHAP)</span>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 32px"}}>
            {[
              ["amount_vs_avg_30d", 0.18, "behavioral"],
              ["merchant_category_risk", 0.14, "transaction"],
              ["device_trust_score", 0.13, "device"],
              ["graph_suspicious_degree", 0.11, "graph"],
              ["hour_anomaly", 0.09, "temporal"],
              ["city_mismatch", 0.08, "behavioral"],
              ["velocity_1h", 0.07, "temporal"],
              ["beneficiary_cluster_risk", 0.06, "graph"],
              ["new_merchant_flag", 0.05, "transaction"],
              ["ip_geo_distance", 0.04, "device"]
            ].map(([name, val, family]) => (
              <div key={name} style={{display:"flex", alignItems:"center", gap:10, fontSize:12}}>
                <span className="mono" style={{width:200, color:"var(--ink-80)"}}>{name}</span>
                <span className="chip-static" data-family={family}>{family}</span>
                <div style={{flex:1, height:6, background:"var(--bg-3)", borderRadius:3}}>
                  <div style={{width:`${val*100/0.2}%`, height:"100%", background:"var(--accent-teal)", borderRadius:3}}/>
                </div>
                <span className="mono" style={{width:42, textAlign:"right", color:"var(--ink-70)"}}>{val.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// seed a distribution if the user hasn't generated enough live txns yet
function seedDistribution() {
  const out = [];
  for (let i=0; i<600; i++) {
    const isFraud = Math.random() < 0.04;
    const score = isFraud
      ? Math.min(100, Math.max(0, 70 + (Math.random()-0.5)*40))
      : Math.min(100, Math.max(0, 15 + Math.random()*25 + (Math.random()<0.03? 40:0)));
    out.push({ isFraud, score: Math.round(score) });
  }
  return out;
}

Object.assign(window, { ModelStats });
