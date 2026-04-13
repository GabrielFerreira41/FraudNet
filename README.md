# 🛡️ FraudNet — Détection de Fraude aux Paiements par Intelligence Artificielle

> Système intelligent de détection et de blocage de transactions frauduleuses en temps réel, combinant analyse comportementale et analyse relationnelle sur des portefeuilles bancaires simulés.

---

## 📌 Contexte & Enjeu Business

La fraude aux paiements est un fléau en pleine explosion au Canada.

| Année | Pertes signalées (CAFC) | Tendance |
|-------|------------------------|----------|
| 2020  | ~170 M$                | —        |
| 2023  | 578 M$                 | ↗ +240%  |
| 2024  | 643 M$                 | ↗ +11%   |
| 2025  | 704 M$                 | ↗ +10%   |

**Le Centre antifraude du Canada estime que seulement 5 à 10 % des fraudes sont signalées.** Les pertes réelles pourraient dépasser **12 milliards de dollars par an**.

Le gouvernement fédéral a réagi en annonçant dans le Budget 2025 :
- La création d'une **Agence contre les crimes financiers**
- L'élaboration d'une **Stratégie nationale antifraude**
- Des modifications à la **Loi sur les banques** pour obliger les institutions financières à détecter et prévenir la fraude

**Les systèmes actuels de détection, basés sur des règles statiques, génèrent jusqu'à 90-95 % de faux positifs**, mobilisant des milliers d'analystes pour des alertes non pertinentes. FraudNet propose une approche fondamentalement différente.

> *Même capter 0,1 % des pertes réelles estimées représente **12 millions de dollars sauvés par an.***

---

## 🎯 Objectif du Projet

Construire un **environnement de simulation bancaire complet** qui :

1. **Génère** des portefeuilles de clients virtuels avec des profils comportementaux réalistes
2. **Simule** un flux continu de transactions cohérentes avec chaque profil
3. **Injecte** des scénarios de fraude réalistes dans le flux de transactions
4. **Détecte** les transactions frauduleuses via un pipeline d'IA multi-couches
5. **Bloque** les transactions suspectes en temps réel avant leur exécution
6. **Visualise** l'ensemble du processus dans un dashboard interactif

L'objectif n'est pas d'entraîner un modèle sur un dataset statique, mais de construire un **système vivant** qui simule le fonctionnement réel d'une banque.

---

## 🏗️ Architecture Globale

