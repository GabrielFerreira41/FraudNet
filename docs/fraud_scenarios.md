# Scénarios de fraude — FraudNet

Cinq scénarios sont implémentés dans `src/simulator/fraud_injector.py`.
Taux global configuré via `--rate` (défaut : 3% des comptes ciblés).
60% des cibles sont des comptes `est_vulnerabilite=True`.

---

## 1. Carte volée (`carte_volee`)

**Poids dans la distribution :** 30%

**Description :** Un fraudeur a obtenu les données d'une carte physique (vol, skimming). Il effectue plusieurs achats à montants élevés dans un laps de temps court, dans une ville différente de la ville d'origine du compte.

**Paramètres injectés :**
- 3 à 6 transactions en séquence (intervalle : 5–40 min entre chaque)
- Montant : 3× à 8× le montant moyen habituel du compte
- Commerçant : enseigne de vêtements ou électronique (Best Buy, Zara, Simons...)
- Ville : différente de la ville d'origine
- Device : mobile ou desktop (aléatoire)

**Signaux de détection :**
- `ratio_montant` élevé (> 3)
- `nouveau_commercant = 1`
- `velocite_1h` > 2
- Ville de transaction ≠ ville du compte

**Difficulté :** Moyenne

---

## 2. Test de carte (`test_carte`)

**Poids dans la distribution :** 25%

**Description :** Avant de revendre ou d'utiliser des données de carte volée, le fraudeur vérifie que la carte est active en effectuant des micro-transactions (< 2$) sur des services en ligne. Si elles passent, il effectue un gros achat final.

**Paramètres injectés :**
- 4 à 8 micro-transactions (0.50$ à 2.00$) en quelques minutes
- Commerçants : services de streaming / jeux (Netflix, Steam, Spotify, App Store)
- Device : mobile
- Suivi d'un gros achat final (5× à 12× le montant moyen) chez Best Buy

**Signaux de détection :**
- `est_rafale = 1` sur toutes les micro-transactions
- `velocite_1h` très élevé (4–8)
- Montants anormalement bas puis pic final
- `nouveau_commercant = 1` sur le gros achat

**Difficulté :** Faible — pattern très caractéristique

---

## 3. Prise de compte (`prise_de_compte`)

**Poids dans la distribution :** 20%

**Description :** Un fraudeur prend le contrôle d'un compte existant (phishing, credential stuffing). Il se connecte depuis un nouveau device et effectue immédiatement un gros virement sortant.

**Paramètres injectés :**
- 1 transaction unique
- Device : différent du device principal habituel
- Montant : 10× à 20× le montant moyen du compte
- Commerçant : "Virement e-Transfer"
- Ville : ville différente de l'origine (déplacement géographique suspect)

**Signaux de détection :**
- `nouveau_device = 1`
- `ratio_montant` très élevé (> 10)
- `nouveau_commercant = 1` (si e-Transfer inhabituel)
- Combinaison device inconnu + montant anormal = signal fort

**Difficulté :** Moyenne — signal clair sur le device

---

## 4. Réseau de mules (`reseau_mules`)

**Poids dans la distribution :** 15%

**Description :** Plusieurs comptes "mules" envoient de petits virements vers un compte "collecteur" en rafale sur une courte période. Le collecteur agrège les fonds avant de les exfiltrer.

**Paramètres injectés :**
- Groupes de 3 à 6 comptes mules + 1 collecteur
- Chaque mule envoie 200$ à 900$ vers le même bénéficiaire
- Intervalle : 2–15 minutes entre chaque virement du groupe
- Tous via "Virement e-Transfer", device mobile

**Signaux de détection :**
- Pattern visible uniquement au niveau graphe : N comptes → même cible dans la même fenêtre temporelle
- `device_partage_suspect` peut être élevé si les mules partagent des devices
- Individuellement, chaque transaction semble peu suspecte

**Difficulté :** Élevée — invisible transaction par transaction, nécessite une vue graphe

---

## 5. Structuration (`structuration`)

**Poids dans la distribution :** 10%

**Description :** Fractionnement d'un gros montant en plusieurs virements juste en dessous du seuil de déclaration obligatoire (10 000$ au Canada — loi LRPCFAT). Chaque virement individuel semble normal, mais la somme totale dépasse le seuil.

**Paramètres injectés :**
- Montant total visé : 9 000$ à 25 000$
- Fractionné en tranches de < 9 500$ (100$ à 400$ sous le seuil)
- Intervalle : 2 à 12 heures entre chaque tranche
- Via "Virement e-Transfer", device habituel du compte

**Signaux de détection :**
- Montants systématiquement proches d'un même plafond
- `montant_cumul_1h` ne suffit pas (intervalles trop longs) — nécessite une fenêtre de 24–72h
- Pattern temporel long — difficile à détecter avec des fenêtres courtes

**Difficulté :** Élevée — nécessite une fenêtre temporelle longue

---

## Matrice de détectabilité par modèle

| Scénario | LightGBM | LSTM | GraphSAGE | LLM Raisonneur |
|---|---|---|---|---|
| test_carte | ✅ Fort | ✅ Fort | — | ✅ |
| carte_volee | ✅ Fort | ✅ Moyen | — | ✅ |
| prise_de_compte | ✅ Moyen | ✅ Fort | ✅ Moyen | ✅ |
| reseau_mules | ❌ Faible | ❌ Faible | ✅ Fort | ✅ |
| structuration | ❌ Faible | ✅ Moyen | ❌ Faible | ✅ |

→ Aucun modèle seul ne couvre tous les scénarios. C'est la justification principale de l'architecture MARS.
