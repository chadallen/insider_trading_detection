"""
Merges price + wallet features and trains the Random Forest classifier.
Corresponds to notebook Cells 12 and 13.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from backend.pipeline.wallet_features import load_labeled_cases, question_matches_filter


# ── RF configuration ──────────────────────────────────────────────────────

# Features fed to the RF. All come from the unified feature matrix built by
# merge_features(). Wallet features are NaN for markets outside the top-N
# wallet query and are imputed with column medians before training/scoring.

RF_PRICE_FEATURES = [
    "surprise_score",
    "late_move_ratio",
    "price_volatility",
    "max_single_move",
    "total_price_move",
]

RF_WALLET_FEATURES = [
    "new_wallet_ratio",
    "new_wallet_ratio_6h",
    "burst_score",
    "order_flow_imbalance",
]

RF_FEATURES = RF_PRICE_FEATURES + RF_WALLET_FEATURES

# Soft confidence weights by label type, used as sample_weight in RF training.
LABEL_WEIGHTS = {
    "CONFIRMED": 1.0,
    "SUSPECTED": 0.6,
    "POSSIBLE":  0.3,
}


# ── Merge price + wallet features ─────────────────────────────────────────

def merge_features(df_scored: pd.DataFrame, df_wallet_agg: pd.DataFrame | None) -> pd.DataFrame:
    """
    Merge price features and wallet features into a single DataFrame.
    No intermediate scoring — the RF trains directly on raw features.
    suspicion_score (IsolationForest output) is preserved for negative selection.
    """
    price_cols = [
        "question", "volume", "suspicion_score",
        "surprise_score", "late_move_ratio", "price_volatility",
        "max_single_move", "total_price_move",
    ]
    df_price = df_scored[[c for c in price_cols if c in df_scored.columns]].copy()

    df_wallet = (
        df_wallet_agg.copy()
        if df_wallet_agg is not None and not df_wallet_agg.empty
        else pd.DataFrame()
    )
    if not df_wallet.empty:
        numeric_cols = [
            "burst_score", "order_flow_imbalance", "directional_consensus",
            "new_wallet_ratio", "new_wallet_ratio_6h",
            "total_volume", "trade_count", "unique_wallets",
        ]
        for col in numeric_cols:
            if col in df_wallet.columns:
                df_wallet[col] = pd.to_numeric(df_wallet[col], errors="coerce")

    wallet_cols = [
        "question", "new_wallet_ratio", "new_wallet_ratio_6h",
        "burst_score", "directional_consensus", "order_flow_imbalance",
    ]
    df_combined = df_price.merge(
        df_wallet[[c for c in wallet_cols if c in df_wallet.columns]]
        if not df_wallet.empty
        else pd.DataFrame(columns=["question"]),
        on="question",
        how="left",
    )

    with_wallet = (
        df_combined["order_flow_imbalance"].notna().sum()
        if "order_flow_imbalance" in df_combined.columns else 0
    )
    print(f"df_combined: {len(df_combined)} markets ({with_wallet} with wallet data)")
    return df_combined


# ── Random Forest classifier ──────────────────────────────────────────────

def train_classifier(
    df_combined: pd.DataFrame,
    features: list[str] | None = None,
    n_neg: int = 30,
) -> tuple[pd.DataFrame, object, object, list[str]]:
    """
    Train Random Forest on df_combined.
    Returns (df_with_probs, model, scaler, active_features).

    Positives are drawn from labeled_cases.csv (CONFIRMED / SUSPECTED / POSSIBLE)
    with soft sample weights (1.0 / 0.6 / 0.3). No POSITIVE_KEYWORDS — the CSV
    is the single source of truth.

    Negatives are the bottom n_neg markets by suspicion_score (IsolationForest
    anomaly output) that are not labeled positives.

    Wallet feature NaNs are imputed with column medians so every market can
    participate in training and scoring.
    """
    if features is None:
        features = RF_FEATURES

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

    # ── Step 2: Label positives from labeled_cases.csv ────────────────────
    labeled_df = load_labeled_cases()

    def _get_weight(question: str) -> float:
        best = 0.0
        for _, case in labeled_df.iterrows():
            if question_matches_filter(question, case["question_filter"]):
                best = max(best, LABEL_WEIGHTS.get(case["label"], 0.0))
        return best

    df["label_weight"] = df["question"].apply(_get_weight)
    df["is_positive"]  = df["label_weight"] > 0

    n_pos = df["is_positive"].sum()
    print(f"  Positives matched: {n_pos}")
    if n_pos > 0:
        for _, row in df[df["is_positive"]].iterrows():
            print(f"    + [{row['label_weight']:.1f}] {str(row['question'])[:80]}")
    else:
        print("  WARNING: No labeled cases matched markets in df_combined.")
        print("  Check that labeled_cases.csv question_filters match current market questions.")
        df["insider_trading_prob"] = np.nan
        return df, None, None, features

    # ── Step 3: Label negatives ───────────────────────────────────────────
    rank_col = "suspicion_score" if "suspicion_score" in df.columns else df[features].sum(axis=1).name
    n_neg = min(n_neg, len(df) - n_pos)
    neg_idx = (
        df[~df["is_positive"]]
        .dropna(subset=features)
        .nsmallest(n_neg, rank_col)
        .index
    )
    df["is_negative"] = False
    df.loc[neg_idx, "is_negative"] = True
    print(f"  Negatives used:    {len(neg_idx)} (bottom {n_neg} by {rank_col})")

    # ── Step 4: Build training set ────────────────────────────────────────
    df_train = df[df["is_positive"] | df["is_negative"]].dropna(subset=features).copy()
    X_train  = df_train[features].values
    y_train  = df_train["is_positive"].astype(int).values
    # Soft weights: positives weighted by label confidence, negatives all 1.0
    sample_weights = np.where(
        y_train == 1,
        df_train["label_weight"].values,
        1.0,
    )
    print(f"  Training set:      {y_train.sum()} pos | {(y_train == 0).sum()} neg | {len(df_train)} total")

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
    rf.fit(X_scaled, y_train, sample_weight=sample_weights)

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
        [["question", "insider_trading_prob", "suspicion_score"]]
        .reset_index(drop=True)
    )
    top.index += 1
    print(top.to_string())

    n_scored = df["insider_trading_prob"].notna().sum()
    print(f"\nScored {n_scored}/{len(df)} markets")

    return df, rf, scaler, active_features
