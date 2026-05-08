"""
FraudNet — Dashboard administrateur
Lancement : streamlit run dashboard/admin.py
"""

import subprocess
import sys
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

ROOT = Path(__file__).parent.parent
DATA = ROOT / "data" / "generated"
ACCOUNTS_PATH     = DATA / "accounts.parquet"
TRANSACTIONS_PATH = DATA / "transactions_labeled.parquet"
FEATURES_PATH     = DATA / "features.parquet"

# ---------------------------------------------------------------------------
# Config page
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="FraudNet Admin",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

st.markdown("""
<style>
    [data-testid="stMetricValue"] { font-size: 2rem; font-weight: 700; }
    [data-testid="stMetricLabel"] { font-size: 0.85rem; color: #888; }
    .block-container { padding-top: 1.5rem; }
    section[data-testid="stSidebar"] { background-color: #0f1117; }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@st.cache_data(show_spinner=False)
def load_accounts():
    if not ACCOUNTS_PATH.exists():
        return pd.DataFrame()
    df = pd.read_parquet(ACCOUNTS_PATH)
    df["date_ouverture"] = pd.to_datetime(df["date_ouverture"])
    return df

@st.cache_data(show_spinner=False)
def load_transactions():
    if not TRANSACTIONS_PATH.exists():
        return pd.DataFrame()
    df = pd.read_parquet(TRANSACTIONS_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df

@st.cache_data(show_spinner=False)
def load_features():
    if not FEATURES_PATH.exists():
        return pd.DataFrame()
    df = pd.read_parquet(FEATURES_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df

def run_script(cmd: list[str]) -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, "-m"] + cmd,
        capture_output=True, text=True, cwd=str(ROOT)
    )
    return result.returncode == 0, result.stdout + result.stderr

def clear_cache():
    st.cache_data.clear()

ARCHETYPE_COLORS = {
    "etudiant":    "#636EFA",
    "jeune_actif": "#EF553B",
    "famille":     "#00CC96",
    "retraite":    "#AB63FA",
    "entreprise":  "#FFA15A",
}

# ---------------------------------------------------------------------------
# Sidebar navigation
# ---------------------------------------------------------------------------

with st.sidebar:
    st.markdown("## 🛡️ FraudNet")
    st.markdown("---")
    page = st.radio(
        "Navigation",
        ["🏠 Vue d'ensemble", "⚙️ Génération", "👥 Comptes", "💳 Transactions", "🔬 Features"],
        label_visibility="collapsed",
    )
    st.markdown("---")

    acc = load_accounts()
    tx  = load_transactions()

    if not acc.empty and not tx.empty:
        st.caption(f"**Comptes :** {len(acc):,}")
        st.caption(f"**Transactions :** {len(tx):,}")
        st.caption(f"**Fraudes :** {tx['is_fraud'].sum():,}")
        st.caption(f"**Période :** {tx['timestamp'].min().date()} → {tx['timestamp'].max().date()}")
    else:
        st.warning("Aucune donnée — lance la génération.")


# ===========================================================================
# PAGE 1 — Vue d'ensemble
# ===========================================================================

if page == "🏠 Vue d'ensemble":
    st.title("🛡️ FraudNet — Vue d'ensemble")

    acc = load_accounts()
    tx  = load_transactions()

    if acc.empty or tx.empty:
        st.warning("Aucune donnée trouvée. Va dans ⚙️ Génération pour créer les données.")
        st.stop()

    fraud = tx[tx["is_fraud"]]

    # KPIs
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Comptes", f"{len(acc):,}")
    c2.metric("Transactions", f"{len(tx):,}")
    c3.metric("Fraudes", f"{len(fraud):,}")
    c4.metric("Taux de fraude", f"{len(fraud)/len(tx)*100:.3f}%")
    c5.metric("Montant total", f"{tx['montant'].sum():,.0f} $")

    st.markdown("---")

    col1, col2 = st.columns(2)

    with col1:
        # Répartition archétypes
        arch_counts = acc["archetype"].value_counts().reset_index()
        arch_counts.columns = ["archetype", "count"]
        fig = px.pie(
            arch_counts, values="count", names="archetype",
            title="Répartition des archétypes",
            color="archetype", color_discrete_map=ARCHETYPE_COLORS,
            hole=0.4,
        )
        fig.update_traces(textinfo="percent+label")
        fig.update_layout(showlegend=False, margin=dict(t=40, b=0))
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        # Fraudes par scénario
        fraud_types = fraud["fraud_type"].value_counts().reset_index()
        fraud_types.columns = ["scenario", "count"]
        fig = px.bar(
            fraud_types, x="count", y="scenario", orientation="h",
            title="Fraudes par scénario",
            color="count", color_continuous_scale="Reds",
            text="count",
        )
        fig.update_traces(textposition="outside")
        fig.update_layout(coloraxis_showscale=False, margin=dict(t=40, b=0), yaxis_title="")
        st.plotly_chart(fig, use_container_width=True)

    # Volume quotidien
    daily = tx.groupby(tx["timestamp"].dt.date).agg(
        n=("transaction_id", "count"),
        fraudes=("is_fraud", "sum"),
        montant=("montant", "sum"),
    ).reset_index()
    daily["date"] = pd.to_datetime(daily["timestamp"])

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=daily["date"], y=daily["n"],
        fill="tozeroy", name="Total",
        line=dict(color="#636EFA", width=1.5),
        fillcolor="rgba(99,110,250,0.15)",
    ))
    fig.add_trace(go.Bar(
        x=daily["date"], y=daily["fraudes"],
        name="Fraudes", marker_color="#EF553B", opacity=0.8,
    ))
    fig.update_layout(
        title="Volume quotidien de transactions",
        xaxis_title="", yaxis_title="Transactions",
        legend=dict(orientation="h", y=1.1),
        margin=dict(t=50, b=0),
    )
    st.plotly_chart(fig, use_container_width=True)

    # Montants par archétype
    fig = px.box(
        tx[tx["archetype"] != "entreprise"], x="archetype", y="montant",
        color="archetype", color_discrete_map=ARCHETYPE_COLORS,
        title="Distribution des montants par archétype (hors entreprise)",
        points=False,
    )
    fig.update_layout(showlegend=False, xaxis_title="", margin=dict(t=50, b=0))
    st.plotly_chart(fig, use_container_width=True)


# ===========================================================================
# PAGE 2 — Génération
# ===========================================================================

elif page == "⚙️ Génération":
    st.title("⚙️ Génération des données")
    st.markdown("Configure les paramètres et lance chaque étape du pipeline.")

    st.markdown("### 1. Profils clients")
    with st.form("form_accounts"):
        c1, c2 = st.columns(2)
        n_accounts = c1.number_input("Nombre de comptes", min_value=100, max_value=50000, value=1000, step=100)
        seed_acc   = c2.number_input("Seed", min_value=0, value=42)
        submitted  = st.form_submit_button("🚀 Générer les comptes", type="primary")

    if submitted:
        with st.spinner("Génération des comptes..."):
            ok, log = run_script(["src.simulator.profile_generator", "--n", str(n_accounts), "--seed", str(seed_acc)])
        if ok:
            clear_cache()
            st.success(f"✓ {n_accounts:,} comptes générés.")
        else:
            st.error("Erreur lors de la génération.")
        with st.expander("Log"):
            st.code(log)

    st.markdown("### 2. Transactions légitimes")
    with st.form("form_transactions"):
        c1, c2 = st.columns(2)
        weeks    = c1.number_input("Semaines simulées", min_value=1, max_value=52, value=13)
        seed_tx  = c2.number_input("Seed", min_value=0, value=42, key="seed_tx")
        submitted2 = st.form_submit_button("🚀 Générer les transactions", type="primary")

    if submitted2:
        if not ACCOUNTS_PATH.exists():
            st.error("Génère d'abord les comptes (étape 1).")
        else:
            with st.spinner("Génération des transactions (peut prendre 1–2 min)..."):
                ok, log = run_script(["src.simulator.transaction_engine", "--weeks", str(weeks), "--seed", str(seed_tx)])
            if ok:
                clear_cache()
                st.success("✓ Transactions générées.")
            else:
                st.error("Erreur lors de la génération.")
            with st.expander("Log"):
                st.code(log)

    st.markdown("### 3. Injection de fraude")
    with st.form("form_fraud"):
        c1, c2 = st.columns(2)
        rate       = c1.slider("Taux de fraude (%)", min_value=1, max_value=10, value=3) / 100
        seed_fraud = c2.number_input("Seed", min_value=0, value=42, key="seed_fraud")
        submitted3 = st.form_submit_button("🚀 Injecter la fraude", type="primary")

    if submitted3:
        if not (DATA / "transactions.parquet").exists():
            st.error("Génère d'abord les transactions (étape 2).")
        else:
            with st.spinner("Injection des scénarios de fraude..."):
                ok, log = run_script(["src.simulator.fraud_injector", "--rate", str(rate), "--seed", str(seed_fraud)])
            if ok:
                clear_cache()
                st.success("✓ Fraudes injectées.")
            else:
                st.error("Erreur lors de l'injection.")
            with st.expander("Log"):
                st.code(log)

    st.markdown("### 4. Feature engineering")
    if st.button("🚀 Calculer les features", type="primary"):
        if not TRANSACTIONS_PATH.exists():
            st.error("Génère d'abord les transactions avec fraude (étape 3).")
        else:
            with st.spinner("Calcul des features (peut prendre 1–2 min)..."):
                ok, log = run_script(["src.features.feature_pipeline"])
            if ok:
                clear_cache()
                st.success("✓ Features calculées.")
            else:
                st.error("Erreur lors du calcul des features.")
            with st.expander("Log"):
                st.code(log)

    # Statut des fichiers
    st.markdown("---")
    st.markdown("### État des fichiers")
    files = {
        "accounts.parquet":              ACCOUNTS_PATH,
        "transactions_labeled.parquet":  TRANSACTIONS_PATH,
        "features.parquet":              FEATURES_PATH,
    }
    for name, path in files.items():
        if path.exists():
            size = path.stat().st_size / 1024 / 1024
            st.success(f"✓ `{name}` — {size:.1f} MB")
        else:
            st.error(f"✗ `{name}` — non généré")


# ===========================================================================
# PAGE 3 — Comptes
# ===========================================================================

elif page == "👥 Comptes":
    st.title("👥 Comptes clients")

    acc = load_accounts()
    if acc.empty:
        st.warning("Aucune donnée. Lance la génération.")
        st.stop()

    # Filtres
    with st.expander("Filtres", expanded=True):
        c1, c2, c3 = st.columns(3)
        archetypes = c1.multiselect("Archétypes", acc["archetype"].unique(), default=list(acc["archetype"].unique()))
        villes     = c2.multiselect("Villes", sorted(acc["ville"].unique()), default=list(acc["ville"].unique()))
        vuln_only  = c3.checkbox("Comptes vulnérables uniquement")

    mask = acc["archetype"].isin(archetypes) & acc["ville"].isin(villes)
    if vuln_only:
        mask &= acc["est_vulnerabilite"]
    filtered = acc[mask]

    st.markdown(f"**{len(filtered):,} comptes** affichés sur {len(acc):,}")

    if filtered.empty:
        st.info("Aucun compte ne correspond aux filtres sélectionnés.")
        st.stop()

    col1, col2 = st.columns(2)

    with col1:
        fig = px.histogram(
            filtered, x="revenu_mensuel", color="archetype",
            color_discrete_map=ARCHETYPE_COLORS,
            title="Distribution des revenus mensuels",
            nbins=40, barmode="overlay", opacity=0.7,
        )
        fig.update_layout(xaxis_title="Revenu (CAD)", yaxis_title="", margin=dict(t=40,b=0))
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        fig = px.scatter(
            filtered, x="frequence_hebdo", y="montant_moyen_transaction",
            color="archetype", color_discrete_map=ARCHETYPE_COLORS,
            title="Fréquence hebdo vs Montant moyen",
            opacity=0.6, size_max=6,
        )
        fig.update_layout(xaxis_title="Transactions / semaine", yaxis_title="Montant moyen (CAD)", margin=dict(t=40,b=0))
        st.plotly_chart(fig, use_container_width=True)

    # Heatmap archétype × ville
    heat = filtered.groupby(["archetype", "ville"]).size().unstack(fill_value=0)
    fig = px.imshow(
        heat, text_auto=True, aspect="auto",
        color_continuous_scale="Blues",
        title="Répartition Archétype × Ville",
    )
    fig.update_layout(margin=dict(t=40, b=0))
    st.plotly_chart(fig, use_container_width=True)

    # Tableau
    st.markdown("### Données brutes")
    display_cols = ["account_id", "archetype", "prenom", "nom", "ville", "province",
                    "revenu_mensuel", "montant_moyen_transaction", "frequence_hebdo",
                    "device_principal", "est_vulnerabilite", "date_ouverture"]
    st.dataframe(
        filtered[display_cols].sort_values("revenu_mensuel", ascending=False),
        use_container_width=True, height=400,
    )


# ===========================================================================
# PAGE 4 — Transactions
# ===========================================================================

elif page == "💳 Transactions":
    st.title("💳 Transactions")

    tx = load_transactions()
    if tx.empty:
        st.warning("Aucune donnée. Lance la génération.")
        st.stop()

    # Filtres
    with st.expander("Filtres", expanded=True):
        c1, c2, c3, c4 = st.columns(4)
        archetypes  = c1.multiselect("Archétypes", tx["archetype"].unique(), default=list(tx["archetype"].unique()))
        fraud_filter = c2.selectbox("Type", ["Toutes", "Fraudes uniquement", "Légitimes uniquement"])
        scenarios   = tx["fraud_type"].dropna().unique().tolist()
        scen_filter = c3.multiselect("Scénario fraude", scenarios, default=scenarios)
        top_n       = c4.slider("Afficher N dernières", 100, 5000, 1000, step=100)

    mask = tx["archetype"].isin(archetypes)
    if fraud_filter == "Fraudes uniquement":
        mask &= tx["is_fraud"]
    elif fraud_filter == "Légitimes uniquement":
        mask &= ~tx["is_fraud"]
    if scen_filter and fraud_filter != "Légitimes uniquement":
        fraud_mask = tx["fraud_type"].isin(scen_filter) | ~tx["is_fraud"]
        mask &= fraud_mask

    filtered = tx[mask].tail(top_n)
    st.markdown(f"**{len(filtered):,} transactions** affichées")

    if filtered.empty:
        st.info("Aucune transaction ne correspond aux filtres sélectionnés.")
        st.stop()

    col1, col2 = st.columns(2)

    with col1:
        # Volume horaire
        hourly = filtered.groupby("heure").size().reset_index(name="count")
        fig = px.bar(hourly, x="heure", y="count", title="Volume par heure",
                     color="count", color_continuous_scale="Blues")
        fig.update_layout(coloraxis_showscale=False, xaxis_title="Heure", margin=dict(t=40,b=0))
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        # Top commerçants
        top_comm = filtered["commercant"].value_counts().head(12).reset_index()
        top_comm.columns = ["commercant", "count"]
        fig = px.bar(top_comm, x="count", y="commercant", orientation="h",
                     title="Top commerçants", color="count", color_continuous_scale="Teal")
        fig.update_layout(coloraxis_showscale=False, yaxis_title="", margin=dict(t=40,b=0))
        st.plotly_chart(fig, use_container_width=True)

    # Timeline des fraudes
    fraud_filtered = filtered[filtered["is_fraud"]]
    fraud_daily = (
        fraud_filtered
        .groupby([fraud_filtered["timestamp"].dt.date, "fraud_type"])
        .size().reset_index(name="count")
    )
    if not fraud_daily.empty:
        fraud_daily["timestamp"] = pd.to_datetime(fraud_daily["timestamp"])
        fig = px.bar(
            fraud_daily, x="timestamp", y="count", color="fraud_type",
            title="Timeline des fraudes par scénario",
            barmode="stack",
        )
        fig.update_layout(xaxis_title="", yaxis_title="Fraudes", margin=dict(t=40, b=0))
        st.plotly_chart(fig, use_container_width=True)

    # Tableau
    st.markdown("### Données brutes")
    display_cols = ["timestamp", "account_id", "archetype", "montant", "commercant",
                    "categorie", "device", "ville_tx", "heure", "is_fraud", "fraud_type"]
    styled = filtered[display_cols].sort_values("timestamp", ascending=False)
    st.dataframe(styled, use_container_width=True, height=400)


# ===========================================================================
# PAGE 5 — Features
# ===========================================================================

elif page == "🔬 Features":
    st.title("🔬 Features engineered")

    feat = load_features()
    if feat.empty:
        st.warning("Aucune feature. Lance le feature pipeline.")
        st.stop()

    fraud = feat[feat["is_fraud"]]
    legit = feat[~feat["is_fraud"]]

    st.markdown(f"**{len(feat):,} transactions** — {len(fraud)} fraudes / {len(legit):,} légitimes")

    # Plotly color_discrete_map nécessite des clés string
    feat = feat.copy()
    feat["is_fraud"] = feat["is_fraud"].astype(str)

    feature_groups = {
        "Transactionnelles": ["ratio_montant", "montant_anormal", "nouveau_commercant",
                               "nouveau_device", "heure_inhabituelle", "score_anomalie_tx"],
        "Temporelles":       ["velocite_1h", "velocite_24h", "montant_cumul_1h",
                               "ecart_montant_30tx", "delta_min_prev_tx", "est_rafale"],
        "Graphe":            ["n_comptes_par_device", "n_comptes_par_commercant",
                               "degre_compte", "device_partage_suspect"],
    }

    tab1, tab2, tab3 = st.tabs(["Transactionnelles", "Temporelles", "Graphe"])

    for tab, (group_name, cols) in zip([tab1, tab2, tab3], feature_groups.items()):
        with tab:
            available = [c for c in cols if c in feat.columns]
            selected  = st.selectbox(f"Feature à analyser", available, key=group_name)

            col1, col2 = st.columns(2)

            with col1:
                fig = px.histogram(
                    feat, x=selected, color="is_fraud",
                    color_discrete_map={"True": "#EF553B", "False": "#636EFA"},
                    barmode="overlay", opacity=0.7, nbins=50,
                    title=f"Distribution — {selected}",
                    labels={"is_fraud": "Fraude"},
                )
                fig.update_layout(margin=dict(t=40, b=0))
                st.plotly_chart(fig, use_container_width=True)

            with col2:
                stats = feat.groupby("is_fraud")[selected].describe().T.round(3)
                stats.rename(columns={"False": "Légitime", "True": "Fraude"}, inplace=True)
                st.markdown(f"**Statistiques — {selected}**")
                st.dataframe(stats, use_container_width=True)

                # Séparation entre fraude et légitime
                mean_fraud = fraud[selected].mean() if selected in fraud.columns else 0
                mean_legit = legit[selected].mean() if selected in legit.columns else 0
                ratio = mean_fraud / mean_legit if mean_legit != 0 else float("inf")
                st.metric("Ratio moyen fraude / légitime", f"{ratio:.2f}×",
                          help="Un ratio > 1 indique que cette feature est plus élevée sur les fraudes")

            # Boxplot fraude vs légitime
            fig = px.box(
                feat, x="is_fraud", y=selected,
                color="is_fraud",
                color_discrete_map={"True": "#EF553B", "False": "#636EFA"},
                title=f"Boxplot fraude vs légitime — {selected}",
                labels={"is_fraud": "Fraude"},
                points=False,
            )
            fig.update_layout(showlegend=False, margin=dict(t=40, b=0))
            st.plotly_chart(fig, use_container_width=True)
