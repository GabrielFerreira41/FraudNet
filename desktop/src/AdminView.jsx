// Vue Administrateur — liste des comptes avec risque + panneau de détail
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

const ARCHETYPE_COLOR = {
  famille:      "var(--accent-teal)",
  jeune_actif:  "var(--accent-blue)",
  etudiant:     "#a78bfa",
  retraite:     "var(--warn)",
  entreprise:   "var(--ok)",
};
const ARCHETYPE_LABEL = {
  famille:     "Famille",
  jeune_actif: "Jeune actif",
  etudiant:    "Étudiant",
  retraite:    "Retraité",
  entreprise:  "Entreprise",
};
const RISK_CFG = {
  HIGH:   { label: "Élevé",  bg: "color-mix(in oklch, var(--alert) 14%, var(--bg-2))", color: "var(--alert)", border: "color-mix(in oklch, var(--alert) 40%, transparent)" },
  MEDIUM: { label: "Moyen",  bg: "color-mix(in oklch, var(--warn) 14%, var(--bg-2))",  color: "var(--warn)",  border: "color-mix(in oklch, var(--warn) 40%, transparent)"  },
  LOW:    { label: "Faible", bg: "color-mix(in oklch, var(--ok) 10%, var(--bg-2))",    color: "var(--ok)",    border: "color-mix(in oklch, var(--ok) 30%, transparent)"    },
};
const FRAUD_TYPE_COLOR = {
  test_carte:       "var(--warn)",
  carte_volee:      "var(--alert)",
  structuration:    "#a78bfa",
  prise_de_compte:  "oklch(0.72 0.18 50)",
  reseau_mules:     "oklch(0.50 0.22 15)",
};

function RiskBadge({ level }) {
  const c = RISK_CFG[level] || RISK_CFG.LOW;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
      padding: "2px 8px", borderRadius: 4,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{c.label}</span>
  );
}

function ArchetypeBadge({ archetype }) {
  const color = ARCHETYPE_COLOR[archetype] || "var(--ink-50)";
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
      padding: "2px 8px", borderRadius: 4,
      background: `color-mix(in oklch, ${color} 12%, var(--bg-2))`,
      color, border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
    }}>{ARCHETYPE_LABEL[archetype] || archetype}</span>
  );
}

function ScoreBar({ score }) {
  if (score == null) return <span style={{ color: "var(--ink-30)", fontSize: 11 }}>—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.70 ? "var(--alert)" : score >= 0.40 ? "var(--warn)" : "var(--ok)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 52, height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color }}>{pct}%</span>
    </div>
  );
}

