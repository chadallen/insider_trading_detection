# ADR-0003: Compute Cross-Market Wallet Flag Locally Instead of via Dune

**Date:** 2026-03-13
**Status:** Accepted

## Context

`cross_market_wallet_flag` counts wallets active in 3+ other flagged markets — a signal for coordinated informed trading. The original implementation used a dedicated Dune query, but it consistently hit the 10-credit per-query resource cap (`FAILED_TYPE_RESOURCES_CAP_REACHED`), making it unusable on the free tier.

## Decision

Compute the flag locally using `top_wallet_addresses` (top 20 wallets per market) already returned by the main Dune wallet query. No additional Dune credits needed.

## Alternatives Considered

**Dune query with raised credit limit** — the original approach. Blocked by the resource cap. Could be re-enabled by raising `DUNE_MAX_CREDITS` and uncommenting `fetch_cross_market_wallet_flags()` in `wallet_features.py`, but this would require a paid Dune plan.

**Skip the feature entirely** — would lose a meaningful signal. Rejected because the local computation is a reasonable approximation.

## Consequences

Coverage is limited to the top 20 wallets per market, not the full trader population. Coordinated activity by smaller wallets will be missed. The Dune query code is preserved but commented out for future re-enablement. This tradeoff is acceptable for a proof-of-concept on the free tier.
