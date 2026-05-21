"""
Configuration — edit this file before running.
All values can be overridden with environment variables.
"""
import os

# ── GitHub ────────────────────────────────────────────────────────────────
GITHUB_REPO   = os.environ.get("GITHUB_REPO",   "chadallen/polymarket-insider-detection")
GITHUB_BRANCH = os.environ.get("GITHUB_BRANCH", "main")
GITHUB_TOKEN  = os.environ.get("GITHUB_TOKEN",  "")

# ── Dune Analytics ────────────────────────────────────────────────────────
DUNE_API_KEY  = os.environ.get("DUNE_API_KEY", "")

# ── Polygonscan (free tier: 5 req/sec, optional API key for better limits) ─
POLYGONSCAN_API_KEY = os.environ.get("POLYGONSCAN_API_KEY", "")

# ── Pipeline settings ─────────────────────────────────────────────────────
TOP_N_MARKETS      = int(os.environ.get("TOP_N_MARKETS", "50"))  # emergency override; not applied by default
MIN_VOLUME_USD     = 1_000_000    # Markets below this are excluded (lowered from $10M to capture lower-volume labeled cases)
MIN_END_DATE       = "2025-01-01"
FETCH_TAG_IDS = [
    2,       # Politics
    100265,  # Geopolitics
    596,     # Culture
    1401,    # Tech
    101999,  # Big Tech
    107,     # Business
    120,     # Finance
    101970,  # World
    100328,  # Economy
]
POLITICS_TAG_ID    = 2  # alias kept for any code that references it directly
MARKETS_PER_PAGE   = 100
MAX_PAGES          = 10
PRICE_HOURS_BEFORE = 48  # Hours of price history to fetch before resolution

# ── Local data directory (replaces Google Drive) ──────────────────────────
DATA_DIR = os.environ.get(
    "DATA_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data")
)
