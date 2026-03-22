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
from typing import Optional


POLYGONSCAN_BASE = "https://api.etherscan.io/v2/api"


def _query_first_timestamp(
    address: str,
    action: str,
    api_key: str = "",
    _debug: bool = False,
) -> Optional[datetime]:
    """
    Query Polygonscan for the earliest transaction of a given action type
    ('txlist' for external txs, 'tokentx' for ERC-20 transfers).
    Returns the timestamp or None if no results / error.
    """
    params = {
        "chainid":    137,          # Polygon PoS (Etherscan V2 unified endpoint)
        "module":     "account",
        "action":     action,
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
        if _debug:
            print(f"  [Polygonscan debug action={action}] status={data.get('status')!r} "
                  f"message={data.get('message')!r} "
                  f"result_preview={str(data.get('result'))[:120]!r}")
        if data.get("status") == "1" and data.get("result"):
            ts = int(data["result"][0]["timeStamp"])
            return datetime.fromtimestamp(ts, tz=timezone.utc)
    except requests.HTTPError as e:
        print(f"  [Polygonscan] HTTP error ({action}) for {address[:10]}…: {e}")
    except Exception as e:
        print(f"  [Polygonscan] Error ({action}) for {address[:10]}…: {type(e).__name__}: {e}")
    return None


def fetch_first_tx_date(
    address: str,
    api_key: str = "",
    _debug_first: bool = False,
) -> Optional[datetime]:
    """
    Return the timestamp of the earliest activity for a Polygon wallet.

    Tries two endpoints in order and returns the earliest result:
    1. txlist  — external/regular transactions
    2. tokentx — ERC-20 token transfers (catches Polymarket-only wallets
                 that interact exclusively via USDC transfers and never
                 send a regular tx)

    Returns None if the wallet has no activity on either endpoint.
    """
    t1 = _query_first_timestamp(address, "txlist",  api_key, _debug=_debug_first)
    t2 = _query_first_timestamp(address, "tokentx", api_key, _debug=_debug_first)

    candidates = [t for t in (t1, t2) if t is not None]
    return min(candidates) if candidates else None


def fetch_wallet_ages(
    addresses: list[str],
    api_key: str = "",
    rate_limit: float = 4.0,
) -> dict[str, float | None]:
    """
    Fetch the age in days for each wallet address.
    Rate-limited to `rate_limit` requests/sec (default 4 — conservative for
    free tier which allows 5/sec).

    Prints a debug line for the first wallet response so misconfiguration
    (bad API key, wrong endpoint, rate limiting) is visible immediately.

    Returns dict: {address_lower: age_in_days or None}
    """
    now = datetime.now(timezone.utc)
    delay = 1.0 / rate_limit
    unique = list(dict.fromkeys(a.strip().lower() for a in addresses if a.strip()))
    results: dict[str, float | None] = {}
    resolved = 0

    for i, addr in enumerate(unique):
        if i > 0:
            time.sleep(delay)
        first_tx = fetch_first_tx_date(addr, api_key=api_key, _debug_first=(i == 0))
        age = (now - first_tx).days if first_tx is not None else None
        results[addr] = age
        if age is not None:
            resolved += 1
        # Progress + early exit hint if nothing resolving after first 5
        if i == 4 and resolved == 0:
            print(f"  [Polygonscan] Warning: 0/{i+1} resolved after first 5 calls — "
                  f"check API key and debug line above")

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
