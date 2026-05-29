"""
FraudTransformer — Agent Comportemental v2

Architecture : Transformer causal intra-compte.
Pour chaque transaction courante, le modèle attend sur tout l'historique
du compte pour décider si elle est frauduleuse.

Séquence d'entrée :
  [PROFILE] [tx_1] [tx_2] ... [tx_N]
      ↓   attention causale (Pre-LN)   ↓
                last token → head → P(fraude)
"""
from __future__ import annotations
import math
import torch
import torch.nn as nn

# ─────────────────────────────────────────────────────────────────────────────
# Constantes — noms des colonnes du features.parquet
# ─────────────────────────────────────────────────────────────────────────────

NUMERIC_COLS: list[str] = [
    "montant", "heure", "jour_semaine", "est_weekend",
    "ratio_montant", "montant_anormal",
    "nouveau_commercant", "nouveau_device", "heure_inhabituelle",
    "score_anomalie_tx",
    "velocite_1h", "velocite_24h", "montant_cumul_1h",
    "montant_moy_30tx", "ecart_montant_30tx",
    "est_rafale",
    "n_comptes_par_device", "n_comptes_par_commercant",
    "degre_compte", "device_partage_suspect",
]

# Vocabulaires catégoriels — ordre = index d'embedding (0 réservé au padding)
DEVICE_VOCAB:    list[str] = ["<pad>", "desktop", "mobile", "tablette"]
CATEGORIE_VOCAB: list[str] = [
    "<pad>", "abonnements", "autre", "divertissement", "education",
    "epicerie", "equipement", "fournisseurs", "restauration", "sante",
    "services_maison", "services_pro", "transport", "vetements",
    "voyage", "voyage_affaires",
]
ARCHETYPE_VOCAB: list[str] = [
    "<pad>", "entreprise", "etudiant", "famille", "jeune_actif", "retraite",
]
PROVINCE_VOCAB: list[str] = ["<pad>", "AB", "BC", "ON", "QC"]

N_NUMERIC   = len(NUMERIC_COLS)           # 20
N_DEVICE    = len(DEVICE_VOCAB)           # 4
N_CATEGORIE = len(CATEGORIE_VOCAB)        # 16
N_ARCHETYPE = len(ARCHETYPE_VOCAB)        # 6
N_PROVINCE  = len(PROVINCE_VOCAB)         # 5

# Lookup inverse : token string → index
DEVICE_TO_IDX    = {v: i for i, v in enumerate(DEVICE_VOCAB)}
CATEGORIE_TO_IDX = {v: i for i, v in enumerate(CATEGORIE_VOCAB)}
ARCHETYPE_TO_IDX = {v: i for i, v in enumerate(ARCHETYPE_VOCAB)}
PROVINCE_TO_IDX  = {v: i for i, v in enumerate(PROVINCE_VOCAB)}


# ─────────────────────────────────────────────────────────────────────────────
# Module 1 — Transaction Tokenizer
# ─────────────────────────────────────────────────────────────────────────────

