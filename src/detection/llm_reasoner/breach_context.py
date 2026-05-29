"""
BreachContext — enrichit le contexte LLM avec les fuites financières mondiales.

Mappe les incidents breach vers les types de fraude canadiens du dataset synthétique,
calcule un threat_score de pertinence, et produit un bloc textuel prêt à injecter
dans le prompt système de Mistral (Agent 5).
"""
from __future__ import annotations
from typing import Any

# Affinité breach_type → fraud_type canadien (MARS taxonomy)
_TYPE_AFFINITY: dict[str, list[str]] = {
    "credential_leak":        ["prise_de_compte", "test_carte"],
    "card_data_theft":        ["carte_volee",      "test_carte"],
    "phishing":               ["prise_de_compte"],
    "unauthorized_access":    ["prise_de_compte"],
    "insider":                ["carte_volee",      "prise_de_compte"],
    "cloud_misconfiguration": ["prise_de_compte",  "carte_volee"],
    "swift_attack":           ["reseau_mules",     "structuration"],
    "atm_skimming":           ["carte_volee"],
    "ransomware":             [],
    "crypto_exchange_hack":   [],
    "unknown":                [],
}

_SEVERITY_WEIGHT = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}


def get_threat_context(
    fraud_type: str | None = None,
    days: int = 60,
) -> dict[str, Any]:
    """
    Retourne le contexte breach pertinent pour une transaction canadienne.

    Pertinence calculée par :
    - Pays Canada → +0.5 ; Global → +0.2 ; autres → +0.1 (risque ambiant)
    - Affinité breach_type × fraud_type MARS → +0.4
    - Pondération par sévérité (critical=1.0 … low=0.2)

    Retourne un dict avec :
      active_breaches : liste des incidents top-5 avec score de pertinence
      threat_score    : float 0-1 (risque agrégé)
      summary         : bloc texte à injecter dans le prompt LLM
    """
    try:
        from src.api.breach_store import get_active_breaches
        all_breaches = get_active_breaches(days=days)
    except Exception:
        return {"active_breaches": [], "threat_score": 0.0, "summary": None}

    if not all_breaches:
        return {"active_breaches": [], "threat_score": 0.0, "summary": None}

    scored: list[dict] = []
    for b in all_breaches:
        geo_score = 0.0
        if b["country"] == "Canada":
            geo_score = 0.5
        elif b["country"] in ("Global", "Unknown"):
            geo_score = 0.2
        else:
            geo_score = 0.1

        affinity_score = 0.0
        if fraud_type:
            if fraud_type in _TYPE_AFFINITY.get(b["breach_type"], []):
                affinity_score = 0.4

        raw = (geo_score + affinity_score) * _SEVERITY_WEIGHT.get(b["severity"], 0.2)
        if raw < 0.03:
            continue

        scored.append({**b, "_relevance": round(raw, 3)})

    scored.sort(key=lambda x: x["_relevance"], reverse=True)
    top5 = scored[:5]

    if not top5:
        return {"active_breaches": [], "threat_score": 0.0, "summary": None}

    threat_score = round(min(1.0, sum(b["_relevance"] for b in top5) / 2.0), 3)

    lines = []
    for b in top5:
        records_txt = f" — {b['records']:,} comptes exposés" if b.get("records", 0) > 0 else ""
        lines.append(
            f"  • [{b['severity'].upper()}] {b['company']} ({b['country']}) "
            f"| {b['breach_type']}{records_txt}\n"
            f"    {b['description'][:120]}  [{b['date']}]"
        )

    affinity_note = ""
    if fraud_type:
        matching = [
            b["company"] for b in top5
            if fraud_type in _TYPE_AFFINITY.get(b["breach_type"], [])
        ]
        if matching:
            affinity_note = (
                f"\n\nIncidents directement liés au type de fraude suspectée "
                f"({fraud_type}) : {', '.join(matching)}."
            )

    summary = (
        f"{len(top5)} incident(s) financier(s) mondial(aux) récents "
        f"(threat_score={threat_score:.2f}) :\n"
        + "\n".join(lines)
        + affinity_note
    )

    return {
        "active_breaches": top5,
        "threat_score":    threat_score,
        "summary":         summary,
    }
