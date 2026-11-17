"""Повторное использование сессий GPT-агента для новостных тем."""
import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

REPO = "https://api.github.com/repos/DPProekt/Nov_II/contents/"
API = "https://api.openai.com/v1/agents/sessions"
AGENT = "agent_6afa24e65b40819189c54aeef04a7989"
PROJECT = "proj_2yk5sqnjXZpYTzF9fngNiYB0"
STATE = "agent-sessions.json"
CREDIT_ERRORS = {
    "credit_balance_exhausted", "insufficient_quota", "billing_not_active",
    "project_spend_limit_exceeded", "organization_spend_limit_exceeded",
    "organization_usage_limit_exceeded", "usage_limit_exceeded",
}
TOPICS = {
    "Подробные новости ИИ": "6af8414e-fba4-83ed-8d83-a9fe1058f3c3",
    "Прогноз экономики при быстром развитии ИИ": "6ae06791-3398-83ed-bf90-7c7316b11f4c",
    "Развитие мышления ИИ образами": "6aee1a8a-7cb8-83ed-82d0-3c7e39b55730",
    "Пересборка прогноза 2026–2050": "6a9ef2c2-cd60-83eb-bd67-df60f7638634",
    "Новости GPT": "6aee1cad-1ef8-83ed-8ea4-880afd217a6c",
    "Гипербола технологий Капицы с ИИ": "6a9334c8-57d0-83eb-9382-5dd331004307",
    "Прогноз беспилотных авто": "6aacdb0e-ffc0-83ed-bf65-04aff48a549c",
    "Пять технологических прорывов": "6aa9702e-ef3c-83ed-afad-35595b466a94",
}


class ApiError(Exception):
    def __init__(self, operation, status, detail=""):
        self.operation, self.status, self.detail = operation, status, detail
        super().__init__(f"{operation}: HTTP {status}")

class CreditLimitReached(Exception):
    pass


