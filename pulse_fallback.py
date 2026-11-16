"""Резервный запуск выпуска, если облачное расписание пропустило обновление."""
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pulse_dispatch import gh

ROOT = Path(__file__).resolve().parent
STATE = ROOT / ".debug" / "fallback-status.json"
REPOSITORY = "DPProekt/Nov_II"


def record(status, **details):
    STATE.parent.mkdir(exist_ok=True)
    data = {"checked_at": datetime.now(timezone.utc).isoformat(), "status": status, **details}
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, STATE)


def read_repo_json(path):
    return json.loads(gh("api", "-H", "Accept: application/vnd.github.raw+json",
                         f"repos/{REPOSITORY}/contents/{path}?ref=main"))


def all_recent():
    state = read_repo_json("agent-sessions.json").get("sessions", {})
    if len(state) != 8:
        raise ValueError("Не найдены восемь сессий")
    archive = read_repo_json("archive.json")
    times = {message.get("agent_turn_id"): message.get("date")
             for doc in archive.get("docs", []) for message in doc.get("messages", [])
             if message.get("agent_turn_id")}
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).timestamp()
    return all(isinstance(entry, dict) and not entry.get("pending") and
               isinstance(times.get(entry.get("last_turn_id")), (int, float)) and
               times[entry["last_turn_id"]] >= cutoff for entry in state.values())


def active_run():
    runs = json.loads(gh("run", "list", "--repo", REPOSITORY, "--workflow", "pulse-news.yml",
                         "--limit", "10", "--json", "status,createdAt"))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    return any(run["status"] in ("queued", "pending", "in_progress", "waiting") and
               datetime.fromisoformat(run["createdAt"].replace("Z", "+00:00")) >= cutoff
               for run in runs)


def run():
    for _ in range(40):
        if not active_run():
            break
        time.sleep(30)
    else:
        record("busy")
        return
    if all_recent():
        record("current")
        return
    if STATE.exists():
        previous = json.loads(STATE.read_text(encoding="utf-8"))
        if previous.get("last_started_at"):
            age = datetime.now(timezone.utc) - datetime.fromisoformat(previous["last_started_at"])
            if age < timedelta(hours=5):
                record("recent_start", run_id=previous.get("run_id"),
                       last_started_at=previous["last_started_at"])
                return
    output = gh("workflow", "run", "pulse-news.yml", "--repo", REPOSITORY,
                "--ref", "main", "-f", "topic=Все темы")
    match = re.search(r"/actions/runs/(\d+)", output)
    if not match:
        raise ValueError("GitHub не вернул номер запуска")
    record("started", run_id=match.group(1), last_started_at=datetime.now(timezone.utc).isoformat())


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        record("error", error_type=type(error).__name__)
