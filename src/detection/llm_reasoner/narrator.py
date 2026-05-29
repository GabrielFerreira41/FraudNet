"""
Générateur de narrative pour l'analyse live MARS.
Utilise Claude API si ANTHROPIC_API_KEY est configuré,
sinon produit une analyse basée sur des règles.
"""
from __future__ import annotations
import json
import os

import pandas as pd
from dotenv import load_dotenv
from mistralai.client import Mistral

load_dotenv()


# ── Narrative basée sur des règles ────────────────────────────────────────────

def _rule_based_narrative(tx_input: dict, mars_result: dict) -> dict:
    score      = mars_result["score_mars"]
    decision   = mars_result["decision"]
    factors    = mars_result["risk_factors"]
    agents     = mars_result["agent_scores"]
    feat       = mars_result["features"]

    if decision == "BLOCK":
        verdict = "FRAUD"
        action  = "BLOCK"
        conf    = min(score + 0.05, 0.99)
    elif decision == "INVESTIGATE":
        verdict = "SUSPICIOUS"
        action  = "MANUAL_REVIEW"
        conf    = score
    else:
        verdict = "LEGITIMATE"
        action  = "APPROVE"
        conf    = 1.0 - score

    # Identifie le type de fraude probable
    g1, g2, g3 = agents["g1_device"], agents["g2_merchant"], agents["g3_temporal"]
    if g1 > 0.75 and g3 > 0.65:
        fraud_type = "reseau_mules"
    elif g2 > 0.75 and g3 > 0.65:
        fraud_type = "test_carte"
    elif g2 > 0.75:
        fraud_type = "carte_volee"
    elif feat.get("nouveau_device") and feat.get("nouveau_commercant"):
        fraud_type = "prise_de_compte"
    elif feat.get("n_comptes_par_device", 0) > 10:
        fraud_type = "structuration"
    else:
        fraud_type = None

    # Génère la justification
    parts = []
    montant = tx_input.get("montant", 0)
    commercant = tx_input.get("commercant", "ce marchand")

    if verdict == "FRAUD":
        parts.append(
            f"Transaction de {montant:.2f} $ CAD chez {commercant} présentant "
            f"un score MARS de {score:.0%} — seuil de blocage atteint."
        )
    elif verdict == "SUSPICIOUS":
        parts.append(
            f"Transaction de {montant:.2f} $ CAD chez {commercant} avec un score "
            f"MARS de {score:.0%} — nécessite une vérification humaine."
        )
    else:
        parts.append(
            f"Transaction de {montant:.2f} $ CAD chez {commercant} conforme "
            f"au profil comportemental du compte (score {score:.0%})."
        )

    if factors:
        parts.append(f"Signaux détectés : {', '.join(factors[:3])}.")

    dominant = max(agents, key=agents.get)
    agent_labels = {
        "baseline":    "l'agent comportemental (Baseline)",
        "g1_device":   "l'agent réseau de devices (G1)",
        "g2_merchant": "l'agent marchands ciblés (G2)",
        "g3_temporal": "l'agent vélocité temporelle (G3)",
    }
    if agents[dominant] > 0.65:
        parts.append(
            f"Signal le plus fort : {agent_labels.get(dominant, dominant)} "
            f"({agents[dominant]:.0%})."
        )

    return {
        "verdict":              verdict,
        "confidence":           round(conf, 3),
        "justification":        " ".join(parts),
        "risk_factors":         factors,
        "fraud_type_suspected": fraud_type,
        "recommended_action":   action,
        "threat_intel_used":    False,
        "source":               "rule_based",
    }


# ── Narrative via Mistral AI ──────────────────────────────────────────────────

SYSTEM_PROMPT = """\
Tu es un analyste expert en fraude bancaire pour une institution financière canadienne.
Tu reçois une fiche JSON décrivant une transaction, les scores de 4 agents ML (MARS),
les facteurs de risque identifiés, et — si disponible — un bloc 'threat_intelligence'
listant les fuites financières mondiales récentes détectées par l'Agent Threat Intel.

Produis un rapport d'analyse en JSON avec exactement ces champs :
{
  "verdict": "FRAUD" | "SUSPICIOUS" | "LEGITIMATE",
  "confidence": 0.0-1.0,
  "justification": "explication claire en 2-3 phrases pour un analyste humain",
  "risk_factors": ["liste des signaux suspects — reprends et complète ceux fournis"],
  "fraud_type_suspected": "carte_volee" | "test_carte" | "prise_de_compte"
                        | "reseau_mules" | "structuration" | null,
  "recommended_action": "BLOCK" | "MANUAL_REVIEW" | "APPROVE",
  "threat_intel_used": true | false,
  "source": "mistral"
}

Règles :
- Sois concis et factuel. Cite des chiffres précis du contexte.
- Si les scores ML se contredisent, explique lequel tu pèses davantage et pourquoi.
- Si 'threat_intelligence' est présent et threat_score > 0.3 : mentionne l'incident
  le plus pertinent dans 'justification' et durcis légèrement ta recommandation.
  Pose 'threat_intel_used' à true si tu en as tenu compte, false sinon.
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.
"""


