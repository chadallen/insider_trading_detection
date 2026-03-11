"""
Price feature computation and Isolation Forest anomaly scoring.
Corresponds to notebook Cells 5, 5b, and 6.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from backend.pipeline.dune import run_query, sql_quote


# ── Feature computation ────────────────────────────────────────────────────

def compute_vpin(history_df: pd.DataFrame):
    if len(history_df) < 3:
        return None
    prices = history_df["price"].values
    changes = np.diff(prices)
    buy  = np.where(changes > 0,  changes, 0).sum()
    sell = np.where(changes < 0, -changes, 0).sum()
    total = buy + sell
    return abs(buy - sell) / total if total > 0 else 0.0


def compute_time_weighted_vpin(history_df: pd.DataFrame):
    """VPIN with linear weights — moves closer to resolution count more."""
    if len(history_df) < 3:
        return None
    prices  = history_df["price"].values
    changes = np.diff(prices)
    weights = np.arange(1, len(changes) + 1, dtype=float)
    w_buy  = np.where(changes > 0,  changes * weights, 0).sum()
    w_sell = np.where(changes < 0, -changes * weights, 0).sum()
    total  = w_buy + w_sell
    return abs(w_buy - w_sell) / total if total > 0 else 0.0


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
        vpin           = compute_vpin(history)
        tw_vpin        = compute_time_weighted_vpin(history)
        feats          = compute_price_features(history)
        surprise, late = compute_resolution_surprise(history)
        if any(v is None for v in [vpin, tw_vpin, feats, surprise, late]):
            continue
        results.append({
            "question":           row["question"],
            "volume":             row["volume"],
            "vpin_score":         vpin,
            "time_weighted_vpin": tw_vpin,
            "surprise_score":     surprise,
            "late_move_ratio":    late,
            **feats,
        })

    df = pd.DataFrame(results)
    print(f"Computed features for {len(df)} markets")
    return df


# ── Replace price-proxy VPIN with real on-chain VPIN from Dune ────────────

def enrich_with_dune_vpin(df_scored: pd.DataFrame) -> pd.DataFrame:
    """
    Overwrites vpin_score with real volume-weighted VPIN from Dune.
    Drops markets with no Dune match. ~1 credit.
    """
    in_clause = ",\n    ".join(sql_quote(q) for q in df_scored["question"].tolist())
    sql = f"""
WITH trades AS (
    SELECT question, price, amount
    FROM polymarket_polygon.market_trades
    WHERE question IN (
    {in_clause}
)
),
vpin AS (
    SELECT question,
        SUM(CASE WHEN price > 0.5  THEN amount ELSE 0 END) AS yes_vol,
        SUM(CASE WHEN price <= 0.5 THEN amount ELSE 0 END) AS no_vol,
        SUM(amount) AS total_vol
    FROM trades GROUP BY question
)
SELECT question,
       ABS(yes_vol - no_vol) / NULLIF(total_vol, 0) AS trade_vpin,
       total_vol
FROM vpin
"""
    print(f"Submitting VPIN query for {len(df_scored)} markets...")
    df_vpin, _ = run_query(sql, label="vpin_all_markets", timeout=300)

    if df_vpin.empty:
        print("  Dune returned no results — df_scored unchanged")
        return df_scored

    vpin_lookup = dict(zip(df_vpin["question"], df_vpin["trade_vpin"].astype(float)))
    before = len(df_scored)
    df_scored = df_scored[df_scored["question"].isin(vpin_lookup)].copy()
    df_scored["vpin_score"] = df_scored["question"].map(vpin_lookup)
    print(f"  {len(df_scored)} markets with real VPIN | {before - len(df_scored)} dropped (no Dune data)")
    return df_scored


# ── Isolation Forest anomaly scoring ──────────────────────────────────────

ISOLATION_FOREST_FEATURES = [
    "vpin_score", "time_weighted_vpin", "volume",
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
        ["question", "suspicion_score", "vpin_score", "surprise_score", "late_move_ratio", "volume"]
    ].reset_index(drop=True)
    top.index += 1
    print(f"Scored {len(df)} markets\n")
    print("Top 15 by price suspicion score:")
    print(top.to_string())
    return df
