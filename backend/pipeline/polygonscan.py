"""
Polygonscan API client for fetching wallet first-transaction dates.

Free tier: 5 req/sec, no API key required (but slower without one).
Set POLYGONSCAN_API_KEY in .env for higher reliability.

Used in Phase 2 to compute wallet_age_median_days — the median age (in days)
of wallets trading in a market, based on their first-ever Polygon transaction.
This is more accurate than new_wallet_ratio which only looks at first appearance
in Polymarket trades.
"""
import time
import requests
import pandas as pd
from datetime import datetime, timezone


POLYGONSCAN_BASE = "https://api.polygonscan.com/api"


def fetch_first_tx_date(address: str, api_key: str = "") -> datetime | None:
    """
    Return the timestamp of the earliest transaction for a Polygon wallet.
    Returns None if the wallet has no transactions or on API error.
    """
    params = {
        "module":     "account",
        "action":     "txlist",
        "address":    address,
        "startblock": 0,
        "endblock":   99999999,
        "page":       1,
        "offset":     1,
        "sort":       "asc",
    }
    if api_key:
        params["apikey"] = api_key
    try:
        r = requests.get(POLYGONSCAN_BASE, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "1" and data.get("result"):
            ts = int(data["result"][0]["timeStamp"])
            return datetime.fromtimestamp(ts, tz=timezone.utc)
    except Exception:
        pass
    return None


def fetch_wallet_ages(
    addresses: list[str],
    api_key: str = "",
    rate_limit: float = 4.0,
) -> dict[str, float | None]:
    """
    Fetch the age in days for each wallet address.
    Rate-limited to `rate_limit` requests/sec (default 4 — conservative for
    free tier which allows 5/sec).

    Returns dict: {address_lower: age_in_days or None}
    """
    now = datetime.now(timezone.utc)
    delay = 1.0 / rate_limit
    unique = list(dict.fromkeys(a.strip().lower() for a in addresses if a.strip()))
    results: dict[str, float | None] = {}

    for i, addr in enumerate(unique):
        if i > 0:
            time.sleep(delay)
        first_tx = fetch_first_tx_date(addr, api_key=api_key)
        results[addr] = (now - first_tx).days if first_tx is not None else None

    return results


def compute_wallet_age_median(
    addresses: list[str],
    age_map: dict[str, float | None],
) -> float | None:
    """
    Compute the median wallet age in days given a list of addresses and an
    age_map returned by fetch_wallet_ages().
    Returns None if no ages could be resolved.
    """
    ages = [
        age_map[addr.strip().lower()]
        for addr in addresses
        if addr.strip() and addr.strip().lower() in age_map
        and age_map[addr.strip().lower()] is not None
    ]
    if not ages:
        return None
    ages.sort()
    n = len(ages)
    mid = n // 2
    return (ages[mid - 1] + ages[mid]) / 2.0 if n % 2 == 0 else float(ages[mid])
