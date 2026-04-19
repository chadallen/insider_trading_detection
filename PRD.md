# Insider Trading Detection — Product Requirements

## Vision

A proof-of-concept system that automatically scans resolved Polymarket prediction markets and surfaces the ones most likely to have involved insider trading — based on price anomalies and on-chain wallet behavior. Research and educational use only.

**Live dashboard:** https://dashboard-rouge-pi-13.vercel.app

---

## Features — Shipped

### Price signal pipeline
Fetches CLOB price history for resolved markets and computes 7 features per market: surprise score, late move ratio, price volatility, max single move, total price move, and 6h/12h momentum. An IsolationForest produces a price-only `suspicion_score` used to rank markets for wallet queries.

### Wallet signal pipeline
Queries on-chain trade data via Dune Analytics and Polygonscan to compute 7 wallet features: new wallet ratio (overall and final 6h), burst score, order flow imbalance, wallet concentration (Gini), median wallet age, and cross-market wallet flag. Cross-market flag is computed locally from top-20 wallets already fetched (no additional Dune query).

### Ensemble classifier
Three-model ensemble outputs `insider_trading_prob` ∈ [0, 1]:
- PU-LightGBM (weight 0.5) — trained on labeled cases with soft weights
- IsolationForest on full 14-feature matrix (weight 0.3)
- One-Class SVM on CONFIRMED cases only (weight 0.2)

Ground truth: 21 labeled cases in `data/labeled_cases.csv` — 5 CONFIRMED, 9 SUSPECTED, 7 POSSIBLE.

### Dashboard
React/Vite/Tailwind frontend deployed on Vercel. Summary stat cards (High/Medium/Low suspicion counts), horizontal bar chart of top markets by score, and a ranked table with expandable detail panels showing all 14 features per market.

---

## Features — Planned

### Phase 4a: News coverage signal (GDELT)

**Goal:** Add `news_article_count_48h` as a 15th feature. Low news coverage + strong price move is more suspicious than the same move with heavy coverage — this is the highest-signal unbuilt addition.

**Approach:** Query GDELT via BigQuery free tier (1 TB/month, no credit card). Extract 2–3 key terms from the market question, count articles in the 48h pre-resolution window, cache per market in `gdelt_counts.pkl`.

**Fallback:** DuckDuckGo News scraping (no API key, rate-limited) to unblock development if BigQuery setup is slow. Migrate to BigQuery later.

**Acceptance criteria:**
- `news_article_count_48h` populated for ≥ 80% of markets in a full run
- Feature in `MODEL_FEATURES` with median imputation fallback
- `--skip-dune --classifier-only` imputation path works
- Leave-one-out CV rank holds or improves for CONFIRMED cases

### Phase 4b: Kalshi cross-reference (evaluate after 4a)

**Decision needed first:** Two labeled cases (`kalshi_mrbeast`, `kalshi_langford`) are Kalshi-only and untestable in the current Polymarket-only pipeline. Decide whether to extend scope.

If yes: fetch Kalshi prices via their free read-only API and compute `kalshi_price_divergence = poly_price - kalshi_price` in the 48h window. Divergence between platforms signals informed flow specific to one venue.

### Phase 4c: Twitter/X API (evaluate after 4a)

Higher recency than GDELT, noisier. Free basic tier: 500K tweets/month. Evaluate only if GDELT signal proves insufficient.

### Phase 5: Validation

1. Leave-one-out CV on all 21 labeled cases — held-out positive must still rank in top 10% of scored markets
2. Manual review of top 10 flagged historical markets — spot-check false positive rate
3. Backtest: model still flags current top suspects after any Phase 4 changes
4. Calibrate ensemble weights (`ENSEMBLE_WEIGHTS` in `scorer.py`) from CV results — current 0.5/0.3/0.2 are unvalidated starting points

---

## Known Limitations

1. **Small labeled set** — 21 cases, 5 CONFIRMED. PU learning helps but the model is data-limited.
2. **CLOB data availability** — ~30% of fetched markets survive the price history filter; low-volume political markets often have no CLOB data.
3. **No entity resolution** — cannot link wallets across accounts beyond the cross-market flag.
4. **Live mode is POC** — `--live` mode is unvalidated; resolution-proxy features are heuristic.
5. **No news signal yet** — model cannot distinguish public-information trading from insider trading in low-coverage markets until Phase 4a lands.

---

## Open Questions

1. **GDELT vs DuckDuckGo**: Start with DDG scraping to unblock model testing, migrate to BigQuery?
2. **Polygonscan rate limits**: 50 markets × 20 wallets = 1,000 API calls against 5 req/sec free tier. If too slow, scope to top 20 markets by `suspicion_score` only.
3. **Kalshi scope**: Decide before Phase 4b. Currently 2 labeled cases are Kalshi-only.
4. **OC-SVM CONFIRMED count**: Falls back to neutral 0.5 if fewer than 3 CONFIRMED cases match current dataset. `top_n=100` or looser date filters would bring in more matches.
