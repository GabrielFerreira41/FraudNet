"""
Prédicateur MARS — charge Baseline + Graphe en mémoire au démarrage.

Fast path  : transactions dans mars_scores.parquet → lookup O(1) (3 agents)
Live path  : nouvelles transactions → Baseline + Graphe (séquence exclue :
             conflit libomp PyTorch/LightGBM sur macOS)

graph_propagation pré-calculé par compte (1 000 valeurs, pas 228K).
"""
from __future__ import annotations
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from src.detection.fusion.meta_reasoner import aggregate, decide, THRESHOLD_BLOCK

BASELINE_MODEL_PATH  = Path("models/baseline.pkl")
GRAPH_MODEL_PATH     = Path("models/graph_lgbm.pkl")
FEATURES_PATH        = Path("data/generated/features.parquet")
ACCOUNTS_PATH        = Path("data/generated/accounts.parquet")
MARS_PATH            = Path("reports/mars_scores.parquet")
GNN_SCORES_PATH      = Path("reports/gnn_account_scores.parquet")


def _graph_propagation_by_account(features_df: pd.DataFrame) -> dict:
    """
    Calcule la propagation graphe par compte via pandas (sans NetworkX).
    Même logique que compute_graph_scores : compte les comptes voisins
    via devices partagés → sigmoid(/10).
    Retourne {account_id: score [0,1]}.
    """
    device_to_accounts = (
        features_df.groupby("device")["account_id"].unique().to_dict()
    )
    account_to_devices = (
        features_df.groupby("account_id")["device"].unique().to_dict()
    )
    result = {}
    for account_id, devices in account_to_devices.items():
        peers: set = set()
        for dev in devices:
            for peer in device_to_accounts.get(dev, []):
                if peer != account_id:
                    peers.add(peer)
        result[account_id] = float(1 / (1 + np.exp(-len(peers) / 10)))
    return result


