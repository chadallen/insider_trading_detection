# ADR-0001: Use PU-LightGBM as Primary Classifier Instead of Random Forest

**Date:** 2026-03-20
**Status:** Accepted

## Context

The original classifier was a Random Forest trained on known insider trading cases as positives and the lowest-scoring markets as implicit negatives. The implicit negatives assumption is wrong: unlabeled Polymarket markets are not confirmed clean — some are likely true positives we haven't labeled yet. Training a standard binary classifier on this setup produces systematically biased scores.

## Decision

Replace Random Forest with PU-LightGBM using the Elkan & Noto two-step adjustment: train LightGBM with labeled positives vs. all unlabeled markets, estimate the class prior `c = mean(raw_prob[labeled_positives])`, then adjust via `pu_prob = clip(raw_prob / c, 0, 1)`.

## Alternatives Considered

**Random Forest with hand-picked negatives** — the original approach. Selecting the "cleanest" markets as negatives is subjective and leaks label information. Rejected because the selection criterion was circular.

**Standard LightGBM without PU adjustment** — same fundamental problem as RF: treats all unlabeled as negatives. Rejected for the same reason.

## Consequences

Scores are better calibrated for a setting where only a fraction of positives are labeled. The `c` prior estimate depends on having enough labeled positives to be stable — with only 5 CONFIRMED cases, this is imprecise. Soft label weights (CONFIRMED=1.0, SUSPECTED=0.6, POSSIBLE=0.3) partially compensate. The backward-compat aliases `RF_FEATURES`, `RF_PRICE_FEATURES`, `RF_WALLET_FEATURES` in `scorer.py` can be removed once any external scripts are updated.
