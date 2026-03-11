"""
Pickle-based checkpoints saved to DATA_DIR (replaces Google Drive).
"""
import os
import pickle
from backend.config import DATA_DIR


def _path(name: str) -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    return os.path.join(DATA_DIR, f"{name}.pkl")


def save(name: str, data) -> None:
    if data is None:
        print(f"  Skipping {name} (None)")
        return
    with open(_path(name), "wb") as f:
        pickle.dump(data, f)
    print(f"  Saved {name}")


def load(name: str):
    p = _path(name)
    if os.path.exists(p):
        with open(p, "rb") as f:
            data = pickle.load(f)
        print(f"  Loaded {name}")
        return data
    print(f"  Not found: {name} — will be computed")
    return None


def load_all():
    return {
        "df_markets":    load("df_markets"),
        "df_scored":     load("df_scored"),
        "histories":     load("histories"),
        "dune_results":  load("dune_results"),
        "df_wallet_agg": load("df_wallet_agg"),
        "df_combined":   load("df_combined"),
    }


def save_all(df_markets=None, df_scored=None, histories=None,
             dune_results=None, df_wallet_agg=None, df_combined=None):
    save("df_markets",    df_markets)
    save("df_scored",     df_scored)
    save("histories",     histories)
    save("dune_results",  dune_results)
    save("df_wallet_agg", df_wallet_agg)
    save("df_combined",   df_combined)
