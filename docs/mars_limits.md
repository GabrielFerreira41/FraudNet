# Limites connues de MARS

**Version évaluée :** Sprint 5 — 5 agents (Baseline + Séquence + G1/G2/G3)  
**Date :** 2026-05-13  
**Suite de tests :** `src/tests/mars_scenarios.py` — 20 scénarios, **11/20 passés (55%)**

---

## Résumé par catégorie

| Catégorie | Score | Détail |
|---|---|---|
| FRAUDE_EVIDENTE | 4/5 | Échec sur structuration financière |
| LEGITIME_EVIDENT | 3/3 | Aucun faux positif évident |
| ZONE_GRISE | 1/3 | Sur/sous-détection sur comptes contaminés |
| ADVERSARIAL | 0/4 | Catégorie la plus problématique |
| COLD_START | 1/2 | Trop agressif sans historique |
| LIMITE_MONTANT | 2/3 | Montants bas non détectés |

---

## Limite 1 — Contamination GNN permanente par compte

**Scénarios concernés :** G03, A01  
**Comportement :** Les comptes ayant eu des fraudes dans leur historique reçoivent des scores GNN (G1/G2/G3) proches de 1.0 de façon permanente. Toute transaction sur ces comptes est bloquée, même une transaction comportementalement normale.

**Exemple :**
- G03 : Retraitée, Apple Store 299 $ (device connu, 11h30) → BLOCK 1.00
  - `g1_device=1.0, g2_merchant=1.0, g3_temporal=1.0`
- A01 : Étudiant, Amazon 38 $ (heure nocturne) → BLOCK 1.00 alors qu'INVESTIGATE était attendu

**Cause racine :** Les scores GNN sont agrégés au niveau du **compte** (`max` sur toutes ses transactions historiques) dans `precompute.py`. Un compte qui a déjà commis une fraude garde un score maximum à vie.

**Impact production :** Taux de faux positifs élevé sur les comptes réhabilités ou sur les comptes partagés (famille, entreprise).

**Piste d'amélioration :**
- Pondérer les scores GNN par un facteur de décroissance temporelle (`exp(-Δt / T_decay)`)
- Calculer le score GNN au niveau de la **transaction** plutôt qu'au niveau du compte
- Introduire un score de "réhabilitation" après N transactions légitimes consécutives

---

## Limite 2 — Cold start trop agressif

**Scénario concerné :** C01  
**Comportement :** Un compte inconnu (absent du dataset) reçoit automatiquement un score de 0.82 quelle que soit la transaction, déclenchant BLOCK.

**Exemple :**
- C01 : Compte inconnu, Tim Hortons 45 $, mobile, 8h30 → BLOCK 0.82
  - `baseline=1.0, g1_device=0.5, g2_merchant=0.5, g3_temporal=0.5`

**Cause racine :** Sans historique, toutes les features comportementales sont à leur valeur maximale d'anomalie (`nouveau_commercant=True`, `nouveau_device=True`, `ratio_montant` basé sur la médiane globale). Le baseline LightGBM, entraîné sur un dataset où ces combinaisons sont associées à la fraude, sort un score de 1.0.

**Impact production :** Tous les nouveaux clients seraient bloqués à leur première transaction, même pour des achats banaux.

**Piste d'amélioration :**
- Appliquer un score plancher différent selon l'absence d'historique (`cold_start_flag`)
- Utiliser des priors basés sur le profil démographique (archetype, ville) pour initialiser les features
- Passer la décision cold start à INVESTIGATE plutôt que de laisser le baseline décider seul

---

## Limite 3 — Montants anormalement bas non détectés

**Scénario concerné :** M02  
**Comportement :** Une transaction de 0.01 $ (test de carte classique) n'est pas bloquée — INVESTIGATE à 0.58 seulement.

**Exemple :**
- M02 : Famille (moy 242 $), Amazon Prime 0.01 $, mobile → INVESTIGATE 0.58
  - `baseline=1.0` mais score final insuffisant pour BLOCK

**Cause racine :** La feature `montant_anormal` est définie comme `montant > mean + 2×std`. Elle ne flag **pas** les montants anormalement bas. Un montant de 0.01 $ passe sous le radar comportemental car il est simplement "petit", pas "au-dessus du seuil".

