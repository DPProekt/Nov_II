"""Локальный сервер новостного архива. Секрет читается только из окружения."""
import datetime as dt
import json
import os
import pathlib
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / 'private-news.json'
BASELINE = '2026-11-14'
LOCK = threading.Lock()
ALLOWED_ORIGINS = ('https://dpproekt.github.io', 'http://127.0.0.1:8766', 'http://localhost:8766')
TOPICS = ('Новости ИИ', 'Подробные новости ИИ', 'Новости ИИ подробно', 'Прогноз экономики ИИ', 'Развитие мышления ИИ образами', 'Пересборка прогноза 2026–2050', 'Новости GPT', 'Гипербола технологий Капицы с ИИ', 'Прогноз беспилотных авто', 'Пять технологических прорывов')

def read_news():
    if not DATA.exists():
        return {'items': [], 'last_search': None}
    with DATA.open(encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get('items'), list):
        raise ValueError('Неверный формат сохранённых новостей')
    return data

def get_cutoff(items):
    dates = [x.get('date', '') for x in items if isinstance(x, dict)]
    return max([BASELINE] + [d for d in dates if valid_date(d)])

def valid_date(value):
    try:
        return isinstance(value, str) and dt.date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False

def select_new(items, old, cutoff):
    known = {i.get('url') for i in old}
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=6))).date().isoformat()
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        date, url = item.get('date', ''), item.get('url', '')
        parsed = urllib.parse.urlsplit(url)
        if not valid_date(date) or not cutoff < date <= today or parsed.scheme != 'https' or not parsed.hostname or parsed.username or url in known:
            continue
        if not all(isinstance(item.get(k), str) and item[k].strip() for k in ('title', 'summary', 'source')):
            continue
        known.add(url)
        result.append({k: item[k].strip() for k in ('title', 'summary', 'date', 'source', 'url')})
    return result

def search_news(key, cutoff, topic):
    schema = {'type':'object','properties':{'items':{'type':'array','items':{'type':'object','properties':{'title':{'type':'string'},'summary':{'type':'string'},'date':{'type':'string'},'source':{'type':'string'},'url':{'type':'string'}},'required':['title','summary','date','source','url'],'additionalProperties':False}}},'required':['items'],'additionalProperties':False}
    prompt = (f'Найди важные новости и исследования по теме «{topic}». По-русски, подробно и точно. '
              f'Включай только публикации с проверяемой датой строго после {cutoff}; не выдумывай новости, даты или ссылки. '
              'Для каждой новости укажи прямую ссылку на источник, дату исходной публикации в формате YYYY-MM-DD, '
              'название источника, заголовок и краткое описание. Предпочитай первоисточники. Если данных нет, верни пустой массив.')
    body = {'model':'gpt-6.1-terra','tools':[{'type':'web_search','search_context_size':'low'}], 'tool_choice':'required','input':prompt,'max_output_tokens':3500,'text':{'format':{'type':'json_schema','name':'news','schema':schema,'strict':True}}}
    request = urllib.request.Request('https://api.openai.com/v1/responses', data=json.dumps(body).encode(), method='POST', headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)
    texts = [c['text'] for o in payload.get('output', []) if o.get('type') == 'message' for c in o.get('content', []) if c.get('type') == 'output_text']
    if payload.get('status') != 'completed' or not texts:
        raise ValueError('API не вернул завершённый результат')
    result = json.loads(''.join(texts))
    if not isinstance(result.get('items'), list):
        raise ValueError('API вернул неверный формат')
    return result['items']

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def reply(self, status, payload):
        body=json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin') if self.headers.get('Origin') in ALLOWED_ORIGINS else 'null'); self.send_header('Vary','Origin'); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        if self.path not in ('/api/refresh','/api/news') or self.headers.get('Origin') not in ALLOWED_ORIGINS: return self.send_error(403)
        self.send_response(204); self.send_header('Access-Control-Allow-Origin',self.headers['Origin']); self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers','Content-Type'); self.send_header('Access-Control-Allow-Private-Network','true'); self.send_header('Vary','Origin'); self.end_headers()
    def do_GET(self):
        if self.path.split('?')[0] == '/api/news':
            try: self.reply(200, read_news())
            except (OSError, ValueError): self.reply(500, {'error':'Не удалось прочитать сохранённые новости.'})
        elif self.path.split('?')[0] in ('/', '/index.html', '/style.css', '/app.js', '/charts.js', '/archive.json'):
            super().do_GET()
        else: self.send_error(404)
    def do_POST(self):
        if self.path != '/api/refresh': return self.send_error(404)
        if self.headers.get('Origin') not in ALLOWED_ORIGINS or self.headers.get('Content-Type') != 'application/json': return self.reply(403, {'error':'Недопустимый источник запроса.'})
        if not LOCK.acquire(blocking=False): return self.reply(409, {'error':'Обновление уже выполняется.'})
        try:
            key=os.environ.get('OPENAI_API_KEY', '').strip()
            if not key: return self.reply(503, {'error':'API-ключ не найден в окружении сервера.'})
            length=int(self.headers.get('Content-Length','0'))
            if length <= 0 or length > 4096: return self.reply(400, {'error':'Некорректный запрос.'})
            data=json.loads(self.rfile.read(length)); topic=data.get('topic'); baseline=data.get('cutoff')
            if topic not in TOPICS or not valid_date(baseline): return self.reply(400, {'error':'Некорректная тема или дата.'})
            saved=read_news(); existing=[x for x in saved['items'] if x.get('topic')==topic]; cutoff=max([baseline]+[x['date'] for x in existing if valid_date(x.get('date'))]); found=search_news(key,cutoff,topic); added=select_new(found,existing,cutoff)
            for item in added: item['topic']=topic
            saved['items']=(added+saved['items'])[:500]; saved['last_search']=dt.datetime.now(dt.timezone.utc).isoformat()
            tmp=DATA.with_suffix('.tmp'); tmp.write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding='utf-8'); tmp.replace(DATA)
            self.reply(200, {'items':saved['items'],'added':len(added),'cutoff':cutoff,'last_search':saved['last_search']})
        except (urllib.error.URLError, OSError, ValueError, KeyError, json.JSONDecodeError): self.reply(502, {'error':'Поиск не завершён. Сохранённые новости не изменены.'})
        finally: LOCK.release()

if __name__ == '__main__':
    print('Пульс ИИ: http://127.0.0.1:8766', flush=True)
    ThreadingHTTPServer(('127.0.0.1',8766),Handler).serve_forever()


