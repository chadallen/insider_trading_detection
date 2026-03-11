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

        new_count = 0
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
                all_markets.append({
                    "market_id":       mid,
                    "question":        mkt.get("question", ""),
                    "end_date":        mkt.get("endDate", ""),
                    "volume":          float(mkt.get("volume") or 0),
                    "resolution_time": mkt.get("endDate"),
                    "token_id":        token_id,
                    "category":        "politics",
                    "event_title":     event.get("title", ""),
                })
                new_count += 1

        earliest = min((m["end_date"] for m in all_markets), default="?")
        print(f"  Page {page + 1}: +{new_count} | Total: {len(all_markets)} | Earliest: {earliest[:10]}")
        time.sleep(0.3)

    df = pd.DataFrame(all_markets)
    df = df[df["volume"] >= MIN_VOLUME_USD].reset_index(drop=True)
    df = df[df["end_date"] >= MIN_END_DATE].reset_index(drop=True)

    print(f"\n{len(df)} markets | volume >= ${MIN_VOLUME_USD:,} | end_date >= {MIN_END_DATE}")
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