**Impact production :** Les tests de carte (transactions de 1 $ ou moins pour vérifier la validité d'une carte volée) ne sont pas détectés de façon fiable.

**Piste d'amélioration :**
- Ajouter `montant_trop_bas = montant < seuil_minimal_categorie` (ex: < 1 $ pour la plupart des marchands)
- Créer une feature `ratio_montant_inverse` pour détecter les montants anormalement faibles
- Règle métier explicite : montant < 1 $ chez un marchand non-caritatif → score_anomalie += 2

---

## Limite 4 — `heure_inhabituelle` pèse trop lourd indépendamment du montant

**Scénario concerné :** A04  
**Comportement :** Un café de 8 $ à 4h15 du matin déclenche INVESTIGATE au lieu d'APPROVE.

**Exemple :**
- A04 : Famille, Tim Hortons 8 $, mobile, 4h15 → INVESTIGATE 0.58
  - `baseline=1.0` à cause de `heure_inhabituelle=True` + `nouveau_device=True`

**Cause racine :** Le LightGBM a appris que `heure_inhabituelle=True` est un fort prédicteur de fraude dans les données d'entraînement, indépendamment du montant. Il n'y a pas d'interaction apprise entre `heure_inhabituelle` et `montant` pour les très petits montants.

**Impact production :** Les travailleurs de nuit, livreurs et autres profils avec des horaires atypiques génèrent beaucoup de faux positifs.

**Piste d'amélioration :**
- Ajouter une feature d'interaction `heure_x_montant_ratio` pour contextualiser l'heure par rapport au montant
- Pondérer `heure_inhabituelle` par `ratio_montant` : une heure suspecte sur un petit montant devrait compter moins
- Entraîner le modèle avec plus d'exemples légitimes nocturnes à petit montant

---

## Limite 5 — Structuration financière non détectée

**Scénario concerné :** F04  
**Comportement :** Un virement de 9 999 $ (juste sous le seuil réglementaire de 10 000 $) n'est pas bloqué mais seulement mis en investigation (0.59).

**Exemple :**
- F04 : Entreprise (moy 698 $), Virement e-Transfer 9 999 $, desktop, 23h58 → INVESTIGATE 0.59
  - `baseline=1.0, g1_device=0.0, g2_merchant=0.08, g3_temporal=0.15`

**Cause racine :** MARS repose entièrement sur des patterns statistiques comportementaux. La structuration est une fraude **réglementaire** définie par une règle métier (montant < 10 000 $ pour éviter les déclarations FINTRAC/FinCEN). Sans règle explicite, le modèle voit un montant élevé mais pas de contamination réseau (compte propre), ce qui plafonne le score à 0.59.

**Impact production :** La structuration par fragmentation (plusieurs virements de 9 999 $ sur plusieurs jours) ne serait pas non plus détectée par MARS tel qu'il est.

**Piste d'amélioration :**
- Couche de règles métier **en amont** du score ML pour les seuils réglementaires connus
- Feature `montant_proche_seuil_reglementaire = abs(montant - 10000) < 500`
- Détecter la structuration multi-transactions : somme des virements sur 7 jours > 10 000 $

---

## Limite 6 — Insensibilité au nouveau device seul (sans anomalie de montant)

**Scénario concerné :** G02  
**Comportement :** Un nouveau device sur une transaction dans la moyenne du compte n'est pas suffisant pour déclencher INVESTIGATE.

**Exemple :**
- G02 : Entreprise (moy 698 $), Marriott 550 $, tablette inconnue → APPROVE 0.03
  - `baseline=0.0, g1_device=0.0, g2_merchant=0.08, g3_temporal=0.15`

**Cause racine :** Le baseline a appris que `nouveau_device=True` seul, sans autres signaux, n'est pas un fort prédicteur sur les données d'entraînement. Pour un compte entreprise où le montant est **sous** la moyenne, le modèle donne APPROVE.

**Impact production :** Une prise de compte sur un profil à montants élevés (entreprise, professionnel) peut passer inaperçue si le fraudeur maintient les montants habituels.

**Piste d'amélioration :**
- Augmenter le poids de `nouveau_device` dans les features ou via une règle de seuil minimum (score ≥ 0.40 si `nouveau_device=True`)
- Croiser `nouveau_device` avec `nouveau_commercant` pour créer un signal combiné plus fort

---

## Tableau récapitulatif

| ID | Limite | Sévérité | Faisabilité du fix |
|---|---|---|---|
| L1 | Contamination GNN permanente | Haute | Moyenne (refonte precompute) |
| L2 | Cold start trop agressif | Haute | Facile (règle de plancher) |
| L3 | Montants bas non détectés | Moyenne | Facile (nouvelle feature) |
| L4 | Heure vs montant non contextualisés | Faible | Moyenne (feature interaction) |
| L5 | Structuration réglementaire | Moyenne | Facile (règle métier explicite) |
| L6 | Nouveau device seul insuffisant | Faible | Facile (seuil minimum) |

---

## Ce que MARS détecte bien

Pour contrebalancer, les catégories où MARS est fiable :

- **Fraudes évidentes multi-signaux** (montant × heure × device × marchand) → détection quasi-parfaite (score 1.00)
- **Transactions légitimes typiques** → aucun faux positif sur les 3 cas testés (scores 0.01–0.03)
- **Zone grise avec montant seul** (M03 : 15 000 $ entreprise) → INVESTIGATE correct
- **Test de carte à heure nocturne** (F01) → BLOCK 1.00

---

*Généré à partir de `reports/scenario_results.json` — run du 2026-05-13*
