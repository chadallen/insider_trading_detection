#!/usr/bin/env python3
"""
Insider trading detection pipeline — CLI entrypoint.

Run modes:
  python run.py                    Full pipeline (fetch + score + classify)
  python run.py --skip-fetch       Use cached markets/histories, re-run scoring
  python run.py --skip-dune        Price pipeline only — no Dune credits spent
  python run.py --classifier-only  Retrain RF on saved df_combined (fastest, 0 credits)
  python run.py --push             Push output CSVs to GitHub after running

Example iteration loop (model tuning):
  1. Edit scorer.py (RF_FEATURES, POSITIVE_KEYWORDS, hyperparams)
  2. python run.py --classifier-only
  3. Review output, repeat
"""
import argparse
import os
import sys
from datetime import datetime, timezone

# Allow running from repo root without installing
sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd


def parse_args():
    p = argparse.ArgumentParser(description="Polymarket insider trading detector")
    p.add_argument("--skip-fetch",       action="store_true", help="Skip Gamma + CLOB fetch, use cached data")
    p.add_argument("--skip-dune",        action="store_true", help="Skip all Dune queries (0 credits, price signals only)")
    p.add_argument("--classifier-only",  action="store_true", help="Retrain RF on saved df_combined only")
    p.add_argument("--push",             action="store_true", help="Push output CSVs to GitHub when done")
    p.add_argument("--top-n",            type=int, default=None, help="Override TOP_N_MARKETS for wallet query")
    p.add_argument("--contamination",    type=float, default=0.1, help="Isolation Forest contamination (default: 0.1)")
    p.add_argument("--n-neg",            type=int, default=30, help="Number of implicit negatives for RF (default: 30)")
    return p.parse_args()


def push_to_github(df_combined, df_scored, df_wallet_agg):
    from github import Github
    from backend.config import GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH

    g = Github(GITHUB_TOKEN)
    repo = g.get_repo(GITHUB_REPO)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    def push_csv(df, filename, message):
        if df is None or (hasattr(df, "empty") and df.empty):
            print(f"  Skipping {filename} (empty)")
            return
        content = df.to_csv(index=False)
        path = f"outputs/{filename}"
        try:
            existing = repo.get_contents(path, ref=GITHUB_BRANCH)
            repo.update_file(path, message, content, existing.sha, branch=GITHUB_BRANCH)
            print(f"  Updated  {path}")
        except Exception:
            repo.create_file(path, message, content, branch=GITHUB_BRANCH)
            print(f"  Created  {path}")

    print(f"Pushing to {GITHUB_REPO} ({ts})...")
    push_csv(df_combined,   "df_combined.csv",   f"Update combined scores {ts}")
    push_csv(df_scored,     "df_scored.csv",      f"Update price scores {ts}")
    push_csv(df_wallet_agg, "df_wallet_agg.csv",  f"Update wallet scores {ts}")
    print("Done — dashboard will update within ~1 minute.")


