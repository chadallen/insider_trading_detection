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
    price_features.py         # VPIN, Isolation Forest scoring
    wallet_features.py        # Dune queries, wallet feature computation
    scorer.py                 # Score combining + RF classifier
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

## Pipeline Flow

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

## Planned Refactor Notes

Areas likely to benefit from refactoring:
- `run.py` is large (~300 lines); pipeline orchestration could be a class
- `wallet_features.py` builds complex SQL inline; could use a query builder
- Checkpointing is ad-hoc; a consistent cache-or-compute pattern would help
- Dashboard reads raw CSVs directly; an API layer would be cleaner
- `POSITIVE_KEYWORDS` in scorer.py is fragile; labeled_cases.csv should be
  the single source of truth for positives (currently both are used)
