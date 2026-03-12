# Insider Trading Detection — Developer Context

## What This Is

A proof-of-concept ML pipeline that detects potential insider trading on
[Polymarket](https://polymarket.com) by analyzing price anomalies and on-chain
wallet behavior in resolved political prediction markets.

## Current State (as of March 2026)

The pipeline is working end-to-end. A full run with real Dune data was just
completed (~8 credits). The output CSVs in `outputs/` and `dashboard/public/`
are current.

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
    price_features.py         # Price features, Isolation Forest scoring
    wallet_features.py        # Dune queries, wallet feature computation
    scorer.py                 # Score combining + RF classifier (pre-refactor)
    dune.py                   # Dune Analytics HTTP client
data/
  labeled_cases.csv           # 23 ground-truth insider trading cases
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

## Pipeline Flow (current — pre-refactor)

See **Refactor Plan** below for the target architecture.

```
1. FETCH       Gamma API → df_markets (closed political, vol ≥ $10M, ≥ 2025-01-01)
               CLOB API  → histories {token_id → price DataFrame}

2. PRICE       build_price_features() → df_scored
   FEATURES    enrich_with_dune_vpin() → overwrites vpin_score (~1 credit)
               score_with_isolation_forest() → adds suspicion_score

3. WALLET      fetch_top_n_wallet_data(top_n=50) → df_wallet_agg (~4 credits)
   FEATURES    Dune table: polymarket_polygon.market_trades
               Features: new_wallet_ratio, new_wallet_ratio_6h,
                         burst_score, directional_consensus, trade_vpin

4. COMBINE     build_combined() → df_combined
               combined_score = √(price_score × wallet_score)

5. CLASSIFY    train_classifier() → insider_trading_prob ∈ [0,1]
               RF: positives = POSITIVE_KEYWORDS matches (5 currently)
                   negatives = bottom 30 by combined_score
               Features: 5 price + 4 wallet = 9 total
               Missing wallet features imputed with column medians

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
| `python run.py --classifier-only` | 0 | ~5 sec | Retrain RF after edits |
| `python run.py --classifier-only --push` | 0 | ~1 min | Update live dashboard |
| `python run.py --live --hours-ahead 48` | ~4 | ~5 min | POC: score open markets |

---

## Key Configuration

**`backend/config.py`** — change behavior without touching pipeline code:
- `TOP_N_MARKETS=50` — how many markets get wallet queries
- `MIN_VOLUME_USD=10_000_000` — market volume filter
- `MIN_END_DATE="2025-01-01"` — earliest market to include
- `PRICE_HOURS_BEFORE=48` — price history window before resolution

**`backend/pipeline/scorer.py`** — ML tuning:
- `POSITIVE_KEYWORDS` — add keywords to tag new known insider trading cases
- `RF_PRICE_FEATURES` / `RF_WALLET_FEATURES` — feature lists fed to RF
- RF hyperparams: `n_estimators=200`, `max_depth=4`, `min_samples_leaf=2`

**`data/labeled_cases.csv`** — ground truth:
- 23 cases: 5 CONFIRMED, 15 SUSPECTED, 3 POSSIBLE
- Add a row here + run `--classifier-only` to incorporate new cases

---

## Environment

Requires a `.env` file in the repo root (gitignored, never committed):
```
DUNE_API_KEY=...
GITHUB_TOKEN=...         # only needed for --push
GITHUB_REPO=chadallen/insider_trading_detection
GITHUB_BRANCH=main
TOP_N_MARKETS=50
```

`run.py` calls `load_dotenv()` at the top — no manual export needed.

---

## Known Limitations / Design Debt

1. **Small training set** — only 5 confirmed positives. RF may overfit.
2. **Implicit negatives** — bottom-30 by score are assumed clean, not verified.
3. **CLOB data availability** — most political markets have no price history.
   Only ~30% of fetched markets survive the price history filter.
4. **No entity resolution** — cannot link wallets across accounts.
5. **Score combining is a heuristic** — geometric mean of price and wallet
   scores is not a principled probabilistic model.
6. **Live mode is POC** — not validated, `--live` flag is experimental.
7. **Zero-variance features are silently dropped** — could mask data issues
   when Dune returns no wallet data (all wallet features = 0).

---

## Refactor Plan: Unified Feature Set + Improved Prediction Model

### Motivation

The current architecture has three core problems:

1. **Split pipelines** — price and wallet features are scored independently and
   merged via a heuristic geometric mean. The classifier never sees raw signals,
   only pre-digested intermediate scores.
2. **Weak labeling** — the RF uses only 5 CONFIRMED positives (via
   `POSITIVE_KEYWORDS`) and 30 implicit negatives (the lowest-scoring markets).
   The negatives are defined by the same heuristic being replaced, which is
   circular. All 23 labeled cases should be used.
3. **Wrong feature windows for labeled cases** — `labeled_cases.csv` has
   precise `start`/`end`/`resolution` timestamps per case, but the pipeline
   ignores them and uses a generic 48h window for everyone, meaning labeled case
   features are computed incorrectly for training.

---

### Unified Feature Matrix

Replace the two-pipeline architecture with a single `build_features(market,
mode)` that returns one row per market. Features are categorized by when they
are available:

**Available for all markets (closed and open):**

| Feature | Source | Notes |
|---|---|---|
| `price_volatility` | CLOB API | Keep as-is |
| `max_single_move` | CLOB API | Keep as-is |
| `price_momentum_6h` | CLOB API | New: price change in final 6h window |
| `price_momentum_12h` | CLOB API | New: price change in final 12h window |
| `order_flow_imbalance` | Dune | Renamed from `trade_vpin` (see VPIN note below) |
| `new_wallet_ratio_12h` | Dune | Keep as-is |
| `new_wallet_ratio_6h` | Dune | Keep as-is |
| `burst_score` | Dune | Keep as-is |
| `directional_consensus` | Dune | Keep as-is |
| `wallet_age_median_days` | Polygonscan API (free) | New: median age of trading wallets |
| `wallet_concentration` | Dune | New: Gini coefficient of trade sizes |
| `cross_market_wallet_flag` | Dune | New: # of trading wallets also active in other flagged markets |
| `news_article_count_48h` | GDELT (free) | New: public news signal before resolution |

**Only for closed markets (resolution outcome known):**

| Feature | Source | Notes |
|---|---|---|
| `surprise_score` | CLOB API | Keep as-is — requires final price |
| `late_move_ratio` | CLOB API | Keep as-is — requires resolution |
| `resolution_vs_consensus` | CLOB API | New: final price vs. market consensus at T-48h |

**Proxy features for open/live markets (substitute resolution-dependent signals):**

| Feature | Proxies for | Computation |
|---|---|---|
| `current_price_deviation` | `surprise_score` | `\|current_price - 0.5\|` |
| `recent_move_ratio_6h` | `late_move_ratio` | Fraction of total price movement in last 6h |

The closed-market model uses 16 features; the live model uses 15 (2
resolution-dependent features replaced by 2 proxies). The live model is trained
on historical labeled cases with proxy features computed retrospectively, then
validated by comparing its output to the historical model on the same cases.

---

### A Note on VPIN

VPIN (Volume-synchronized Probability of Informed Trading) was designed for
equity market microstructure. It breaks down in prediction markets for two
reasons:

1. **Binary convergence is not a signal.** All prediction markets naturally
   converge to 0 or 1 at resolution. In the final hours, every
   public-information trader is on the winning side, so directional imbalance
   spikes on every well-predicted market — not just insider ones.
2. **The current implementation is not real VPIN.** It computes a
   price-change directional ratio from CLOB history, not volume-bucketed
   order-flow classification.

**Decision:** Drop `vpin_score` and `time_weighted_vpin` entirely. Keep the
Dune on-chain directional measure but rename it `order_flow_imbalance` to
accurately describe what it measures. The features `directional_consensus`,
`burst_score`, `late_move_ratio`, and `surprise_score` cover the same
conceptual ground more directly.

---

### Labeling Strategy

**`labeled_cases.csv` is the single source of truth.** Remove `POSITIVE_KEYWORDS`
from `scorer.py` entirely.

Use all 23 labeled cases as positives with soft confidence weights:

| Label | Weight |
|---|---|
| CONFIRMED | 1.0 |
| SUSPECTED | 0.6 |
| POSSIBLE | 0.3 |

Do **not** treat unlabeled markets as negatives. The current implicit negatives
(bottom-30 by combined score) are circular — they are defined by the heuristic
being replaced, and some may be genuine insider cases that simply haven't been
identified yet.

When computing features for labeled cases, use the per-case `start`/`end`/
`resolution` timestamps from the CSV, not the generic 48h pipeline window.

Target: expand to ~35 labeled cases before the model refactor, drawing from
cases documented in existing notes.

---

### Model Architecture

Given the labeled set will likely never exceed 50 cases, standard supervised ML
is not reliable. The approach:

#### Primary: Positive-Unlabeled (PU) Learning

PU learning treats labeled cases as known positives and all other markets as
unlabeled (not assumed negative). This avoids training on mislabeled data.

Implementation — two-step Elkan & Noto:
1. Train a classifier on labeled positives vs. unlabeled (all unlabeled labeled
   0). Produces `P(labeled | features)`.
2. Estimate prior `c = P(labeled | positive)` from held-out positives.
3. Adjust: `P(positive | features) = P(labeled | features) / c`.

Use **LightGBM** with:
- Sample weights from soft label confidence scores
- L1 regularization (high feature-to-sample ratio)
- Stratified 5-fold CV by label type (CONFIRMED / SUSPECTED / POSSIBLE)

Replaces the current Random Forest.

#### Secondary: Unsupervised Anomaly Score

Keep `IsolationForest`, but run it on the **unified feature matrix** (not just
price features). The anomaly score becomes one input to the final ensemble
rather than driving market selection.

Also add a **One-Class SVM** trained only on CONFIRMED cases. Weak signal given
only 5 confirmed cases, but captures anomaly shape differently than
IsolationForest.

#### Ensemble

```
final_score = 0.5 * pu_prob + 0.3 * isolation_forest_score + 0.2 * one_class_svm_score
```

Weights calibrated via held-out labeled data. Probabilities calibrated with
Platt scaling.

#### Two Model Variants

| | Historical Model | Live Model |
|---|---|---|
| Training data | All 23 labeled cases | Same, with proxy features |
| Feature set | Full 16 features | 15 features (proxies replace resolution-dependent) |
| Use case | Closed markets | Markets resolving within 48h |

---

### New Data Sources

**Already using, underutilized:**
- **CLOB API** — currently `fidelity=720` (one point per 12h, ~4 points per
  market). Change to `fidelity=60` (hourly, 48 points). This is free and is the
  highest-ROI improvement: multi-window price features and better `late_move_ratio`
  both depend on it.

**Free, no signup required:**
- **GDELT Project** — global news event database via BigQuery free tier (1TB/mo).
  Query article count mentioning the market subject in the 48h before resolution.
  Low news coverage + strong price move = more suspicious.
- **Polygonscan API** — free tier (5 req/sec). First-transaction date per wallet
  address. More precise than `new_wallet_ratio` heuristic; eliminates some Dune
  cost for wallet age lookups.

**Cheap (within existing Dune budget):**
- **Cross-market wallet correlation** (~0.5 credits): For top-20 anomaly markets,
  check whether their trading wallets appear in other flagged markets. A wallet
  active in 3+ suspicious markets is a strong signal.
- **Wallet trade-size concentration** (add to existing query, no extra credits):
  Gini coefficient of trade sizes per market. Insider trading often involves a
  few large concentrated bets.

**Worth evaluating after Phase 4:**
- **Kalshi API** (free read-only): Cross-reference odds divergence between
  Polymarket and Kalshi. A market that moves on Polymarket without moving on
  Kalshi suggests informed flow specific to one platform.
- **Twitter/X API** (free basic tier, 500K tweets/month): Social signal for the
  48h window. Noisier than GDELT but captures real-time leaks more quickly.
  Evaluate after GDELT to determine if it adds independent signal.

---

### Implementation Phases

#### Phase 1 — Foundation (no Dune credits)
1. Fix labeled case feature computation to use per-case `start`/`end`/`resolution`
   windows from `labeled_cases.csv`
2. Merge the two feature pipelines into a single `build_features()` function
3. Remove `POSITIVE_KEYWORDS` from `scorer.py`; make `labeled_cases.csv` the
   only positive source
4. Switch CLOB fidelity from 720 → 60 for richer price data
5. Drop `vpin_score` and `time_weighted_vpin`; rename Dune `trade_vpin` →
   `order_flow_imbalance`

#### Phase 2 — Feature improvements (minimal Dune cost)
1. Compute multi-window price momentum (6h, 12h) from higher-res CLOB data
2. Add `wallet_age_median_days` via Polygonscan API (free; replaces some Dune
   wallet age usage)
3. Add `wallet_concentration` (Gini coefficient) to existing Dune wallet query
   (no extra credits)
4. Add `cross_market_wallet_flag` via new Dune query (~0.5 credits per full run)

#### Phase 3 — Model upgrade (no cost)
1. Add soft label weights to training data
2. Implement PU learning classifier (LightGBM, two-step Elkan & Noto)
3. Retrain IsolationForest on unified feature matrix
4. Build ensemble; calibrate weights on labeled set with Platt scaling
5. Implement separate historical and live model variants with proxy features

#### Phase 4 — New data sources
1. Integrate GDELT BigQuery for `news_article_count_48h`
2. Integrate Polygonscan for `wallet_age_median_days`
3. Evaluate Kalshi API cross-referencing
4. Evaluate Twitter/X API if GDELT signal proves insufficient

#### Phase 5 — Validation
1. Leave-one-out CV on all 23 labeled cases
2. Manual review of top 10 flagged historical markets from last full run
3. Backtest: confirm model correctly flags the 3 current top suspects
   (Maduro 0.70, shutdown 0.69, Khamenei 0.68)

---

### Open Questions

1. **GDELT setup**: Requires a Google Cloud project for BigQuery free tier. If
   that's too much friction, a simpler fallback is scraping DuckDuckGo News
   article counts (no API key, less reliable).
2. **Polygonscan rate limits**: 5 req/sec free tier. Wallet age lookups for 50
   markets × N wallets each could be slow. May need to scope to top 20 markets
   by anomaly score only.
3. **Soft label weights**: The 1.0/0.6/0.3 weights for CONFIRMED/SUSPECTED/
   POSSIBLE are a starting point. Some SUSPECTED cases (e.g., `iran_khamenei_strikes`)
   read as near-certain; others (e.g., `coinbase_armstrong`) are edge cases.
   Review the CSV and adjust before Phase 3.
4. **Kalshi scope**: Two labeled cases (`kalshi_mrbeast`, `kalshi_langford`) are
   Kalshi-only. Decide whether to include Kalshi detection in scope or keep the
   pipeline Polymarket-only.

---

## Legacy Notes (pre-refactor)

The sections below describe the current (pre-refactor) architecture for
reference during the transition.

### Current Known Limitations / Design Debt

1. **Small training set** — only 5 confirmed positives. RF may overfit.
2. **Implicit negatives** — bottom-30 by score are assumed clean, not verified.
3. **CLOB data availability** — most political markets have no price history.
   Only ~30% of fetched markets survive the price history filter.
4. **No entity resolution** — cannot link wallets across accounts.
5. **Score combining is a heuristic** — geometric mean of price and wallet
   scores is not a principled probabilistic model.
6. **Live mode is POC** — not validated, `--live` flag is experimental.
7. **Zero-variance features are silently dropped** — could mask data issues
   when Dune returns no wallet data (all wallet features = 0).

### Current Pipeline Flow

```
1. FETCH       Gamma API → df_markets (closed political, vol ≥ $10M, ≥ 2025-01-01)
               CLOB API  → histories {token_id → price DataFrame}

2. PRICE       build_price_features() → df_scored
   FEATURES    enrich_with_dune_vpin() → overwrites vpin_score (~1 credit)
               score_with_isolation_forest() → adds suspicion_score

3. WALLET      fetch_top_n_wallet_data(top_n=50) → df_wallet_agg (~4 credits)
   FEATURES    Dune table: polymarket_polygon.market_trades
               Features: new_wallet_ratio, new_wallet_ratio_6h,
                         burst_score, directional_consensus, trade_vpin

4. COMBINE     build_combined() → df_combined
               combined_score = √(price_score × wallet_score)

5. CLASSIFY    train_classifier() → insider_trading_prob ∈ [0,1]
               RF: positives = POSITIVE_KEYWORDS matches (5 currently)
                   negatives = bottom 30 by combined_score
               Features: 5 price + 4 wallet = 9 total
               Missing wallet features imputed with column medians

6. OUTPUT      Write df_combined.csv, df_scored.csv, df_wallet_agg.csv
               → outputs/ and dashboard/public/
```