```
┌──────────────────────────────────────────────────────────────────┐
│                    SIMULATEUR BANCAIRE                            │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │  Générateur   │   │   Moteur de  │   │   Injecteur de       │ │
│  │  de Profils   │──▶│ Transactions │──▶│   Fraude             │ │
│  │  Clients      │   │  Légitimes   │   │   (scénarios réels)  │ │
│  └──────────────┘   └──────────────┘   └──────────┬───────────┘ │
└───────────────────────────────────────────────────┼──────────────┘
                                                    │
                                                    ▼
                                          Flux de transactions
                                          (légitimes + fraude)
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE DÉTECTION                          │
│                                                                  │
│           ┌─────────────────────────────────┐                    │
│           │   🔬 Architecture en réflexion  │                    │
│           │      (voir section dédiée)      │                    │
│           └────────────────┬────────────────┘                    │
│                            │                                     │
│                            ▼                                     │
│                   Score de risque 0-100                           │
│                            │                                     │
│              ┌─────────────┴─────────────┐                       │
│              │    Moteur de décision      │                       │
│              │  ✅ Approuvé  ❌ Bloqué    │                       │
│              └───────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DASHBOARD TEMPS RÉEL                           │
│                                                                  │
│  ┌──────────┐  ┌──────────────────┐  ┌─────────────────────────┐│
│  │ Flux de  │  │ Graphe de        │  │ Métriques & KPIs        ││
│  │ transac. │  │ relations        │  │ (détection, faux pos.,  ││
│  │ live     │  │ interactif       │  │  argent sauvé)          ││
│  └──────────┘  └──────────────────┘  └─────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Module 1 — Simulateur Bancaire

### 1.1 Générateur de Portefeuilles Clients

Chaque client virtuel possède un profil comportemental cohérent :

| Attribut             | Description                                         |
|----------------------|-----------------------------------------------------|
| `profil_type`        | Étudiant, jeune actif, famille, retraité, entreprise |
| `revenus`            | Fourchette de revenus mensuels                      |
| `géolocalisation`    | Ville / région principale                           |
| `habitudes_horaires` | Créneaux d'activité typiques                        |
| `commerçants_freq`   | Liste de commerçants habituels                      |
| `devices`            | Appareils utilisés (mobile, desktop, tablette)      |
| `montant_moyen`      | Montant moyen par transaction                       |
| `fréquence`          | Nombre de transactions par semaine                  |

Les profils sont générés de manière à refléter la diversité réelle d'une base de clients bancaire canadienne.

### 1.2 Moteur de Transactions

Le moteur génère un flux continu de transactions qui respectent le profil de chaque client :

- **Temporalité** — les transactions suivent les habitudes horaires du client (un étudiant ne fait pas de virement à 6h du matin un mardi)
- **Montants** — distribués selon le profil avec une variance réaliste
- **Commerçants** — pondérés selon les habitudes (80% commerçants habituels, 20% nouveaux)
- **Géolocalisation** — cohérente avec la localisation du client
- **Devices** — chaque transaction est associée à un appareil

### 1.3 Injecteur de Fraude

Des scénarios de fraude réalistes sont injectés dans le flux normal avec un taux configurable (par défaut ~2-5% des transactions) :

| Scénario              | Description                                                                 | Difficulté de détection |
|-----------------------|-----------------------------------------------------------------------------|------------------------|
| Carte volée           | Achats inhabituels (montant, lieu, horaire) sur un court laps de temps      | Moyenne                |
| Test de carte         | Micro-transactions (1-2$) sur plusieurs sites avant un gros achat          | Faible                 |
| Prise de compte       | Connexion depuis nouveau device/IP → changement de mdp → gros virement     | Moyenne                |
| Réseau de mules       | Petits virements vers N comptes qui transfèrent tous vers un collecteur     | Élevée                 |
| Structuration         | Fractionnement d'un gros montant en petits virements sous le seuil d'alerte| Élevée                 |
| Fraude au virement    | Virement normal en apparence mais vers un bénéficiaire modifié             | Très élevée            |
| Fraude au paiement mobile | Activation d'Apple Pay/Google Pay via phishing téléphonique           | Élevée                 |

Chaque fraude injectée est étiquetée (`is_fraud=True`) avec le type de scénario pour permettre l'évaluation du pipeline de détection.

---

## 🔬 Module 2 — Pipeline de Détection (Architecture en Réflexion)

> ⚠️ **Cette section est en cours de conception.** L'architecture finale du pipeline de détection n'est pas encore arrêtée. Plusieurs approches sont à l'étude et seront évaluées itérativement.

### Pistes explorées

**Approche 1 — Analyse séquentielle (comportementale)**

L'idée est de modéliser l'historique de transactions de chaque client comme une séquence temporelle et de détecter les déviations par rapport au comportement appris.

- *Pistes techniques :* Transformer, LSTM, modèles de séquence
- *Forces :* Performant sur les fraudes par carte volée, prise de compte
- *Limites :* Ne voit pas les relations entre comptes

**Approche 2 — Analyse relationnelle (réseau)**

L'idée est de modéliser les relations entre entités (comptes, bénéficiaires, devices, IPs, commerçants) sous forme de graphe et de propager l'information de suspicion à travers le réseau.

- *Pistes techniques :* Graph Neural Networks (GNN), GraphSAGE, GAT
- *Forces :* Performant sur les réseaux de mules, la structuration
- *Limites :* Nécessite une masse critique de données relationnelles

**Approche 3 — Approche hybride (fusion)**

Combiner les deux approches précédentes dans un modèle de fusion qui agrège les scores comportementaux et relationnels avec des features classiques.

- *Pistes techniques :* Ensemble learning (LightGBM, XGBoost), stacking
- *Forces :* Couverture large de scénarios de fraude
- *Limites :* Complexité d'intégration, latence potentielle

**Approche 4 — Baseline avec règles + ML classique**

Commencer par un modèle simple (feature engineering manuel + gradient boosting) pour établir une baseline solide avant d'itérer vers des architectures plus complexes.

- *Pistes techniques :* LightGBM, XGBoost, feature engineering temporel
- *Forces :* Rapide à implémenter, interprétable, bon point de comparaison
- *Limites :* Plafonné en performance sur les patterns complexes

### Questions ouvertes

- Quel est le bon équilibre entre complexité du modèle et latence de réponse pour un scoring temps réel ?
- Comment gérer le cold-start (nouveaux clients sans historique) ?
- Quelle granularité de graphe offre le meilleur rapport signal/bruit ?
- Comment assurer l'explicabilité des décisions (exigence réglementaire) avec des modèles complexes ?
- Quel seuil de score de risque optimise le trade-off détection vs faux positifs ?

### Explicabilité

Quelle que soit l'architecture retenue, l'explicabilité des décisions est une exigence non négociable. Les régulateurs canadiens (BSIF, AMF) et les normes internes des banques exigent de pouvoir justifier pourquoi une transaction a été bloquée. Les pistes envisagées incluent SHAP, LIME, et des mécanismes d'attention interprétables.

---

## 📊 Module 3 — Dashboard d'Investigation

Le dashboard fournit une interface de monitoring et d'investigation en temps réel :

### Vue Flux
- Transactions en direct (approuvées en vert, bloquées en rouge, suspectes en orange)
- Filtrage par client, type de transaction, score de risque

### Vue Client
- Timeline comportementale du client
- Historique des transactions avec anomalies mises en évidence
- Score de risque évolutif dans le temps

### Vue Réseau
- Graphe interactif des relations autour d'une transaction suspecte
- Visualisation des clusters et communautés suspectes
- Propagation de la suspicion dans le graphe

### Vue Métriques
- Taux de détection (recall) et précision en temps réel
- Nombre de faux positifs / faux négatifs
- Estimation de l'argent sauvé vs pertes non détectées
- Distribution des scores de risque
- Performance par type de scénario de fraude

---

## 🗂️ Structure du Projet

```
FraudNet/
│
├── README.md
├── requirements.txt
├── docker-compose.yml
├── .env.example
│
├── data/
│   ├── raw/                     # Données brutes (Kaggle, etc.)
│   ├── generated/               # Portefeuilles et transactions générés
│   └── configs/
│       ├── profiles.yaml        # Configuration des profils clients
│       └── fraud_scenarios.yaml # Configuration des scénarios de fraude
│
├── src/
│   ├── simulator/
│   │   ├── profile_generator.py    # Génération de profils clients
│   │   ├── transaction_engine.py   # Moteur de transactions légitimes
│   │   ├── fraud_injector.py       # Injection de scénarios de fraude
│   │   └── stream_manager.py       # Orchestration du flux en temps réel
│   │
│   ├── features/
│   │   ├── transaction_features.py # Features transactionnelles
│   │   ├── temporal_features.py    # Features temporelles / séquentielles
│   │   ├── graph_features.py       # Features de graphe (degré, centralité...)
│   │   └── device_features.py      # Features device / session
│   │
│   ├── detection/                  # ⚠️ Architecture en réflexion
│   │   ├── baseline/               # Modèle baseline (règles + ML)
│   │   ├── sequence/               # Modèle séquentiel (à définir)
│   │   ├── graph/                  # Modèle graphe (à définir)
│   │   ├── fusion/                 # Modèle de fusion (à définir)
│   │   └── decision_engine.py      # Moteur de décision (bloquer/approuver)
│   │
│   ├── evaluation/
│   │   ├── metrics.py              # Métriques de performance
│   │   └── business_value.py       # Calcul du ROI / argent sauvé
│   │
│   └── api/
│       └── scoring_api.py          # API de scoring temps réel (FastAPI)
│
├── dashboard/                      # Interface de visualisation
│   ├── app.py                      # Application Streamlit ou React
│   └── components/
│       ├── transaction_feed.py     # Flux de transactions en direct
│       ├── network_graph.py        # Graphe interactif
│       ├── client_timeline.py      # Timeline comportementale
│       └── metrics_panel.py        # Panneau de métriques
│
├── notebooks/
│   ├── 01_data_exploration.ipynb
│   ├── 02_profile_generation.ipynb
│   ├── 03_feature_engineering.ipynb
│   ├── 04_baseline_model.ipynb
│   └── 05_evaluation.ipynb
│
├── tests/
│   ├── test_simulator.py
│   ├── test_features.py
│   └── test_detection.py
│
└── docs/
    ├── architecture.md             # Documentation technique détaillée
    ├── business_case.md            # Enjeu business & ROI
    ├── fraud_scenarios.md          # Description détaillée des scénarios
    └── detection_research.md       # Notes de recherche sur l'architecture
