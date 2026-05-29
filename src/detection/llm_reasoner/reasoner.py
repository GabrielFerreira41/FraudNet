"""
Sprint 5 — LLM Raisonneur (Mistral AI API, async)
Produit un rapport narratif JSON pour les transactions suspectes.
Fonctionne en chemin froid (cold path) — ne bloque pas la décision ML.

Modèles recommandés :
  - mistral-small-latest   (rapide, économique)
  - mistral-large-latest   (plus précis)
  - open-mistral-7b        (open source)

Usage : python -m src.detection.llm_reasoner.reasoner
        python -m src.detection.llm_reasoner.reasoner --transaction_id <id>
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from mistralai.client import Mistral

load_dotenv()

FEATURES_PATH = Path("data/generated/features.parquet")
ACCOUNTS_PATH = Path("data/generated/accounts.parquet")
MARS_PATH     = Path("reports/mars_scores.parquet")

DEFAULT_MODEL     = "mistral-large-latest"
LLM_TRIGGER_SCORE = 0.40


# ---------------------------------------------------------------------------
# Construction de la fiche contextuelle
# ---------------------------------------------------------------------------

def build_context(
    transaction_id: str,
    features: pd.DataFrame,
    accounts: pd.DataFrame,
    mars_scores: pd.DataFrame | None = None,
) -> dict:
    """Assemble le contexte JSON d'une transaction pour le prompt LLM."""
    tx = features[features["transaction_id"] == transaction_id]
    if tx.empty:
        raise ValueError(f"Transaction {transaction_id} introuvable.")
    tx = tx.iloc[0]

    acc = accounts[accounts["account_id"] == tx["account_id"]]
    acc = acc.iloc[0] if not acc.empty else None

    historique = (
        features[features["account_id"] == tx["account_id"]]
        .sort_values("timestamp")
        .tail(6).head(5)
    )

    context: dict = {
        "transaction": {
            "id":          transaction_id,
            "timestamp":   str(tx["timestamp"]),
            "montant":     float(tx["montant"]),
            "commercant":  str(tx["commercant"]),
            "categorie":   str(tx["categorie"]),
            "device":      str(tx["device"]),
            "ville":       str(tx["ville_tx"]),
            "heure":       int(tx["heure"]),
            "est_weekend": bool(tx["est_weekend"]),
        },
        "signaux_anomalie": {
            "ratio_montant":          float(tx["ratio_montant"]),
            "montant_anormal":        bool(tx["montant_anormal"]),
            "nouveau_commercant":     bool(tx["nouveau_commercant"]),
            "nouveau_device":         bool(tx["nouveau_device"]),
            "heure_inhabituelle":     bool(tx["heure_inhabituelle"]),
            "velocite_1h":            int(tx["velocite_1h"]),
            "est_rafale":             bool(tx["est_rafale"]),
            "device_partage_suspect": bool(tx["device_partage_suspect"]),
        },
        "profil_client": {
            "archetype":         str(tx["archetype"]),
            "revenu_mensuel":    float(acc["revenu_mensuel"])  if acc is not None else None,
            "ville_habituelle":  str(acc["ville"])             if acc is not None else None,
            "device_principal":  str(acc["device_principal"]) if acc is not None else None,
            "est_vulnerabilite": bool(acc["est_vulnerabilite"]) if acc is not None else None,
        },
        "historique_recent": [
            {
                "timestamp": str(row["timestamp"]),
                "montant":   float(row["montant"]),
                "commercant": str(row["commercant"]),
                "device":    str(row["device"]),
                "ville":     str(row["ville_tx"]),
            }
            for _, row in historique.iterrows()
        ],
    }

    suspected_fraud_type: str | None = None
    if mars_scores is not None:
        m = mars_scores[mars_scores["transaction_id"] == transaction_id]
        if not m.empty:
            m = m.iloc[0]
            context["scores_mars"] = {
                "score_final":    float(m["score_mars"]),
                "decision":       str(m["decision_mars"]),
                "score_baseline": float(m["score_baseline"]),
                "score_graph":    float(m["score_graph"]),
                "contradiction":  bool(m["contradiction"]),
            }
            if "fraud_type" in m.index and pd.notna(m["fraud_type"]):
                suspected_fraud_type = str(m["fraud_type"])

    # Enrichissement threat intelligence
    try:
        from src.detection.llm_reasoner.breach_context import get_threat_context
        ti = get_threat_context(fraud_type=suspected_fraud_type)
        if ti["threat_score"] > 0:
            context["threat_intelligence"] = {
                "threat_score": ti["threat_score"],
                "n_incidents":  len(ti["active_breaches"]),
                "summary":      ti["summary"],
            }
    except Exception:
        pass

    return context


