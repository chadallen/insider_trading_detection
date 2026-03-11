"""
Combines price + wallet scores and trains the Random Forest classifier.
Corresponds to notebook Cells 12 and 13.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from backend.pipeline.wallet_features import compute_wallet_score


# ── RF configuration ──────────────────────────────────────────────────────

RF_FEATURES = [
    "vpin_score",
    "time_weighted_vpin",
    "surprise_score",
    "late_move_ratio",
    "price_volatility",
    "burst_score",
    "directional_consensus",
    "trade_vpin",
]

# Markets whose question contains any of these keywords are treated as
# known insider trading positives for training.
POSITIVE_KEYWORDS = [
    "Maduro", "Machado", "Khamenei", "Venezuela",
    "ZachXBT", "Taylor Swift", "Ophelia", "Gemini 3", "Iran",
]


# ── Build df_combined ─────────────────────────────────────────────────────

def build_combined(df_scored: pd.DataFrame, df_wallet_agg: pd.DataFrame | None) -> pd.DataFrame:
    """
    Merge price features + wallet features, normalize scores, compute combined_score.
    """
    # Normalize suspicion_score → price_score (0–1)
    df_price = df_scored[[
        "question", "suspicion_score",
        "vpin_score", "time_weighted_vpin",
        "surprise_score", "late_move_ratio", "price_volatility",
    ]].copy()
    s = df_price["suspicion_score"]
    df_price["price_score"] = (s - s.min()) / (s.max() - s.min() + 1e-9)

    # Wallet score via rules
    df_wallet = (
        df_wallet_agg.copy()
        if df_wallet_agg is not None and not df_wallet_agg.empty
        else pd.DataFrame()
    )
    if not df_wallet.empty:
        df_wallet["wallet_score"] = df_wallet.apply(
            lambda row: compute_wallet_score(row.to_dict()), axis=1
        )

    # Merge
    wallet_cols = ["question", "wallet_score", "burst_score", "directional_consensus", "trade_vpin"]
    df_combined = df_price.merge(
        df_wallet[wallet_cols]
        if not df_wallet.empty and all(c in df_wallet.columns for c in wallet_cols)
        else pd.DataFrame(columns=["question"]),
        on="question",
        how="left",
    )

    df_combined["combined_score"] = df_combined.apply(
        lambda r: (
            (r["price_score"] + r["wallet_score"]) / 2
            if pd.notna(r.get("wallet_score"))
            else r["price_score"]
        ),
        axis=1,
    )

    with_wallet = df_combined["wallet_score"].notna().sum() if "wallet_score" in df_combined.columns else 0
    print(f"df_combined: {len(df_combined)} markets ({with_wallet} with wallet score)")
    return df_combined


# ── Random Forest classifier ──────────────────────────────────────────────

def train_classifier(
    df_combined: pd.DataFrame,
    features: list[str] | None = None,
    pos_keywords: list[str] | None = None,
    n_neg: int = 30,
) -> tuple[pd.DataFrame, object, object]:
    """
    Train Random Forest on df_combined. Returns (df_with_probs, model, scaler).

    To tune: adjust features or pos_keywords here (or pass them in from run.py).
    """
    if features is None:
        features = RF_FEATURES
    if pos_keywords is None:
        pos_keywords = POSITIVE_KEYWORDS

    df = df_combined.copy()

    # Label positives
    df["is_positive"] = df["question"].apply(
        lambda q: any(kw.lower() in str(q).lower() for kw in pos_keywords)
    )
    n_pos = df["is_positive"].sum()
    print(f"  Positives matched: {n_pos}")

    # Label negatives (bottom of combined_score = implicitly clean)
    n_neg = min(n_neg, len(df) - n_pos)
    neg_idx = (
        df[~df["is_positive"]]
        .dropna(subset=features)
        .nsmallest(n_neg, "combined_score")
        .index
    )
    df["is_negative"] = False
    df.loc[neg_idx, "is_negative"] = True
    print(f"  Negatives used:    {len(neg_idx)} (bottom by combined_score)")

    # Build training set
    df_train = df[df["is_positive"] | df["is_negative"]].dropna(subset=features).copy()
    X_train  = df_train[features].values
    y_train  = df_train["is_positive"].astype(int).values
    print(f"  Training set:      {y_train.sum()} pos | {(y_train == 0).sum()} neg | {len(df_train)} total")

    if y_train.sum() == 0:
        print("  No positives found — check POSITIVE_KEYWORDS vs df_combined['question']")
        df["insider_trading_prob"] = np.nan
        return df, None, None

    # Train
    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)
    rf = RandomForestClassifier(
        n_estimators=200, class_weight="balanced",
        max_depth=4, min_samples_leaf=2, random_state=42,
    )
    rf.fit(X_scaled, y_train)

    # Score all markets with complete features
    df_scoreable = df.dropna(subset=features).copy()
    X_all = scaler.transform(df_scoreable[features].values)
    df_scoreable["insider_trading_prob"] = rf.predict_proba(X_all)[:, 1]

    if "insider_trading_prob" in df.columns:
        df = df.drop(columns=["insider_trading_prob"])
    df = df.join(df_scoreable[["insider_trading_prob"]], how="left")

    # Print feature importances
    print("\nFeature importances:")
    for feat, imp in sorted(zip(features, rf.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"  {feat:<25} {bar} {imp:.3f}")

    # Top 15
    print("\nTop 15 by insider_trading_prob:")
    top = (
        df[df["insider_trading_prob"].notna()]
        .nlargest(15, "insider_trading_prob")
        [["question", "insider_trading_prob", "combined_score"]]
        .reset_index(drop=True)
    )
    top.index += 1
    print(top.to_string())

    n_scored = df["insider_trading_prob"].notna().sum()
    print(f"\nScored {n_scored}/{len(df)} markets")

    return df, rf, scaler