def _infer_fraud_type(mars_result: dict) -> str | None:
    """Déduit le type de fraude probable depuis les scores agents."""
    agents = mars_result.get("agent_scores", {})
    feat   = mars_result.get("features", {})
    g1, g2, g3 = agents.get("g1_device", 0), agents.get("g2_merchant", 0), agents.get("g3_temporal", 0)
    if g1 > 0.75 and g3 > 0.65:
        return "reseau_mules"
    if g2 > 0.75 and g3 > 0.65:
        return "test_carte"
    if g2 > 0.75:
        return "carte_volee"
    if feat.get("nouveau_device") and feat.get("nouveau_commercant"):
        return "prise_de_compte"
    if feat.get("n_comptes_par_device", 0) > 10:
        return "structuration"
    return None


def _inject_threat_context(context: dict, mars_result: dict) -> None:
    """Injecte le bloc threat_intelligence dans le contexte si des breaches sont disponibles."""
    try:
        from src.detection.llm_reasoner.breach_context import get_threat_context
        ti = get_threat_context(fraud_type=_infer_fraud_type(mars_result))
        if ti["threat_score"] > 0:
            context["threat_intelligence"] = {
                "threat_score": ti["threat_score"],
                "n_incidents":  len(ti["active_breaches"]),
                "summary":      ti["summary"],
            }
    except (ImportError, OSError, ValueError):
        pass


def _mistral_narrative(tx_input: dict, mars_result: dict, accounts_df: pd.DataFrame | None) -> dict:
    account_id = tx_input.get("account_id")
    acc_info   = {}
    if account_id is not None and accounts_df is not None:
        rows = accounts_df[accounts_df["account_id"] == account_id]
        if not rows.empty:
            r = rows.iloc[0]
            acc_info = {
                "archetype":      str(r.get("archetype", "")),
                "revenu_mensuel": float(r.get("revenu_mensuel", 0)),
                "ville":          str(r.get("ville", "")),
                "est_vulnerable": bool(r.get("est_vulnerabilite", False)),
            }

    context = {
        "transaction": {
            "montant":    tx_input.get("montant"),
            "commercant": tx_input.get("commercant"),
            "device":     tx_input.get("device"),
            "timestamp":  tx_input.get("timestamp"),
        },
        "profil_compte": acc_info,
        "scores_mars": {
            "score_final":   mars_result["score_mars"],
            "decision":      mars_result["decision"],
            "baseline":      mars_result["agent_scores"]["baseline"],
            "g1_device":     mars_result["agent_scores"]["g1_device"],
            "g2_merchant":   mars_result["agent_scores"]["g2_merchant"],
            "g3_temporal":   mars_result["agent_scores"]["g3_temporal"],
            "contradiction": mars_result["contradiction"],
        },
        "facteurs_risque":   mars_result["risk_factors"],
        "features_cles": {
            k: mars_result["features"][k]
            for k in ["ratio_montant", "velocite_1h", "nouveau_commercant",
                      "nouveau_device", "n_comptes_par_device", "est_rafale",
                      "heure_inhabituelle"]
            if k in mars_result["features"]
        },
    }

    # Enrichissement threat intelligence (breach context)
    _inject_threat_context(context, mars_result)

    client   = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    response = client.chat.complete(
        model          = "mistral-large-latest",
        temperature    = 0.1,
        response_format= {"type": "json_object"},
        messages       = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role":    "user",
                "content": (
                    "Analyse cette transaction :\n\n"
                    + json.dumps(context, ensure_ascii=False, indent=2)
                ),
            },
        ],
    )

    raw = response.choices[0].message.content.strip()
    result = json.loads(raw)
    result["source"] = "mistral"
    return result


# ── Point d'entrée public ─────────────────────────────────────────────────────

def narrate(
    tx_input:   dict,
    mars_result: dict,
    accounts_df: pd.DataFrame | None = None,
) -> dict:
    """
    Génère la narrative d'analyse.
    Utilise Claude API si ANTHROPIC_API_KEY est présent, sinon règles.
    """
    api_key = os.environ.get("MISTRAL_API_KEY", "").strip()
    if api_key:
        try:
            return _mistral_narrative(tx_input, mars_result, accounts_df)
        except (OSError, ValueError, KeyError, IndexError, json.JSONDecodeError) as e:
            result = _rule_based_narrative(tx_input, mars_result)
            result["justification"] += f" (Mistral indisponible : {e})"
            return result

    return _rule_based_narrative(tx_input, mars_result)
