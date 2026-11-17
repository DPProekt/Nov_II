"""Forward owner-approved requests from the private edition desk to GitHub Actions."""
import json
import os
import re
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from clock import API, WORKFLOW, app_token, get_json

SITE = "https://puls-ii-novosti.dnpnik.chatgpt.site"
TOPICS = {"Все темы","Подробные новости ИИ","Прогноз экономики при быстром развитии ИИ",
          "Развитие мышления ИИ образами","Пересборка прогноза 2026–2050","Новости GPT",
          "Гипербола технологий Капицы с ИИ","Прогноз беспилотных авто","Пять технологических прорывов"}
ID = re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def site_request(path, secrets, body=None):
    headers = {"OAI-Sites-Authorization": "Bearer "+secrets["access"], "X-Pulse-Relay": secrets["relay"],
               "Accept":"application/json", "User-Agent":"Pulse-II-edition-relay/1","Cache-Control":"no-store"}
    if body is not None:
        headers["Content-Type"]="application/json"
    req=Request(SITE+path, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    with build_opener(NoRedirect).open(req,timeout=15) as resp:
        if resp.headers.get_content_type()!="application/json":
            raise ValueError("Unexpected response from edition desk")
        return json.load(resp)

def check():
    credentials=Path(os.environ["CREDENTIALS_DIRECTORY"])
    secrets=json.loads((credentials/"edition-desk").read_text())
    job=site_request("/edition/relay",secrets)["job"]
    if not job:
        return
    rid,topic=job["id"],job["topic"]
    if not ID.fullmatch(rid) or topic not in TOPICS:
        raise ValueError("Unrecognized job")
    state_file=Path(os.environ["STATE_DIRECTORY"])/"last.json"
    def save(record):
        tmp=state_file.with_suffix(".tmp");tmp.write_text(json.dumps(record));tmp.replace(state_file)
    def report(state,run=None):
        site_request("/edition/relay",secrets,{"id":rid,"state":state,"run_id":run})
    reg=json.loads((credentials/"github-app").read_text())
    token=app_token(reg)
    if job["state"]=="dispatched":
        run=get_json(f"{API}/repos/DPProekt/Nov_II/actions/runs/{int(job['run_id'])}",token=token)
        if run["status"]=="completed":
            report("done" if run["conclusion"]=="success" else "failed",job["run_id"])
        return
    record=json.loads(state_file.read_text()) if state_file.exists() else {}
    if record.get("id")==rid:
        if record.get("run"):
            report("dispatched",record["run"]);return
        runs=get_json(API+WORKFLOW+"/runs?event=workflow_dispatch&per_page=30",token=token)["workflow_runs"]
        match=next((r for r in runs if r["display_title"]=="Пульс ИИ · запрос "+rid),None)
        if match:report("dispatched",match["id"])
        elif time.time()-record["sent"]>300:report("failed")
        return
    record={"id":rid,"sent":time.time()}
    save(record)   # If the dispatch response is lost, recover by run name without sending it twice.
    try:
        result=get_json(API+WORKFLOW+"/dispatches",token=token,data={"ref":"main","inputs":{
            "topic":topic,"persistent_session":True,"web_request":rid}})
    except HTTPError as exc:
        if 400<=exc.code<500 and exc.code not in (408,429):report("failed")
        raise
    run=(result or {}).get("workflow_run_id")
    if run:
        record["run"]=str(int(run));save(record);report("dispatched",record["run"])
    print("Accepted edition request",rid,flush=True)

if __name__=="__main__":
    try:check()
    except Exception as exc:
        print("Edition relay:",type(exc).__name__,getattr(exc,"code",""),flush=True)
        raise SystemExit(1)
