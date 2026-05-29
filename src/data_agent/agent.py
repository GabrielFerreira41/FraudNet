"""
DatasetAgent — la vraie couche "agent".

Différence avec pipeline.py :
  pipeline.py → applique toujours les 3 blocs dans l'ordre (script)
  agent.py    → observe d'abord, décide quoi faire, agit, puis évalue (agent)
"""
from __future__ import annotations
from dataclasses import dataclass

import lightgbm as lgb
import pandas as pd
from sklearn.metrics import average_precision_score

from src.data_agent.base import FeatureBlock
from src.data_agent.behavioral import BehavioralBlock
from src.data_agent.enricher import DatasetEnricher
from src.data_agent.interaction import InteractionBlock
from src.data_agent.temporal import TemporalBlock


# ─── Structures de données ────────────────────────────────────────────────────

@dataclass
class Observation:
    n_rows:             int
    n_cols:             int
    fraud_rate:         float
    blocs_a_appliquer:  list[str]   # blocs dont les colonnes sont absentes
    blocs_a_ignorer:    list[str]   # blocs déjà faits (colonnes présentes)


@dataclass
class EvalResult:
    auc_pr_avant:  float
    auc_pr_apres:  float
    delta:         float
    amelioration:  bool
    top_features:  list[tuple[str, float]]   # (nom_feature, importance)


# ─── Agent ────────────────────────────────────────────────────────────────────

