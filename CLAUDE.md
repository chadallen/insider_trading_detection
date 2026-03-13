# Insider Trading Detection — Developer Context

## What This Is

A proof-of-concept ML pipeline that detects potential insider trading on
[Polymarket](https://polymarket.com) by analyzing price anomalies and on-chain
wallet behavior in resolved political prediction markets.

## Current State (as of March 2026)

**Phases 1, 2, and 3 of the refactor are complete.** The pipeline runs
end-to-end with the new ensemble model (PU-LightGBM + IsolationForest +
One-Class SVM). A full run with real Dune data produced results across 77
markets. Phase 4 (new data sources, primarily GDELT) is next.

### Architecture Decision: cross_market_wallet_flag (2026-03-13)

`cross_market_wallet_flag` is now computed **locally** from `top_wallet_addresses`
already fetched by the main Dune wallet query. The original Dune-based query
(`fetch_cross_market_wallet_flags`) was disabled because it consistently hit the
10-credit per-query resource cap (`FAILED_TYPE_RESOURCES_CAP_REACHED`).

**Tradeoff:** The local approach only covers the top-N wallets per market (top 20),
not the full trader population. Concentrated insiders (large bets) are likely
captured; distributed/layered trading across many small wallets may be missed.

**To re-enable the Dune query:** Raise `DUNE_MAX_CREDITS` and uncomment
`fetch_cross_market_wallet_flags()` in `backend/pipeline/wallet_features.py`,
then update `run.py` to call it instead of `compute_cross_market_wallet_flags()`.

**Top suspects in current dataset (77 markets):**
1. Maduro out by Jan 31, 2026 — prob 0.70
2. Government shutdown end Nov 12 — prob 0.69
3. Khamenei out by Feb 28 — prob 0.68

---

## Directory Structure

```
run.py                        # CLI entrypoint — start here
backend/
  config.py                   # All tunable constants + env vars
  checkpoints.py              # Pickle-based cache (data/*.pkl)
  pipeline/
    fetcher.py                # Gamma API (markets) + CLOB API (price history)
    price_features.py         # Price features + Isolation Forest scoring
    wallet_features.py        # Dune queries + wallet feature computation
    scorer.py                 # Ensemble classifier (Phase 3)
    polygonscan.py            # Polygonscan API client (wallet age lookup)
    dune.py                   # Dune Analytics HTTP client
data/
  labeled_cases.csv           # 21 ground-truth insider trading cases (5 CONFIRMED,
                              #   9 SUSPECTED, 7 POSSIBLE)
  *.pkl                       # Cached pipeline intermediates
outputs/                      # CSV outputs (mirrored to dashboard/public/)
dashboard/                    # React frontend (Vite + Tailwind + Recharts)
  src/
    App.jsx
    components/
      SuspicionTable.jsx
      ScatterPlot.jsx
      DetailPanel.jsx
  public/                     # CSVs read by dashboard at runtime
```

---

## Pipeline Flow (current — post Phase 3 refactor)

```
1. FETCH       Gamma API → df_markets (closed political, vol ≥ $10M, ≥ 2025-01-01)
               CLOB API  → histories {token_id → price DataFrame} at fidelity=60
               Labeled cases get extended price windows from labeled_cases.csv start date

2. PRICE       build_price_features() → df_scored
   FEATURES    Features: surprise_score, late_move_ratio, price_volatility,
               max_single_move, total_price_move,
               price_momentum_6h, price_momentum_12h  ← Phase 2
               score_with_isolation_forest() → adds suspicion_score (price-only,
               used to rank markets for Dune wallet queries)

3. WALLET      fetch_top_n_wallet_data(top_n=50) → df_wallet_agg (~4 credits)
   FEATURES    Dune table: polymarket_polygon.market_trades
               Features: new_wallet_ratio, new_wallet_ratio_6h, burst_score,
               order_flow_imbalance, wallet_concentration  ← Phase 2 (Gini)
               top_wallet_addresses (top 20 wallets, used for Polygonscan)
               fetch_wallet_age_features() → wallet_age_median_days  ← Phase 2
               fetch_cross_market_wallet_flags() → cross_market_wallet_flag  ← Phase 2

4. MERGE       merge_features() → df_combined (14 features total)
               No intermediate heuristic scoring — classifier sees raw features

5. CLASSIFY    train_classifier() → insider_trading_prob ∈ [0,1]
               Ensemble: 0.5 × pu_prob + 0.3 × iso_score + 0.2 × ocsvm_score
               PU-LightGBM: positives from labeled_cases.csv with soft weights
               IsolationForest: unified feature matrix (all 14 features)
               One-Class SVM: trained on CONFIRMED cases only (needs ≥ 3)
               Missing features imputed with column medians

6. OUTPUT      Write df_combined.csv, df_scored.csv, df_wallet_agg.csv
               → outputs/ and dashboard/public/
```

---

## Run Modes

| Command | Credits | Time | Use |
|---------|---------|------|-----|
| `python run.py` | ~8 | ~25 min | Full refresh |
| `python run.py --skip-fetch` | ~5 | ~5 min | Rescore with cached markets |
| `python run.py --skip-dune` | 0 | ~10 min | Price signals only |
| `python run.py --classifier-only` | 0 | ~5 sec | Retrain ensemble after label edits |
| `python run.py --classifier-only --push` | 0 | ~1 min | Update live dashboard |
| `python run.py --live --hours-ahead 48` | ~4 | ~5 min | POC: score open markets |

---

## Key Configuration

**`backend/config.py`** — change behavior without touching pipeline code:
- `TOP_N_MARKETS=50` — how many markets get wallet queries
- `MIN_VOLUME_USD=10_000_000` — market volume filter
- `MIN_END_DATE="2025-01-01"` — earliest market to include
- `PRICE_HOURS_BEFORE=48` — price history window before resolution
- `POLYGONSCAN_API_KEY` — optional; if empty, wallet age lookup is skipped

**`backend/pipeline/scorer.py`** — ML tuning:
- `MODEL_PRICE_FEATURES` / `MODEL_WALLET_FEATURES` — feature lists (14 total)
- `LABEL_WEIGHTS` — soft weights: CONFIRMED=1.0, SUSPECTED=0.6, POSSIBLE=0.3
- `ENSEMBLE_WEIGHTS` — pu=0.5, iso=0.3, ocsvm=0.2 (must sum to 1.0)
- LightGBM hyperparams: `n_estimators=200`, `max_depth=3`, `num_leaves=7`,
  `reg_alpha=1.0`, `reg_lambda=1.0`, `class_weight="balanced"`

**`data/labeled_cases.csv`** — ground truth:
- 21 cases: 5 CONFIRMED, 9 SUSPECTED, 7 POSSIBLE
- Add a row here + run `--classifier-only` to incorporate new cases
- Columns: `key, label, question_filter, start, end, resolution, notes, polymarket_url`
- `question_filter` uses SQL LIKE syntax matched against market question strings

**`.env`** — required at repo root (gitignored, never committed):
```
DUNE_API_KEY=...
GITHUB_TOKEN=...              # only needed for --push
GITHUB_REPO=chadallen/insider_trading_detection
GITHUB_BRANCH=main
TOP_N_MARKETS=50
POLYGONSCAN_API_KEY=...       # optional; get free key at polygonscan.com
```

---

## Feature Set (14 features after Phase 2+3)

### Price features (7) — `price_features.py`
| Feature | Description |
|---|---|
| `surprise_score` | How unexpected the resolution outcome was (`\|actual - starting_price\|`) |
| `late_move_ratio` | Fraction of total price movement in the final step before resolution |
| `price_volatility` | Std dev of absolute price changes across the CLOB history |
| `max_single_move` | Largest single price step in the history |
| `total_price_move` | Absolute difference between first and last price |
| `price_momentum_6h` | Price change in final 6h window (requires fidelity=60) |
| `price_momentum_12h` | Price change in final 12h window (requires fidelity=60) |

### Wallet features (7) — `wallet_features.py` + `polygonscan.py`
| Feature | Description |
|---|---|
| `new_wallet_ratio` | Fraction of trading wallets with no prior Polymarket activity |
| `new_wallet_ratio_6h` | Same, restricted to the final 6h window |
| `burst_score` | Ratio of peak-hour trade count to median hourly trade count |
| `order_flow_imbalance` | Net directional bias in on-chain trades (renamed from `trade_vpin`) |
| `wallet_concentration` | Gini coefficient of trade sizes — high = few large bets |
| `wallet_age_median_days` | Median days since first tx for trading wallets (Polygonscan) |
| `cross_market_wallet_flag` | Count of wallets also active in 3+ other flagged markets |

The price-only `suspicion_score` (IsolationForest on price features) is
preserved in `df_combined` as a ranking signal for Dune market selection but
is not fed to the ensemble classifier.

---

## Model Architecture (Phase 3)

### PU Learning — LightGBM (primary, weight 0.5)

Two-step Elkan & Noto adjustment:
1. Train LightGBM with labeled positives (class 1) vs. all unlabeled markets
   (class 0). Unlabeled are NOT assumed to be clean negatives.
2. Estimate prior: `c = mean(raw_prob[labeled_positives])`
3. Adjust: `pu_prob = clip(raw_prob / c, 0, 1)`

Soft label weights applied as `sample_weight` to LightGBM fit.

### IsolationForest (secondary, weight 0.3)

Runs on the full 14-feature matrix (not just price features as in Phase 1).
`contamination=0.1`. Score normalized to [0, 1] via min-max.

### One-Class SVM (tertiary, weight 0.2)

Trained only on CONFIRMED cases. Requires ≥ 3 CONFIRMED matches in the current
dataset; falls back to neutral 0.5 if fewer. `nu=0.5, kernel="rbf", gamma="scale"`.

### Zero-variance guard

Features with `std < 1e-6` across the dataset are silently dropped before
training. This is expected when running `--skip-dune` (all wallet features
collapse to their imputed median=0). The active feature list is printed at
train time.

---

## Phase Completion Status

### ✅ Phase 1 — Foundation
- Labeled case feature computation uses per-case `start`/`end` windows
- POSITIVE_KEYWORDS removed; `labeled_cases.csv` is sole positive source
- CLOB fidelity switched from 720 → 60 (hourly data)
- `vpin_score` / `time_weighted_vpin` dropped
- `trade_vpin` renamed to `order_flow_imbalance`

### ✅ Phase 2 — Feature improvements
- `price_momentum_6h` and `price_momentum_12h` added to price features
- `wallet_concentration` (Gini coefficient) added to Dune wallet query
- `wallet_age_median_days` via Polygonscan API (`backend/pipeline/polygonscan.py`)
  - Dune query now returns `top_wallet_addresses` (top 20 wallets per market)
  - `fetch_wallet_age_features()` in `wallet_features.py` calls Polygonscan
  - Skipped silently if `POLYGONSCAN_API_KEY` is empty or column is missing
- `cross_market_wallet_flag` via new Dune query in `fetch_cross_market_wallet_flags()`
  - ~0.5 Dune credits per full run
  - Counts wallets active in 3+ of the top-N markets being analyzed
  - Called from `run.py` after the main wallet query

### ✅ Phase 3 — Model upgrade
- PU-LightGBM replaces RandomForest
- Unified IsolationForest on merged feature matrix
- One-Class SVM on CONFIRMED cases
- Ensemble: `0.5 × pu_prob + 0.3 × iso_score + 0.2 × ocsvm_score`
- `train_classifier()` returns `(df, model_bundle, scaler, active_features)`
  where `model_bundle = {"lgbm": ..., "iso": ..., "ocsvm": ..., "c": float}`
- Backward-compat aliases in scorer.py: `RF_FEATURES`, `RF_PRICE_FEATURES`,
  `RF_WALLET_FEATURES` (point to MODEL_* equivalents; safe to remove once
  any external scripts are updated)
- `checkpoints.py` has graceful pickle recovery: if a checkpoint fails to
  load (e.g., pandas version mismatch across machines), it prints a truncated
  error and returns None so the pipeline recomputes from scratch

### 🔲 Phase 4 — New data sources
See below.

### 🔲 Phase 5 — Validation
See below.

---

## Phase 4 — New Data Sources (next)

### Goal
Add `news_article_count_48h` as a feature. Low news coverage + strong price
move is a more suspicious pattern than the same move with heavy news. This is
the highest-signal Phase 4 addition.

### Step-by-step

#### 4a. GDELT integration (primary)

GDELT is a free global news event database accessible via BigQuery free tier
(1 TB/month query budget; no credit card required for free tier).

1. Create a Google Cloud project and enable BigQuery API (free).
2. Add `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_CLOUD_PROJECT` to `.env`.
3. Create `backend/pipeline/gdelt.py` with a function:
   ```python
   def fetch_news_count(question: str, resolution_time: datetime,
                        hours_before: int = 48) -> int:
       """
       Query GDELT via BigQuery for article count mentioning key terms
       extracted from `question` in the window [resolution_time - hours_before,
       resolution_time]. Returns 0 if BigQuery is unavailable.
       """
   ```
4. Key extraction: strip stop words from the market question to produce 2-3
   search terms. E.g., "Will Maduro be out by Jan 31?" → `["Maduro", "Venezuela"]`.
5. GDELT table: `gdelt-bq.gdeltv2.events` — filter on `Actor1Name` or
   `SOURCEURL` containing key terms, group by date.
6. Cache results per market in a new checkpoint (`gdelt_counts.pkl`).
7. Add `news_article_count_48h` to `MODEL_FEATURES` in `scorer.py`.
8. Update `build_price_features()` or add a new `enrich_with_gdelt()` step
   in `run.py` between price features and wallet features.

**Fallback if BigQuery is too much friction:** DuckDuckGo News scraping
(`requests` + `BeautifulSoup`) — no API key, less reliable, rate-limited.
Pattern: `https://html.duckduckgo.com/html/?q={terms}&df=d2` and count results.

#### 4b. Kalshi cross-reference (evaluate after GDELT)

Two labeled cases (`kalshi_mrbeast`, `kalshi_langford`) are Kalshi-only.
Decision needed: keep pipeline Polymarket-only, or extend?

If extending: Kalshi public API at `https://trading-api.kalshi.com/trade-api/v2`
is free read-only. For each Polymarket market, find the equivalent Kalshi market
(by topic matching) and compute `kalshi_price_divergence = poly_price - kalshi_price`
in the 48h window. A market moving on Polymarket but not Kalshi suggests
informed flow specific to one platform.

#### 4c. Twitter/X API (evaluate after GDELT)

Free basic tier: 500K tweets/month read access. Higher signal recency than
GDELT, but noisier. Evaluate only if GDELT signal proves insufficient.

### Feature addition checklist

For any new feature added in Phase 4:
1. Add to `MODEL_FEATURES` in `scorer.py`
2. Add to the feature table in this document
3. Imputation fallback (0 or median) in `_impute_wallet_features()`
4. Test with `--skip-dune --classifier-only` to verify imputation path works
5. Test with `--skip-fetch` to confirm feature survives the merge step

---

## Phase 5 — Validation (after Phase 4)

1. Leave-one-out CV on all labeled cases: for each positive, remove it from
   training, score the full dataset, check whether the held-out case still
   ranks in the top 10%.
2. Manual review of top 10 flagged historical markets from the last full run —
   spot-check for false positives.
3. Backtest: confirm model still flags the 3 current top suspects
   (Maduro 0.70, shutdown 0.69, Khamenei 0.68) after any Phase 4 changes.
4. Calibrate ensemble weights (`ENSEMBLE_WEIGHTS` in scorer.py) using
   leave-one-out results. Current weights (0.5/0.3/0.2) are a starting point.

---

## Open Questions

1. **GDELT setup friction**: BigQuery free tier requires a Google Cloud project.
   If this is too slow to set up, start with the DuckDuckGo fallback to unblock
   model testing, then migrate to BigQuery later.
2. **Polygonscan rate limits**: 5 req/sec free tier. With top_n=50 markets ×
   20 wallets each = 1,000 API calls. Current implementation batches and sleeps;
   if it's too slow, scope to top 20 markets by suspicion_score only.
3. **Kalshi scope**: decide before Phase 4b whether Kalshi markets are in scope.
   Currently two labeled cases are Kalshi-only and are effectively untestable.
4. **Ensemble weight calibration**: The 0.5/0.3/0.2 weights are unvalidated.
   Phase 5 leave-one-out CV will produce data to tune these.
5. **CONFIRMED case count for OC-SVM**: currently 5 CONFIRMED cases, but only
   those that match markets in the current dataset (77 markets) are used. If
   fewer than 3 match, OC-SVM falls back to neutral 0.5. A full pipeline run
   with `top_n=100` or looser date filters would bring in more matches.

---

## Known Limitations

1. **Small labeled set** — 21 cases total, 5 CONFIRMED. PU learning is more
   robust than RF to mislabeled data, but the model is still data-limited.
2. **CLOB data availability** — only ~30% of fetched markets survive the price
   history filter. Low-volume political markets often have no CLOB data.
3. **Wallet feature sparsity** — when running `--skip-dune`, all wallet features
   impute to median (≈0) and are dropped by the zero-variance guard. The model
   then runs on price features only, which is still useful but less precise.
4. **No entity resolution** — cannot link wallets across accounts or identify
   coordinated activity beyond the cross-market flag.
5. **Live mode is POC** — `--live` mode is not validated. Proxy features for
   resolution-dependent signals are heuristic.
6. **`news_article_count_48h` missing** — Phase 4 item. Until integrated, the
   model cannot distinguish public-information trading from true insider trading
   in markets that happened to have low news coverage anyway.