```

---

## 🛠️ Stack Technique

| Composant         | Technologies                                     |
|-------------------|--------------------------------------------------|
| Langage           | Python 3.11+                                     |
| Données           | Pandas, Polars, NumPy                            |
| Simulation        | Faker, NumPy (distributions), YAML configs       |
| ML / DL           | PyTorch, Scikit-learn, LightGBM                  |
| Graphe            | NetworkX, PyTorch Geometric *(à confirmer)*       |
| Explicabilité     | SHAP, LIME *(à confirmer)*                        |
| API               | FastAPI, WebSocket                               |
| Dashboard         | Streamlit ou React *(à confirmer)*                |
| Visualisation     | Plotly, D3.js, Pyvis                             |
| Base de données   | SQLite (dev), PostgreSQL (prod)                  |
| Containerisation  | Docker, Docker Compose                           |

---

## 📈 Métriques de Succès

Le projet sera évalué sur les critères suivants :

| Métrique                   | Cible             | Description                                              |
|----------------------------|-------------------|----------------------------------------------------------|
| Recall (fraude)            | > 85%             | Proportion de fraudes correctement détectées             |
| Precision (fraude)         | > 70%             | Proportion d'alertes qui sont de vraies fraudes          |
| Taux de faux positifs      | < 5%              | Transactions légitimes bloquées à tort                   |
| Latence de scoring         | < 200ms           | Temps de réponse du pipeline de détection                |
| Couverture des scénarios   | 100%              | Tous les types de fraude simulés sont détectables        |
| Argent sauvé (simulé)      | Maximiser         | Montant des transactions frauduleuses bloquées           |

---

## 🗺️ Roadmap

### Phase 1 — Simulateur bancaire *(en cours)*
- [ ] Générateur de profils clients
- [ ] Moteur de transactions légitimes
- [ ] Injecteur de fraude (scénarios de base)
- [ ] Tests et validation de la cohérence des données

### Phase 2 — Feature engineering
- [ ] Features transactionnelles
- [ ] Features temporelles / séquentielles
- [ ] Features de graphe
- [ ] Features device / session

### Phase 3 — Pipeline de détection
- [ ] Modèle baseline (feature engineering + LightGBM)
- [ ] Évaluation et itération
- [ ] Exploration des approches avancées (séquentiel, graphe, fusion)
- [ ] Explicabilité des décisions

### Phase 4 — Temps réel & Dashboard
- [ ] API de scoring (FastAPI)
- [ ] Flux de transactions en WebSocket
- [ ] Dashboard de monitoring
- [ ] Graphe interactif de relations

### Phase 5 — Polish & Démonstration
- [ ] Optimisation des performances
- [ ] Documentation complète
- [ ] Scénarios de démonstration pour entretien
- [ ] Containerisation (Docker)

---

## 🚀 Installation & Utilisation

```bash
# Cloner le projet
git clone https://github.com/<username>/FraudNet.git
cd FraudNet

