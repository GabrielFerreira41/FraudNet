# Architecture technique — FraudNet

## Vue d'ensemble du système

FraudNet est composé de trois couches principales :

```
┌─────────────────────────────────────────────┐
│           SIMULATEUR BANCAIRE               │
│  profile_generator → transaction_engine     │
│                    → fraud_injector         │
└─────────────────────────┬───────────────────┘
                          │ transactions_labeled.parquet
                          ▼
┌─────────────────────────────────────────────┐
│           FEATURE ENGINEERING               │
│  transaction_features + temporal_features   │
│  + graph_features → features.parquet        │
└─────────────────────────┬───────────────────┘
                          │ features.parquet (31 colonnes)
                          ▼
┌─────────────────────────────────────────────┐
│     MARS — Multi-Agent Reasoning System     │
│  [planifié — voir detection_research.md]    │
└─────────────────────────────────────────────┘
```

---

## Module 1 — Simulateur bancaire

### profile_generator.py
Génère des profils clients synthétiques depuis `data/configs/profiles.yaml`.

**Entrée :** `profiles.yaml` (paramètres des 5 archétypes)
**Sortie :** `accounts.parquet` (1 000 comptes, 21 colonnes)

Chaque compte contient :
- Identité : `account_id`, `prenom`, `nom`, `email`, `telephone`, `date_naissance`
- Géographie : `ville`, `province`, `code_postal`
- Profil financier : `revenu_mensuel`, `montant_moyen_transaction`, `frequence_hebdo`, `solde_initial`
- Comportement : `devices`, `device_principal`, `commercants_habituels`, `horaires_actifs`, `categories_depenses`
- Méta : `date_ouverture`, `est_vulnerabilite` (5% des comptes, ciblés en priorité par l'injecteur)

**Distributions utilisées :**
- Revenus : lognormale (asymétrie réaliste)
- Montants : normale tronquée
- Répartition archétypes : `rng.multinomial` sur les poids du YAML

### transaction_engine.py
Génère un flux de transactions légitimes cohérent avec chaque profil.

**Entrée :** `accounts.parquet`
**Sortie :** `transactions.parquet`

Logique par transaction :
- Timestamp : jour aléatoire dans la semaine + heure tirée des `horaires_actifs` du profil
- Montant : lognormale(μ=log(montant_moyen), σ=0.35) — toujours positif, queue longue réaliste
- Commerçant : 80% dans `commercants_habituels`, 20% nouveau (exploration)
- Device : device principal 85% du temps, secondaire 15%
- Ville : ville d'origine 95%, déplacement 5%

### fraud_injector.py
Injecte 5 scénarios de fraude dans le flux légitime.

**Entrée :** `transactions.parquet` + `accounts.parquet`
**Sortie :** `transactions_labeled.parquet`

Taux par défaut : 3% des comptes ciblés, 60% prioritairement sur les `est_vulnerabilite=True`.

Voir `docs/fraud_scenarios.md` pour le détail de chaque scénario.

---

## Module 2 — Feature engineering

Pipeline orchestré par `feature_pipeline.py` → produit `features.parquet` (31 colonnes).

### transaction_features.py
Features statiques par rapport au profil du compte :

| Feature | Description |
|---|---|
| `ratio_montant` | montant / montant_moyen du profil |
| `montant_anormal` | ratio > 3.0 |
| `nouveau_commercant` | commerçant absent de la liste habituelle |
| `nouveau_device` | device non enregistré sur le compte |
| `heure_inhabituelle` | heure hors des créneaux actifs du profil |
| `score_anomalie_tx` | somme des 4 flags (0–4) |

### temporal_features.py
Features calculées sur l'historique glissant par compte :

| Feature | Description |
|---|---|
| `velocite_1h` | nombre de transactions dans la dernière heure |
| `velocite_24h` | nombre de transactions dans les 24 dernières heures |
| `montant_cumul_1h` | montant total dépensé dans la dernière heure |
| `montant_moy_30tx` | moyenne glissante des 30 dernières transactions |
| `ecart_montant_30tx` | (montant - moy_30tx) / moy_30tx |
| `delta_min_prev_tx` | délai en minutes depuis la transaction précédente |
| `est_rafale` | délai < 5 minutes depuis la transaction précédente |

### graph_features.py
Features dérivées des relations entre entités :

| Feature | Description |
|---|---|
| `n_comptes_par_device` | nombre de comptes distincts ayant utilisé ce device |
| `n_comptes_par_commercant` | nombre de comptes distincts chez ce commerçant |
| `degre_compte` | nombre de commerçants distincts contactés par le compte |
| `device_partage_suspect` | device utilisé par plus de 3 comptes distincts |

---

## Module 3 — Graphe Neo4j

### Modèle de graphe

```
(Account)-[:MADE]------->(Transaction)-[:AT]------>(Merchant)
                                      -[:USING]--->(Device)
                                      -[:IN_CITY]->(City)
(Account)-[:HAS_DEVICE]->(Device)
```

### Noeuds

| Label | Propriétés clés | Cardinalité |
|---|---|---|
| Account | accountId, archetype, ville, revenuMensuel, estVulnerable | 1 000 |
| Transaction | transactionId, montant, timestamp, isFraud, fraudType | 228 661 |
| Merchant | merchantId, categorie | 71 |
| Device | deviceId | 3 |
| City | cityId | 9 |

### Relations

| Type | Cardinalité |
|---|---|
| MADE | 228 661 |
| AT | 228 661 |
| USING | 228 661 |
| IN_CITY | 228 661 |
| HAS_DEVICE | 1 396 |

### Chargement
Le loader `src/graph/neo4j_loader.py` utilise des inserts batch Python (UNWIND, taille 500) — pas de LOAD CSV (bloqué par Neo4j Desktop par défaut).

---

## Module 4 — MARS (planifié)

Voir `docs/detection_research.md`.

---

## Flux de données complet

```
profiles.yaml
    │
    ▼
profile_generator.py ──► accounts.parquet (1 000 comptes)
                                │
                                ▼
              transaction_engine.py ──► transactions.parquet (228 556 tx)
                                                │
                                                ▼
                        fraud_injector.py ──► transactions_labeled.parquet (+105 fraudes)
                                                │
                                                ▼
                      feature_pipeline.py ──► features.parquet (31 features)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
             neo4j_loader.py          [MARS — Sprint 1+]
             (Neo4j Desktop)
```
