"""
Fetches market metadata (Gamma API) and price histories (CLOB API).
Corresponds to notebook Cells 3 and 4.
"""
import json
import time
import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
from backend.config import (
    POLITICS_TAG_ID, MARKETS_PER_PAGE, MAX_PAGES,
    MIN_VOLUME_USD, MIN_END_DATE, PRICE_HOURS_BEFORE,
)


def _parse_markets_from_events(events: list, seen_ids: set) -> list:
    """Extract market rows from Gamma API event objects."""
    rows = []
    for event in events:
        for mkt in event.get("markets", []):
            mid = mkt.get("conditionId")
            if not mid or mid in seen_ids:
                continue
            seen_ids.add(mid)
            try:
                token_ids = json.loads(mkt.get("clobTokenIds", "[]"))
                token_id = token_ids[0] if token_ids else None
            except Exception:
                token_id = None
            rows.append({
                "market_id":       mid,
                "question":        mkt.get("question", ""),
                "end_date":        mkt.get("endDate", ""),
                "volume":          float(mkt.get("volume") or 0),
                "resolution_time": mkt.get("endDate"),
                "token_id":        token_id,
                "category":        "politics",
                "event_title":     event.get("title", ""),
            })
    return rows


def fetch_markets() -> pd.DataFrame:
    """
    Fetch closed political markets from Gamma API.
    Filters: volume >= MIN_VOLUME_USD, end_date >= MIN_END_DATE.
    """
    all_markets, seen_ids = [], set()
    print(f"Fetching closed political markets (tag_id={POLITICS_TAG_ID})...")

    for page in range(MAX_PAGES):
        offset = page * MARKETS_PER_PAGE
        url = (
            f"https://gamma-api.polymarket.com/events"
            f"?tag_id={POLITICS_TAG_ID}&closed=true"
            f"&limit={MARKETS_PER_PAGE}&offset={offset}"
            f"&order=volume&ascending=false"
        )
        events = requests.get(url, timeout=30).json()
        if not events:
            print(f"  No more results at offset {offset}")
            break

        new_count_before = len(all_markets)
        all_markets.extend(_parse_markets_from_events(events, seen_ids))
        new_count = len(all_markets) - new_count_before

        earliest = min((m["end_date"] for m in all_markets), default="?")
        print(f"  Page {page + 1}: +{new_count} | Total: {len(all_markets)} | Earliest: {earliest[:10]}")
        time.sleep(0.3)

    df = pd.DataFrame(all_markets)
    df = df[df["volume"] >= MIN_VOLUME_USD].reset_index(drop=True)
    df = df[df["end_date"] >= MIN_END_DATE].reset_index(drop=True)

    print(f"\n{len(df)} markets | volume >= ${MIN_VOLUME_USD:,} | end_date >= {MIN_END_DATE}")
    return df


def fetch_live_markets(hours_ahead: int = 48, min_volume: float = 1_000_000) -> pd.DataFrame:
    """
    Fetch open political markets resolving within the next `hours_ahead` hours.
    Sets resolution_time = now so price histories are pulled up to the present.
    Filters: volume >= min_volume.
    """
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(hours=hours_ahead)
    all_markets, seen_ids = [], set()
    print(
        f"Fetching live political markets ending within {hours_ahead}h "
        f"(tag_id={POLITICS_TAG_ID}, vol >= ${min_volume:,.0f})..."
    )

    for page in range(MAX_PAGES):
        offset = page * MARKETS_PER_PAGE
        url = (
            f"https://gamma-api.polymarket.com/events"
            f"?tag_id={POLITICS_TAG_ID}&closed=false&active=true"
            f"&limit={MARKETS_PER_PAGE}&offset={offset}"
            f"&order=volume&ascending=false"
        )
        events = requests.get(url, timeout=30).json()
        if not events:
            break

        new_count_before = len(all_markets)
        all_markets.extend(_parse_markets_from_events(events, seen_ids))
        new_count = len(all_markets) - new_count_before
        print(f"  Page {page + 1}: +{new_count} | Total so far: {len(all_markets)}")
        time.sleep(0.3)

    if not all_markets:
        print("No live markets found.")
        return pd.DataFrame()

    df = pd.DataFrame(all_markets)
    df = df[df["volume"] >= min_volume].reset_index(drop=True)

    # Keep only markets resolving within the window
    now_iso = now.isoformat()
    cutoff_iso = cutoff.isoformat()
    df = df[(df["end_date"] > now_iso) & (df["end_date"] <= cutoff_iso)].reset_index(drop=True)

    # Use current time as the effective resolution time so price histories
    # are fetched up to now rather than a future timestamp.
    now_str = now.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    df["resolution_time"] = now_str

    print(f"\n{len(df)} live markets ending within {hours_ahead}h | volume >= ${min_volume:,.0f}")
    return df


def fetch_price_history(token_id: str, resolution_time, hours_before: int = PRICE_HOURS_BEFORE) -> pd.DataFrame:
    """Fetch CLOB price history for a single market token."""
    if isinstance(resolution_time, str):
        res_time = datetime.fromisoformat(resolution_time.replace("Z", "+00:00"))
    else:
        res_time = resolution_time
    start_time = res_time - timedelta(hours=hours_before)
    params = {
        "market":    token_id,
        "interval":  "max",
        "fidelity":  720,
        "startTs":   int(start_time.timestamp()),
        "endTs":     int(res_time.timestamp()),
    }
    try:
        r = requests.get("https://clob.polymarket.com/prices-history", params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if not data or "history" not in data or not data["history"]:
            return pd.DataFrame()
        df = pd.DataFrame(data["history"]).rename(columns={"t": "timestamp", "p": "price"})
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="s", utc=True)
        df["price"] = df["price"].astype(float)
        return df
    except Exception:
        return pd.DataFrame()


def fetch_price_histories(df_markets: pd.DataFrame) -> dict:
    """
    Fetch price histories for all markets. Skips uncontested markets
    (starting price outside 0.15–0.85).
    Returns dict: token_id -> DataFrame.
    """
    histories = {}
    print(f"Fetching price histories for {len(df_markets)} markets...")

    for i, (_, row) in enumerate(df_markets.iterrows()):
        if i % 25 == 0:
            print(f"  {i}/{len(df_markets)}...")
        if row["resolution_time"] is None:
            continue
        history = fetch_price_history(row["token_id"], row["resolution_time"])
        if len(history) < 3:
            continue
        if not (0.15 <= history["price"].iloc[0] <= 0.85):
            continue
        histories[row["token_id"]] = history

    print(f"\nPrice histories cached for {len(histories)}/{len(df_markets)} markets")
    return histories
