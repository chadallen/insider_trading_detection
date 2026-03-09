# Polymarket Insider Trading Detector

A proof-of-concept system that automatically scans resolved [Polymarket](https://polymarket.com) prediction markets and flags ones that show signs of insider trading.

**[Live Dashboard](https://polymarket-dashboard-roan.vercel.app/)**

---

## What it does

Polymarket is a blockchain-based prediction market where people bet real money on real-world events. Because every trade is recorded on-chain, the data is public and permanent — which makes it uniquely suited to this kind of analysis.

This project combines two independent models to score each market:

**Price model** — Fetches price history for resolved markets and computes 8 features per market: two versions of VPIN (how one-sided was the trading?), volume, total price move, volatility, the biggest single price jump, a resolution surprise score (how wrong was the market?), and a late move ratio (how much of the movement happened right before resolution?). Feeds all 8 into an Isolation Forest to find statistical outliers.

**Wallet model** — Queries on-chain trade data via Dune Analytics and computes wallet-level features: new wallet ratio (did fresh wallets flood in right before resolution?), wallet concentration (did a few wallets dominate volume?), burst trading score (did anyone place hundreds of trades in an hour?), directional consensus (was nearly everyone betting the same way?), and trade VPIN.

The combined score is a simple average of both. The dashboard shows all markets ranked by combined score with full signal detail.

---

## Validation

Validated against 4 confirmed/suspected insider trading cases. Each had a different dominant signal:

| Market | Label | Dominant signal |
|--------|-------|----------------|
| Nobel Peace Prize 2025 | CONFIRMED | New wallet ratio 79.8% |
| US strikes Iran Feb 2026 | CONFIRMED | Burst score 409 + directional consensus 77.6% |
| Maduro removal Jan 2026 | SUSPECTED | Trade VPIN 0.937 |
| ZachXBT/Axiom Feb 2026 | SUSPECTED | Burst score 270 trades/hr |

All 4 confirmed cases were scored by the wallet model only — the CLOB API doesn't retain price history for political markets, so they can't be scored by the price model. Fixing this is a priority next step.

---

## Setup

The entire project runs in Google Colab — no local install required.

**Open the notebook:**
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/chadallen/insider_trading_detection/blob/main/Detect_insider_trading_on_prediction_markets.ipynb)

**Required secrets** (add via the Colab key icon):
- `DUNE_API_KEY` — from [dune.com](https://dune.com), free tier is sufficient
- `GITHUB_TOKEN` — GitHub personal access token with `repo` scope, for pushing results

**Run order:**
1. Cell 1 — install dependencies
2. Cell 1b — mount Google Drive, load saved checkpoints
3. Cells 2–7 — fetch markets, price histories, compute features, run Isolation Forest
4. Cell 11 — fetch labeled market trades from Dune (optional, uses credits)
5. Cell 13 — define wallet scoring functions
6. Cell 14 — fetch wallet features for top 15 markets via Dune
7. Cell 15 — save checkpoints to Google Drive
8. Cell 16 — push scored CSVs to GitHub (updates the dashboard automatically)

---

## Outputs

Results are saved to [`/outputs`](/outputs) and read directly by the dashboard:

- `df_combined.csv` — top 15 markets with price, wallet, and combined scores
- `df_scored.csv` — all 132 scored markets with full price model features
- `df_wallet_agg.csv` — wallet features for the top 15 markets

---

## Data sources

- **Polymarket Gamma API** — market metadata and resolved markets
- **Polymarket CLOB API** — price history (12h granularity minimum for closed markets)
- **Dune Analytics** — on-chain trade data via `polymarket_polygon.market_trades`

---

## Limitations

- Price history unavailable for most political markets — API doesn't retain data long enough after resolution
- Only 4 confirmed cases for validation — not yet enough to train a supervised classifier
- The Isolation Forest finds statistical anomalies, not specifically insider trading — some false positives expected
- Simple 50/50 averaging of price and wallet scores is a placeholder, not a principled weighting

---

## Roadmap

- Reconstruct price history from Dune trade data to cover political markets
- Switch VPIN to real order flow (buy/sell volume) instead of price proxies
- Build supervised classifier once ~20 confirmed cases are available
- Cross-wallet analysis to connect repeat offenders across markets
- Live market monitoring

---

*For research and educational purposes only. This is a POC, not a production system.*
