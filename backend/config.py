"""
Configuration — edit this file before running.
All values can be overridden with environment variables.
"""
import os

# ── GitHub ────────────────────────────────────────────────────────────────
GITHUB_REPO   = os.environ.get("GITHUB_REPO",   "chadallen/insider_trading_detection")
GITHUB_BRANCH = os.environ.get("GITHUB_BRANCH", "main")
GITHUB_TOKEN  = os.environ.get("GITHUB_TOKEN",  "")

# ── Dune Analytics ────────────────────────────────────────────────────────
DUNE_API_KEY  = os.environ.get("DUNE_API_KEY", "")

# ── Polygonscan (free tier: 5 req/sec, optional API key for better limits) ─
POLYGONSCAN_API_KEY = os.environ.get("POLYGONSCAN_API_KEY", "")

# ── Pipeline settings ─────────────────────────────────────────────────────
TOP_N_MARKETS      = int(os.environ.get("TOP_N_MARKETS", "50"))
MIN_VOLUME_USD     = 10_000_000   # Markets below this are excluded
MIN_END_DATE       = "2024-01-01"
POLITICS_TAG_ID    = 2
MARKETS_PER_PAGE   = 100
MAX_PAGES          = 10
PRICE_HOURS_BEFORE = 48  # Hours of price history to fetch before resolution

# ── Local data directory (replaces Google Drive) ──────────────────────────
DATA_DIR = os.environ.get(
    "DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data")
)
