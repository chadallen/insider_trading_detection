# Polymarket Insider Trading Detector

A system that automatically scans resolved [Polymarket](https://polymarket.com) prediction markets and flags ones that show signs of insider trading.

**[Live Dashboard](https://polymarket-dashboard-roan.vercel.app/)**

---

## How it works

Polymarket is a blockchain-based prediction market where every trade is recorded on-chain — public and permanent — which makes it uniquely suited to this kind of analysis.

Two independent signals are combined to score each market:

**Price model** — Fetches price history for resolved markets and computes features per market: two versions of VPIN (how one-sided was the trading?), volume, total price move, volatility, the biggest single price jump, a resolution surprise score (how wrong was the market?), and a late move ratio (how much of the movement happened right before resolution?). Feeds all into an Isolation Forest to find statistical outliers.

**Wallet model** — Queries on-chain trade data via Dune Analytics and computes wallet-level features: new wallet ratio (did fresh wallets flood in right before resolution?), burst trading score (did anyone place hundreds of trades in an hour?), directional consensus (was nearly everyone betting the same way?), and trade VPIN.

A Random Forest classifier combines both signals into a single `insider_trading_prob` score (0–1), trained on known insider trading cases as positives and the lowest-scoring markets as implicit negatives.

---

## Setup

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Add API keys**
```bash
cp .env.example .env
# edit .env and add your keys
```

Required keys:
- `DUNE_API_KEY` — from [dune.com](https://dune.com), free tier is sufficient
- `GITHUB_TOKEN` — GitHub personal access token with `repo` scope (only needed for `--push`)

---

## Running the pipeline

```bash
# Full pipeline: fetch markets, score, train classifier (~25 min, ~8 Dune credits)
python run.py

# Refresh price scores only, no Dune credits spent (~10 min)
python run.py --skip-dune

# Use cached market data, re-run scoring and classifier (~2 min, ~5 credits)
python run.py --skip-fetch

# Retrain classifier only on saved data (~5 seconds, 0 credits)
python run.py --classifier-only

# Push output CSVs to GitHub after any of the above (updates the dashboard)
python run.py --classifier-only --push
```

### Tuning the model

Edit `backend/pipeline/scorer.py` then run:
```bash
python run.py --classifier-only
```

Key things to tune:
- `POSITIVE_KEYWORDS` — which markets count as known insider trading cases
- `RF_PRICE_FEATURES` / `RF_WALLET_FEATURES` — which features the classifier uses
- RF hyperparameters (`n_estimators`, `max_depth`, `min_samples_leaf`)
- `n_neg` — how many implicit negatives to use (default: 30)

---

## Code structure

```
run.py                        CLI entrypoint
backend/
  config.py                   Settings (overridable via env vars)
  checkpoints.py              Save/load pipeline state to data/
  pipeline/
    fetcher.py                Gamma API + CLOB price history fetch
    price_features.py         VPIN, Isolation Forest scoring
    wallet_features.py        Dune queries, labeled cases, wallet scoring
    scorer.py                 Combine scores, RF classifier
dashboard/                    React frontend (served via Vercel)
outputs/                      CSVs read by the dashboard
```

---

## Validation

Validated against confirmed and suspected insider trading cases:

| Market | Label | Dominant signal |
|--------|-------|----------------|
| Nobel Peace Prize 2025 | CONFIRMED | New wallet ratio 79.8% |
| US strikes Iran Feb 2026 | CONFIRMED | Burst score 409 + directional consensus 77.6% |
| Maduro removal Jan 2026 | SUSPECTED | Trade VPIN 0.937 |
| ZachXBT/Axiom Feb 2026 | SUSPECTED | Burst score 270 trades/hr |

---

## Data sources

- **Polymarket Gamma API** — market metadata and resolved markets
- **Polymarket CLOB API** — price history for closed markets
- **Dune Analytics** — on-chain trade data via `polymarket_polygon.market_trades`

---

## Limitations

- Price history unavailable for most political markets — the CLOB API doesn't retain data long after resolution
- Small labeled dataset — only a handful of confirmed cases, so the classifier leans heavily on implicit negatives
- Isolation Forest finds statistical anomalies, not specifically insider trading — some false positives expected
- Simple averaging of price and wallet scores is a placeholder, not a principled weighting

---

## Roadmap

- Reconstruct price history from Dune trade data to cover political markets
- Cross-wallet analysis to connect repeat offenders across markets
- Live market monitoring (open markets, not just resolved)
- Expand labeled dataset to improve classifier reliability

---

*For research and educational purposes only.*