class DatasetAgent:
    """
    Cycle : Observer → Décider → Agir → Évaluer
    """

    # Catalogue de tous les blocs disponibles
    CATALOGUE: dict[str, type[FeatureBlock]] = {
        "temporal":    TemporalBlock,
        "behavioral":  BehavioralBlock,
        "interaction": InteractionBlock,
    }

    # ── Phase 1 : Observer ────────────────────────────────────────────────────

    def observe(self, df: pd.DataFrame) -> Observation:
        existing = set(df.columns)
        blocs_a_appliquer, blocs_a_ignorer = [], []

        for name, BlockClass in self.CATALOGUE.items():
            bloc = BlockClass()
            # Si toutes les colonnes de ce bloc sont déjà dans le dataset → déjà fait
            already_done = all(col in existing for col in bloc.output_cols)
            (blocs_a_ignorer if already_done else blocs_a_appliquer).append(name)

        return Observation(
            n_rows            = len(df),
            n_cols            = df.shape[1],
            fraud_rate        = float(df["is_fraud"].mean()),
            blocs_a_appliquer = blocs_a_appliquer,
            blocs_a_ignorer   = blocs_a_ignorer,
        )

    # ── Phase 2 : Décider ─────────────────────────────────────────────────────

    def decide(self, obs: Observation) -> tuple[list[FeatureBlock], list[str]]:
        blocs, raisons = [], []

        for name in obs.blocs_a_appliquer:
            bloc = self.CATALOGUE[name]()

            # Règle : behavioral a besoin de suffisamment de données
            if name == "behavioral" and obs.n_rows < 500:
                raisons.append(f"  ✗ {name} ignoré — dataset trop petit ({obs.n_rows} lignes)")
                continue

            blocs.append(bloc)
            raisons.append(f"  ✓ {name} → à appliquer")

        for name in obs.blocs_a_ignorer:
            raisons.append(f"  ~ {name} → déjà présent, ignoré")

        return blocs, raisons

    # ── Phase 3 : Agir ────────────────────────────────────────────────────────

    def act(
        self,
        df: pd.DataFrame,
        blocs: list[FeatureBlock],
        train_df: pd.DataFrame,
    ) -> tuple[pd.DataFrame, DatasetEnricher | None]:
        if not blocs:
            return df, None

        enricher = DatasetEnricher(blocs)
        enricher.fit(train_df)
        return enricher.transform(df), enricher

    # ── Phase 4 : Évaluer ─────────────────────────────────────────────────────

    def evaluate(
        self,
        df_avant: pd.DataFrame,
        df_apres: pd.DataFrame,
        cutoff: pd.Timestamp,
    ) -> EvalResult:

        def _entrainer_et_scorer(df: pd.DataFrame) -> tuple[float, list]:
            train = df[df["timestamp"] <= cutoff]
            test  = df[df["timestamp"] >  cutoff]

            # Garde uniquement les colonnes numériques (exclut IDs, strings, cible)
            exclure = {
                "timestamp", "transaction_id", "account_id",
                "archetype", "province", "device", "categorie",
                "commercant", "is_fraud", "fraud_type",
            }
            feat_cols = [
                c for c in df.columns
                if c not in exclure and pd.api.types.is_numeric_dtype(df[c])
            ]

            X_train, y_train = train[feat_cols].fillna(0), train["is_fraud"].astype(int)
            X_test,  y_test  = test[feat_cols].fillna(0),  test["is_fraud"].astype(int)

            n_neg = (y_train == 0).sum()
            n_pos = (y_train == 1).sum()

            model = lgb.LGBMClassifier(
                n_estimators     = 200,
                scale_pos_weight = n_neg / max(n_pos, 1),
                verbose          = -1,
                random_state     = 42,
            )
            model.fit(X_train, y_train)

            scores = model.predict_proba(X_test)[:, 1]
            auc    = average_precision_score(y_test, scores)

            top5 = sorted(
                zip(feat_cols, model.feature_importances_),
                key=lambda x: x[1], reverse=True,
            )[:5]

            return float(auc), top5

        print("  Modèle AVANT enrichissement...")
        auc_avant, _        = _entrainer_et_scorer(df_avant)
        print("  Modèle APRÈS enrichissement...")
        auc_apres, top_feats = _entrainer_et_scorer(df_apres)

        return EvalResult(
            auc_pr_avant = round(auc_avant, 4),
            auc_pr_apres = round(auc_apres, 4),
            delta        = round(auc_apres - auc_avant, 4),
            amelioration = auc_apres > auc_avant,
            top_features = top_feats,
        )

    # ── Cycle complet ─────────────────────────────────────────────────────────

    def run(self, df: pd.DataFrame) -> tuple[pd.DataFrame, EvalResult | None]:
        cutoff   = pd.to_datetime(df["timestamp"]).max() - pd.Timedelta(weeks=2)
        train_df = df[pd.to_datetime(df["timestamp"]) <= cutoff].copy()

        print("═" * 52)
        print("  PHASE 1 — OBSERVATION")
        print("═" * 52)
        obs = self.observe(df)
        print(f"  Lignes            : {obs.n_rows:,}")
        print(f"  Colonnes          : {obs.n_cols}")
        print(f"  Taux de fraude    : {obs.fraud_rate*100:.2f}%")
        print(f"  Blocs à appliquer : {obs.blocs_a_appliquer or 'aucun'}")
        print(f"  Blocs déjà faits  : {obs.blocs_a_ignorer or 'aucun'}")

        print("\n" + "═" * 52)
        print("  PHASE 2 — DÉCISION")
        print("═" * 52)
        blocs, raisons = self.decide(obs)
        for r in raisons:
            print(r)

        if not blocs:
            print("\n  Dataset déjà enrichi — rien à faire.")
            return df, None

        print("\n" + "═" * 52)
        print("  PHASE 3 — ACTION")
        print("═" * 52)
        df_enrichi, enricher = self.act(df, blocs, train_df)
        if enricher:
            enricher.save()

        print("\n" + "═" * 52)
        print("  PHASE 4 — ÉVALUATION")
        print("═" * 52)
        result = self.evaluate(df, df_enrichi, cutoff)

        signe = "+" if result.delta >= 0 else ""
        print(f"\n  AUC-PR avant      : {result.auc_pr_avant}")
        print(f"  AUC-PR après      : {result.auc_pr_apres}")
        print(f"  Delta             : {signe}{result.delta}")
        print(f"  Amélioration      : {'✓ OUI' if result.amelioration else '✗ NON'}")
        print(f"\n  Top 5 features :")
        for feat, imp in result.top_features:
            print(f"    {feat:<32} importance={imp:.0f}")
        print("═" * 52)

        return df_enrichi, result
