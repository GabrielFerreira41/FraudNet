# Pipeline de données — FraudNet

## Vue d'ensemble

```
profiles.yaml → accounts.parquet → transactions_labeled.parquet → features.parquet
                                                                        │
                                                                   neo4j/ (CSVs)
```

Toutes les étapes sont reproductibles via `--seed`. Seed par défaut : `42`.

---

## Étape 1 — Génération des comptes

**Script :** `python -m src.simulator.profile_generator --n 1000 --seed 42`
**Sortie :** `data/generated/accounts.parquet`

### Paramètres (data/configs/profiles.yaml)

5 archétypes avec leurs distributions :

| Archétype | Poids | Revenu mensuel | Montant moyen | Fréquence/sem |
|---|---|---|---|---|
| etudiant | 20% | ~1 800$ | ~35$ | 3–12 |
| jeune_actif | 25% | ~4 200$ | ~75$ | 8–25 |
| famille | 25% | ~7 500$ | ~120$ | 10–30 |
| retraite | 15% | ~3 200$ | ~60$ | 4–14 |
| entreprise | 15% | ~25 000$ | ~850$ | 15–60 |

### Résultat généré (seed=42)

| Archétype | Comptes | Revenu moyen |
|---|---|---|
| famille | 251 | 7 715$/mois |
| jeune_actif | 250 | 4 350$/mois |
| etudiant | 180 | 1 834$/mois |
| retraite | 168 | 3 302$/mois |
| entreprise | 151 | 31 480$/mois |

5% des comptes ont `est_vulnerabilite=True` (ciblés en priorité par l'injecteur).

---

## Étape 2 — Génération des transactions

**Script :** `python -m src.simulator.transaction_engine --weeks 13 --seed 42`
**Sortie :** `data/generated/transactions.parquet`

### Logique de cohérence

Chaque transaction respecte le profil du compte :
- **Montant** : lognormale(μ=log(montant_moyen), σ=0.35) — variance ~30%
- **Horaire** : tiré des `horaires_actifs` du profil (différent semaine/weekend)
- **Commerçant** : 80% dans la liste habituelle, 20% exploration
- **Device** : principal 85%, secondaire 15% (si enregistré)
- **Ville** : ville d'origine 95%, déplacement 5%

### Volume produit (seed=42, 13 semaines)

- 228 556 transactions légitimes
- Période : 2026-02-02 → 2026-05-03
- Toutes `is_fraud=False` à cette étape

---

## Étape 3 — Injection de fraude

**Script :** `python -m src.simulator.fraud_injector --rate 0.03 --seed 42`
**Sortie :** `data/generated/transactions_labeled.parquet`

### Distribution des scénarios

| Scénario | Poids | Comptes ciblés | Transactions injectées |
|---|---|---|---|
| carte_volee | 30% | 9 | 43 |
| test_carte | 25% | 7 | 45 |
| prise_de_compte | 20% | 6 | 6 |
| reseau_mules | 15% | ~4 groupes | 5 |
| structuration | 10% | 3 | 6 |
| **Total** | | | **105** |

Taux de fraude final : **0.05%** (105 / 228 661)

> Note : le taux est volontairement bas pour refléter la réalité bancaire. Le déséquilibre de classes sera géré à l'entraînement (SMOTE, class_weight).

---

## Étape 4 — Feature engineering

**Script :** `python -m src.features.feature_pipeline`
**Sortie :** `data/generated/features.parquet` + `data/generated/neo4j/*.csv`

### 31 features produites

| Groupe | Features |
|---|---|
| Identité | transaction_id, account_id, archetype, timestamp |
| Brutes | montant, commercant, categorie, device, ville_tx, est_weekend, heure, jour_semaine |
| Labels | is_fraud, fraud_type |
| Transactionnelles | ratio_montant, montant_anormal, nouveau_commercant, nouveau_device, heure_inhabituelle, score_anomalie_tx |
| Temporelles | velocite_1h, velocite_24h, montant_cumul_1h, montant_moy_30tx, ecart_montant_30tx, delta_min_prev_tx, est_rafale |
| Graphe | n_comptes_par_device, n_comptes_par_commercant, degre_compte, device_partage_suspect |

### Export Neo4j

9 fichiers CSV pour chargement via `src/graph/neo4j_loader.py` :
- 4 fichiers de noeuds (Account, Merchant, Device, City)
- 5 fichiers de relations (MADE, AT, USING, IN_CITY, HAS_DEVICE)

---

## Régénérer tout depuis zéro

```bash
source venv/bin/activate

python -m src.simulator.profile_generator --n 1000 --seed 42
python -m src.simulator.transaction_engine --weeks 13 --seed 42
python -m src.simulator.fraud_injector     --rate 0.03 --seed 42
python -m src.features.feature_pipeline
python -m src.graph.neo4j_loader           # Neo4j doit être démarré
```

Temps total estimé : ~3 minutes.
