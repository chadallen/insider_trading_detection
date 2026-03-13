"""
Price feature computation and Isolation Forest anomaly scoring.
Corresponds to notebook Cells 5, 5b, and 6.

VPIN (compute_vpin / compute_time_weighted_vpin) was removed in Phase 1 of the
refactor. See CLAUDE.md for rationale. The Dune on-chain directional measure
(formerly trade_vpin) is retained as order_flow_imbalance in wallet_features.py.

Phase 2 additions:
  price_momentum_6h  — price change in the final 6h window before resolution
  price_momentum_12h — price change in the final 12h window before resolution
  Both require hourly CLOB data (fidelity=60, switched in Phase 1).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


# ── Feature computation ────────────────────────────────────────────────────

def _price_at_offset(history_df: pd.DataFrame, hours_before: int) -> float | None:
    """
    Return the price approximately `hours_before` hours before the last
    timestamp in history_df. Uses the last row whose timestamp is at or before
    the target time; falls back to the earliest row if the window is wider than
    the available history.
    """
    if history_df.empty:
        return None
    target_ts = history_df["timestamp"].max() - pd.Timedelta(hours=hours_before)
    before = history_df[history_df["timestamp"] <= target_ts]
    if before.empty:
        return float(history_df["price"].iloc[0])
    return float(before["price"].iloc[-1])


def compute_price_features(history_df: pd.DataFrame):
    if len(history_df) < 2:
        return None
    prices  = history_df["price"].values
    changes = np.abs(np.diff(prices))
    final_price = float(prices[-1])

    p6h  = _price_at_offset(history_df, 6)
    p12h = _price_at_offset(history_df, 12)

    return {
        "price_volatility":   changes.std() if len(changes) > 1 else 0,
        "max_single_move":    changes.max() if len(changes) > 0 else 0,
        "final_price":        final_price,
        "starting_price":     float(prices[0]),
        "total_price_move":   abs(final_price - float(prices[0])),
        "price_momentum_6h":  (final_price - p6h)  if p6h  is not None else 0.0,
        "price_momentum_12h": (final_price - p12h) if p12h is not None else 0.0,
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
    "price_momentum_6h", "price_momentum_12h",
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
