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

# Price features are present for all markets after price scoring.
# Wallet features are only present for TOP_N markets after the wallet query.
# The classifier imputes missing wallet features with column medians so
# every market can participate in training and scoring.

RF_PRICE_FEATURES = [
    "vpin_score",
    "time_weighted_vpin",
    "surprise_score",
    "late_move_ratio",
    "price_volatility",
]

RF_WALLET_FEATURES = [
    "new_wallet_ratio",
    "new_wallet_ratio_6h",
    "burst_score",
    "trade_vpin",
]

RF_FEATURES = RF_PRICE_FEATURES + RF_WALLET_FEATURES

# Markets whose question contains any of these keywords are treated as
# known insider trading positives for training.
POSITIVE_KEYWORDS = [
    "Maduro", "Machado", "Khamenei", "Venezuela",
    "ZachXBT", "Taylor Swift", "Ophelia", "Gemini 3",
    # Confirmed insider trading — Feb 28 strike specifically, not all Iran markets
    "US strikes Iran by February 28",
]


# ── Build df_combined ─────────────────────────────────────────────────────

def build_combined(df_scored: pd.DataFrame, df_wallet_agg: pd.DataFrame | None) -> pd.DataFrame:
    """
    Merge price features + wallet features, normalize scores, compute combined_score.
    combined_score = geometric mean of price_score and wallet_score (when both available),
    requiring both signals to be elevated to score highly (fewer false positives).
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
        # Dune returns all numeric columns as strings — coerce to float
        numeric_cols = ["burst_score", "trade_vpin", "directional_consensus",
                        "new_wallet_ratio", "new_wallet_ratio_6h",
                        "total_volume", "trade_count", "unique_wallets"]
        for col in numeric_cols:
            if col in df_wallet.columns:
                df_wallet[col] = pd.to_numeric(df_wallet[col], errors="coerce")

        df_wallet["wallet_score"] = df_wallet.apply(
            lambda row: compute_wallet_score(row.to_dict()), axis=1
        )

    # Merge — keep directional_consensus for wallet_score calculation but not RF features
    wallet_cols = ["question", "wallet_score", "new_wallet_ratio", "new_wallet_ratio_6h",
                   "burst_score", "directional_consensus", "trade_vpin"]
    df_combined = df_price.merge(
        df_wallet[wallet_cols]
        if not df_wallet.empty and all(c in df_wallet.columns for c in wallet_cols)
        else pd.DataFrame(columns=["question"]),
        on="question",
        how="left",
    )

    df_combined["combined_score"] = df_combined.apply(
        lambda r: (
            (r["price_score"] * r["wallet_score"]) ** 0.5
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
) -> tuple[pd.DataFrame, object, object, list[str]]:
    """
    Train Random Forest on df_combined.
    Returns (df_with_probs, model, scaler, active_features).

    Key design decisions:
    - Wallet feature NaNs are imputed with column medians (not 0) before training.
      This means 'no wallet data' is treated as 'average market', not 'clean market'.
    - Features with zero variance in the training set are dropped automatically,
      since they cannot contribute signal and cause the RF to output a constant.
    - All markets are scored (not just those with wallet data).

    To tune: adjust RF_FEATURES / RF_PRICE_FEATURES / RF_WALLET_FEATURES or
    POSITIVE_KEYWORDS above, or pass them in from run.py.
    """
    if features is None:
        features = RF_FEATURES
    if pos_keywords is None:
        pos_keywords = POSITIVE_KEYWORDS

    df = df_combined.copy()

    # ── Step 1: Impute wallet feature NaNs with column median ─────────────
    imputed_cols = []
    for col in RF_WALLET_FEATURES:
        if col not in df.columns:
            df[col] = np.nan
        if df[col].isna().any():
            median_val = df[col].median()
            fill_val   = median_val if pd.notna(median_val) else 0.0
            df[col]    = df[col].fillna(fill_val)
            imputed_cols.append(f"{col}→{fill_val:.3f}")
    if imputed_cols:
        print(f"  Imputed NaNs:      {', '.join(imputed_cols)}")
    else:
        print("  Imputed NaNs:      none (all wallet features present)")

    # ── Step 2: Label positives ───────────────────────────────────────────
    df["is_positive"] = df["question"].apply(
        lambda q: any(kw.lower() in str(q).lower() for kw in pos_keywords)
    )
    n_pos = df["is_positive"].sum()
    print(f"  Positives matched: {n_pos}")
    if n_pos > 0:
        for q in df[df["is_positive"]]["question"].tolist():
            print(f"    + {q[:80]}")

    # ── Step 3: Label negatives ───────────────────────────────────────────
    n_neg = min(n_neg, len(df) - n_pos)
    neg_idx = (
        df[~df["is_positive"]]
        .dropna(subset=features)
        .nsmallest(n_neg, "combined_score")
        .index
    )
    df["is_negative"] = False
    df.loc[neg_idx, "is_negative"] = True
    print(f"  Negatives used:    {len(neg_idx)} (bottom {n_neg} by combined_score)")

    # ── Step 4: Build training set ────────────────────────────────────────
    df_train = df[df["is_positive"] | df["is_negative"]].dropna(subset=features).copy()
    X_train  = df_train[features].values
    y_train  = df_train["is_positive"].astype(int).values
    print(f"  Training set:      {y_train.sum()} pos | {(y_train == 0).sum()} neg | {len(df_train)} total")

    if y_train.sum() == 0:
        print("  No positives in training set.")
        print("  Possible causes:")
        print("    1. POSITIVE_KEYWORDS don't match any question in df_combined")
        print("    2. df_combined is stale — re-run scoring then retry")
        df["insider_trading_prob"] = np.nan
        return df, None, None, features

    # ── Step 5: Drop zero-variance features ──────────────────────────────
    print(f"\n  {'Feature':<25} {'Std':>7}  {'Min':>7}  {'Max':>7}")
    print("  " + "─" * 50)
    active_features = []
    for feat in features:
        col_vals = df_train[feat]
        std = col_vals.std()
        mn, mx = col_vals.min(), col_vals.max()
        if std < 1e-6:
            print(f"  {feat:<25} {std:>7.4f}  {mn:>7.4f}  {mx:>7.4f}  ZERO VARIANCE — dropping")
        else:
            print(f"  {feat:<25} {std:>7.4f}  {mn:>7.4f}  {mx:>7.4f}")
            active_features.append(feat)

    if not active_features:
        print("  All features have zero variance — cannot train.")
        df["insider_trading_prob"] = np.nan
        return df, None, None, features

    if len(active_features) < len(features):
        dropped = set(features) - set(active_features)
        print(f"\n  Dropped {len(dropped)} zero-variance feature(s): {dropped}")

    # ── Step 6: Train ─────────────────────────────────────────────────────
    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(df_train[active_features].values)
    rf = RandomForestClassifier(
        n_estimators=200, class_weight="balanced",
        max_depth=4, min_samples_leaf=2, random_state=42,
    )
    rf.fit(X_scaled, y_train)

    # ── Step 7: Score all markets ─────────────────────────────────────────
    df_scoreable = df.dropna(subset=active_features).copy()
    X_all = scaler.transform(df_scoreable[active_features].values)
    df_scoreable["insider_trading_prob"] = rf.predict_proba(X_all)[:, 1]

    if "insider_trading_prob" in df.columns:
        df = df.drop(columns=["insider_trading_prob"])
    df = df.join(df_scoreable[["insider_trading_prob"]], how="left")

    # Print feature importances
    print("\nFeature importances:")
    for feat, imp in sorted(zip(active_features, rf.feature_importances_), key=lambda x: -x[1]):
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

    return df, rf, scaler, active_features
