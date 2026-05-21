"""
Tests for PU learning labeled-only exclusion fix (insider_trading_detection-gy0).

Verifies:
1. _merge_labeled_features() sets is_labeled_only=True on df_labeled rows and
   is_labeled_only=False on pipeline rows.
2. train_classifier() excludes is_labeled_only rows from the unlabeled pool
   used for LightGBM training, so the unlabeled count equals the number of
   current pipeline markets not matched as positives.
"""
import sys
import os
import numpy as np
import pandas as pd

# Allow imports from repo root without install
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Tests for _merge_labeled_features ────────────────────────────────────────

def _make_pipeline_df(n=5):
    """Minimal df_combined with price features."""
    return pd.DataFrame({
        "question": [f"pipeline market {i}" for i in range(n)],
        "suspicion_score": np.random.rand(n),
        "surprise_score": np.random.rand(n),
        "late_move_ratio": np.random.rand(n),
        "price_volatility": np.random.rand(n),
        "max_single_move": np.random.rand(n),
        "total_price_move": np.random.rand(n),
        "price_momentum_6h": np.random.rand(n),
        "price_momentum_12h": np.random.rand(n),
    })


def _make_labeled_df(n=3):
    """Minimal df_labeled with wallet features (no price features)."""
    return pd.DataFrame({
        "question": [f"labeled market {i}" for i in range(n)],
        "label": ["CONFIRMED", "SUSPECTED", "POSSIBLE"][:n],
        "new_wallet_ratio": np.random.rand(n),
        "burst_score": np.random.rand(n),
    })


def test_merge_labeled_features_sets_is_labeled_only():
    """Pipeline rows get is_labeled_only=False; labeled rows get is_labeled_only=True."""
    # Import under test (import here so sys.path insert takes effect)
    from run import _merge_labeled_features

    df_pipeline = _make_pipeline_df(5)
    df_labeled = _make_labeled_df(3)

    result = _merge_labeled_features(df_pipeline, df_labeled)

    assert "is_labeled_only" in result.columns, "is_labeled_only column should exist"
    assert result["is_labeled_only"].notna().all(), "No NaN values should remain in is_labeled_only"

    # Pipeline rows should be False
    pipeline_questions = set(df_pipeline["question"])
    pipeline_rows = result[result["question"].isin(pipeline_questions)]
    assert (pipeline_rows["is_labeled_only"] == False).all(), (
        "Pipeline rows should have is_labeled_only=False"
    )

    # Labeled-only rows (not in pipeline) should be True
    labeled_questions = set(df_labeled["question"])
    labeled_only_rows = result[result["question"].isin(labeled_questions)]
    assert (labeled_only_rows["is_labeled_only"] == True).all(), (
        "Labeled-only rows should have is_labeled_only=True"
    )


def test_merge_labeled_features_returns_unchanged_when_no_labeled():
    """Returns df_combined unchanged when df_labeled is None or empty."""
    from run import _merge_labeled_features

    df_pipeline = _make_pipeline_df(5)

    result_none = _merge_labeled_features(df_pipeline, None)
    assert len(result_none) == len(df_pipeline)
    assert "is_labeled_only" not in result_none.columns

    result_empty = _merge_labeled_features(df_pipeline, pd.DataFrame())
    assert len(result_empty) == len(df_pipeline)


def test_merge_labeled_features_deduplicates_on_question():
    """When a labeled market overlaps a pipeline market, the pipeline row wins."""
    from run import _merge_labeled_features

    # One overlapping market
    df_pipeline = _make_pipeline_df(3)
    df_pipeline.at[0, "question"] = "shared market"
    df_pipeline.at[0, "surprise_score"] = 0.99  # distinctive value

    df_labeled = _make_labeled_df(2)
    df_labeled.at[0, "question"] = "shared market"

    result = _merge_labeled_features(df_pipeline, df_labeled)

    # Should not duplicate the shared market
    assert result["question"].value_counts().max() == 1, "No duplicates expected"

    # The pipeline version of the shared market should be kept (surprise_score=0.99)
    shared = result[result["question"] == "shared market"]
    assert len(shared) == 1
    assert shared.iloc[0]["surprise_score"] == 0.99
    # And since pipeline row won, it should be labeled False
    assert shared.iloc[0]["is_labeled_only"] == False


# ── Tests for train_classifier unlabeled pool ─────────────────────────────────

