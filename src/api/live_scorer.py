"""
Calcule le vecteur de features d'une transaction en temps réel
à partir du contexte historique du compte.
"""
from __future__ import annotations
import pandas as pd


def compute_live_features(tx: dict, features_df: pd.DataFrame) -> pd.DataFrame:
    """
    Construit la ligne de features que le modèle Baseline attend,
    en dérivant les stats comportementales depuis l'historique du compte.

    tx : {account_id, montant, commercant, device, timestamp (opt)}
    """
    account_id = tx.get("account_id")
    montant    = float(tx["montant"])
    commercant = str(tx["commercant"])
    device     = str(tx.get("device", "mobile"))

    # Si pas de timestamp fourni, on se place juste après la dernière tx du compte
    # pour que les features de vélocité soient cohérentes avec l'historique.
    raw_ts = tx.get("timestamp")
    if raw_ts:
        ts = pd.to_datetime(raw_ts)
    else:
        if account_id:
            hist_ts = features_df[features_df["account_id"] == account_id]["timestamp"]
            if not hist_ts.empty:
                ts = pd.to_datetime(hist_ts.max()) + pd.Timedelta(minutes=30)
            else:
                ts = pd.Timestamp.now()
        else:
            ts = pd.Timestamp.now()

    # ── Historique du compte ──────────────────────────────────────────────────
    if account_id:
        hist = features_df[features_df["account_id"] == account_id].copy()
        hist["timestamp"] = pd.to_datetime(hist["timestamp"])
        hist = hist.sort_values("timestamp")
    else:
        hist = pd.DataFrame()

    if not hist.empty:
        mean_m    = float(hist["montant"].mean())
        std_m     = float(hist["montant"].std()) or 1.0
        last_ts   = hist["timestamp"].max()
        delta_min = max(0.0, (ts - last_ts).total_seconds() / 60.0)

        r_1h  = hist[hist["timestamp"] >= ts - pd.Timedelta(hours=1)]
        r_24h = hist[hist["timestamp"] >= ts - pd.Timedelta(hours=24)]
        last30 = hist.tail(30)

        velocite_1h       = len(r_1h)
        velocite_24h      = len(r_24h)
        montant_cumul_1h  = float(r_1h["montant"].sum())   # exclu la tx courante, comme dans le pipeline
        moy_30            = float(last30["montant"].mean())
        std_30            = float(last30["montant"].std()) or 1.0
        ecart_30          = abs(montant - moy_30) / std_30
        ratio_montant     = montant / (mean_m or 1.0)
        montant_anormal   = int(montant > mean_m + 2 * std_m)
        est_rafale        = int(velocite_1h >= 3)
        nouveau_commercant = int(commercant not in hist["commercant"].values)
        nouveau_device    = int(device not in hist["device"].values)
        degre_compte      = int(hist["commercant"].nunique())
    else:
        # Compte inconnu / cold-start → defaults prudents
        mean_m = montant; delta_min = 9999.0
        velocite_1h = 1; velocite_24h = 1; montant_cumul_1h = montant
        moy_30 = montant; ecart_30 = 0.0; ratio_montant = 1.0
        montant_anormal = 0; est_rafale = 0
        nouveau_commercant = 1; nouveau_device = 1; degre_compte = 0

    # ── Stats réseau ──────────────────────────────────────────────────────────
    n_comptes_device   = int(features_df[features_df["device"] == device]["account_id"].nunique()) \
                         if not features_df.empty else 1
    n_comptes_merchant = int(features_df[features_df["commercant"] == commercant]["account_id"].nunique()) \
                         if not features_df.empty else 1

    heure_inhabituelle = int(ts.hour < 6 or ts.hour >= 23)

    # Somme d'entiers 0–4, identique au feature_pipeline.py
    score_anomalie = montant_anormal + nouveau_commercant + nouveau_device + heure_inhabituelle

    return pd.DataFrame([{
        "montant":               montant,
        "heure":                 ts.hour,
        "jour_semaine":          ts.weekday(),
        "est_weekend":           int(ts.weekday() >= 5),
        "ratio_montant":         ratio_montant,
        "montant_anormal":       montant_anormal,
        "nouveau_commercant":    nouveau_commercant,
        "nouveau_device":        nouveau_device,
        "heure_inhabituelle":    heure_inhabituelle,
        "score_anomalie_tx":     score_anomalie,
        "velocite_1h":           velocite_1h,
        "velocite_24h":          velocite_24h,
        "montant_cumul_1h":      montant_cumul_1h,
        "montant_moy_30tx":      moy_30,
        "ecart_montant_30tx":    ecart_30,
        "delta_min_prev_tx":     delta_min,
        "est_rafale":            est_rafale,
        "n_comptes_par_device":   n_comptes_device,
        "n_comptes_par_commercant": n_comptes_merchant,
        "degre_compte":          degre_compte,
    }])


def compute_risk_factors(feat: dict, gnn: dict) -> list[str]:
    """Produit la liste des facteurs de risque lisibles pour un analyste."""
    factors: list[str] = []

    if feat["montant_anormal"]:
        factors.append(f"Montant anormal ({feat['ratio_montant']:.1f}× la moyenne)")
    if feat["est_rafale"]:
        factors.append(f"Rafale détectée ({feat['velocite_1h']} tx / heure)")
    if feat["nouveau_commercant"]:
        factors.append("Premier achat chez ce marchand")
    if feat["nouveau_device"]:
        factors.append("Nouvel appareil non reconnu")
    if feat["heure_inhabituelle"]:
        factors.append(f"Heure inhabituelle ({feat['heure']}h)")
    if feat["velocite_24h"] > 20:
        factors.append(f"Vélocité élevée ({feat['velocite_24h']} tx / 24h)")
    if gnn.get("g1_device", 0) > 0.75:
        factors.append("Réseau de devices suspects (G1)")
    if gnn.get("g2_merchant", 0) > 0.75:
        factors.append("Marchand ciblé par des fraudeurs (G2)")
    if gnn.get("g3_temporal", 0) > 0.75:
        factors.append("Co-occurrence temporelle suspecte (G3)")

    return factors
