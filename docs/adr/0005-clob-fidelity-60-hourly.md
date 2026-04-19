# ADR-0005: Use CLOB Price History at Fidelity 60 (Hourly)

**Date:** 2026-03-01
**Status:** Accepted

## Context

The Polymarket CLOB API returns price history at configurable fidelity (minutes per data point). The original pipeline used fidelity=720 (12-hour intervals), which was sufficient for basic price features but too coarse to compute meaningful short-window momentum signals.

## Decision

Switch to fidelity=60 (hourly data points). This enables `price_momentum_6h` and `price_momentum_12h` — the price change in the final 6h and 12h before resolution — which are among the strongest signals for detecting late informed trades.

## Alternatives Considered

**Fidelity=720 (12-hour)** — original setting. Cannot compute sub-12h momentum. Rejected when Phase 2 added momentum features.

**Fidelity=1 (minute-level)** — maximum granularity. Would produce very large DataFrames and slow the pipeline significantly for marginal gain in feature precision. Not needed for the current feature set.

## Consequences

DataFrames are ~12× larger than with fidelity=720. Fetch time increases slightly. The 6h and 12h momentum windows require at least 6 and 12 data points respectively; markets with very short price histories may still have missing values for these features (imputed with column median).