def _make_df_for_training(n_pipeline=20, n_labeled_only=5, seed=42):
    """
    Build a synthetic df_combined:
    - n_pipeline rows: is_labeled_only=False, no label match
    - n_labeled_only rows: is_labeled_only=True, with questions that won't
      match anything in labeled_cases.csv
    """
    rng = np.random.default_rng(seed)
    n = n_pipeline + n_labeled_only

    features = [
        "surprise_score", "late_move_ratio", "price_volatility",
        "max_single_move", "total_price_move", "price_momentum_6h",
        "price_momentum_12h", "new_wallet_ratio", "new_wallet_ratio_6h",
        "burst_score", "order_flow_imbalance", "wallet_age_median_days",
        "cross_market_wallet_flag",
    ]
    data = {feat: rng.random(n) for feat in features}
    data["question"] = [f"synthetic pipeline market {i}" for i in range(n_pipeline)] + \
                       [f"synthetic labeled only market {i}" for i in range(n_labeled_only)]
    data["suspicion_score"] = rng.random(n)
    data["is_labeled_only"] = [False] * n_pipeline + [True] * n_labeled_only

    return pd.DataFrame(data)


def test_train_classifier_unlabeled_pool_excludes_labeled_only(capsys, monkeypatch):
    """
    When is_labeled_only rows are present, the unlabeled pool used for LightGBM
    training should equal n_pipeline rows only (those not matched as positives).
    """
    from backend.pipeline import scorer

    # Patch _label_positives to return no positives (all synthetic questions
    # won't match real labeled_cases.csv, but let's be explicit)
    def mock_label_positives(df):
        df = df.copy()
        df["label_weight"] = 0.0
        df["is_confirmed"] = False
        df["is_positive"] = False
        return df

    # Monkeypatch at the module level
    original = scorer._label_positives
    scorer._label_positives = mock_label_positives

    try:
        df = _make_df_for_training(n_pipeline=20, n_labeled_only=5)

        # With no positives, train_classifier returns early — we need at least
        # one positive. Add a fake positive pipeline row.
        df.at[0, "is_labeled_only"] = False
        # We'll inject is_positive manually by patching more carefully:
        def mock_label_positives_with_one_pos(df):
            df = df.copy()
            df["label_weight"] = 0.0
            df["is_confirmed"] = False
            df["is_positive"] = False
            # Mark first pipeline market as positive
            df.at[0, "label_weight"] = 1.0
            df.at[0, "is_confirmed"] = True
            df.at[0, "is_positive"] = True
            return df

        scorer._label_positives = mock_label_positives_with_one_pos

        df_result, model, scaler, active_feats = scorer.train_classifier(df)

        captured = capsys.readouterr()

        # The print line format: "{n_pos} positives | {n_unlabeled} unlabeled | {n_labeled_only} labeled-only..."
        assert "labeled-only (excluded from negatives)" in captured.out, (
            "Expected labeled-only exclusion message in output"
        )
        # n_unlabeled should be 19 (20 pipeline - 1 positive), not 24 (19 + 5 labeled-only)
        assert "19 unlabeled" in captured.out, (
            f"Expected 19 unlabeled (pipeline markets minus 1 positive), got:\n{captured.out}"
        )
        assert "5 labeled-only" in captured.out, (
            f"Expected 5 labeled-only excluded, got:\n{captured.out}"
        )
    finally:
        scorer._label_positives = original


def test_train_classifier_backward_compat_no_is_labeled_only_column(capsys, monkeypatch):
    """
    When is_labeled_only column is absent (old checkpoint), treat all rows as
    is_labeled_only=False — no rows excluded from unlabeled pool.
    """
    from backend.pipeline import scorer

    def mock_label_positives(df):
        df = df.copy()
        df["label_weight"] = 0.0
        df["is_confirmed"] = False
        df["is_positive"] = False
        df.at[0, "label_weight"] = 1.0
        df.at[0, "is_confirmed"] = True
        df.at[0, "is_positive"] = True
        return df

    original = scorer._label_positives
    scorer._label_positives = mock_label_positives

    try:
        df = _make_df_for_training(n_pipeline=20, n_labeled_only=0)
        # Remove the is_labeled_only column to simulate old checkpoint
        df = df.drop(columns=["is_labeled_only"])

        df_result, model, scaler, active_feats = scorer.train_classifier(df)

        captured = capsys.readouterr()

        # Should print 0 labeled-only excluded
        assert "0 labeled-only (excluded from negatives)" in captured.out, (
            f"Expected 0 labeled-only, got:\n{captured.out}"
        )
    finally:
        scorer._label_positives = original


if __name__ == "__main__":
    # Run with: python tests/test_pu_labeled_only.py
    import traceback
    tests = [
        test_merge_labeled_features_sets_is_labeled_only,
        test_merge_labeled_features_returns_unchanged_when_no_labeled,
        test_merge_labeled_features_deduplicates_on_question,
    ]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
