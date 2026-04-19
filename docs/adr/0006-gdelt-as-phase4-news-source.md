# ADR-0006: Use GDELT via BigQuery as the Phase 4 News Coverage Source

**Date:** 2026-04-18
**Status:** Accepted

## Context

The model cannot currently distinguish informed trading in low-coverage markets from informed trading in heavily covered ones. Adding `news_article_count_48h` would let the model down-weight markets where the outcome was widely anticipated in the news. A news data source is needed.

## Decision

Use GDELT (`gdelt-bq.gdeltv2.events`) via Google BigQuery free tier (1 TB/month queries, no credit card required). Extract 2–3 key terms from the market question and count articles in the 48h pre-resolution window. Cache results in `gdelt_counts.pkl`. If BigQuery setup is too slow to unblock development, use DuckDuckGo News HTML scraping as a fallback.

## Alternatives Considered

**Twitter/X API** — higher recency, but noisier and rate-limited (500K tweets/month on free tier). Evaluate only if GDELT signal proves insufficient.

**Kalshi cross-reference** — detects platform-specific informed flow rather than news coverage; a different signal entirely. Evaluated separately as Phase 4b.

**NewsAPI / GDELT DOC API** — free tiers are more limited than the BigQuery interface. Rejected in favor of BigQuery for query flexibility and volume.

## Consequences

Requires a Google Cloud project and `GOOGLE_APPLICATION_CREDENTIALS` in `.env`. The BigQuery query extracts key terms heuristically (stop-word removal) — quality of term extraction affects feature reliability. The DuckDuckGo fallback is rate-limited and less reliable but requires no credentials.
