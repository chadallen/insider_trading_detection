"""
Dune Analytics API client.
"""
import time
import requests
import pandas as pd
from backend.config import DUNE_API_KEY

DUNE_HEADERS = {"X-Dune-Api-Key": DUNE_API_KEY, "Content-Type": "application/json"}

_session_credits_used = 0.0


def sql_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def execute_sql(sql: str) -> str:
    r = requests.post(
        "https://api.dune.com/api/v1/sql/execute",
        headers=DUNE_HEADERS,
        json={"sql": sql, "performance": "medium"},
    )
    r.raise_for_status()
    return r.json()["execution_id"]


def poll_until_done(execution_id: str, timeout: int = 180, interval: int = 5) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(
            f"https://api.dune.com/api/v1/execution/{execution_id}/status",
            headers=DUNE_HEADERS,
        )
        r.raise_for_status()
        state = r.json()["state"]
        if state == "QUERY_STATE_COMPLETED":
            return True
        if state in ("QUERY_STATE_FAILED", "QUERY_STATE_CANCELLED"):
            print(f"  Query failed: {state}")
            return False
        print(f"  Status: {state} — waiting {interval}s...")
        time.sleep(interval)
    print("  Timed out.")
    return False


def fetch_results(execution_id: str) -> pd.DataFrame:
    r = requests.get(
        f"https://api.dune.com/api/v1/execution/{execution_id}/results",
        headers=DUNE_HEADERS,
    )
    r.raise_for_status()
    return pd.DataFrame(r.json().get("result", {}).get("rows", []))


def get_execution_cost(execution_id: str):
    r = requests.get(
        f"https://api.dune.com/api/v1/execution/{execution_id}/status",
        headers=DUNE_HEADERS,
    )
    r.raise_for_status()
    return r.json().get("execution_cost_credits")


def run_query(sql: str, label: str = "query", timeout: int = 180):
    """Execute a Dune SQL query end-to-end. Returns (df, execution_id)."""
    global _session_credits_used
    try:
        exec_id = execute_sql(sql)
        print(f"  Execution ID: {exec_id}")
        if poll_until_done(exec_id, timeout=timeout):
            df = fetch_results(exec_id)
            cost = get_execution_cost(exec_id)
            if cost is not None:
                _session_credits_used += cost
            print(f"  Cost: {cost:.4f} credits | Session total: {_session_credits_used:.4f}")
            return df, exec_id
        return pd.DataFrame(), exec_id
    except Exception as e:
        print(f"  run_query({label}): {e}")
        return pd.DataFrame(), None
