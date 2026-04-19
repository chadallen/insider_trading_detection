# ADR-0004: Use Polygonscan V2 API for Wallet Age Lookup

**Date:** 2026-03-13
**Status:** Accepted

## Context

`wallet_age_median_days` — the median age of wallets trading a market — is a useful signal: very new wallets suggest coordinated fresh accounts. Dune Analytics does not expose wallet creation dates or first transaction timestamps directly. The data must come from a chain explorer.

## Decision

Use the Polygonscan V2 API (`https://api.etherscan.io/v2/api?chainid=137`) to look up the first transaction for each wallet. Fall back from `txlist` to `tokentx` if a wallet has no native MATIC transactions (common for pure ERC-20 traders who never hold native token). Requires `POLYGONSCAN_API_KEY` in `.env`; skipped silently if the key is absent.

## Alternatives Considered

**Dune query for first transaction** — Dune's `polymarket_polygon.market_trades` table doesn't contain wallet creation dates, only trade timestamps. Building a first-transaction query across all of Polygon would be expensive and slow.

**Alchemy / Moralis APIs** — also viable chain explorers, but Polygonscan free tier (5 req/sec, 100K calls/day) is sufficient and doesn't require another account.

## Consequences

At 50 markets × 20 wallets = 1,000 API calls per run, the 5 req/sec free tier takes ~3–4 minutes. The implementation batches and sleeps to stay within limits. If this becomes a bottleneck, scope can be reduced to top 20 markets by `suspicion_score` only.
