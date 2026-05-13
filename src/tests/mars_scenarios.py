"""
Suite de tests scénarisés pour MARS — Multi-Agent Reasoning System.
Teste les limites, les zones grises et les cas adversariaux du pipeline.

Usage : python -m src.tests.mars_scenarios [--api http://localhost:8000] [--verbose]

Catégories :
  FRAUDE_EVIDENTE    — le système DOIT bloquer
  LEGITIME_EVIDENT   — le système DOIT approuver
  ZONE_GRISE         — investigation attendue (score 0.40–0.70)
  ADVERSARIAL        — cas conçus pour tromper le modèle
  COLD_START         — compte inconnu ou sans historique
  LIMITE_MONTANT     — tests aux seuils de montant
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import requests

API = "http://localhost:8000"

# ── Comptes réels du dataset (UUID complets) ──────────────────────────────────
RETRAITE_FRAUDE  = "a772e490-a369-46bb-b1d6-7b1f9edd4ace"   # moy 52$/tx, Provigo/Super C
ETUDIANT_FRAUDE  = "3b0699f3-d952-4f62-9abb-5faa7ca34728"   # moy 40$/tx, Netflix/Telus
ENTREPRISE_CLEAN = "4b84d554-e4ac-4ec9-8ebb-b9c4000e6fff"   # moy 698$/tx, AWS/CDW
FAMILLE_CLEAN    = "294403f0-ff13-4333-8035-917864b6472e"   # moy 242$/tx, McDo/Rona
ETUDIANT_CLEAN   = "1ed669ea-f79f-47e4-ba3e-146e296231c5"   # moy 28$/tx, Netflix/Maxi


# ── Définition d'un scénario ──────────────────────────────────────────────────

@dataclass
class Scenario:
    id:           str
    nom:          str
    description:  str
    categorie:    str       # FRAUDE_EVIDENTE | LEGITIME_EVIDENT | ZONE_GRISE | ADVERSARIAL | COLD_START | LIMITE_MONTANT
    difficulte:   str       # FACILE | MOYEN | DIFFICILE
    transaction:  dict      # champs pour POST /analyze
    decision_attendue: str  # BLOCK | INVESTIGATE | APPROVE
    agent_attendu: str      # agent qui devrait tirer le score le plus haut
    rationale:    str       # pourquoi ce cas est intéressant
    tags:         list[str] = field(default_factory=list)


# ── Scénarios ─────────────────────────────────────────────────────────────────

SCENARIOS: list[Scenario] = [

    # ════════════════════════════════════════════════════════════
    # FRAUDES ÉVIDENTES — le système doit bloquer
    # ════════════════════════════════════════════════════════════

    Scenario(
        id="F01",
        nom="Test de carte — micro-transactions en rafale",
        description=(
            "Étudiant (moy 40$) : 1.00$ chez Amazon Prime à 3h du matin. "
            "Test classique pour vérifier si une carte volée est encore active."
        ),
        categorie="FRAUDE_EVIDENTE",
        difficulte="FACILE",
        transaction={
            "account_id": ETUDIANT_FRAUDE,
            "montant":    1.00,
            "commercant": "Amazon Prime",
            "device":     "mobile",
            "timestamp":  "2026-05-08T03:14:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="Heure nocturne + montant anormalement bas + nouveau marchand = score_anomalie_tx élevé.",
        tags=["test_carte", "heure_nocturne", "montant_anormal"],
    ),

    Scenario(
        id="F02",
        nom="Prise de compte — montant 20x la moyenne",
        description=(
            "Retraitée (moy 52$) : virement e-Transfer de 1 050$ depuis un nouvel appareil. "
            "Schéma classique de prise de compte — accès nouveau device, gros montant."
        ),
        categorie="FRAUDE_EVIDENTE",
        difficulte="FACILE",
        transaction={
            "account_id": RETRAITE_FRAUDE,
            "montant":    1050.00,
            "commercant": "Virement e-Transfer",
            "device":     "desktop",
            "timestamp":  "2026-05-08T02:30:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="Nouveau device + heure nocturne + montant 20x la moyenne + marchand inhabituell.",
        tags=["prise_de_compte", "nouveau_device", "virement"],
    ),

    Scenario(
        id="F03",
        nom="Carte volée — achat high-value tech",
        description=(
            "Étudiant (moy 40$) : Best Buy 850$ depuis une tablette inconnue à 22h. "
            "Les fraudeurs achètent des articles revendables (électronique) rapidement."
        ),
        categorie="FRAUDE_EVIDENTE",
        difficulte="FACILE",
        transaction={
            "account_id": ETUDIANT_FRAUDE,
            "montant":    850.00,
            "commercant": "Best Buy",
            "device":     "tablette",
            "timestamp":  "2026-05-08T22:50:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="Montant 21x la moyenne + nouveau device + heure tardive + marchand inconnu.",
        tags=["carte_volee", "electronique", "nouveau_device"],
    ),

    Scenario(
        id="F04",
        nom="Structuration — virement juste sous le seuil de déclaration",
        description=(
            "Entreprise (moy 698$) : virement e-Transfer de 9 999$ à 23h58. "
            "Structuration : montant juste sous 10 000$ pour éviter les rapports réglementaires."
        ),
        categorie="FRAUDE_EVIDENTE",
        difficulte="MOYEN",
        transaction={
            "account_id": ENTREPRISE_CLEAN,
            "montant":    9999.00,
            "commercant": "Virement e-Transfer",
            "device":     "desktop",
            "timestamp":  "2026-05-08T23:58:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="Montant 14x la moyenne + heure nocturne + virement (signal structuration).",
        tags=["structuration", "virement", "seuil_reglementaire"],
    ),

    Scenario(
        id="F05",
        nom="Voyage frauduleux — acheteur fantôme Air Canada",
        description=(
            "Retraitée (moy 52$, marchands : Provigo/Super C) : billet Air Canada 1 200$ "
            "depuis un desktop jamais utilisé. Fraude typique sur cartes de retraités."
        ),
        categorie="FRAUDE_EVIDENTE",
        difficulte="MOYEN",
        transaction={
            "account_id": RETRAITE_FRAUDE,
            "montant":    1200.00,
            "commercant": "Air Canada",
            "device":     "desktop",
            "timestamp":  "2026-05-08T01:15:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="Profil vulnérable (retraite) + montant 23x + nouveau device + heure nocturne.",
        tags=["carte_volee", "voyage", "profil_vulnerable"],
    ),

    # ════════════════════════════════════════════════════════════
    # LÉGITIMES ÉVIDENTS — le système doit approuver
    # ════════════════════════════════════════════════════════════

    Scenario(
        id="L01",
        nom="Achat habituel — épicerie dans la moyenne",
        description=(
            "Famille (moy 242$) : Super C 45$ depuis mobile habituel en soirée. "
            "Transaction parfaitement normale — sous la moyenne, marchand connu."
        ),
        categorie="LEGITIME_EVIDENT",
        difficulte="FACILE",
        transaction={
            "account_id": FAMILLE_CLEAN,
            "montant":    45.00,
            "commercant": "McDonald's",
            "device":     "mobile",
            "timestamp":  "2026-05-08T18:30:00",
        },
        decision_attendue="APPROVE",
        agent_attendu="baseline",
        rationale="Montant dans la moyenne, marchand habituel, device connu, heure normale.",
        tags=["transaction_normale", "marchand_habituel"],
    ),

    Scenario(
        id="L02",
        nom="Achat pro courant — entreprise tech",
        description=(
            "Entreprise (moy 698$) : AWS 650$ depuis desktop habituel en journée. "
            "Achat parfaitement cohérent avec le profil professionnel."
        ),
        categorie="LEGITIME_EVIDENT",
        difficulte="FACILE",
        transaction={
            "account_id": ENTREPRISE_CLEAN,
            "montant":    650.00,
            "commercant": "AWS",
            "device":     "desktop",
            "timestamp":  "2026-05-08T10:00:00",
        },
        decision_attendue="APPROVE",
        agent_attendu="baseline",
        rationale="Montant dans la moyenne, AWS est le marchand principal de ce compte.",
        tags=["transaction_normale", "professionnel"],
    ),

    Scenario(
        id="L03",
        nom="Étudiant — abonnement mensuel normal",
        description=(
            "Étudiant (moy 28$) : Netflix 17$ depuis mobile en soirée. "
            "Paiement récurrent prévisible, parfaitement dans le profil."
        ),
        categorie="LEGITIME_EVIDENT",
        difficulte="FACILE",
        transaction={
            "account_id": ETUDIANT_CLEAN,
            "montant":    17.00,
            "commercant": "Netflix",
            "device":     "mobile",
            "timestamp":  "2026-05-08T20:00:00",
        },
        decision_attendue="APPROVE",
        agent_attendu="baseline",
        rationale="Montant sous la moyenne, Netflix est le marchand principal, mobile habituel.",
        tags=["abonnement", "recurrent", "etudiant"],
    ),

    # ════════════════════════════════════════════════════════════
    # ZONES GRISES — investigation attendue
    # ════════════════════════════════════════════════════════════

    Scenario(
        id="G01",
        nom="Achat légèrement élevé — nouveau marchand plausible",
        description=(
            "Famille (moy 242$) : IKEA 480$ depuis mobile connu en fin de semaine. "
            "Montant 2x la moyenne mais plausible (achat maison), marchand inconnu."
        ),
        categorie="ZONE_GRISE",
        difficulte="MOYEN",
        transaction={
            "account_id": FAMILLE_CLEAN,
            "montant":    480.00,
            "commercant": "IKEA",
            "device":     "mobile",
            "timestamp":  "2026-05-09T14:00:00",  # samedi
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="baseline",
        rationale="2x la moyenne + nouveau marchand, mais device connu + heure normale + profil famille cohérent.",
        tags=["zone_grise", "nouveau_marchand", "montant_modere"],
    ),

    Scenario(
        id="G02",
        nom="Voyage d'affaires — montant normal mais tout est nouveau",
        description=(
            "Entreprise (moy 698$) : hôtel Marriott 550$ depuis tablette inconnue. "
            "Montant dans la norme, mais device inconnu + marchand inconnu = signal mixed."
        ),
        categorie="ZONE_GRISE",
        difficulte="MOYEN",
        transaction={
            "account_id": ENTREPRISE_CLEAN,
            "montant":    550.00,
            "commercant": "Marriott",
            "device":     "tablette",
            "timestamp":  "2026-05-08T16:00:00",
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="baseline",
        rationale="Montant raisonnable pour le profil, mais device + marchand inconnus créent de l'incertitude.",
        tags=["voyage_affaires", "nouveau_device", "zone_grise"],
    ),

    Scenario(
        id="G03",
        nom="Retraité — achat inhabituel mais justifiable",
        description=(
            "Retraitée (moy 52$, profil vulnérable) : Apple Store 299$ depuis mobile connu. "
            "Achat plausible (nouvel appareil) mais 6x la moyenne pour ce profil fragile."
        ),
        categorie="ZONE_GRISE",
        difficulte="DIFFICILE",
        transaction={
            "account_id": RETRAITE_FRAUDE,
            "montant":    299.00,
            "commercant": "Apple Store",
            "device":     "mobile",
            "timestamp":  "2026-05-08T11:30:00",
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="baseline",
        rationale="6x la moyenne + profil vulnérable (retraite) + nouveau marchand. Légitime mais risqué.",
        tags=["profil_vulnerable", "zone_grise", "montant_eleve"],
    ),

    # ════════════════════════════════════════════════════════════
    # ADVERSARIAL — conçus pour tromper MARS
    # ════════════════════════════════════════════════════════════

    Scenario(
        id="A01",
        nom="Fraude discrète — montant dans la moyenne",
        description=(
            "Étudiant (moy 40$) : 38$ chez Amazon Prime à 3h du matin depuis device inconnu. "
            "Fraudeur prudent : montant normal pour passer sous les radars comportementaux."
        ),
        categorie="ADVERSARIAL",
        difficulte="DIFFICILE",
        transaction={
            "account_id": ETUDIANT_FRAUDE,
            "montant":    38.00,
            "commercant": "Amazon Prime",
            "device":     "tablette",
            "timestamp":  "2026-05-08T03:30:00",
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="baseline",
        rationale=(
            "Montant dans la moyenne (piège comportemental), mais heure nocturne + nouveau device. "
            "Un fraudeur sophistiqué copie le montant moyen du compte."
        ),
        tags=["adversarial", "fraude_discrete", "heure_nocturne"],
    ),

    Scenario(
        id="A02",
        nom="Faux positif — grand achat légitime d'un entrepreneur",
        description=(
            "Entreprise (moy 698$) : Dell 1 750$ depuis desktop habituel en semaine. "
            "Achat tout à fait normal pour ce profil — mais le montant élevé peut déclencher une alerte."
        ),
        categorie="ADVERSARIAL",
        difficulte="MOYEN",
        transaction={
            "account_id": ENTREPRISE_CLEAN,
            "montant":    1750.00,
            "commercant": "Dell",
            "device":     "desktop",
            "timestamp":  "2026-05-08T09:00:00",
        },
        decision_attendue="APPROVE",
        agent_attendu="baseline",
        rationale=(
            "2.5x la moyenne pour un entrepreneur tech qui achète du matériel. "
            "Faux positif classique — le modèle devrait peser le profil avant de bloquer."
        ),
        tags=["faux_positif", "professionnel", "materiel_info"],
    ),

    Scenario(
        id="A03",
        nom="Contradiction agents — graph suspect, baseline OK",
        description=(
            "Compte propre (famille) : McDonald's 25$ depuis mobile, mais ce compte "
            "partage le même device avec des comptes frauduleux connus dans les GNN. "
            "Baseline dira OK, G1/G2 diront suspect."
        ),
        categorie="ADVERSARIAL",
        difficulte="DIFFICILE",
        transaction={
            "account_id": FAMILLE_CLEAN,
            "montant":    25.00,
            "commercant": "McDonald's",
            "device":     "mobile",
            "timestamp":  "2026-05-08T12:15:00",
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="g1_device",
        rationale=(
            "Transaction comportementalement normale (sous la moyenne, marchand habituel) "
            "mais le graphe G1 peut détecter la contamination réseau. "
            "Test de la capacité de MARS à détecter les contradictions."
        ),
        tags=["contradiction_agents", "reseau_contamination", "adversarial"],
    ),

    Scenario(
        id="A04",
        nom="Heure suspecte — achat plausible à 4h du matin",
        description=(
            "Famille (moy 242$) : Tim Hortons 8$ depuis mobile à 4h15 du matin. "
            "Travailleur de nuit ? L'heure est suspecte mais le montant est minime."
        ),
        categorie="ADVERSARIAL",
        difficulte="DIFFICILE",
        transaction={
            "account_id": FAMILLE_CLEAN,
            "montant":    8.00,
            "commercant": "Tim Hortons",
            "device":     "mobile",
            "timestamp":  "2026-05-08T04:15:00",
        },
        decision_attendue="APPROVE",
        agent_attendu="baseline",
        rationale=(
            "Heure nocturne (flag) mais montant très faible + Tim Hortons est habituel. "
            "Le modèle ne devrait pas bloquer un café de 8$ à cause de l'heure."
        ),
        tags=["heure_suspecte", "montant_minime", "faux_positif_potentiel"],
    ),

    # ════════════════════════════════════════════════════════════
    # COLD START — compte inconnu
    # ════════════════════════════════════════════════════════════

    Scenario(
        id="C01",
        nom="Compte inconnu — transaction normale",
        description=(
            "Compte absent du dataset : 45$ chez Tim Hortons depuis mobile. "
            "Sans historique, le modèle doit être prudent mais ne pas bloquer automatiquement."
        ),
        categorie="COLD_START",
        difficulte="MOYEN",
        transaction={
            "account_id": None,
            "montant":    45.00,
            "commercant": "Tim Hortons",
            "device":     "mobile",
            "timestamp":  "2026-05-08T08:30:00",
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="baseline",
        rationale=(
            "Sans historique, tous les marchands et devices sont 'nouveaux'. "
            "Le score d'anomalie monte mécaniquement même pour une transaction inoffensive."
        ),
        tags=["cold_start", "compte_inconnu"],
    ),

    Scenario(
        id="C02",
        nom="Compte inconnu — gros montant suspect",
        description=(
            "Compte absent du dataset : virement e-Transfer 3 500$ à 2h du matin. "
            "Sans historique + montant élevé + heure nocturne = doit bloquer."
        ),
        categorie="COLD_START",
        difficulte="FACILE",
        transaction={
            "account_id": None,
            "montant":    3500.00,
            "commercant": "Virement e-Transfer",
            "device":     "mobile",
            "timestamp":  "2026-05-08T02:00:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="Cold-start + montant très élevé + heure nocturne = tous les signaux au rouge.",
        tags=["cold_start", "virement", "heure_nocturne"],
    ),

    # ════════════════════════════════════════════════════════════
    # LIMITES MONTANT — tests aux seuils
    # ════════════════════════════════════════════════════════════

    Scenario(
        id="M01",
        nom="Montant exactement à 2 écarts-types",
        description=(
            "Étudiant (moy 28$, std 10$) : achat de 48$ — exactement à la limite de "
            "montant_anormal = mean + 2*std. Test de la sensibilité du seuil."
        ),
        categorie="LIMITE_MONTANT",
        difficulte="DIFFICILE",
        transaction={
            "account_id": ETUDIANT_CLEAN,
            "montant":    48.00,   # ~moy(28) + 2*std(10) = 48
            "commercant": "Netflix",
            "device":     "mobile",
            "timestamp":  "2026-05-08T20:00:00",
        },
        decision_attendue="APPROVE",
        agent_attendu="baseline",
        rationale=(
            "À la limite exacte du seuil montant_anormal. "
            "Test si le modèle est trop ou pas assez sensible à cette frontière."
        ),
        tags=["seuil", "montant_limite", "sensibilite_modele"],
    ),

    Scenario(
        id="M02",
        nom="Montant centimes — 0.01$",
        description=(
            "Famille : transaction de 1 centime chez Amazon Prime. "
            "Test de carte extrême — vérification qu'une carte est valide sans dépenser."
        ),
        categorie="LIMITE_MONTANT",
        difficulte="FACILE",
        transaction={
            "account_id": FAMILLE_CLEAN,
            "montant":    0.01,
            "commercant": "Amazon Prime",
            "device":     "mobile",
            "timestamp":  "2026-05-08T14:00:00",
        },
        decision_attendue="BLOCK",
        agent_attendu="baseline",
        rationale="0.01$ est anormalement bas par rapport à n'importe quel historique — test de carte évident.",
        tags=["test_carte", "montant_minimal", "amazon"],
    ),

    Scenario(
        id="M03",
        nom="Très gros montant — achat entreprise plausible",
        description=(
            "Entreprise (moy 698$) : achat Dell 15 000$ (serveurs) depuis desktop habituel. "
            "21x la moyenne mais cohérent avec un profil entreprise tech en croissance."
        ),
        categorie="LIMITE_MONTANT",
        difficulte="DIFFICILE",
        transaction={
            "account_id": ENTREPRISE_CLEAN,
            "montant":    15000.00,
            "commercant": "Dell",
            "device":     "desktop",
            "timestamp":  "2026-05-08T10:30:00",
        },
        decision_attendue="INVESTIGATE",
        agent_attendu="baseline",
        rationale=(
            "21x la moyenne mérite investigation, mais device connu + heure normale + "
            "marchand plausible pour ce profil. Un analyste humain doit trancher."
        ),
        tags=["gros_montant", "professionnel", "limite_superieure"],
    ),
]


# ── Runner ────────────────────────────────────────────────────────────────────

DECISION_COLOR = {"BLOCK": "\033[91m", "INVESTIGATE": "\033[93m", "APPROVE": "\033[92m"}
RESET          = "\033[0m"
BOLD           = "\033[1m"


def run_scenario(s: Scenario, api: str, verbose: bool = False) -> dict:
    try:
        r = requests.post(
            f"{api}/analyze",
            json=s.transaction,
            timeout=10,
        )
        r.raise_for_status()
        res = r.json()
    except Exception as e:
        return {"scenario_id": s.id, "error": str(e), "passed": False}

    decision   = res["decision"]
    score      = res["score_mars"]
    passed     = decision == s.decision_attendue
    agents     = res["agent_scores"]
    dominant_agent = max(agents, key=lambda k: agents[k])

    result = {
        "scenario_id":     s.id,
        "nom":             s.nom,
        "categorie":       s.categorie,
        "difficulte":      s.difficulte,
        "decision":        decision,
        "decision_attendue": s.decision_attendue,
        "score_mars":      score,
        "agent_scores":    agents,
        "dominant_agent":  dominant_agent,
        "risk_factors":    res["risk_factors"],
        "passed":          passed,
        "contradiction":   res["contradiction"],
    }

    color  = DECISION_COLOR.get(decision, "")
    status = f"{BOLD}✓ PASS{RESET}" if passed else f"{BOLD}\033[91m✗ FAIL{RESET}"
    print(
        f"  [{s.id}] {s.nom[:50]:<50} "
        f"{color}{decision:<12}{RESET} "
        f"score={score:.2f}  {status}"
    )
    if not passed or verbose:
        print(f"         Attendu: {s.decision_attendue}  |  Facteurs: {res['risk_factors']}")
        if verbose and res.get("account_context"):
            ctx = res["account_context"]
            print(f"         Compte: {ctx.get('prenom')} {ctx.get('nom')} | moy={ctx.get('montant_moyen')}$ | arch={ctx.get('archetype')}")

    return result


def print_summary(results: list[dict]) -> None:
    total  = len(results)
    passed = sum(1 for r in results if r.get("passed"))
    failed = [r for r in results if not r.get("passed") and "error" not in r]
    errors = [r for r in results if "error" in r]

    print(f"\n{'═'*70}")
    print(f"{BOLD}RÉSULTATS MARS — Suite de scénarios{RESET}")
    print(f"{'═'*70}")
    print(f"  Total   : {total}")
    print(f"  Passés  : {BOLD}\033[92m{passed}{RESET}")
    print(f"  Échoués : {BOLD}\033[91m{total - passed - len(errors)}{RESET}")
    if errors:
        print(f"  Erreurs : {BOLD}\033[91m{len(errors)}{RESET}")

    print(f"\n{'─'*70}")
    print(f"  {BOLD}Par catégorie :{RESET}")
    cats: dict[str, list] = {}
    for r in results:
        cats.setdefault(r.get("categorie", "?"), []).append(r)
    for cat, items in sorted(cats.items()):
        ok = sum(1 for i in items if i.get("passed"))
        print(f"    {cat:<25} {ok}/{len(items)}")

    if failed:
        print(f"\n{'─'*70}")
        print(f"  {BOLD}Scénarios échoués :{RESET}")
        for r in failed:
            print(
                f"    [{r['scenario_id']}] {r['nom'][:45]:<45} "
                f"obtenu={r['decision']} attendu={r['decision_attendue']} "
                f"score={r['score_mars']:.2f}"
            )

    print(f"\n{'─'*70}")
    print(f"  {BOLD}Scores moyens par décision :{RESET}")
    for dec in ["BLOCK", "INVESTIGATE", "APPROVE"]:
        group = [r["score_mars"] for r in results if r.get("decision") == dec]
        if group:
            print(f"    {dec:<12} {sum(group)/len(group):.3f}  (n={len(group)})")

    print(f"{'═'*70}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="MARS — Suite de tests scénarisés")
    parser.add_argument("--api",     default=API,   help="URL de l'API (défaut: http://localhost:8000)")
    parser.add_argument("--verbose", action="store_true", help="Affiche le détail de chaque scénario")
    parser.add_argument("--cat",     default=None,  help="Filtre par catégorie (ex: FRAUDE_EVIDENTE)")
    parser.add_argument("--id",      default=None,  help="Exécute un seul scénario (ex: F01)")
    parser.add_argument("--output",  default="reports/scenario_results.json", help="Fichier de sortie JSON")
    args = parser.parse_args()

    # Vérification API
    try:
        requests.get(f"{args.api}/health", timeout=3).raise_for_status()
    except Exception:
        print(f"\033[91mErreur : API non disponible à {args.api}\033[0m")
        print("Démarrez l'API avec : uvicorn src.api.main:app --port 8000")
        sys.exit(1)

    scenarios = SCENARIOS
    if args.id:
        scenarios = [s for s in scenarios if s.id == args.id.upper()]
    elif args.cat:
        scenarios = [s for s in scenarios if s.categorie == args.cat.upper()]

    print(f"\n{BOLD}MARS Scenario Tester — {len(scenarios)} scénario(s){RESET}")
    print(f"API : {args.api}\n")

    cats_seen: set[str] = set()
    results: list[dict] = []
    for s in scenarios:
        if s.categorie not in cats_seen:
            cats_seen.add(s.categorie)
            print(f"\n{BOLD}{'─'*70}")
            print(f"  {s.categorie}")
            print(f"{'─'*70}{RESET}")
        result = run_scenario(s, args.api, args.verbose)
        results.append(result)
        time.sleep(0.1)  # ne pas spammer l'API

    print_summary(results)

    import os
    os.makedirs("reports", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({
            "run_at":    datetime.now().isoformat(),
            "api":       args.api,
            "total":     len(results),
            "passed":    sum(1 for r in results if r.get("passed")),
            "scenarios": results,
        }, f, ensure_ascii=False, indent=2)
    print(f"Résultats sauvegardés → {args.output}")


if __name__ == "__main__":
    main()
