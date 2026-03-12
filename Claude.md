## Project: Polymarket Insider Trading Detector

### What This Is
An ML-based insider trading detection system for Polymarket prediction markets. 
Learning project / MVP — not production code. Prioritize simplicity.

### My Background
- Intermediate ML background — explain modeling decisions clearly
- Prefer to understand tradeoffs before implementing

### Tech Stack

- Language: Python
- Data: Polymarket API, Dune Analytics (on-chain)
- Dashboard: Vercel
- Repo: github.com/chadallen/insider_trading_detection

### Key Modules
- vpin.py — VPIN implementation
- polymarket_vpin.py — Polymarket API integration
- wallet_clustering.py — entity resolution / wallet clustering
- detection_api.py — unified API with composite risk scoring
- backend/pipeline/scorer.py — random forest scoring, POSITIVE_KEYWORDS controls training labels
- backend/pipeline/wallet_features.py — loads LABELED_MARKET_CONFIGS from CSV at import time

### Labeled Cases System
- Source of truth: data/labeled_cases.csv (tracked in git via .gitignore exception)
- Columns: key, label (CONFIRMED/SUSPECTED/POSSIBLE), question_filter (SQL WHERE fragment), start, end, resolution, notes, polymarket_url
- question_filter is used directly in Dune queries — must be valid SQL
- To add a new case: (1) add row to CSV, (2) add keyword to POSITIVE_KEYWORDS in scorer.py, (3) run python run.py --classifier-only to retrain (~5 sec)

### Most Recent Task (completed)
Moved labeled_cases.csv from repo root to data/labeled_cases.csv, deduped and 
merged with existing hardcoded cases, preserved polymarket_url column, updated 
wallet_features.py to load from the new path.

### Coding Guidelines
- This is an MVP. Start with the simplest solution that works.
- Prefer single-file implementations when feasible
- No unnecessary abstractions or enterprise patterns
- Hardcode reasonable defaults instead of complex config systems
- Don't add error handling for unlikely edge cases
- If you're about to do something complex, suggest a simpler alternative first
- Write code that fits naturally in a Colab notebook cell structure

### Explain Your Reasoning
- Flag when a decision has meaningful tradeoffs
- Call out when something is a shortcut that would need to change at scale
- Suggest when a different approach might be meaningfully better
