"""
Agents Graphe MARS — 3 agents spécialisés.

G1 device_sharing : GraphSAGE — comptes liés par un device partagé
G2 merchant       : GAT bipartite — marchands ciblés en rafale
G3 temporal       : GCN pondéré — cooccurrences temporelles chez le même marchand
"""
from src.detection.graph.device_sharing import score as score_g1, train as train_g1
from src.detection.graph.merchant       import score as score_g2, train as train_g2
from src.detection.graph.temporal       import score as score_g3, train as train_g3

__all__ = [
    "score_g1", "train_g1",
    "score_g2", "train_g2",
    "score_g3", "train_g3",
]