class FraudPredictor:
    """Prédicateur MARS : Baseline + Graphe (+ Séquence via cache)."""

    def __init__(self) -> None:
        # Agent Baseline (LightGBM)
        with open(BASELINE_MODEL_PATH, "rb") as f:
            data = pickle.load(f)
        self._baseline = data["model"]
        self._baseline_features: list[str] = data["feature_cols"]

        # Agent Graphe (LightGBM)
        with open(GRAPH_MODEL_PATH, "rb") as f:
            data = pickle.load(f)
        self._graph = data["model"]
        self._graph_features: list[str] = data["features"]

        # Feature store
        self.features_df = pd.read_parquet(FEATURES_PATH)
        self.features_df["timestamp"] = pd.to_datetime(self.features_df["timestamp"])
        self.features_df = (
            self.features_df
            .sort_values(["account_id", "timestamp"])
            .reset_index(drop=True)
        )

        # graph_propagation par compte (1 000 valeurs)
        self._account_propagation = _graph_propagation_by_account(self.features_df)

        # Comptes + scores MARS (pour le LLM Raisonneur)
        self.accounts_df = pd.read_parquet(ACCOUNTS_PATH)
        self.mars_df = pd.read_parquet(MARS_PATH) if MARS_PATH.exists() else None

        # Scores GNN pré-calculés par compte (évite l'import PyTorch à runtime)
        self._gnn_scores: dict[str, dict] = {}
        if GNN_SCORES_PATH.exists():
            gnn_df = pd.read_parquet(GNN_SCORES_PATH)
            for _, row in gnn_df.iterrows():
                self._gnn_scores[str(row["account_id"])] = {
                    "g1_device":   float(row["score_g1"]),
                    "g2_merchant": float(row["score_g2"]),
                    "g3_temporal": float(row["score_g3"]),
                }

        # Cache fast-path : {transaction_id → résultat MARS pré-calculé (3 agents)}
        self._mars_cache: dict[str, dict] = {}
        if self.mars_df is not None:
            for _, row in self.mars_df.iterrows():
                tid = row["transaction_id"]
                self._mars_cache[tid] = {
                    "score_mars":    round(float(row["score_mars"]), 4),
                    "decision":      str(row["decision_mars"]),
                    "agent_scores": {
                        "baseline": round(float(row["score_baseline"]), 4),
                        "sequence": round(float(row["score_sequence"]), 4),
                        "graph":    round(float(row["score_graph"]), 4),
                    },
                    "contradiction": bool(row["contradiction"]),
                    "confidence":    round(float(row.get("confidence_mars", 0.5)), 4),
                }

        # Index rapide : transaction_id → position dans features_df
        self._tx_index: dict[str, int] = {
            tid: i for i, tid in enumerate(self.features_df["transaction_id"])
        }

        # Par compte : liste ordonnée de positions (pour info, non utilisé en live)
        self._account_idx_map: dict[str, list[int]] = {
            str(acc_id): grp.index.tolist()
            for acc_id, grp in self.features_df.groupby("account_id")
        }

    # ------------------------------------------------------------------
    # Scoring public
    # ------------------------------------------------------------------

    def score(self, transaction_id: str) -> dict:
        """Score une transaction : fast-path cache (3 agents) ou live (2 agents)."""
        idx = self._tx_index.get(transaction_id)
        if idx is None:
            raise KeyError(f"Transaction {transaction_id} introuvable")

        is_fraud = None
        if "is_fraud" in self.features_df.columns:
            is_fraud = bool(self.features_df.iloc[idx]["is_fraud"])

        # Fast path : MARS pré-calculé (Baseline + Séquence + Graphe)
        if transaction_id in self._mars_cache:
            return {"transaction_id": transaction_id,
                    **self._mars_cache[transaction_id],
                    "is_fraud_label": is_fraud}

        # Live path : Baseline + Graphe uniquement (séquence non disponible)
        return self._score_live(idx, transaction_id, is_fraud)

    # ------------------------------------------------------------------
    # Live scoring (sans PyTorch)
    # ------------------------------------------------------------------

    def _score_live(self, idx: int, transaction_id: str, is_fraud: bool | None) -> dict:
        """Calcule Baseline + Graphe et agrège avec MARS (séquence exclue)."""
        row = self.features_df.iloc[[idx]]
        account_id = str(row.iloc[0]["account_id"])

        s_baseline = float(self._baseline.predict(row[self._baseline_features])[0])

        row_g = row.copy()
        row_g["graph_propagation"] = self._account_propagation.get(account_id, 0.5)
        s_graph = float(self._graph.predict(row_g[self._graph_features])[0])

        # MARS re-normalise automatiquement sur les agents présents
        scores = {"baseline": s_baseline, "graph": s_graph}
        score_final, contradiction, _ = aggregate(scores)
        decision   = decide(score_final)
        confidence = float(np.clip(
            1.0 - abs(score_final - THRESHOLD_BLOCK) / THRESHOLD_BLOCK, 0.0, 1.0
        ))

        return {
            "transaction_id": transaction_id,
            "score_mars":     round(score_final, 4),
            "decision":       decision,
            "agent_scores": {
                "baseline": round(s_baseline, 4),
                "sequence": None,   # non disponible en live (conflit libomp)
                "graph":    round(s_graph, 4),
            },
            "contradiction":  contradiction,
            "confidence":     round(confidence, 4),
            "is_fraud_label": is_fraud,
        }

    # ------------------------------------------------------------------
    # Utilitaires
    # ------------------------------------------------------------------

    def account_list(self) -> list[dict]:
        """Aggregated account list with risk stats (cached after first call)."""
        if hasattr(self, "_account_list_cache"):
            return self._account_list_cache

        agg = (
            self.features_df
            .groupby("account_id", as_index=False)
            .agg(n_transactions=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"))
        )
        agg["n_fraud"] = agg["n_fraud"].astype(int)
        agg_idx = agg.set_index("account_id").to_dict("index")

        # Max MARS score per account via cache
        tx_to_acc: dict = (
            self.features_df[["transaction_id", "account_id"]]
            .drop_duplicates("transaction_id")
            .set_index("transaction_id")["account_id"]
            .to_dict()
        )
        account_max: dict[str, float] = {}
        for tid, cached in self._mars_cache.items():
            acc_id = tx_to_acc.get(tid)
            if acc_id is not None:
                s = cached["score_mars"]
                if acc_id not in account_max or s > account_max[acc_id]:
                    account_max[acc_id] = s

        result = []
        for _, row in self.accounts_df.iterrows():
            acc_id = str(row["account_id"])
            s       = agg_idx.get(acc_id, {})
            n_fraud = int(s.get("n_fraud", 0))
            max_sc  = float(account_max.get(acc_id, 0.0))
            risk    = ("HIGH"   if n_fraud > 0 or max_sc >= 0.70 else
                       "MEDIUM" if max_sc >= 0.40 else "LOW")
            result.append({
                "account_id":    acc_id,
                "prenom":        str(row["prenom"]),
                "nom":           str(row["nom"]),
                "archetype":     str(row["archetype"]),
                "province":      str(row["province"]),
                "revenu_mensuel": round(float(row["revenu_mensuel"]), 2),
                "est_vulnerable": bool(row.get("est_vulnerabilite", False)),
                "n_transactions": int(s.get("n_transactions", 0)),
                "n_fraud":        n_fraud,
                "max_score":      round(max_sc, 4),
                "risk_level":     risk,
            })

        result.sort(key=lambda x: (
            {"HIGH": 0, "MEDIUM": 1, "LOW": 2}[x["risk_level"]], -x["max_score"]
        ))
        self._account_list_cache = result
        return result

    def account_detail(self, account_id: str) -> dict | None:
        """Account detail with last 20 transactions and MARS scores."""
        rows = self.accounts_df[self.accounts_df["account_id"] == account_id]
        if rows.empty:
            return None
        acc = rows.iloc[0]
        acc_tx = (
            self.features_df[self.features_df["account_id"] == account_id]
            .sort_values("timestamp", ascending=False)
            .head(20)
        )
        transactions = []
        for _, tx in acc_tx.iterrows():
            tid      = str(tx["transaction_id"])
            cached   = self._mars_cache.get(tid, {})
            ft       = tx.get("fraud_type")
            transactions.append({
                "transaction_id": tid,
                "timestamp":  str(tx["timestamp"]),
                "montant":    round(float(tx["montant"]), 2),
                "commercant": str(tx["commercant"]),
                "categorie":  str(tx["categorie"]),
                "device":     str(tx["device"]),
                "is_fraud":   bool(tx["is_fraud"]),
                "fraud_type": str(ft) if pd.notna(ft) and ft else None,
                "score_mars": cached.get("score_mars"),
                "decision":   cached.get("decision"),
            })
        return {
            "account_id":     account_id,
            "prenom":         str(acc["prenom"]),
            "nom":            str(acc["nom"]),
            "archetype":      str(acc["archetype"]),
            "province":       str(acc["province"]),
            "ville":          str(acc["ville"]),
            "revenu_mensuel": round(float(acc["revenu_mensuel"]), 2),
            "est_vulnerable": bool(acc.get("est_vulnerabilite", False)),
            "date_ouverture": str(acc.get("date_ouverture", "")),
            "device_principal": str(acc.get("device_principal", "")),
            "transactions":   transactions,
        }

    def graph_network(self, max_peers: int = 25) -> dict:
        """Fraud network graph for D3 (accounts + merchants + edges)."""
        fraud_tx    = self.features_df[self.features_df["is_fraud"]].copy()
        fraud_accs  = set(fraud_tx["account_id"].unique())
        fraud_merch = set(fraud_tx["commercant"].unique())

        # Top-N legit accounts that visited fraud merchants (ordered by visit frequency)
        peer_tx = self.features_df[
            (~self.features_df["is_fraud"]) &
            (self.features_df["commercant"].isin(fraud_merch)) &
            (~self.features_df["account_id"].isin(fraud_accs))
        ]
        peer_accs = set(
            peer_tx.groupby("account_id")["transaction_id"]
            .count().nlargest(max_peers).index
        )
        all_accs = fraud_accs | peer_accs

        acc_meta = {
            str(r["account_id"]): r
            for _, r in self.accounts_df[
                self.accounts_df["account_id"].isin(all_accs)
            ].iterrows()
        }
        acc_n_tx = (
            self.features_df[self.features_df["account_id"].isin(all_accs)]
            .groupby("account_id")["transaction_id"].count().to_dict()
        )

        nodes: list[dict] = []
        for acc_id in all_accs:
            m = acc_meta.get(str(acc_id))
            if m is None:
                continue
            is_fraud = acc_id in fraud_accs
            ftypes = list(
                fraud_tx[fraud_tx["account_id"] == acc_id]["fraud_type"]
                .dropna().unique()
            ) if is_fraud else []
            nodes.append({
                "id":          f"acc_{acc_id}",
                "type":        "account",
                "label":       f"{str(m['prenom'])[0]}. {m['nom']}",
                "full_name":   f"{m['prenom']} {m['nom']}",
                "archetype":   str(m["archetype"]),
                "province":    str(m["province"]),
                "fraud":       is_fraud,
                "fraud_types": ftypes,
                "n_tx":        int(acc_n_tx.get(acc_id, 0)),
            })

        for merchant in fraud_merch:
            m_tx = fraud_tx[fraud_tx["commercant"] == merchant]
            cat  = str(m_tx["categorie"].iloc[0]) if not m_tx.empty else "autre"
            nodes.append({
                "id":         f"merch_{merchant}",
                "type":       "merchant",
                "label":      str(merchant),
                "categorie":  cat,
                "n_fraud_tx": int(len(m_tx)),
            })

        edges: list[dict] = []
        for _, tx in fraud_tx.iterrows():
            ft = tx.get("fraud_type")
            edges.append({
                "source":     f"acc_{tx['account_id']}",
                "target":     f"merch_{tx['commercant']}",
                "fraud":      True,
                "fraud_type": str(ft) if pd.notna(ft) and ft else None,
                "montant":    round(float(tx["montant"]), 2),
            })

        peer_sample = (
            peer_tx[peer_tx["account_id"].isin(peer_accs)]
            .groupby(["account_id", "commercant"], as_index=False)
            .agg(montant=("montant", "mean"))
        )
        for _, tx in peer_sample.iterrows():
            edges.append({
                "source":     f"acc_{tx['account_id']}",
                "target":     f"merch_{tx['commercant']}",
                "fraud":      False,
                "fraud_type": None,
                "montant":    round(float(tx["montant"]), 2),
            })

        return {"nodes": nodes, "edges": edges}

    def dataset_stats(
        self,
        archetype: str = "all",
        province:  str = "all",
        fraud_type: str = "all",
    ) -> dict:
        """Agrégations filtrées pour la vue exploration de données."""
        df = self.features_df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"])

        # Merge province depuis accounts
        df = df.merge(
            self.accounts_df[["account_id", "province"]],
            on="account_id", how="left",
        )

        # Filtres
        if archetype != "all":
            df = df[df["archetype"] == archetype]
        if province != "all":
            df = df[df["province"] == province]
        if fraud_type != "all":
            df = df[(~df["is_fraud"]) | (df["fraud_type"] == fraud_type)]

        n_tx    = len(df)
        n_fraud = int(df["is_fraud"].sum())

        # ── KPIs ──
        kpis = {
            "n_transactions": n_tx,
            "n_accounts":     int(df["account_id"].nunique()),
            "n_fraud":        n_fraud,
            "fraud_rate":     round(n_fraud / max(n_tx, 1), 6),
            "total_montant":  round(float(df["montant"].sum()), 2),
            "montant_moyen":  round(float(df["montant"].mean()), 2),
        }

        # ── Timeline hebdomadaire ──
        df["week"] = df["timestamp"].dt.to_period("W").dt.start_time
        weekly = (
            df.groupby("week")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"),
                 montant_total=("montant", "sum"))
            .reset_index()
        )
        weekly["week"]         = weekly["week"].dt.strftime("%Y-%m-%d")
        weekly["n_fraud"]      = weekly["n_fraud"].astype(int)
        weekly["montant_total"] = weekly["montant_total"].round(2)

        # ── Distribution horaire ──
        hourly_raw = (
            df.groupby("heure")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"),
                 montant_moyen=("montant", "mean"))
            .reset_index()
        )
        hourly = (
            pd.DataFrame({"heure": range(24)})
            .merge(hourly_raw, on="heure", how="left")
            .fillna(0)
        )
        hourly["n_tx"]         = hourly["n_tx"].astype(int)
        hourly["n_fraud"]      = hourly["n_fraud"].astype(int)
        hourly["montant_moyen"] = hourly["montant_moyen"].round(2)

        # ── Par type de fraude ──
        fraud_df = df[df["is_fraud"] & df["fraud_type"].notna()]
        by_type = (
            fraud_df["fraud_type"].value_counts()
            .reset_index()
            .rename(columns={"fraud_type": "type", "count": "n"})
        )

        # ── Par marchand (top 15 par n_fraud) ──
        by_merch = (
            df.groupby("commercant")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"),
                 montant_moyen=("montant", "mean"))
            .reset_index()
            .sort_values("n_fraud", ascending=False)
            .head(15)
        )
        by_merch["n_fraud"]      = by_merch["n_fraud"].astype(int)
        by_merch["montant_moyen"] = by_merch["montant_moyen"].round(2)

        # ── Par archétype ──
        by_arch = (
            df.groupby("archetype")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"),
                 montant_moyen=("montant", "mean"))
            .reset_index()
        )
        by_arch["fraud_rate"] = (by_arch["n_fraud"] / by_arch["n_tx"]).round(5)
        by_arch["n_fraud"]    = by_arch["n_fraud"].astype(int)

        # ── Par device ──
        by_device = (
            df.groupby("device")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"))
            .reset_index()
        )
        by_device["n_fraud"] = by_device["n_fraud"].astype(int)

        # ── Par province ──
        by_province = (
            df.groupby("province")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"))
            .reset_index()
            .sort_values("n_tx", ascending=False)
        )
        by_province["n_fraud"] = by_province["n_fraud"].astype(int)

        # ── Distribution des montants ──
        bins   = [0, 25, 100, 500, 2000, float("inf")]
        labels = ["< 25 $", "25–100 $", "100–500 $", "500–2k $", "> 2k $"]
        df["bucket"] = pd.cut(df["montant"], bins=bins, labels=labels, right=False)
        by_amount = (
            df.groupby("bucket", observed=True)
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"))
            .reset_index()
        )
        by_amount["n_fraud"] = by_amount["n_fraud"].astype(int)
        by_amount["bucket"]  = by_amount["bucket"].astype(str)

        # ── Par catégorie ──
        by_cat = (
            df.groupby("categorie")
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"),
                 montant_moyen=("montant", "mean"))
            .reset_index()
            .sort_values("n_fraud", ascending=False)
        )
        by_cat["n_fraud"]      = by_cat["n_fraud"].astype(int)
        by_cat["montant_moyen"] = by_cat["montant_moyen"].round(2)

        # ── Par tranche d'âge ──
        from datetime import date as _date
        acc_copy = self.accounts_df[["account_id", "date_naissance"]].copy()
        acc_copy["age"] = pd.to_datetime(acc_copy["date_naissance"]).apply(
            lambda d: (_date.today() - d.date()).days // 365
        )
        age_bins   = [0, 25, 35, 45, 55, 65, 200]
        age_labels = ["< 25", "25-34", "35-44", "45-54", "55-64", "65+"]
        acc_copy["age_group"] = pd.cut(
            acc_copy["age"], bins=age_bins, labels=age_labels, right=False
        )
        df_age = df.merge(acc_copy[["account_id", "age_group"]], on="account_id", how="left")
        by_age = (
            df_age.groupby("age_group", observed=True)
            .agg(n_tx=("transaction_id", "count"),
                 n_fraud=("is_fraud", "sum"),
                 montant_moyen=("montant", "mean"))
            .reset_index()
        )
        by_age["fraud_rate"]    = (by_age["n_fraud"] / by_age["n_tx"].clip(lower=1)).round(5)
        by_age["n_fraud"]       = by_age["n_fraud"].astype(int)
        by_age["montant_moyen"] = by_age["montant_moyen"].round(2)
        by_age["age_group"]     = by_age["age_group"].astype(str)

        # ── Heatmap fraude : fraud_type × archétype ──
        fraud_only = df[df["is_fraud"] & df["fraud_type"].notna()]
        if len(fraud_only) > 0:
            heatmap_rows = (
                fraud_only.groupby(["fraud_type", "archetype"])
                .size()
                .reset_index(name="n")
                .to_dict(orient="records")
            )
        else:
            heatmap_rows = []

        # ── Montant moyen par archétype (pour bubble) ──
        by_arch_rich = by_arch.copy()
        by_arch_rich["montant_moyen"] = by_arch_rich["montant_moyen"].round(2)

        return {
            "kpis":         kpis,
            "weekly":       weekly.to_dict(orient="records"),
            "hourly":       hourly.to_dict(orient="records"),
            "by_type":      by_type.to_dict(orient="records"),
            "by_merchant":  by_merch.to_dict(orient="records"),
            "by_archetype": by_arch_rich.to_dict(orient="records"),
            "by_device":    by_device.to_dict(orient="records"),
            "by_province":  by_province.to_dict(orient="records"),
            "by_amount":    by_amount.to_dict(orient="records"),
            "by_category":  by_cat.to_dict(orient="records"),
            "by_age_group": by_age.to_dict(orient="records"),
            "heatmap":      heatmap_rows,
        }

    def _account_context(self, account_id: str) -> dict | None:
        """Construit le profil contextuel d'un compte pour enrichir l'analyse."""
        if not account_id:
            return None

        acc_rows = self.accounts_df[self.accounts_df["account_id"] == account_id]
        hist     = self.features_df[self.features_df["account_id"] == account_id].copy()
        if acc_rows.empty or hist.empty:
            return None

        acc  = acc_rows.iloc[0]
        hist["timestamp"] = pd.to_datetime(hist["timestamp"])
        hist  = hist.sort_values("timestamp")
        last  = hist.iloc[-1]

        top_merchants = (
            hist.groupby("commercant")["montant"].agg(["count", "mean"])
            .sort_values("count", ascending=False)
            .head(5)
            .reset_index()
            .rename(columns={"commercant": "nom", "count": "n_tx", "mean": "montant_moyen"})
        )

        n_fraud = int(hist["is_fraud"].sum())

        return {
            "prenom":           str(acc.get("prenom", "")),
            "nom":              str(acc.get("nom", "")),
            "archetype":        str(acc.get("archetype", "")),
            "ville":            str(acc.get("ville", "")),
            "revenu_mensuel":   round(float(acc.get("revenu_mensuel", 0)), 0),
            "est_vulnerable":   bool(acc.get("est_vulnerabilite", False)),
            "n_transactions":   len(hist),
            "n_fraud_connus":   n_fraud,
            "montant_moyen":    round(float(hist["montant"].mean()), 2),
            "montant_median":   round(float(hist["montant"].median()), 2),
            "montant_max":      round(float(hist["montant"].max()), 2),
            "merchants_habituels": [
                {
                    "nom":           str(r["nom"]),
                    "n_tx":          int(r["n_tx"]),
                    "montant_moyen": round(float(r["montant_moyen"]), 2),
                }
                for _, r in top_merchants.iterrows()
            ],
            "derniere_tx": {
                "timestamp":  str(last["timestamp"]),
                "montant":    round(float(last["montant"]), 2),
                "commercant": str(last["commercant"]),
                "device":     str(last["device"]),
            },
        }

    def analyze_live(self, tx: dict) -> dict:
        """
        Analyse une transaction inconnue en temps réel.
        tx : {account_id?, montant, commercant, device, timestamp?}
        Retourne decision, score_mars, agent_scores, risk_factors, features.
        """
        from src.api.live_scorer import compute_live_features, compute_risk_factors

        feat_df   = compute_live_features(tx, self.features_df)
        feat_dict = feat_df.iloc[0].to_dict()

        # Agent Baseline (LightGBM)
        s_baseline = float(self._baseline.predict(feat_df[self._baseline_features])[0])

        # Agents GNN — lookup dans le cache pré-calculé
        account_id = str(tx.get("account_id") or "")
        gnn = self._gnn_scores.get(account_id, {"g1_device": 0.5, "g2_merchant": 0.5, "g3_temporal": 0.5})

        scores = {
            "baseline":    s_baseline,
            "g1_device":   gnn["g1_device"],
            "g2_merchant": gnn["g2_merchant"],
            "g3_temporal": gnn["g3_temporal"],
        }
        from src.detection.fusion.meta_reasoner import DEFAULT_WEIGHTS, aggregate, decide, THRESHOLD_BLOCK
        score_f, contradiction, _ = aggregate(scores, DEFAULT_WEIGHTS)
        decision   = decide(score_f)
        confidence = float(np.clip(1.0 - abs(score_f - THRESHOLD_BLOCK) / THRESHOLD_BLOCK, 0.0, 1.0))

        risk_factors = compute_risk_factors(feat_dict, gnn)

        return {
            "decision":       decision,
            "score_mars":     round(score_f, 4),
            "confidence":     round(confidence, 4),
            "contradiction":  contradiction,
            "agent_scores": {
                "baseline":    round(s_baseline, 4),
                "g1_device":   round(gnn["g1_device"], 4),
                "g2_merchant": round(gnn["g2_merchant"], 4),
                "g3_temporal": round(gnn["g3_temporal"], 4),
            },
            "risk_factors":   risk_factors,
            "features":       {k: round(v, 4) if isinstance(v, float) else v for k, v in feat_dict.items()},
            "account_context": self._account_context(account_id),
        }

    def transaction_details(self, transaction_id: str) -> dict | None:
        """Retourne les champs bruts d'une transaction pour pré-remplir le formulaire."""
        idx = self._tx_index.get(transaction_id)
        if idx is None:
            return None
        row = self.features_df.iloc[idx]
        ft  = row.get("fraud_type")
        return {
            "transaction_id": transaction_id,
            "account_id":     str(row["account_id"]),
            "montant":        round(float(row["montant"]), 2),
            "commercant":     str(row["commercant"]),
            "device":         str(row["device"]),
            "timestamp":      str(row["timestamp"]),
            "is_fraud":       bool(row["is_fraud"]),
            "fraud_type":     str(ft) if pd.notna(ft) and ft else None,
        }

    def has_transaction(self, transaction_id: str) -> bool:
        """Vérifie si un transaction_id est indexé."""
        return transaction_id in self._tx_index

    def sample_ids(self, n: int = 5) -> dict[str, list[str]]:
        """Retourne n IDs de fraudes et n IDs légitimes pour tests."""
        fraud = (
            self.features_df[self.features_df["is_fraud"]]["transaction_id"]
            .head(n).tolist()
        )
        legit = (
            self.features_df[~self.features_df["is_fraud"]]["transaction_id"]
            .head(n).tolist()
        )
        return {"fraud": fraud, "legitimate": legit}

    @property
    def stats(self) -> dict:
        """Statistiques globales du jeu de données indexé."""
        n       = len(self.features_df)
        n_fraud = int(self.features_df["is_fraud"].sum())
        return {
            "transactions_indexed": n,
            "accounts_indexed":     len(self._account_idx_map),
            "fraud_rate":           round(n_fraud / n, 6),
            "features_count":       len(self._baseline_features),
        }
