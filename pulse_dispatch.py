"""Локальный запуск GitHub Actions для владельца сайта."""
import json
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ORIGIN = "https://dpproekt.github.io"
REPOSITORY = "DPProekt/Nov_II"
TOPICS = {
    "Подробные новости ИИ", "Прогноз экономики при быстром развитии ИИ",
    "Развитие мышления ИИ образами", "Пересборка прогноза 2026–2050",
    "Новости GPT", "Гипербола технологий Капицы с ИИ",
    "Прогноз беспилотных авто", "Пять технологических прорывов", "Все темы",
}
active = set()
lock = threading.Lock()


def gh(*args):
    return subprocess.run(
        ["gh", *args], capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=40, check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    ).stdout


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.headers.get("Origin") != ORIGIN:
            self.reply(403, {"error": "Недопустимый источник."})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_POST(self):
        if self.path != "/start" or self.headers.get("Origin") != ORIGIN:
            self.reply(403, {"error": "Недопустимый запрос."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1024:
                raise ValueError
            topic = json.loads(self.rfile.read(length)).get("topic")
            if topic not in TOPICS:
                raise ValueError
            with lock:
                if active:
                    existing = next(iter(active))
                    if existing == "starting":
                        self.reply(409, {"error": "Обновление уже запускается."})
                        return
                    prior = json.loads(gh("run", "view", existing, "--repo", REPOSITORY,
                                          "--json", "status"))
                    if prior.get("status") != "completed":
                        self.reply(409, {"error": "Обновление уже выполняется."})
                        return
                    active.discard(existing)
                active.add("starting")
            output = gh("workflow", "run", "pulse-news.yml", "--repo", REPOSITORY,
                        "--ref", "main", "-f", f"topic={topic}")
            match = re.search(r"/actions/runs/(\d+)", output)
            if not match:
                raise RuntimeError("GitHub не вернул номер запуска.")
            run_id = match.group(1)
            with lock:
                active.discard("starting")
                active.add(run_id)
            self.reply(202, {"run_id": run_id})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.reply(400, {"error": "Неизвестная тема."})
        except (subprocess.SubprocessError, OSError, RuntimeError):
            with lock:
                active.discard("starting")
            self.reply(502, {"error": "Не удалось запустить GitHub Actions. Проверьте вход GitHub CLI."})

    def do_GET(self):
        if self.headers.get("Origin") != ORIGIN:
            self.reply(403, {"error": "Недопустимый источник."})
            return
        match = re.fullmatch(r"/status/(\d+)", urlsplit(self.path).path)
        if not match:
            self.reply(404, {"error": "Запуск не найден."})
            return
        run_id = match.group(1)
        try:
            result = json.loads(gh("run", "view", run_id, "--repo", REPOSITORY,
                                   "--json", "status,conclusion,url"))
            if result.get("status") == "completed":
                with lock:
                    active.discard(run_id)
            self.reply(200, result)
        except (subprocess.SubprocessError, OSError, ValueError):
            self.reply(502, {"error": "Не удалось получить состояние GitHub Actions."})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8767), Handler).serve_forever()
