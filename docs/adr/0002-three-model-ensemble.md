# ADR-0002: Three-Model Ensemble (PU-LightGBM + IsolationForest + One-Class SVM)

**Date:** 2026-03-20
**Status:** Accepted

## Context

A single model capturing all signals (price anomaly, wallet behavior, labeled case similarity) risks overfitting the small labeled set or being dominated by one signal type. Each of the three models captures a different aspect of the problem and has different failure modes.

## Decision

Ensemble: `insider_trading_prob = 0.5 × pu_prob + 0.3 × iso_score + 0.2 × ocsvm_score`. PU-LightGBM trains on all 14 features with label supervision. IsolationForest finds statistical outliers across the full feature matrix. One-Class SVM trains only on CONFIRMED cases and falls back to neutral 0.5 if fewer than 3 CONFIRMED cases match the current dataset.

## Alternatives Considered

**Single PU-LightGBM** — simpler, but the model sees only what the labeled cases teach it. IsolationForest catches anomalies with no labeled-case similarity, which is useful given the small labeled set.

**Stacking / learned ensemble weights** — more principled but requires a validation set large enough to train the meta-learner. With 21 labeled cases total, this is not feasible yet. Deferred to Phase 5.

## Consequences

Ensemble weights (0.5/0.3/0.2) are unvalidated starting points — Phase 5 leave-one-out CV will produce data to calibrate them. The OC-SVM component is inactive if fewer than 3 CONFIRMED cases match the current market dataset, silently contributing a neutral 0.5. Adding more labeled CONFIRMED cases or loosening date filters would activate it more reliably.
