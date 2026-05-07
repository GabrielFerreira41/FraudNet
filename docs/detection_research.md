# Architecture de détection — MARS

## Multi-Agent Reasoning System

### Principe

Au lieu d'un modèle monolithique qui score une transaction isolément, MARS est une équipe d'agents spécialisés qui collaborent. Chaque agent a un angle d'attaque différent. Un Meta-Raisonneur agrège leurs signaux — y compris les **désaccords entre agents**, qui sont eux-mêmes un signal.

Un LLM Raisonneur (asynchrone) produit un rapport narratif lisible par un analyste humain, couvrant le cas de l'explicabilité réglementaire (BSIF, AMF).

---

## Schéma général

```
Transaction entrante
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                    HOT PATH (< 200ms)                 │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Agent Règles │  │ Agent Comport│  │ Agent Graphe│ │
│  │ + LightGBM   │  │ (LSTM)       │  │ (GraphSAGE) │ │
│  │ score: 0–1   │  │ score: 0–1   │  │ score: 0–1  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         └─────────────────┴─────────────────┘        │
│                           │                           │
│                           ▼                           │
│              ┌────────────────────────┐               │
│              │    Meta-Raisonneur     │               │
│              │ • agrégation pondérée  │               │
│              │ • détection contradiction               │
│              │ • score final 0–100   │               │
│              └────────────┬───────────┘               │
│                           │                           │
│              ┌────────────┴───────────┐               │
│              │   Moteur de décision   │               │
│              │ ✅ Approuvé ❌ Bloqué  │               │
│              └────────────────────────┘               │
└───────────────────────────────────────────────────────┘
        │ si score > seuil d'investigation
        ▼
┌───────────────────────────────────────────────────────┐
│              COLD PATH (asynchrone)                   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │            LLM Raisonneur (Claude API)          │  │
│  │  • reçoit fiche contextuelle structurée         │  │
│  │  • produit rapport narratif pour l'analyste     │  │
│  │  • gère le cold-start (nouveaux comptes)        │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

---

## Les agents

### Agent 1 — Baseline (LightGBM)

**Sprint :** 1
**Dossier :** `src/detection/baseline/`

- Entrée : features tabulaires de `features.parquet`
- Features clés : `ratio_montant`, `velocite_1h`, `est_rafale`, `nouveau_device`, `heure_inhabituelle`
- Avantages : rapide, interprétable (SHAP), bonne baseline
- Limites : ne voit pas les séquences ni les relations inter-comptes

**Objectif de performance :** recall > 70%, precision > 60% sur les scénarios `test_carte` et `carte_volee`.

### Agent 2 — Comportemental (LSTM)

**Sprint :** 2
**Dossier :** `src/detection/sequence/`

- Entrée : séquences de N dernières transactions par compte
- Architecture : LSTM bidirectionnel ou Transformer léger
- Avantages : capte les déviations temporelles (structuration, prise de compte)
- Limites : cold-start, pas de signal inter-comptes

**Objectif :** recall supplémentaire de +10–15% sur `structuration` et `prise_de_compte` vs baseline.

### Agent 3 — Graphe (GraphSAGE)

**Sprint :** 3
**Dossier :** `src/detection/graph/`

- Entrée : graphe Neo4j / NetworkX (Account, Transaction, Device, Merchant, City)
- Architecture : GraphSAGE ou GAT
- Avantages : seul agent capable de détecter `reseau_mules`
- Limites : nécessite une masse critique de données relationnelles

**Objectif :** recall > 60% sur `reseau_mules`, F1 global en hausse.

### Meta-Raisonneur

**Sprint :** 4
**Dossier :** `src/detection/fusion/`

Deux rôles :

1. **Agrégation pondérée** — les poids de chaque agent évoluent en fonction de leur précision récente par type de fraude (online learning simple)
2. **Détection de contradiction** — si deux agents sont en désaccord fort (ex: comportemental = 0.1, graphe = 0.9), ce désaccord est lui-même un signal qui peut déclencher l'investigation LLM

Score final = f(score_lgbm, score_lstm, score_gnn, flag_contradiction)

### LLM Raisonneur (async)

**Sprint :** 5
**Dossier :** `src/detection/llm_reasoner/`

- API : Claude (Anthropic SDK)
- Déclenchement : score > seuil d'investigation OU flag_contradiction = True
- Entrée : fiche contextuelle structurée (JSON → prompt)
- Sortie : rapport narratif JSON `{justification, risk_factors, recommended_action, confidence}`

**Gestion du cold-start :** pour les comptes sans historique (< 10 transactions), le LLM raisonne depuis le contexte transactionnel pur sans s'appuyer sur les agents comportemental/graphe.

**Contrainte de latence :** le LLM est asynchrone — il ne bloque pas la décision de scoring. Il produit le rapport pour l'équipe fraude après la décision initiale.

---

## Questions ouvertes

- **Seuil de score** : quel seuil optimise le trade-off recall vs faux positifs ? À calibrer sur les données simulées.
- **Fenêtre temporelle pour la structuration** : 24h, 48h ou 72h ? À évaluer empiriquement.
- **Fréquence de mise à jour des poids du Meta-Raisonneur** : en continu (online) ou par batch quotidien ?
- **Format de la fiche contextuelle pour le LLM** : JSON structuré ou texte libre ? JSON garantit la reproductibilité.
- **Évaluation du LLM Raisonneur** : comment mesurer la qualité du raisonnement narratif ? Annotation humaine ? Cohérence avec le score ML ?

---

## Métriques cibles (Phase 3)

| Métrique | Cible | Note |
|---|---|---|
| Recall global | > 85% | Priorité absolue — une fraude non détectée coûte cher |
| Precision | > 70% | Éviter la paralysie des équipes fraude par les faux positifs |
| Faux positifs | < 5% | Standard bancaire |
| Latence hot path | < 200ms | Agents ML uniquement |
| Couverture scénarios | 100% | Tous les scénarios doivent être détectables |
