# FraudNet — Contexte projet pour Claude Code

## Vue d'ensemble
Système de détection de fraude aux paiements par IA sur des données bancaires synthétiques canadiennes. Portfolio de Gabriel — Data Scientist.

## Stack technique
- Python 3.12, venv dans `venv/`
- Données : pandas, pyarrow (Parquet), NumPy, Faker, PyYAML
- ML (à venir) : LightGBM, PyTorch, scikit-learn
- Graphe : Neo4j local (bolt://localhost:7687), driver `neo4j`, credentials dans `.env`
- Visualisation : matplotlib, seaborn, Jupyter (kernel `fraudnet`)

## Structure des données générées
Tout est dans `data/generated/` (gitignored) :
- `accounts.parquet` — 1 000 comptes, 21 colonnes
- `transactions_labeled.parquet` — 228 661 transactions, 14 colonnes, 105 fraudes
- `features.parquet` — 228 661 lignes, 31 features prêtes pour le modèle
- `neo4j/` — 9 CSV pour chargement Neo4j

## Commandes clés
```bash
source venv/bin/activate

# Régénérer les données depuis zéro
python -m src.simulator.profile_generator --n 1000 --seed 42
python -m src.simulator.transaction_engine --weeks 13 --seed 42
python -m src.simulator.fraud_injector --rate 0.03 --seed 42
python -m src.features.feature_pipeline

# Charger Neo4j (doit être démarré)
python -m src.graph.neo4j_loader
```

## Architecture de détection planifiée (MARS)
Multi-Agent Reasoning System — 5 sprints :
1. Agent Baseline (LightGBM) — `src/detection/baseline/`
2. Agent Comportemental (LSTM) — `src/detection/sequence/`
3. Agent Graphe (GraphSAGE) — `src/detection/graph/`
4. Meta-Raisonneur — `src/detection/fusion/`
5. LLM Raisonneur (Claude API, async) — `src/detection/llm_reasoner/`

## Conventions
- Sorties toujours en Parquet dans `data/generated/`
- Chaque module CLI accepte `--seed` pour reproducibilité
- Variables sensibles dans `.env` (jamais dans le code)
- Notebooks dans `notebooks/` numérotés `NN_nom.ipynb`