# Créer l'environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Installer les dépendances
pip install -r requirements.txt

# Lancer le simulateur (à venir)
python -m src.simulator.stream_manager

# Lancer le dashboard (à venir)
streamlit run dashboard/app.py

# Lancer l'API de scoring (à venir)
uvicorn src.api.scoring_api:app --reload
```

---

## 📚 Références & Sources

### Données
- [IEEE-CIS Fraud Detection](https://www.kaggle.com/c/ieee-fraud-detection) — 590k transactions labellées
- [Elliptic Bitcoin Dataset](https://www.kaggle.com/ellipticco/elliptic-dataset) — Graphe de transactions Bitcoin avec labels
- [PaySim](https://www.kaggle.com/ealaxi/paysim1) — Simulateur de transactions mobile money

### Rapports officiels
- Centre antifraude du Canada (CAFC) — Rapports annuels 2024-2025
- Statistique Canada — La fraude autodéclarée au Canada
- Budget fédéral 2025 — Stratégie nationale antifraude & Agence contre les crimes financiers

### Recherche
- *Attention Is All You Need* (Vaswani et al., 2017) — Architecture Transformer
- *Inductive Representation Learning on Large Graphs* (Hamilton et al., 2017) — GraphSAGE
- *Graph Attention Networks* (Veličković et al., 2018) — GAT
- *A Unified Approach to Interpreting Model Predictions* (Lundberg & Lee, 2017) — SHAP

---

## 📝 Licence

Ce projet est développé dans un cadre éducatif et de démonstration de compétences.
Les données utilisées sont entièrement synthétiques ou issues de datasets publics.
Aucune donnée bancaire réelle n'est utilisée.

---

## ✉️ Contact

Projet développé par **Gabriel** — Développeur & Data Scientist

*Ce projet fait partie d'un portfolio orienté IA appliquée au secteur bancaire canadien.*
