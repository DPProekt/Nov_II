"""Однократная настройка облачного таймера для GPT-агента."""
import time

STATE_FILE = "agent-cloud-scheduler.json"
AUTOMATIONS = "https://api.openai.com/v1/agents/automations"
INSTRUCTIONS = (
    "Ты запускаешь обновление сайта Пульс ИИ. Твоя единственная задача по команде — "
    "через подключённый GitHub прочитать файл refresh-trigger.json в ветке main "
    "репозитория DPProekt/Nov_II, увеличить его целочисленное поле counter на единицу "
    "и записать полный JSON обратно с текущим SHA. После записи проверь значение. "
    "При конфликте SHA перечитай и повтори один раз. Не изменяй другие файлы, "
    "не выполняй поиск и не публикуй секреты. Один запуск — одно увеличение счётчика."
)
TRIGGER = "Запусти обновление Пульса ИИ: увеличь counter в refresh-trigger.json на единицу."


def configure(manager):
    state, sha = manager.read_file(STATE_FILE, missing=True)
    state = state or {"schema_version": 1}

    def save():
        nonlocal sha
        manager.write_file(STATE_FILE, state, sha, "Сохранить настройки облачного расписания")
        _, sha = manager.read_file(STATE_FILE)

    if not state.get("session_id"):
        session = manager.call(
            "https://api.openai.com/v1/agents/sessions", "Создание сессии расписания",
            openai=True, method="POST", payload={
                "agent_id": "agent_6afa24e65b40819189c54aeef04a7989",
                "agent": {"instructions": INSTRUCTIONS},
                "environment": {"type": "none"}, "vault_ids": [manager.vault_id],
                "input": "Проверка настройки. Ответь ГОТОВО, не изменяя файлы.", "stream": False,
            },
        )
        state["session_id"] = session["id"]
        save()
    session_id = state["session_id"]
    target = {"type": "existing_session", "session_id": session_id, "instructions": TRIGGER}
    if not state.get("periodic_id"):
        automation = manager.call(AUTOMATIONS, "Создание облачного расписания",
                                  openai=True, method="POST", payload={
                                      "type": "periodic", "name": "Пульс ИИ — каждые 6 часов",
                                      "expression": "17 */6 * * *", "timezone": "Asia/Omsk", "target": target,
                                  })
        state["periodic_id"] = automation["id"]
        save()
    if not state.get("test_id"):
        automation = manager.call(AUTOMATIONS, "Создание разовой проверки",
                                  openai=True, method="POST", payload={
                                      "type": "once", "name": "Пульс ИИ — проверка облачного запуска",
                                      "run_at": int(time.time()) + 180, "target": target,
                                  })
        state["test_id"] = automation["id"]
        save()
    print("Облачный таймер и разовая проверка созданы.", flush=True)