function AccountDetail({ detail, onClose }) {
  if (!detail) return (
    <div style={{ padding: 28, color: "var(--ink-40)", fontSize: 13, textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>◌</div>
      Chargement…
    </div>
  );

  const fraudTx = detail.transactions.filter(t => t.is_fraud);
  const hasVulnerability = detail.est_vulnerable;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-90)" }}>
              {detail.prenom} {detail.nom}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-40)", fontFamily: "var(--mono)", marginTop: 2 }}>
              {detail.account_id.slice(0, 8)}…
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "var(--bg-3)", border: "none", color: "var(--ink-50)",
            width: 24, height: 24, borderRadius: 6, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <ArchetypeBadge archetype={detail.archetype} />
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
            background: "var(--bg-3)", color: "var(--ink-50)" }}>{detail.province} · {detail.ville}</span>
          {hasVulnerability && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
              background: "color-mix(in oklch, var(--warn) 14%, var(--bg-2))", color: "var(--warn)",
              border: "1px solid color-mix(in oklch, var(--warn) 30%, transparent)" }}>Vulnérable</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderBottom: "1px solid var(--line)", background: "var(--line)" }}>
        {[
          { label: "Revenu mensuel", value: `$${detail.revenu_mensuel.toLocaleString("fr-CA")}` },
          { label: "Device principal", value: detail.device_principal || "—" },
          { label: "Fraudes détectées", value: fraudTx.length, color: fraudTx.length > 0 ? "var(--alert)" : "var(--ok)" },
          { label: "Ouverture", value: detail.date_ouverture?.slice(0, 10) || "—" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "10px 16px", background: "var(--bg-1)" }}>
            <div style={{ fontSize: 10, color: "var(--ink-40)", letterSpacing: 0.5, fontWeight: 600 }}>{label.toUpperCase()}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: color || "var(--ink-80)", marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Transactions */}
      <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 10, letterSpacing: 0.7, color: "var(--ink-50)", fontWeight: 600 }}>
          20 DERNIÈRES TRANSACTIONS
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {detail.transactions.map(tx => (
          <div key={tx.transaction_id} style={{
            padding: "8px 20px",
            borderBottom: "1px solid var(--line)",
            background: tx.is_fraud ? "color-mix(in oklch, var(--alert) 5%, var(--bg-1))" : "var(--bg-1)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--ink-80)", fontWeight: 500 }}>{tx.commercant}</span>
                {tx.is_fraud && tx.fraud_type && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                    padding: "1px 5px", borderRadius: 3,
                    background: `color-mix(in oklch, ${FRAUD_TYPE_COLOR[tx.fraud_type] || "var(--alert)"} 15%, var(--bg-2))`,
                    color: FRAUD_TYPE_COLOR[tx.fraud_type] || "var(--alert)",
                  }}>{tx.fraud_type.replace(/_/g, " ").toUpperCase()}</span>
                )}
              </div>
              <span className="mono" style={{
                fontSize: 12, fontWeight: 600,
                color: tx.is_fraud ? "var(--alert)" : "var(--ink-70)",
              }}>${tx.montant.toLocaleString("fr-CA", { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 10, color: "var(--ink-40)" }}>
                {tx.timestamp?.slice(0, 16).replace("T", " ")} · {tx.device}
              </span>
              {tx.score_mars != null && (
                <span className="mono" style={{
                  fontSize: 10,
                  color: tx.score_mars >= 0.70 ? "var(--alert)" : tx.score_mars >= 0.40 ? "var(--warn)" : "var(--ok)",
                }}>
                  {tx.decision} {(tx.score_mars * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminView() {
  const [accounts, setAccounts]           = useStateA([]);
  const [loading, setLoading]             = useStateA(true);
  const [search, setSearch]               = useStateA("");
  const [filterProvince, setFilterProvince] = useStateA("all");
  const [filterArchetype, setFilterArchetype] = useStateA("all");
  const [filterRisk, setFilterRisk]       = useStateA("all");
  const [sortKey, setSortKey]             = useStateA("risk_level");
  const [sortAsc, setSortAsc]             = useStateA(true);
  const [selected, setSelected]           = useStateA(null);
  const [detail, setDetail]               = useStateA(null);

  useEffectA(() => {
    if (window.FraudNetAPI) {
      window.FraudNetAPI.accounts().then(data => {
        if (data) setAccounts(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  useEffectA(() => {
    if (!selected) { setDetail(null); return; }
    setDetail(null);
    window.FraudNetAPI?.accountDetail(selected.account_id).then(d => { if (d) setDetail(d); });
  }, [selected]);

  const filtered = useMemoA(() => {
    let rows = accounts.filter(a => {
      if (filterProvince !== "all" && a.province !== filterProvince) return false;
      if (filterArchetype !== "all" && a.archetype !== filterArchetype) return false;
      if (filterRisk !== "all" && a.risk_level !== filterRisk) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.prenom.toLowerCase().includes(q) ||
          a.nom.toLowerCase().includes(q) ||
          a.account_id.toLowerCase().includes(q)
        );
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "risk_level") {
        va = { HIGH: 0, MEDIUM: 1, LOW: 2 }[a.risk_level];
        vb = { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.risk_level];
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [accounts, search, filterProvince, filterArchetype, filterRisk, sortKey, sortAsc]);

  const stats = useMemoA(() => ({
    total:      accounts.length,
    high:       accounts.filter(a => a.risk_level === "HIGH").length,
    medium:     accounts.filter(a => a.risk_level === "MEDIUM").length,
    vulnerable: accounts.filter(a => a.est_vulnerable).length,
  }), [accounts]);

  const handleSort = key => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };
  const SortIcon = ({ k }) => sortKey === k
    ? <span style={{ marginLeft: 3, opacity: 0.7 }}>{sortAsc ? "↑" : "↓"}</span>
    : <span style={{ marginLeft: 3, opacity: 0.2 }}>↕</span>;

  const selectEl = { background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--ink-70)",
    borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", outline: "none" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-1)" }}>

      {/* Sub-header */}
      <div style={{
        padding: "10px 22px", borderBottom: "1px solid var(--line)",
        background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        {/* Stat pills */}
        <div style={{ display: "flex", gap: 8, marginRight: 8 }}>
          {[
            { label: "comptes", value: stats.total,      color: "var(--ink-60)" },
            { label: "risque élevé", value: stats.high,  color: "var(--alert)"  },
            { label: "risque moyen", value: stats.medium, color: "var(--warn)"  },
            { label: "vulnérables", value: stats.vulnerable, color: "oklch(0.72 0.14 280)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="health-pill" style={{ gap: 5 }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
              <span style={{ color: "var(--ink-40)", fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher nom / ID…"
          style={{
            ...selectEl, flex: "0 0 200px", padding: "5px 12px",
            background: "var(--bg-1)", color: "var(--ink-80)",
          }}
        />

        {/* Filters */}
        <select value={filterProvince} onChange={e => setFilterProvince(e.target.value)} style={selectEl}>
          <option value="all">Toutes les provinces</option>
          {["ON","QC","BC","AB"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterArchetype} onChange={e => setFilterArchetype(e.target.value)} style={selectEl}>
          <option value="all">Tous les archétypes</option>
          {Object.entries(ARCHETYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} style={selectEl}>
          <option value="all">Tous les risques</option>
          <option value="HIGH">Élevé</option>
          <option value="MEDIUM">Moyen</option>
          <option value="LOW">Faible</option>
        </select>

        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-40)" }}>
          {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-40)" }}>
              Chargement des comptes…
            </div>
          ) : (
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("nom")}>
                    Titulaire <SortIcon k="nom" />
                  </th>
                  <th>Archétype</th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("province")}>
                    Province <SortIcon k="province" />
                  </th>
                  <th style={{ textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("n_transactions")}>
                    Transactions <SortIcon k="n_transactions" />
                  </th>
                  <th style={{ textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("n_fraud")}>
                    Fraudes <SortIcon k="n_fraud" />
                  </th>
                  <th>Score max</th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("risk_level")}>
                    Risque <SortIcon k="risk_level" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(acc => (
                  <tr
                    key={acc.account_id}
                    onClick={() => setSelected(acc)}
                    style={{
                      cursor: "pointer",
                      background: selected?.account_id === acc.account_id
                        ? "color-mix(in oklch, var(--accent-blue) 8%, var(--bg-2))"
                        : undefined,
                    }}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: `color-mix(in oklch, ${ARCHETYPE_COLOR[acc.archetype] || "var(--ink-50)"} 20%, var(--bg-3))`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                          color: ARCHETYPE_COLOR[acc.archetype] || "var(--ink-50)",
                          flexShrink: 0,
                        }}>
                          {acc.prenom[0]}{acc.nom[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-80)" }}>
                            {acc.prenom} {acc.nom}
                          </div>
                          <div className="mono" style={{ fontSize: 10, color: "var(--ink-30)" }}>
                            {acc.account_id.slice(0, 8)}…
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><ArchetypeBadge archetype={acc.archetype} /></td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--ink-60)" }}>{acc.province}</span>
                      {acc.est_vulnerable && (
                        <span style={{ marginLeft: 5, fontSize: 9, color: "var(--warn)", fontWeight: 700 }}>●</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="mono" style={{ fontSize: 12 }}>{acc.n_transactions.toLocaleString("fr-CA")}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {acc.n_fraud > 0 ? (
                        <span className="mono" style={{ fontSize: 12, color: "var(--alert)", fontWeight: 700 }}>
                          {acc.n_fraud}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-30)", fontSize: 12 }}>0</span>
                      )}
                    </td>
                    <td><ScoreBar score={acc.max_score} /></td>
                    <td><RiskBadge level={acc.risk_level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            width: 360, borderLeft: "1px solid var(--line)",
            background: "var(--bg-1)", overflowY: "auto", flexShrink: 0,
          }}>
            <AccountDetail detail={detail} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AdminView });