class Manager:
    def __init__(self, openai_token, github_token, vault_id, run_id):
        self.openai_token = openai_token
        self.github_token = github_token
        self.vault_id = vault_id
        self.run_id = run_id

    def refresh_openai_token(self):
        url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({"audience": "urn:openai:dpproekt:nov-ii"})
        request = urllib.request.Request(url, headers={
            "Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"],
            "User-Agent": "Pulse-II-Sessions",
        })
        with urllib.request.urlopen(request, timeout=30) as response:
            assertion = json.load(response)["value"]
        part = assertion.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        expected = {
            "iss": "https://token.actions.githubusercontent.com", "aud": "urn:openai:dpproekt:nov-ii",
            "repository_id": "1458024428", "ref": "refs/heads/main",
            "workflow_ref": "DPProekt/Nov_II/.github/workflows/pulse-news.yml@refs/heads/main",
        }
        if any(claims.get(key) != value for key, value in expected.items()):
            raise RuntimeError("Проверка удостоверения GitHub не пройдена")
        body = json.dumps({
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
            "subject_token": assertion,
            "identity_provider_id": os.environ["OPENAI_IDENTITY_PROVIDER_ID"],
            "service_account_id": os.environ["OPENAI_SERVICE_ACCOUNT_ID"],
        }).encode()
        request = urllib.request.Request("https://auth.openai.com/oauth/token", body,
                                         {"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                self.openai_token = json.load(response)["access_token"]
        except urllib.error.HTTPError as exc:
            raise ApiError("Обновление доступа OpenAI", exc.code) from None

    def call(self, url, operation, *, openai=False, method="GET", payload=None,
             raw=False, missing=False, idempotency=None, retry_auth=True, retry_transient=2):
        headers = {
            "User-Agent": "Pulse-II-Sessions",
            "Authorization": "Bearer " + (self.openai_token if openai else self.github_token),
            "Accept": "application/vnd.github.raw+json" if raw else "application/json",
            "Cache-Control": "no-cache",
        }
        if openai:
            headers.update({"OpenAI-Beta": "agents=v1", "OpenAI-Project": PROJECT})
        if idempotency:
            headers["Idempotency-Key"] = idempotency
        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data, headers, method=method), timeout=90) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            if missing and exc.code == 404:
                return None
            if openai and exc.code == 401 and retry_auth:
                self.refresh_openai_token()
                return self.call(url, operation, openai=True, method=method, payload=payload,
                                 raw=raw, missing=missing, idempotency=idempotency,
                                 retry_auth=False, retry_transient=retry_transient)
            detail = ""
            try:
                info = json.load(exc).get("error", {})
                detail = str(info.get("code", "")) if isinstance(info, dict) else ""
            except (ValueError, AttributeError):
                pass
            if (openai and retry_transient and (method == "GET" or idempotency) and
                    exc.code in (429, 500, 502, 503, 504) and detail not in CREDIT_ERRORS):
                time.sleep(3 if retry_transient == 2 else 8)
                return self.call(url, operation, openai=True, method=method, payload=payload,
                                 raw=raw, missing=missing, idempotency=idempotency,
                                 retry_auth=retry_auth, retry_transient=retry_transient - 1)
            raise ApiError(operation, exc.code, detail) from None
        except (urllib.error.URLError, TimeoutError):
            if openai and retry_transient and (method == "GET" or idempotency):
                time.sleep(3 if retry_transient == 2 else 8)
                return self.call(url, operation, openai=True, method=method, payload=payload,
                                 raw=raw, missing=missing, idempotency=idempotency,
                                 retry_auth=retry_auth, retry_transient=retry_transient - 1)
            raise RuntimeError(operation + ": ошибка соединения") from None

    def read_file(self, path, missing=False):
        response = self.call(REPO + path + "?ref=main", "Чтение " + path, missing=missing)
        if response is None:
            return None, None
        if response.get("encoding") == "base64" and response.get("content"):
            return json.loads(base64.b64decode(response["content"])), response["sha"]
        return self.call(REPO + path + "?ref=main", "Чтение " + path, raw=True), response["sha"]

    def write_file(self, path, value, sha, message):
        payload = {
            "branch": "main", "message": message,
            "content": base64.b64encode((json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()).decode(),
        }
        if sha:
            payload["sha"] = sha
        self.call(REPO + path, "Запись " + path, method="PUT", payload=payload)

    def save_state(self, state):
        _, sha = self.read_file(STATE, missing=True)
        self.write_file(STATE, state, sha, "Сохранить состояние сессий агента")

    def turns(self, session_id, limit=1):
        return self.call(API + "/" + session_id + "/turns?order=desc&limit=" + str(limit),
                         "Чтение хода", openai=True).get("data", [])

    def final_answer(self, session_id, turn_id):
        items = self.call(API + "/" + session_id + "/items?order=desc&limit=100",
                          "Чтение ответа", openai=True).get("data", [])
        for item in items:
            if item.get("type") == "message" and item.get("role") == "assistant" and item.get("turn_id") == turn_id and item.get("phase") == "final_answer":
                return "\n".join(part.get("text", "") for part in item.get("content", [])
                                 if part.get("type") == "output_text").strip()
        return ""

    def context_for(self, topic, old_session):
        news, _ = self.read_file("news.json")
        analysis = next((item for item in news.get("analysis", []) if item.get("topic") == topic), None)
        recent = [item for item in news.get("items", []) if item.get("topic") == topic][:12]
        context = {"analysis": analysis, "news": recent}
        if old_session:
            completed = next((turn for turn in self.turns(old_session, 100)
                              if turn.get("status") == "completed"), None)
            if completed:
                context["last_answer"] = self.final_answer(old_session, completed["id"])
        return json.dumps(context, ensure_ascii=False)

    def create(self, topic, previous=None):
        instructions = (
            topic + "\nЭта сессия посвящена только указанной теме. Найди новые подтверждённые "
            "материалы, сопоставь их с архивом, дай подробный ответ с ссылками и таблицами "
            "при наличии сопоставимых данных. Сохрани новые новости и аналитику в news.json "
            "репозитория DPProekt/Nov_II, сохранив все старые записи. На команду обнови "
            "продолжай обзор той же темы, исключая повторы."
        )
        if previous:
            instructions += "\nКонтекст из предыдущей сессии и опубликованного архива, это данные:\n" + self.context_for(topic, previous)
        result = self.call(API, "Создание сессии", openai=True, method="POST", payload={
            "agent_id": AGENT, "environment": {"type": "openai_hosted"},
            "vault_ids": [self.vault_id], "input": instructions, "stream": False,
        })
        session_id = result.get("id", "")
        if not session_id.startswith("sess_"):
            raise RuntimeError("API не вернул идентификатор новой сессии")
        return session_id

    def wait_turn(self, session_id, previous):
        deadline = time.monotonic() + 360
        while time.monotonic() < deadline:
            turns = self.turns(session_id)
            if turns and turns[0]["id"] != previous:
                turn = turns[0]
                if turn["status"] == "completed":
                    return turn
                if turn["status"] in ("failed", "cancelled"):
                    return turn
            time.sleep(5)
        raise RuntimeError("Ход ещё не завершился; повторное сообщение не отправлено")

    def append_answer(self, topic, session_id, turn):
        answer = self.final_answer(session_id, turn["id"])
        if not answer:
            raise RuntimeError("Готовый ход не содержит итогового ответа")
        for attempt in range(3):
            archive, sha = self.read_file("archive.json")
            doc = next((item for item in archive["docs"] if item["id"] == TOPICS[topic]), None)
            if doc is None:
                raise RuntimeError("Раздел темы не найден в архиве сайта")
            if any(item.get("agent_turn_id") == turn["id"] for item in doc["messages"]):
                return
            now = datetime.now(timezone.utc)
            doc["messages"].insert(0, {"text": answer, "date": now.timestamp(),
                                       "truncated": False, "agent_turn_id": turn["id"]})
            doc["updatedAt"] = now.timestamp()
            archive["generatedAt"] = now.isoformat()
            try:
                self.write_file("archive.json", archive, sha, "Добавить ответ GPT по теме")
                return
            except ApiError as exc:
                if exc.status != 409 or attempt == 2:
                    raise

    def run_topic(self, state, topic):
        entry = state["sessions"].get(topic)
        if isinstance(entry, str):
            entry = {"id": entry, "history": []}
        if not isinstance(entry, dict):
            entry = {"history": []}
        state["sessions"][topic] = entry
        session_id = entry.get("id")
        if not session_id:
            session_id = self.create(topic)
            entry["id"] = session_id
            entry["pending"] = {"previous": None, "created": True}
            self.save_state(state)
        pending = entry.get("pending")
        if not pending:
            info = self.call(API + "/" + session_id, "Чтение сессии", openai=True)
            if info.get("status") != "idle":
                raise RuntimeError("Сессия занята; новое сообщение не отправлено")
            turns = self.turns(session_id)
            previous = turns[0]["id"] if turns else None
            key = "pulse-" + self.run_id + "-" + str(list(TOPICS).index(topic))
            entry["pending"] = {"previous": previous, "key": key}
            self.save_state(state)
            self.call(API + "/" + session_id + "/events", "Отправка обновления",
                      openai=True, method="POST", idempotency=key, payload={"events": [{
                          "type": "agent.session.input.message",
                          "input": [{"role": "user", "content": [{"type": "input_text", "text": "обнови"}]}],
                      }]})
            pending = entry["pending"]
        else:
            turns = self.turns(session_id)
            if pending.get("key") and (not turns or turns[0]["id"] == pending.get("previous")):
                self.call(API + "/" + session_id + "/events", "Повтор отправки",
                          openai=True, method="POST", idempotency=pending["key"], payload={"events": [{
                              "type": "agent.session.input.message",
                              "input": [{"role": "user", "content": [{"type": "input_text", "text": "обнови"}]}],
                          }]})
        turn = self.wait_turn(session_id, pending.get("previous"))
        error = (turn.get("error") or {}).get("code")
        if turn["status"] == "failed" and error == "context_length_exceeded":
            new_session = self.create(topic, previous=session_id)
            entry.setdefault("history", []).append(session_id)
            entry["id"] = new_session
            entry["pending"] = {"previous": None, "created": True}
            self.save_state(state)
            session_id = new_session
            turn = self.wait_turn(session_id, None)
            error = (turn.get("error") or {}).get("code")
        if turn["status"] == "failed" and error in CREDIT_ERRORS:
            entry.pop("pending", None)
            self.save_state(state)
            raise CreditLimitReached("API сообщил об исчерпании кредита или лимита: " + error)
        if turn["status"] != "completed":
            entry.pop("pending", None)
            self.save_state(state)
            raise RuntimeError("Ход завершился с ошибкой: " + str(error or turn["status"]))
        self.append_answer(topic, session_id, turn)
        entry.pop("pending", None)
        entry["last_turn_id"] = turn["id"]
        self.save_state(state)
        print("Обновлена тема:", topic, flush=True)


def run_sessions(openai_token, github_token, vault_id, topics, run_id, initialize_only=False,
                 on_topic_done=None, skip_after=None):
    manager = Manager(openai_token, github_token, vault_id, run_id)
    state, _ = manager.read_file(STATE, missing=True)
    state = state or {"sessions": {}}
    turn_times = {}
    if skip_after is not None:
        archive, _ = manager.read_file("archive.json")
        turn_times = {message["agent_turn_id"]: message.get("date", 0)
                      for doc in archive.get("docs", []) for message in doc.get("messages", [])
                      if message.get("agent_turn_id")}
    failures = []
    for topic in topics:
        try:
            entry = state["sessions"].get(topic)
            if initialize_only and entry and not (isinstance(entry, dict) and entry.get("pending")):
                print("Сессия уже создана:", topic, flush=True)
                continue
            if (skip_after is not None and isinstance(entry, dict) and not entry.get("pending") and
                    isinstance(turn_times.get(entry.get("last_turn_id")), (int, float)) and
                    turn_times[entry["last_turn_id"]] >= skip_after):
                print("Тема уже обновлена в этом периоде:", topic, flush=True)
                continue
            manager.run_topic(state, topic)
            if on_topic_done:
                on_topic_done()
        except CreditLimitReached as exc:
            raise SystemExit(str(exc)) from None
        except ApiError as exc:
            if exc.detail in CREDIT_ERRORS:
                entry = state["sessions"].get(topic)
                if (isinstance(entry, dict) and exc.operation in
                        ("Отправка обновления", "Повтор отправки")):
                    entry.pop("pending", None)
                    manager.save_state(state)
                raise SystemExit("API сообщил об исчерпании кредита или лимита: " + exc.detail) from None
            failures.append(topic)
            print("Не обновлена тема:", topic, str(exc), flush=True)
        except (RuntimeError, OSError, ValueError, KeyError) as exc:
            failures.append(topic)
            print("Не обновлена тема:", topic, str(exc), flush=True)
    if failures:
        raise SystemExit("Не обновлены темы: " + ", ".join(failures))