def main():
    args = parse_args()

    import backend.checkpoints as cp
    from backend.pipeline.fetcher import fetch_markets, fetch_price_histories
    from backend.pipeline.price_features import (
        build_price_features, enrich_with_dune_vpin, score_with_isolation_forest
    )
    from backend.pipeline.wallet_features import fetch_top_n_wallet_data
    from backend.pipeline.scorer import build_combined, train_classifier, RF_FEATURES, RF_WALLET_FEATURES
    from backend.config import TOP_N_MARKETS

    top_n = args.top_n or TOP_N_MARKETS

    # ── Classifier-only mode: load df_combined, retrain, save ────────────
    if args.classifier_only:
        print("=== Classifier-only mode ===")
        state = cp.load_all()
        df_combined = state.get("df_combined")
        if df_combined is None:
            print("No saved df_combined found. Run full pipeline first.")
            sys.exit(1)
        print(f"Loaded df_combined: {len(df_combined)} markets")

        _preflight(df_combined)
        print("\n=== Training RF classifier ===")
        df_combined, rf_model, rf_scaler, _ = train_classifier(
            df_combined, n_neg=args.n_neg
        )
        cp.save("df_combined", df_combined)
        _write_outputs(df_combined, state.get("df_scored"), state.get("df_wallet_agg"))
        if args.push:
            push_to_github(df_combined, state.get("df_scored"), state.get("df_wallet_agg"))
        return

    # ── Load or fetch markets / histories ────────────────────────────────
    state = cp.load_all()

    if args.skip_fetch and state["df_markets"] is not None:
        print("=== Using cached markets + histories ===")
        df_markets = state["df_markets"]
        histories  = state["histories"]
    else:
        print("=== Fetching markets ===")
        df_markets = fetch_markets()
        cp.save("df_markets", df_markets)

        print("\n=== Fetching price histories ===")
        histories = fetch_price_histories(df_markets)
        cp.save("histories", histories)

    # ── Price features ────────────────────────────────────────────────────
    print("\n=== Computing price features ===")
    df_scored = build_price_features(df_markets, histories)

    if not args.skip_dune:
        print("\n=== Enriching VPIN from Dune (~1 credit) ===")
        df_scored = enrich_with_dune_vpin(df_scored)

    print("\n=== Isolation Forest scoring ===")
    df_scored = score_with_isolation_forest(df_scored, contamination=args.contamination)
    cp.save("df_scored", df_scored)

    # ── Wallet features (optional, ~4 credits) ───────────────────────────
    df_wallet_agg = state.get("df_wallet_agg")
    if not args.skip_dune:
        print(f"\n=== Top-{top_n} wallet query from Dune (~4 credits) ===")
        df_wallet_agg = fetch_top_n_wallet_data(df_scored, top_n=top_n)
        cp.save("df_wallet_agg", df_wallet_agg)
    else:
        print("\n=== Skipping wallet query (--skip-dune) ===")
        if df_wallet_agg is not None:
            print(f"  Using cached df_wallet_agg ({len(df_wallet_agg)} markets)")

    # ── Combine scores ────────────────────────────────────────────────────
    print("\n=== Combining scores ===")
    df_combined = build_combined(df_scored, df_wallet_agg)

    # ── Train classifier ──────────────────────────────────────────────────
    _preflight(df_combined)
    print("\n=== Training RF classifier ===")
    df_combined, rf_model, rf_scaler, _ = train_classifier(df_combined, n_neg=args.n_neg)
    cp.save("df_combined", df_combined)

    # ── Write outputs ─────────────────────────────────────────────────────
    _write_outputs(df_combined, df_scored, df_wallet_agg)

    if args.push:
        push_to_github(df_combined, df_scored, df_wallet_agg)

    print("\nDone.")


def _preflight(df_combined):
    """Print NaN counts per RF feature so you can see what's populated before training."""
    from backend.pipeline.scorer import RF_FEATURES, RF_WALLET_FEATURES
    print("\n=== Pre-flight: feature NaN counts ===")
    for feat in RF_FEATURES:
        if feat in df_combined.columns:
            n_null = df_combined[feat].isna().sum()
            n_ok   = df_combined[feat].notna().sum()
            tag    = " <- needs wallet query" if n_null > 0 and feat in RF_WALLET_FEATURES else ""
            print(f"  {feat:<25} {n_ok:>4} present  {n_null:>4} NaN{tag}")
        else:
            print(f"  {feat:<25}  MISSING COLUMN — check scorer.py")


def _write_outputs(df_combined, df_scored, df_wallet_agg):
    """Write CSVs to outputs/ so the dashboard can read them locally."""
    out_dir = os.path.join(os.path.dirname(__file__), "outputs")
    os.makedirs(out_dir, exist_ok=True)

    if df_combined is not None:
        df_combined.to_csv(os.path.join(out_dir, "df_combined.csv"), index=False)
    if df_scored is not None:
        df_scored.to_csv(os.path.join(out_dir, "df_scored.csv"), index=False)
    if df_wallet_agg is not None:
        df_wallet_agg.to_csv(os.path.join(out_dir, "df_wallet_agg.csv"), index=False)

    print(f"\nOutputs written to outputs/")


if __name__ == "__main__":
    main()