class TransactionTokenizer(nn.Module):
    """
    Transforme un batch de transactions en vecteurs de dim d_model.

    Chaque transaction = projection linéaire des numériques
                       + somme d'embeddings catégoriels
                       → LayerNorm → d_model

    Input:
      numeric  : (B, T, N_NUMERIC)
      device   : (B, T)  — indices dans DEVICE_VOCAB
      categorie: (B, T)  — indices dans CATEGORIE_VOCAB
      archetype: (B, T)  — indices dans ARCHETYPE_VOCAB

    Output: (B, T, d_model)
    """

    EMB_DIM = 16  # dim des embeddings catégoriels

    def __init__(self, d_model: int) -> None:
        super().__init__()

        # Projection numériques → d_model // 2
        self.num_proj = nn.Linear(N_NUMERIC, d_model // 2)

        # Embeddings catégoriels (padding_idx=0)
        self.emb_device    = nn.Embedding(N_DEVICE,    self.EMB_DIM, padding_idx=0)
        self.emb_categorie = nn.Embedding(N_CATEGORIE, self.EMB_DIM, padding_idx=0)
        self.emb_archetype = nn.Embedding(N_ARCHETYPE, self.EMB_DIM, padding_idx=0)

        # Projection catégoriels → d_model // 2
        self.cat_proj = nn.Linear(self.EMB_DIM * 3, d_model // 2)

        self.norm = nn.LayerNorm(d_model)

    def forward(
        self,
        numeric: torch.Tensor,
        device: torch.Tensor,
        categorie: torch.Tensor,
        archetype: torch.Tensor,
    ) -> torch.Tensor:
        x_num = self.num_proj(numeric)                           # (B, T, d//2)

        cat = torch.cat([
            self.emb_device(device),
            self.emb_categorie(categorie),
            self.emb_archetype(archetype),
        ], dim=-1)                                               # (B, T, 48)
        x_cat = self.cat_proj(cat)                              # (B, T, d//2)

        return self.norm(torch.cat([x_num, x_cat], dim=-1))     # (B, T, d)


# ─────────────────────────────────────────────────────────────────────────────
# Module 2 — Time-Delta Positional Encoding
# ─────────────────────────────────────────────────────────────────────────────

class TimeDeltaEncoding(nn.Module):
    """
    Encoding positionnel basé sur Δt (minutes depuis la transaction précédente).

    Pourquoi pas l'index de position ?
      Le même écart d'1h entre deux transactions est sémantiquement identique
      quelle que soit la position dans la séquence. L'index de position
      perd cette information absolue.

    On encode log(1 + max(0, Δt)) via sinusoïdal pour gérer la plage
    [0, 18 000 min] sans saturer.

    Le facteur `scale` est learnable : le modèle apprend quelle résolution
    temporelle est pertinente pour la fraude.

    Input : (B, T)  — delta_minutes, peut valoir -1 pour la 1ère tx (→ clampé à 0)
    Output: (B, T, d_model)
    """

    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.d_model = d_model
        # Facteur d'échelle learnable : compresse / dilate l'axe temporel
        self.log_scale = nn.Parameter(torch.zeros(1))

    def forward(self, delta_minutes: torch.Tensor) -> torch.Tensor:
        dt = torch.clamp(delta_minutes, min=0.0)         # -1 → 0 pour 1ère tx
        scale = torch.exp(self.log_scale)
        log_dt = torch.log1p(dt * scale)                 # (B, T)

        d = self.d_model
        # Fréquences sinusoïdales : (d//2,)
        freqs = torch.arange(0, d, 2, device=dt.device).float()
        freqs = 1.0 / (10000.0 ** (freqs / d))

        # Angles : (B, T, d//2)
        angles = log_dt.unsqueeze(-1) * freqs.unsqueeze(0).unsqueeze(0)

        pe = torch.zeros(*dt.shape, d, device=dt.device)
        pe[..., 0::2] = torch.sin(angles)
        pe[..., 1::2] = torch.cos(angles)

        return pe  # (B, T, d)


# ─────────────────────────────────────────────────────────────────────────────
# Module 3 — Profile Token
# ─────────────────────────────────────────────────────────────────────────────

class ProfileTokenizer(nn.Module):
    """
    Encode le profil statique du compte en un token [PROFILE].

    Ce token — inspiré du [CLS] de BERT — est prepend à la séquence.
    Le transformer apprend à y encoder "ce qui est normal pour CE client",
    ce que le modèle peut ensuite utiliser pour contextualiser chaque tx.

    Input:
      archetype : (B,)  — index ARCHETYPE_VOCAB
      province  : (B,)  — index PROVINCE_VOCAB
      revenu_norm: (B,) — revenu mensuel normalisé [0, 1]
      age_norm  : (B,)  — âge normalisé [0, 1]

    Output: (B, d_model)
    """

    EMB_DIM = 8

    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.emb_archetype = nn.Embedding(N_ARCHETYPE, self.EMB_DIM * 2, padding_idx=0)
        self.emb_province  = nn.Embedding(N_PROVINCE,  self.EMB_DIM,     padding_idx=0)

        # EMB*2 + EMB + revenu(1) + age(1)
        in_dim = self.EMB_DIM * 2 + self.EMB_DIM + 2
        self.proj = nn.Sequential(
            nn.Linear(in_dim, d_model),
            nn.GELU(),
            nn.LayerNorm(d_model),
        )

    def forward(
        self,
        archetype: torch.Tensor,    # (B,)
        province: torch.Tensor,     # (B,)
        revenu_norm: torch.Tensor,  # (B,)
        age_norm: torch.Tensor,     # (B,)
    ) -> torch.Tensor:
        x = torch.cat([
            self.emb_archetype(archetype),         # (B, 16)
            self.emb_province(province),           # (B, 8)
            revenu_norm.unsqueeze(-1),             # (B, 1)
            age_norm.unsqueeze(-1),                # (B, 1)
        ], dim=-1)                                 # (B, 26)
        return self.proj(x)                        # (B, d_model)


# ─────────────────────────────────────────────────────────────────────────────
# Module 4 — FraudTransformer
# ─────────────────────────────────────────────────────────────────────────────

class FraudTransformer(nn.Module):
    """
    Transformer causal intra-compte pour la détection de fraude.

    Séquence d'entrée de longueur T+1 :
      [PROFILE] [tx_1] [tx_2] ... [tx_T]
                                     ↑ transaction courante (cible)

    Masque causal : tx_i ne peut attendre que sur [PROFILE, tx_1 .. tx_{i-1}].
    → Le token [PROFILE] est visible par toutes les transactions.
    → La transaction courante voit tout son historique.

    Paramètres par défaut (d_model=64) :
      ~130 k paramètres — entraînable sur CPU en quelques minutes.
    """

    def __init__(
        self,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 3,
        dim_feedforward: int = 128,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.d_model = d_model

        self.tokenizer = TransactionTokenizer(d_model)
        self.profiler  = ProfileTokenizer(d_model)
        self.time_enc  = TimeDeltaEncoding(d_model)

        # Pre-LN Transformer : plus stable à l'entraînement que Post-LN
        # norm_first=True active le Pre-LN dans PyTorch >= 1.11
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(
            encoder_layer,
            num_layers=num_layers,
            enable_nested_tensor=False,  # compatibilité masques padding + causal
        )

        # Head : last token → score fraude (logit)
        self.head = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, 1),
        )

        self._init_weights()

    # ── Initialisation ──

    def _init_weights(self) -> None:
        for name, p in self.named_parameters():
            if p.dim() > 1:
                nn.init.xavier_uniform_(p)
            elif "bias" in name:
                nn.init.zeros_(p)

    # ── Masque causal ──

    @staticmethod
    def _causal_mask(seq_len: int, device: torch.device) -> torch.Tensor:
        """
        Masque upper-triangulaire de taille (L, L) où L = seq_len + 1 (pour le token PROFILE).
        True = position masquée (ne peut pas être attenue).

        Le token PROFILE (position 0) n'est jamais masqué : toutes les
        transactions peuvent le voir.
        """
        L = seq_len + 1
        mask = torch.triu(torch.ones(L, L, device=device), diagonal=1).bool()
        # La colonne 0 (PROFILE) reste accessible à tous → déjà False grâce à triu
        return mask  # (L, L)

    # ── Forward ──

    def forward(
        self,
        numeric: torch.Tensor,       # (B, T, N_NUMERIC)
        device_idx: torch.Tensor,    # (B, T)
        categorie_idx: torch.Tensor, # (B, T)
        archetype_idx: torch.Tensor, # (B, T)
        delta_minutes: torch.Tensor, # (B, T)
        profile_arch: torch.Tensor,  # (B,)
        profile_prov: torch.Tensor,  # (B,)
        profile_rev: torch.Tensor,   # (B,)
        profile_age: torch.Tensor,   # (B,)
        padding_mask: torch.Tensor | None = None,  # (B, T) True = position paddée
    ) -> torch.Tensor:
        """
        Retourne les logits (avant sigmoid) de forme (B,).
        Chaque logit correspond à la probabilité de fraude pour la DERNIÈRE
        transaction de la séquence.
        """
        B, T, _ = numeric.shape

        # ① Tokenise les transactions
        tokens = self.tokenizer(numeric, device_idx, categorie_idx, archetype_idx)
        # (B, T, d_model)

        # ② Ajoute l'encoding temporel (time-delta)
        tokens = tokens + self.time_enc(delta_minutes)
        # (B, T, d_model)

        # ③ Construit et prepend le token [PROFILE]
        profile_tok = self.profiler(profile_arch, profile_prov, profile_rev, profile_age)
        profile_tok = profile_tok.unsqueeze(1)          # (B, 1, d_model)
        tokens = torch.cat([profile_tok, tokens], dim=1) # (B, T+1, d_model)

        # ④ Masques
        causal = self._causal_mask(T, numeric.device)   # (T+1, T+1)

        if padding_mask is not None:
            # Prepend False pour le token PROFILE (jamais paddé)
            prof_col = torch.zeros(B, 1, dtype=torch.bool, device=numeric.device)
            key_padding = torch.cat([prof_col, padding_mask], dim=1)  # (B, T+1)
        else:
            key_padding = None

        # ⑤ Encode
        out = self.encoder(
            tokens,
            mask=causal,
            src_key_padding_mask=key_padding,
        )
        # out : (B, T+1, d_model)

        # ⑥ Dernière position = transaction courante → score
        last = out[:, -1, :]     # (B, d_model)
        return self.head(last).squeeze(-1)  # (B,) logits

    # ── Utilitaire : compte les paramètres ──

    def n_params(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
