# Insider Trading Detection — Project Plan

## Overall Plan

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 1 — Foundation | ✅ Complete | Labeled case windows, CLOB fidelity 720→60, dropped VPIN/POSITIVE_KEYWORDS, renamed `trade_vpin` → `order_flow_imbalance` |
| Phase 2 — Feature improvements | ✅ Complete | Momentum features (6h/12h), wallet concentration (Gini), wallet age via Polygonscan, cross-market wallet flag (local) |
| Phase 3 — Model upgrade | ✅ Complete | PU-LightGBM + IsolationForest + One-Class SVM ensemble replaces Random Forest |
| Phase 4 — New data sources | 🔲 Next | Add `news_article_count_48h` via GDELT; evaluate Kalshi and Twitter/X after |
| Phase 5 — Validation | 🔲 Planned | Leave-one-out CV, false positive review, ensemble weight calibration |

Active epic: none — create with `/create-beads` when ready to plan Phase 4

Design docs: `docs/plans/`

---

## Current Status

**2026-04-18 — Migrated to planning docs + ADR + beads workflow.**

Phases 1–3 complete and running end-to-end. Pipeline fetches ~77 resolved political markets (vol ≥ $10M, ≥ 2025-01-01), scores them with the PU-LightGBM ensemble across 14 features, and publishes to the live Vercel dashboard. Full run costs ~5 Dune credits, ~25 min. Polygonscan wallet age lookup working (166/166 resolved). Phase 4 (GDELT news signal) is next but not started — direction TBD (BigQuery vs DuckDuckGo fallback).

---

## Known Issues / Blockers

- **Phase 4 direction TBD** — GDELT (BigQuery) vs DuckDuckGo fallback decision pending. See PRD.md open questions.
- **Kalshi scope** — Two labeled cases (`kalshi_mrbeast`, `kalshi_langford`) are Kalshi-only and untestable. Needs a decision before Phase 4b.
- **OC-SVM activation** — Falls back to neutral 0.5 if fewer than 3 CONFIRMED cases match the current dataset. May need `top_n=100` or looser date filters.
- **Ensemble weights unvalidated** — Current 0.5/0.3/0.2 are a starting point; calibration deferred to Phase 5.
