"""
Price feature computation and Isolation Forest anomaly scoring.
Corresponds to notebook Cells 5, 5b, and 6.

VPIN (compute_vpin / compute_time_weighted_vpin) was removed in Phase 1 of the
refactor. See CLAUDE.md for rationale. The Dune on-chain directional measure
(formerly trade_vpin) is retained as order_flow_imbalance in wallet_features.py.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


# ── Feature computation ────────────────────────────────────────────────────

def compute_price_features(history_df: pd.DataFrame):
    if len(history_df) < 2:
        return None
    prices  = history_df["price"].values
    changes = np.abs(np.diff(prices))
    return {
        "price_volatility": changes.std() if len(changes) > 1 else 0,
        "max_single_move":  changes.max() if len(changes) > 0 else 0,
        "final_price":      prices[-1],
        "starting_price":   prices[0],
        "total_price_move": abs(prices[-1] - prices[0]),
    }


def compute_resolution_surprise(history_df: pd.DataFrame):
    if len(history_df) < 2:
        return None, None
    prices     = history_df["price"].values
    actual     = 1.0 if prices[-1] > 0.5 else 0.0
    surprise   = abs(actual - prices[0])
    total_move = abs(prices[-1] - prices[0])
    final_step = abs(prices[-1] - prices[-2])
    late_move_ratio = (final_step / total_move) if total_move > 0.01 else 0.0
    return surprise, late_move_ratio


# ── Build df_scored from raw histories ────────────────────────────────────

def build_price_features(df_markets: pd.DataFrame, histories: dict) -> pd.DataFrame:
    """Compute all price features for every market. Returns df_scored."""
    results = []
    for _, row in df_markets.iterrows():
        history = histories.get(row["token_id"])
        if history is None or len(history) < 3:
            continue
        feats          = compute_price_features(history)
        surprise, late = compute_resolution_surprise(history)
        if any(v is None for v in [feats, surprise, late]):
            continue
        results.append({
            "question":        row["question"],
            "volume":          row["volume"],
            "surprise_score":  surprise,
            "late_move_ratio": late,
            **feats,
        })

    df = pd.DataFrame(results)
    print(f"Computed features for {len(df)} markets")
    return df


# ── Isolation Forest anomaly scoring ──────────────────────────────────────

ISOLATION_FOREST_FEATURES = [
    "volume",
    "total_price_move", "price_volatility", "max_single_move",
    "surprise_score", "late_move_ratio",
]


def score_with_isolation_forest(df_scored: pd.DataFrame, contamination: float = 0.1) -> pd.DataFrame:
    """
    Adds anomaly_score and suspicion_score columns to df_scored.
    contamination=0.1 → top ~10% flagged as anomalous.
    """
    df = df_scored.copy()
    X = df[ISOLATION_FOREST_FEATURES].fillna(0)
    X_scaled = StandardScaler().fit_transform(X)
    iso = IsolationForest(contamination=contamination, random_state=42)
    df["anomaly_score"]   = iso.fit_predict(X_scaled)
    df["suspicion_score"] = -iso.decision_function(X_scaled)

    top = df.nlargest(15, "suspicion_score")[
        ["question", "suspicion_score", "surprise_score", "late_move_ratio", "volume"]
    ].reset_index(drop=True)
    top.index += 1
    print(f"Scored {len(df)} markets\n")
    print("Top 15 by price suspicion score:")
    print(top.to_string())
    return df
