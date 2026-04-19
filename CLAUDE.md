# Insider Trading Detection — Developer Context

## What This Is

A proof-of-concept ML pipeline that detects potential insider trading on
[Polymarket](https://polymarket.com) by analyzing price anomalies and on-chain
wallet behavior in resolved political prediction markets.

---

## Stack

- **Python 3.14** — pipeline and ML
- **LightGBM, scikit-learn, pandas** — ensemble classifier and feature computation
- **Dune Analytics** — on-chain wallet data (`polymarket_polygon.market_trades`)
- **Polygonscan V2 API** — wallet age lookup (Polygon PoS chain)
- **Polymarket Gamma API + CLOB API** — market metadata and price history
- **React / Vite / Tailwind / Recharts** — dashboard frontend
- **Vercel** — dashboard hosting

---

## Run Commands

```bash
python run.py                              # Full pipeline (~25 min, ~5 Dune credits)
python run.py --skip-fetch                 # Cached markets, fresh Dune + Polygonscan (~10 min, ~5 credits)
python run.py --skip-fetch --skip-dune     # All cached, fresh Polygonscan only (~2 min, 0 credits)
python run.py --skip-dune                  # Price signals only (~10 min, 0 credits)
python run.py --classifier-only            # Retrain ensemble only (~5 sec, 0 credits)
python run.py --classifier-only --push     # Retrain + update live dashboard (~1 min)
python run.py --live --hours-ahead 48      # POC: score open markets (~5 min, ~4 credits)
```

Dashboard dev server:
```bash
cd dashboard && npm run dev               # http://localhost:5173
```

Dashboard deploy:
```bash
cd dashboard && vercel --prod --yes
```

---

## Environment Variables

Required in `.env` at repo root (gitignored, never committed):

```
DUNE_API_KEY=...
GITHUB_TOKEN=...              # only needed for --push
GITHUB_REPO=chadallen/insider_trading_detection
GITHUB_BRANCH=main
TOP_N_MARKETS=50
POLYGONSCAN_API_KEY=...       # optional; get free key at polygonscan.com
```

---

## Directory Structure

```
run.py                        # CLI entrypoint — start here
backend/
  config.py                   # All tunable constants + env vars
  checkpoints.py              # Pickle-based cache (data/*.pkl)
  pipeline/
    fetcher.py                # Gamma API (markets) + CLOB API (price history)
    price_features.py         # Price features + Isolation Forest scoring
    wallet_features.py        # Dune queries + wallet feature computation
    scorer.py                 # Ensemble classifier
    polygonscan.py            # Polygonscan API client (wallet age lookup)
    dune.py                   # Dune Analytics HTTP client
data/
  labeled_cases.csv           # 21 ground-truth cases (5 CONFIRMED, 9 SUSPECTED, 7 POSSIBLE)
  *.pkl                       # Cached pipeline intermediates
outputs/                      # CSV outputs (mirrored to dashboard/public/)
dashboard/                    # React frontend (Vite + Tailwind + Recharts)
  vercel.json                 # Vercel build config (must live inside rootDirectory)
  src/
    App.jsx
    components/
      SuspicionTable.jsx      # Ranked table + inline expanded detail panel
      ScatterPlot.jsx
  public/                     # CSVs read by dashboard at runtime
docs/
  adr/                        # Architecture Decision Records
  plans/                      # Feature design docs (created by /create-beads)
```

---

## Pipeline Flow

```
1. FETCH       Gamma API → df_markets (closed political, vol ≥ $10M, ≥ 2025-01-01)
               CLOB API  → histories {token_id → price DataFrame} at fidelity=60
               Labeled cases get extended price windows from labeled_cases.csv start date

2. PRICE       build_price_features() → df_scored
   FEATURES    Features: surprise_score, late_move_ratio, price_volatility,
               max_single_move, total_price_move, price_momentum_6h, price_momentum_12h
               score_with_isolation_forest() → adds suspicion_score (price-only,
               used to rank markets for Dune wallet queries; not fed to ensemble)

3. WALLET      fetch_top_n_wallet_data(top_n=50) → df_wallet_agg (~5 credits)
   FEATURES    Dune table: polymarket_polygon.market_trades
               Features: new_wallet_ratio, new_wallet_ratio_6h, burst_score,
               order_flow_imbalance, wallet_concentration (Gini)
               top_wallet_addresses (top 20 wallets, used for Polygonscan)
               fetch_wallet_age_features() via Polygonscan V2 → wallet_age_median_days
               compute_cross_market_wallet_flags() (local, no Dune) → cross_market_wallet_flag

4. MERGE       merge_features() → df_combined (14 features total)

5. CLASSIFY    train_classifier() → insider_trading_prob ∈ [0,1]
               Ensemble: 0.5 × pu_prob + 0.3 × iso_score + 0.2 × ocsvm_score

6. OUTPUT      Write df_combined.csv, df_scored.csv, df_wallet_agg.csv
               → outputs/ and dashboard/public/
```

---

## Key Configuration

**`backend/config.py`:**
- `TOP_N_MARKETS=50` — how many markets get wallet queries
- `MIN_VOLUME_USD=10_000_000` — market volume filter
- `MIN_END_DATE="2025-01-01"` — earliest market to include
- `PRICE_HOURS_BEFORE=48` — price history window before resolution

**`backend/pipeline/scorer.py`** — ML tuning:
- `MODEL_PRICE_FEATURES` / `MODEL_WALLET_FEATURES` — feature lists (14 total)
- `LABEL_WEIGHTS` — soft weights: CONFIRMED=1.0, SUSPECTED=0.6, POSSIBLE=0.3
- `ENSEMBLE_WEIGHTS` — pu=0.5, iso=0.3, ocsvm=0.2 (must sum to 1.0)
- LightGBM: `n_estimators=200`, `max_depth=3`, `num_leaves=7`, `reg_alpha=1.0`, `reg_lambda=1.0`

**`data/labeled_cases.csv`** — ground truth:
- Columns: `key, label, question_filter, start, end, resolution, notes, polymarket_url`
- `question_filter` uses SQL LIKE syntax matched against market question strings
- Add a row + run `--classifier-only` to incorporate new cases

---

## Feature Set (14 features)

### Price features (7) — `price_features.py`
| Feature | Description |
|---|---|
| `surprise_score` | How unexpected the resolution was (`\|actual - starting_price\|`) |
| `late_move_ratio` | Fraction of total price movement in the final step |
| `price_volatility` | Std dev of absolute price changes |
| `max_single_move` | Largest single price step |
| `total_price_move` | Absolute difference between first and last price |
| `price_momentum_6h` | Price change in final 6h window |
| `price_momentum_12h` | Price change in final 12h window |

### Wallet features (7) — `wallet_features.py` + `polygonscan.py`
| Feature | Description |
|---|---|
| `new_wallet_ratio` | Fraction of trading wallets with no prior Polymarket activity |
| `new_wallet_ratio_6h` | Same, restricted to the final 6h window |
| `burst_score` | Ratio of peak-hour trade count to median hourly trade count |
| `order_flow_imbalance` | Net directional bias in on-chain trades |
| `wallet_concentration` | Gini coefficient of trade sizes |
| `wallet_age_median_days` | Median days since first tx for trading wallets (Polygonscan) |
| `cross_market_wallet_flag` | Count of wallets active in 3+ other flagged markets |

---

## Model Architecture

### PU-LightGBM (primary, weight 0.5)
Elkan & Noto two-step adjustment: train on positives vs unlabeled, estimate prior `c = mean(raw_prob[positives])`, then `pu_prob = clip(raw_prob / c, 0, 1)`. Soft label weights as `sample_weight`.

### IsolationForest (secondary, weight 0.3)
Full 14-feature matrix, `contamination=0.1`, score normalized [0, 1] via min-max.

### One-Class SVM (tertiary, weight 0.2)
Trained on CONFIRMED cases only. Requires ≥ 3 CONFIRMED matches in dataset; falls back to 0.5 if fewer. `nu=0.5, kernel="rbf", gamma="scale"`.

### Zero-variance guard
Features with `std < 1e-6` across the dataset are silently dropped before training. Expected when running `--skip-dune`.

---

## Vercel Deployment

Dashboard is live at https://dashboard-rouge-pi-13.vercel.app (Vercel project `cgallen-1252s-projects/dashboard`).

- `rootDirectory` is set to `dashboard` on the Vercel project — configured via `PATCH /v9/projects/{id}` REST API (CLI flag `--root-dir` does not exist)
- `dashboard/vercel.json` must exist inside `rootDirectory` for Vercel to find build settings
- Auth token lives at `~/Library/Application Support/com.vercel.cli/auth.json`

---

## Dev Server Setup in Git Worktrees

When working on the dashboard in a git worktree, two issues arise:

1. **Port conflict** — another worktree's preview server may hold port 5173
2. **`vite` not found** — worktrees don't have their own `node_modules/`

Fix (both steps required):

1. Symlink node_modules:
   ```bash
   ln -sf /Users/chadallen/insider_trading_detection/dashboard/node_modules \
     /Users/chadallen/insider_trading_detection/.claude/worktrees/<name>/dashboard/node_modules
   ```

2. Write `.claude/launch.json` in the worktree root with an explicit vite path and a non-conflicting port (e.g. 5174).

---

## Agent Behavior

- **Wait for approval before writing code** — confirm approach with user first
- **Commit frequently** with task IDs in parens: `git commit -m "<message> (<task-id>)"`
- **Prompt the user** when manual testing or architectural decisions are needed
- **Do not read `scratch.md`**

---

## Task Tracking

This project uses beads. Run `bd ready` for next tasks.

Skills: /start-session, /end-session, /create-beads, /build-beads, /adr


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
