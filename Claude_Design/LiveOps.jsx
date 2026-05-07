// Live Ops view: accounts list + live transaction feed + detail drawer
const { useState, useEffect, useRef, useMemo } = React;

function Avatar({ initials, profile, size = 36 }) {
  const bgMap = {
    student: "var(--accent-teal)",
    young_pro: "var(--accent-amber)",
    family: "var(--accent-mint)",
    retiree: "var(--accent-lilac)",
    business: "var(--accent-rose)"
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: `color-mix(in oklch, ${bgMap[profile] || "var(--ink-60)"} 24%, var(--bg-2))`,
      color: `color-mix(in oklch, ${bgMap[profile] || "var(--ink-60)"} 90%, white)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 600, fontSize: size * 0.38, letterSpacing: 0.3,
      border: `1px solid color-mix(in oklch, ${bgMap[profile] || "var(--ink-60)"} 35%, transparent)`
    }}>{initials}</div>
  );
}

function StatusDot({ status }) {
  const c = { approved: "var(--ok)", review: "var(--warn)", blocked: "var(--alert)" }[status];
  return <span style={{
    display:"inline-block", width:8, height:8, borderRadius:"50%",
    background:c, boxShadow:`0 0 0 3px color-mix(in oklch, ${c} 20%, transparent)`
  }}/>;
}

function ScoreBar({ score }) {
  const color = score >= 70 ? "var(--alert)" : score >= 45 ? "var(--warn)" : "var(--ok)";
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:110}}>
      <div style={{flex:1, height:4, background:"var(--bg-3)", borderRadius:2, overflow:"hidden"}}>
        <div style={{width:`${score}%`, height:"100%", background:color, transition:"width .4s"}}/>
      </div>
      <span className="mono" style={{fontSize:12, color, fontWeight:600, minWidth:24, textAlign:"right"}}>{score}</span>
    </div>
  );
}

function AccountRow({ account, selected, onClick, pulse }) {
  return (
    <button onClick={onClick} className="account-row" data-selected={selected} data-pulse={pulse}>
      <Avatar initials={account.initials} profile={account.profile} />
      <div style={{flex:1, minWidth:0, textAlign:"left"}}>
        <div style={{display:"flex", justifyContent:"space-between", gap:8, alignItems:"baseline"}}>
          <span style={{fontWeight:500, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{account.name}</span>
          <span className="mono" style={{fontSize:11, color:"var(--ink-40)"}}>{account.id}</span>
        </div>
        <div style={{display:"flex", gap:8, marginTop:3, fontSize:11, color:"var(--ink-50)", alignItems:"center"}}>
          <span>{account.profileLabel}</span>
          <span style={{opacity:0.4}}>·</span>
          <span>{account.city}</span>
          <span style={{opacity:0.4}}>·</span>
          <span className="mono">${account.balance.toLocaleString("fr-CA")}</span>
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3}}>
        <ScoreBar score={account.riskScore}/>
        {account.blockedCount > 0 && (
          <span style={{fontSize:10, color:"var(--alert)", fontWeight:600, letterSpacing:0.4}}>
            {account.blockedCount} BLOQUÉ{account.blockedCount>1?"S":""}
          </span>
        )}
      </div>
    </button>
  );
}

function TransactionCard({ txn, onClick, isNew }) {
  const statusLabel = { approved: "APPROUVÉ", review: "À EXAMINER", blocked: "BLOQUÉ" }[txn.action];
  const icon = {
    groceries:"🛒", coffee:"☕", gas:"⛽", online:"🌐", restaurants:"🍽️",
    transit:"🚇", utilities:"💡", transfers:"↗", suspicious:"⚠"
  }[txn.category] || "•";
  return (
    <div className={`txn-card ${isNew?"txn-card-new":""}`} data-action={txn.action} onClick={onClick}>
      <div style={{display:"flex", alignItems:"center", gap:12, padding:"10px 14px"}}>
        <div style={{
          width:34, height:34, borderRadius:8, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:16,
          background:"var(--bg-3)", border:"1px solid var(--line)"
        }}>{icon}</div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10}}>
            <span style={{fontWeight:500, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
              {txn.merchant}
            </span>
            <span className="mono" style={{fontSize:14, fontWeight:600, color: txn.action==="blocked"?"var(--alert)":"var(--ink-90)"}}>
              {txn.action==="blocked" && <span style={{opacity:0.5, marginRight:3}}>⊘</span>}
              ${txn.amount.toLocaleString("fr-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}
            </span>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", marginTop:3, fontSize:11, color:"var(--ink-50)", gap:10}}>
            <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
              <span className="mono">{txn.account}</span>
              <span style={{opacity:0.5, margin:"0 6px"}}>·</span>
              <span>{txn.city}</span>
            </span>
            <span style={{display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap"}}>
              <StatusDot status={txn.action}/>
              <span style={{
                fontSize:10, fontWeight:600, letterSpacing:0.5,
                color: txn.action==="blocked" ? "var(--alert)" : txn.action==="review" ? "var(--warn)" : "var(--ok)"
              }}>{statusLabel}</span>
              <span className="mono" style={{color:"var(--ink-40)", minWidth:28, textAlign:"right"}}>{txn.score}</span>
            </span>
          </div>
        </div>
      </div>
      {txn.action !== "approved" && txn.riskFactors.length > 0 && (
        <div style={{
          padding:"6px 14px 10px", display:"flex", flexWrap:"wrap", gap:5,
          borderTop:"1px dashed var(--line)"
        }}>
          {txn.riskFactors.slice(0,3).map((rf,i)=>(
            <span key={i} style={{
              fontSize:10, padding:"2px 7px", borderRadius:3,
              background:"color-mix(in oklch, var(--alert) 12%, transparent)",
              color:"var(--alert)", fontWeight:500
            }}>{rf}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, height=32, color="var(--accent-teal)" }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 120, step = w / Math.max(1, data.length - 1);
  const pts = data.map((v,i) => `${i*step},${height - (v/max)*height}`).join(" ");
  return (
    <svg width={w} height={height} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      <polyline points={`0,${height} ${pts} ${w},${height}`} fill={`color-mix(in oklch, ${color} 15%, transparent)`} stroke="none"/>
    </svg>
  );
}

function AccountDetail({ account, recentTxns, onClose }) {
  if (!account) return null;
  const accountTxns = recentTxns.filter(t => t.accountId === account.id).slice(0, 40);
  const blocked = accountTxns.filter(t => t.action === "blocked");
  const riskTrend = useMemo(() => {
    // fake trend
    const arr = [];
    let v = account.riskScore;
    for (let i=0;i<24;i++) { v = Math.max(0, Math.min(100, v + (Math.random()-0.5)*6)); arr.push(Math.round(v)); }
    return arr;
  }, [account.id]);

  return (
    <div className="drawer">
      <div style={{padding:"18px 20px 16px", borderBottom:"1px solid var(--line)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
          <div style={{display:"flex", gap:14}}>
            <Avatar initials={account.initials} profile={account.profile} size={48}/>
            <div>
              <div style={{fontSize:18, fontWeight:600}}>{account.name}</div>
              <div className="mono" style={{fontSize:12, color:"var(--ink-40)", marginTop:2}}>{account.id}</div>
              <div style={{display:"flex", gap:10, marginTop:6, fontSize:12, color:"var(--ink-60)"}}>
                <span>{account.profileIcon} {account.profileLabel}</span>
                <span>📍 {account.city}</span>
                <span>Ouvert {account.openedDate}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginTop:16}}>
          <div className="stat-card">
            <div className="stat-label">Solde</div>
            <div className="stat-value mono">${account.balance.toLocaleString("fr-CA")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Txn / 7j</div>
            <div className="stat-value mono">{account.txnCount7d}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Score risque</div>
            <div className="stat-value mono" style={{color: account.riskScore>=45?"var(--warn)":"var(--ok)"}}>{account.riskScore}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Bloqués</div>
            <div className="stat-value mono" style={{color: account.blockedCount>0?"var(--alert)":"var(--ink-60)"}}>{account.blockedCount}</div>
          </div>
        </div>
      </div>

      <div style={{padding:"16px 20px", borderBottom:"1px solid var(--line)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8}}>
          <div style={{fontSize:11, letterSpacing:0.6, color:"var(--ink-50)", fontWeight:600}}>SCORE DE RISQUE · 24H</div>
          <span className="mono" style={{fontSize:11, color:"var(--ink-40)"}}>now: {account.riskScore}</span>
        </div>
        <Sparkline data={riskTrend} height={44} color={account.riskScore>=45?"var(--warn)":"var(--accent-teal)"}/>
      </div>

      <div style={{padding:"14px 20px 10px"}}>
        <div style={{fontSize:11, letterSpacing:0.6, color:"var(--ink-50)", fontWeight:600, marginBottom:10}}>
          TRANSACTIONS RÉCENTES · {accountTxns.length}
        </div>
      </div>
      <div style={{padding:"0 14px 20px", display:"flex", flexDirection:"column", gap:6, overflowY:"auto", flex:1}}>
        {accountTxns.length === 0 && (
          <div style={{padding:30, textAlign:"center", color:"var(--ink-40)", fontSize:12}}>
            Aucune transaction encore — attendez le prochain tick…
          </div>
        )}
        {accountTxns.map(t => <TransactionCard key={t.id} txn={t}/>)}
      </div>
    </div>
  );
}

function TransactionDetail({ txn, account, onClose }) {
  if (!txn) return null;
  const scenarioLabel = txn.fraudType ? window.FraudNet.FRAUD_SCENARIOS.find(s=>s.key===txn.fraudType)?.label : null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{padding:"18px 22px", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:11, letterSpacing:0.6, color:"var(--ink-50)", fontWeight:600}}>TRANSACTION</div>
            <div className="mono" style={{fontSize:16, marginTop:4}}>{txn.id}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{padding:"20px 22px"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
            <div>
              <div style={{fontSize:22, fontWeight:600}}>{txn.merchant}</div>
              <div style={{fontSize:13, color:"var(--ink-60)", marginTop:3}}>{account?.name} · {txn.city}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="mono" style={{fontSize:26, fontWeight:600, color: txn.action==="blocked"?"var(--alert)":"var(--ink-90)"}}>
                ${txn.amount.toLocaleString("fr-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
              <div style={{display:"inline-flex", alignItems:"center", gap:6, marginTop:4, fontSize:11, fontWeight:600, letterSpacing:0.5,
                color: txn.action==="blocked" ? "var(--alert)" : txn.action==="review" ? "var(--warn)" : "var(--ok)"}}>
                <StatusDot status={txn.action}/>
                {{approved:"APPROUVÉ", review:"À EXAMINER", blocked:"BLOQUÉ"}[txn.action]}
              </div>
            </div>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
            <div>
              <div className="detail-label">Score du modèle</div>
              <ScoreBar score={txn.score}/>
            </div>
            <div>
              <div className="detail-label">Scénario détecté</div>
              <div style={{fontSize:13}}>{scenarioLabel || <span style={{color:"var(--ink-40)"}}>—</span>}</div>
            </div>
            <div>
              <div className="detail-label">Horodatage</div>
              <div className="mono" style={{fontSize:12}}>{new Date(txn.timestamp).toLocaleString("fr-CA")}</div>
            </div>
            <div>
              <div className="detail-label">Device</div>
              <div className="mono" style={{fontSize:12, color: txn.device.includes("unknown")||txn.device.includes("new")?"var(--alert)":"var(--ink-80)"}}>
                {txn.device}
              </div>
            </div>
          </div>

          {txn.riskFactors.length > 0 && (
            <div style={{marginTop:20}}>
              <div className="detail-label">Facteurs de risque</div>
              <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                {txn.riskFactors.map((rf,i)=>(
                  <span key={i} style={{
                    fontSize:12, padding:"5px 10px", borderRadius:4,
                    background:"color-mix(in oklch, var(--alert) 12%, transparent)",
                    color:"var(--alert)", fontWeight:500,
                    border:"1px solid color-mix(in oklch, var(--alert) 25%, transparent)"
                  }}>{rf}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{marginTop:22, padding:14, background:"var(--bg-2)", borderRadius:6, border:"1px solid var(--line)"}}>
            <div className="detail-label">Explication modèle (SHAP-like)</div>
            <div style={{display:"flex", flexDirection:"column", gap:4, marginTop:6}}>
              {(txn.riskFactors.length ? txn.riskFactors : ["Montant normal","Commerçant habituel","Device connu"]).slice(0,4).map((f,i)=>{
                const contrib = txn.action==="approved" ? -(5+Math.random()*15) : (6+Math.random()*22);
                return (
                  <div key={i} style={{display:"flex", alignItems:"center", gap:10, fontSize:12}}>
                    <span style={{flex:1}}>{f}</span>
                    <div style={{flex:1, display:"flex", justifyContent:"center", position:"relative", height:14}}>
                      <div style={{position:"absolute", left:"50%", top:0, bottom:0, width:1, background:"var(--line)"}}/>
                      <div style={{
                        position:"absolute", left: contrib>0 ? "50%" : `calc(50% + ${contrib/0.4}%)`,
                        top:3, height:8, width: Math.abs(contrib/0.4)+"%",
                        background: contrib>0 ? "var(--alert)" : "var(--ok)",
                        borderRadius:2
                      }}/>
                    </div>
                    <span className="mono" style={{width:44, textAlign:"right", fontSize:11, color: contrib>0?"var(--alert)":"var(--ok)"}}>
                      {contrib>0?"+":""}{contrib.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveOps({ accounts, setAccounts, transactions, setTransactions, paused, setPaused, speed, setSpeed }) {
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [filter, setFilter] = useState("all"); // all | blocked | review | approved
  const [profileFilter, setProfileFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pulseAccount, setPulseAccount] = useState(null);
  const feedRef = useRef(null);

  // Live ticker
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      const account = accounts[Math.floor(Math.random() * accounts.length)];
      const txn = window.FraudNet.generateTransaction(account, Date.now());
      const score = window.FraudNet.scoreTransaction(txn, account);
      const action = window.FraudNet.decideAction(score);
      const enriched = { ...txn, score, action };

      setTransactions(prev => [enriched, ...prev].slice(0, 200));

      // update account state
      setAccounts(prev => prev.map(a => {
        if (a.id !== account.id) {
          // gently decay
          return { ...a, riskScore: Math.max(0, Math.round(a.riskScore - 0.2)) };
        }
        const newRisk = Math.max(0, Math.min(100, a.riskScore * 0.85 + score * 0.35));
        return {
          ...a,
          riskScore: Math.round(newRisk),
          blockedCount: a.blockedCount + (action==="blocked" ? 1 : 0),
          savedAmount: a.savedAmount + (action==="blocked" ? txn.amount : 0),
          flagged: action !== "approved"
        };
      }));

      if (action !== "approved") {
        setPulseAccount(account.id);
        setTimeout(()=>setPulseAccount(null), 900);
      }
    }, Math.max(200, 1800 / speed));
    return () => clearInterval(interval);
  }, [paused, speed, accounts]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  const filteredAccounts = accounts
    .filter(a => profileFilter === "all" || a.profile === profileFilter)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.riskScore - a.riskScore);

  const filteredTxns = transactions.filter(t => filter === "all" || t.action === filter);

  // live stats strip
  const stats = useMemo(() => {
    const last100 = transactions.slice(0, 100);
    return {
      total: transactions.length,
      blocked: transactions.filter(t=>t.action==="blocked").length,
      review: transactions.filter(t=>t.action==="review").length,
      saved: transactions.filter(t=>t.action==="blocked").reduce((s,t)=>s+t.amount, 0),
      rate: last100.length ? Math.round(last100.filter(t=>t.action==="blocked").length / last100.length * 1000)/10 : 0
    };
  }, [transactions]);

  return (
    <div style={{display:"grid", gridTemplateColumns: selectedAccount ? "340px 1fr 380px" : "340px 1fr", height:"100%", minHeight:0}}>
      {/* Accounts panel */}
      <div className="panel" style={{borderRight:"1px solid var(--line)", display:"flex", flexDirection:"column", minHeight:0}}>
        <div style={{padding:"14px 14px 10px", borderBottom:"1px solid var(--line)"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10}}>
            <div style={{fontSize:11, letterSpacing:0.6, color:"var(--ink-50)", fontWeight:600}}>
              COMPTES · {filteredAccounts.length}
            </div>
            <span className="mono" style={{fontSize:10, color:"var(--ink-40)"}}>tri: risque ↓</span>
          </div>
          <input className="input" placeholder="rechercher compte ou ID…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div style={{display:"flex", gap:4, marginTop:8, flexWrap:"wrap"}}>
            <button className="chip" data-active={profileFilter==="all"} onClick={()=>setProfileFilter("all")}>Tous</button>
            {window.FraudNet.PROFILE_TYPES.map(p => (
              <button key={p.key} className="chip" data-active={profileFilter===p.key} onClick={()=>setProfileFilter(p.key)}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{flex:1, overflowY:"auto", padding:"6px 8px"}}>
          {filteredAccounts.map(a => (
            <AccountRow
              key={a.id}
              account={a}
              selected={a.id === selectedAccountId}
              pulse={a.id === pulseAccount}
              onClick={() => setSelectedAccountId(a.id === selectedAccountId ? null : a.id)}
            />
          ))}
        </div>
      </div>

      {/* Feed panel */}
      <div className="panel" style={{display:"flex", flexDirection:"column", minHeight:0}}>
        <div style={{padding:"12px 18px", borderBottom:"1px solid var(--line)"}}>
          <div style={{display:"flex", gap:14, alignItems:"center"}}>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <span className={`pulse-dot ${paused?"paused":""}`}/>
              <span style={{fontSize:11, letterSpacing:0.6, color: paused?"var(--ink-40)":"var(--ok)", fontWeight:600}}>
                {paused ? "PAUSED" : "LIVE"}
              </span>
            </div>
            <button className="chip" onClick={()=>setPaused(p=>!p)}>{paused?"▶ Reprendre":"❚❚ Pause"}</button>
            <div style={{display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--ink-50)"}}>
              Vitesse
              <input type="range" min="0.3" max="4" step="0.1" value={speed} onChange={e=>setSpeed(parseFloat(e.target.value))} style={{width:100}}/>
              <span className="mono" style={{minWidth:32}}>{speed.toFixed(1)}x</span>
            </div>
            <div style={{flex:1}}/>
            <div style={{display:"flex", gap:4}}>
              {[["all","Tous"],["blocked","Bloqués"],["review","À examiner"],["approved","Approuvés"]].map(([k,l]) => (
                <button key={k} className="chip" data-active={filter===k} onClick={()=>setFilter(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10, marginTop:14}}>
            <div className="stat-card"><div className="stat-label">Transactions</div><div className="stat-value mono">{stats.total}</div></div>
            <div className="stat-card"><div className="stat-label">Bloquées</div><div className="stat-value mono" style={{color:"var(--alert)"}}>{stats.blocked}</div></div>
            <div className="stat-card"><div className="stat-label">À examiner</div><div className="stat-value mono" style={{color:"var(--warn)"}}>{stats.review}</div></div>
            <div className="stat-card"><div className="stat-label">Taux de blocage</div><div className="stat-value mono">{stats.rate}%</div></div>
            <div className="stat-card"><div className="stat-label">$ Sauvés</div><div className="stat-value mono" style={{color:"var(--ok)"}}>${Math.round(stats.saved).toLocaleString("fr-CA")}</div></div>
          </div>
        </div>
        <div ref={feedRef} style={{flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:6}}>
          {filteredTxns.length === 0 && (
            <div style={{padding:40, textAlign:"center", color:"var(--ink-40)", fontSize:12}}>
              Flux en attente… {paused ? "Reprenez la lecture pour voir les transactions arriver." : ""}
            </div>
          )}
          {filteredTxns.map((t,i) => (
            <TransactionCard key={t.id} txn={t} isNew={i===0} onClick={()=>setSelectedTxn(t)}/>
          ))}
        </div>
      </div>

      {/* Detail drawer */}
      {selectedAccount && (
        <AccountDetail account={selectedAccount} recentTxns={transactions} onClose={()=>setSelectedAccountId(null)}/>
      )}

      {selectedTxn && (
        <TransactionDetail
          txn={selectedTxn}
          account={accounts.find(a=>a.id===selectedTxn.accountId)}
          onClose={()=>setSelectedTxn(null)}
        />
      )}
    </div>
  );
}

Object.assign(window, { LiveOps });