# ---------------------------------------------------------------------------
# Prompt système
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "Tu es un analyste expert en fraude bancaire pour une institution financière canadienne.\n"
    "Tu reçois une fiche contextuelle JSON d'une transaction suspecte : profil du client,\n"
    "habitudes comportementales, transactions récentes, scores de plusieurs agents ML,\n"
    "et — si disponible — un bloc 'threat_intelligence' listant les fuites de données\n"
    "financières mondiales récentes détectées par l'Agent Threat Intel.\n"
    "\n"
    "Produis un rapport d'analyse structuré en JSON avec exactement ces champs :\n"
    "\n"
    "{\n"
    '  "verdict": "FRAUD" | "SUSPICIOUS" | "LEGITIMATE",\n'
    '  "confidence": 0.0-1.0,\n'
    '  "risk_score": 0-100,\n'
    '  "justification": "explication claire en 2-3 phrases pour un analyste humain",\n'
    '  "risk_factors": ["liste des signaux suspects identifiés"],\n'
    '  "recommended_action": "BLOCK" | "MANUAL_REVIEW" | "APPROVE",\n'
    '  "fraud_type_suspected": "carte_volee" | "test_carte" | "prise_de_compte"\n'
    '                       | "reseau_mules" | "structuration" | null,\n'
    '  "threat_intel_used": true | false,\n'
    '  "missing_context": ["informations manquantes pour trancher"]\n'
    "}\n"
    "\n"
    "Règles :\n"
    "- Sois concis et factuel. Cite des chiffres précis du contexte.\n"
    "- Si les scores ML se contredisent, explique lequel tu pèses davantage et pourquoi.\n"
    "- Un compte récent sans historique justifie plus de vigilance (cold-start).\n"
    "- Si 'threat_intelligence' est présent et threat_score > 0.3 : mentionne l'incident\n"
    "  le plus pertinent dans 'justification' et élève le risk_score de 5-15 points.\n"
    "  Une fuite de credentials récente augmente la probabilité de prise de compte.\n"
    "  Un vol de données de cartes augmente la probabilité de carte_volee / test_carte.\n"
    "  Pose 'threat_intel_used' à true si tu en as tenu compte, false sinon.\n"
    "- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après."
)


# ---------------------------------------------------------------------------
# Appel Mistral
# ---------------------------------------------------------------------------

def reason(
    transaction_id: str,
    features: pd.DataFrame,
    accounts: pd.DataFrame,
    mars_scores: pd.DataFrame | None = None,
    model: str = DEFAULT_MODEL,
) -> dict:
    """Appelle Mistral et retourne le rapport JSON parsé."""
    api_key = os.environ.get("MISTRAL_API_KEY", "")
    if not api_key:
        raise EnvironmentError("MISTRAL_API_KEY manquant dans .env")

    context = build_context(transaction_id, features, accounts, mars_scores)
    client  = Mistral(api_key=api_key)

    response = client.chat.complete(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Analyse cette transaction suspecte :\n\n"
                    + json.dumps(context, ensure_ascii=False, indent=2)
                ),
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    raw = response.choices[0].message.content.strip()
    return json.loads(raw)


def reason_batch(
    transaction_ids: list[str],
    features: pd.DataFrame,
    accounts: pd.DataFrame,
    mars_scores: pd.DataFrame | None = None,
    model: str = DEFAULT_MODEL,
) -> list[dict]:
    results = []
    for i, tid in enumerate(transaction_ids):
        print(f"  [{i+1}/{len(transaction_ids)}] {tid[:16]}...")
        try:
            report = reason(tid, features, accounts, mars_scores, model)
            report["transaction_id"] = tid
            results.append(report)
        except (EnvironmentError, ValueError, json.JSONDecodeError) as e:
            results.append({"transaction_id": tid, "error": str(e)})
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    """Point d'entrée CLI : analyse les transactions suspectes via Mistral."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--transaction_id", type=str, default=None)
    parser.add_argument(
        "--model", type=str, default=DEFAULT_MODEL,
        help="Modèle Mistral (ex: mistral-small-latest, mistral-large-latest)",
    )
    parser.add_argument("--n", type=int, default=3,
                        help="Nombre de fraudes à analyser si pas d'ID fourni")
    args = parser.parse_args()

    features  = pd.read_parquet(FEATURES_PATH)
    features["timestamp"] = pd.to_datetime(features["timestamp"])
    accounts  = pd.read_parquet(ACCOUNTS_PATH)
    mars_scores = pd.read_parquet(MARS_PATH) if MARS_PATH.exists() else None

    if args.transaction_id:
        ids = [args.transaction_id]
    else:
        cutoff  = features["timestamp"].max() - pd.Timedelta(weeks=2)
        test_df = features[features["timestamp"] > cutoff]
        ids     = test_df[test_df["is_fraud"]]["transaction_id"].head(args.n).tolist()
        if not ids:
            print("Aucune fraude dans le test set.")
            return

    print(f"\nSprint 5 — LLM Raisonneur (Mistral: {args.model})")
    print(f"Analyse de {len(ids)} transaction(s)...\n")

    reports = reason_batch(ids, features, accounts, mars_scores, model=args.model)

    for report in reports:
        print("\n" + "=" * 60)
        tid = report.pop("transaction_id", "N/A")
        print(f"Transaction : {tid[:16]}...")
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
