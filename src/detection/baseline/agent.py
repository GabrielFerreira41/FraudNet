"""
Sprint 1 — Agent Baseline (LightGBM)
Entraîne et expose un scorer sur features.parquet.
Usage : python -m src.detection.baseline.agent
"""
from __future__ import annotations
import pickle
from pathlib import Path

import lightgbm as lgb
import mlflow
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

FEATURES_PATH = Path("data/generated/features.parquet")
MODEL_PATH    = Path("models/baseline.pkl")

# Colonnes utilisées par le modèle (exclu : IDs, strings, target, colonne constante)
FEATURE_COLS = [
    "montant", "heure", "jour_semaine", "est_weekend",
    "ratio_montant", "montant_anormal", "nouveau_commercant",
    "nouveau_device", "heure_inhabituelle", "score_anomalie_tx",
    "velocite_1h", "velocite_24h", "montant_cumul_1h",
    "montant_moy_30tx", "ecart_montant_30tx", "delta_min_prev_tx", "est_rafale",
    "n_comptes_par_device", "n_comptes_par_commercant", "degre_compte",
]
TARGET = "is_fraud"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_data(path: Path = FEATURES_PATH) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split temporel : 11 semaines train / 2 semaines test."""
    df = pd.read_parquet(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    cutoff = df["timestamp"].max() - pd.Timedelta(weeks=2)
    train = df[df["timestamp"] <= cutoff].copy()
    test  = df[df["timestamp"] >  cutoff].copy()
    return train, test


def _xy(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    X = df[FEATURE_COLS].copy()
    X["est_weekend"] = X["est_weekend"].astype(int)
    y = df[TARGET].astype(int)
    return X, y


# ---------------------------------------------------------------------------
# Entraînement
# ---------------------------------------------------------------------------

def train(
    features_path: Path = FEATURES_PATH,
    model_path: Path = MODEL_PATH,
    run_name: str = "baseline",
    extra_params: dict | None = None,
) -> lgb.Booster:
    print("Chargement des données (split temporel)...")
    train_df, test_df = load_data(features_path)

    X_train, y_train = _xy(train_df)
    X_test,  y_test  = _xy(test_df)

    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    print(f"Train : {len(X_train):,} | fraudes : {n_pos} ({n_pos/len(y_train)*100:.3f}%)")
    print(f"Test  : {len(X_test):,}  | fraudes : {y_test.sum()} ({y_test.sum()/len(y_test)*100:.3f}%)")

    dtrain = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_COLS)
    dval   = lgb.Dataset(X_test,  label=y_test,  reference=dtrain)

    params = {
        "objective":         "binary",
        "metric":            ["auc", "binary_logloss"],
        "scale_pos_weight":  n_neg / max(n_pos, 1),
        "learning_rate":     0.05,
        "num_leaves":        31,
        "min_child_samples": 20,
        "feature_fraction":  0.8,
        "bagging_fraction":  0.8,
        "bagging_freq":      5,
        "verbose":           -1,
        "seed":              42,
    }
    if extra_params:
        params.update(extra_params)

    mlflow.set_experiment("fraudnet-baseline")
    with mlflow.start_run(run_name=run_name):
        mlflow.log_params({
            "learning_rate":     params["learning_rate"],
            "num_leaves":        params["num_leaves"],
            "min_child_samples": params["min_child_samples"],
            "feature_fraction":  params["feature_fraction"],
            "bagging_fraction":  params["bagging_fraction"],
            "n_train":           len(X_train),
            "n_test":            len(X_test),
            "fraud_rate_train":  round(n_pos / len(y_train), 4),
        })

        print("\nEntraînement LightGBM...")
        callbacks = [lgb.early_stopping(50, verbose=False), lgb.log_evaluation(100)]
        model = lgb.train(
            params, dtrain,
            num_boost_round=1000,
            valid_sets=[dtrain, dval],
            valid_names=["train", "val"],
            callbacks=callbacks,
        )

        mlflow.log_metric("best_iteration", model.best_iteration)
        mlflow.log_metric("auc_val", model.best_score["val"]["auc"])
        mlflow.log_metric("logloss_val", model.best_score["val"]["binary_logloss"])

        model_path.parent.mkdir(exist_ok=True)
        with open(model_path, "wb") as f:
            pickle.dump({"model": model, "feature_cols": FEATURE_COLS}, f)
        mlflow.log_artifact(str(model_path))
        print(f"\n✓ Modèle sauvegardé → {model_path}")

    return model


# ---------------------------------------------------------------------------
# Inférence
# ---------------------------------------------------------------------------

def load_model(model_path: Path = MODEL_PATH) -> lgb.Booster:
    with open(model_path, "rb") as f:
        data = pickle.load(f)
    return data["model"]


def score(transactions: pd.DataFrame, model_path: Path = MODEL_PATH) -> np.ndarray:
    """Retourne un score de risque [0,1] par transaction."""
    model = load_model(model_path)
    X = transactions[FEATURE_COLS].copy()
    X["est_weekend"] = X["est_weekend"].astype(int)
    return model.predict(X)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    train()
    print("\nLance 'python -m src.detection.baseline.evaluate' pour le rapport complet.")


if __name__ == "__main__":
    main()
