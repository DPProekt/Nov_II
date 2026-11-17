"""Check the current edition and dispatch the cloud news agent if needed."""
import argparse
import base64
import json
import os
import subprocess
import time
import urllib.request
from datetime import datetime
from pathlib import Path

REPOSITORY = "DPProekt/Nov_II"
API = "https://api.github.com"
WORKFLOW = f"/repos/{REPOSITORY}/actions/workflows/pulse-news.yml"
PERIOD = 6 * 3600
EDITION_DELAY = 17 * 60  # Same opening time as the GitHub Actions freshness guard.
SIGNAL_GRACE = 12 * 60  # Allow another check at :32; active runs are checked separately.


def get_json(url, *, token=None, data=None):
    headers = {"User-Agent": "Pulse-II-clock", "Accept": "application/vnd.github+json",
               "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data, headers), timeout=25) as response:
        return json.load(response) if response.status != 204 else None


def app_token(registration):
    def encode(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    now = int(time.time())
    header = encode(b'{"alg":"RS256","typ":"JWT"}')
    payload = encode(json.dumps({"iat": now - 60, "exp": now + 480,
                                 "iss": registration["client_id"]}).encode())
    message = header + b"." + payload
    key = Path(os.environ["CREDENTIALS_DIRECTORY"]) / "github-app-key"
    signature = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(key)], input=message,
        stdout=subprocess.PIPE, timeout=10, check=True,
    ).stdout
    assertion = (message + b"." + encode(signature)).decode()
    response = get_json(f"{API}/app/installations/{int(registration['installation_id'])}/access_tokens",
                        token=assertion, data={"repositories": ["Nov_II"],
                                               "permissions": {"actions": "write"}})
    return response["token"]


def recent_topics(slot, cache_tag):
    base = f"https://raw.githubusercontent.com/{REPOSITORY}/main/"
    registry = get_json(base + "agent-sessions.json?v=" + cache_tag)
    archive = get_json(base + "archive.json?v=" + cache_tag)
    sessions = registry.get("sessions", {})
    turns = {message["agent_turn_id"]: message.get("date")
             for doc in archive.get("docs", []) for message in doc.get("messages", [])
             if message.get("agent_turn_id")}
    return len(sessions) == 8 and all(
        isinstance(entry, dict) and not entry.get("pending")
        and isinstance(turns.get(entry.get("last_turn_id")), (int, float))
        and turns[entry["last_turn_id"]] >= slot
        for entry in sessions.values()
    )


def run(verify):
    now = int(time.time())
    slot = now // PERIOD * PERIOD
    if not verify and now - slot < EDITION_DELAY:
        print("Waiting for the scheduled minute")
        return
    current = recent_topics(slot, str(now // 60))
    if current and not verify:
        print("All eight topics are current")
        return

    state_file = Path(os.environ["STATE_DIRECTORY"]) / "last-dispatch.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    attempts = state.get("attempts", 0) if state.get("slot") == slot else 0
    if not verify and (attempts >= 3 or (attempts and now - state["sent_at"] < SIGNAL_GRACE)):
        print("A previous signal is still being given time to run")
        return

    registration = json.loads((Path(os.environ["CREDENTIALS_DIRECTORY"]) / "github-app").read_text())
    token = app_token(registration)
    runs = get_json(API + WORKFLOW + "/runs?per_page=10", token=token)["workflow_runs"]
    if any(item["status"] in {"queued", "pending", "in_progress", "waiting", "requested"}
           and datetime.fromisoformat(item["created_at"].replace("Z", "+00:00")).timestamp() > now - 7200
           for item in runs):
        print("Another edition is running or queued")
        return
    if verify and not current:
        raise RuntimeError("Wait for the current edition before a signal-only check")
    get_json(API + WORKFLOW + "/dispatches", token=token, data={
        "ref": "main", "inputs": {"clock_check": True},
    })
    if not verify:
        temporary = state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({"slot": slot, "sent_at": now, "attempts": attempts + 1}))
        temporary.replace(state_file)
    print("GitHub accepted the edition signal")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-signal", action="store_true")
    run(parser.parse_args().verify_signal)
