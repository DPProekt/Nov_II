"""Narrow HTTPS API for browsers paired by the owner; upstream keys stay in systemd."""
import base64
import hashlib
import json
import os
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from manual import ID, TOPICS, site_request

ORIGIN = "https://dpproekt.github.io"
DB = Path(os.environ["STATE_DIRECTORY"]) / "reader.sqlite3"
SECRETS = json.loads((Path(os.environ["CREDENTIALS_DIRECTORY"])/"edition-desk").read_text())

def b64(data): return base64.urlsafe_b64decode(data+'='*(-len(data)%4))
def digest(b): return hashlib.sha256(b).hexdigest()
def db():
    c=sqlite3.connect(DB,timeout=8)
    return c
with db() as c:
    c.executescript("""CREATE TABLE IF NOT EXISTS devices(k TEXT PRIMARY KEY, pub BLOB NOT NULL, claimed TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,k TEXT NOT NULL,topic TEXT NOT NULL,ts INTEGER NOT NULL);""")
def pair(d):
    pub=b64(d['pub']); key=digest(pub); invitation=digest(d['invite'].encode())
    if len(pub)!=65 or pub[0]!=4: return 400,{}
    ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(),pub)
    invites=json.loads(Path('/etc/pulse-ii-reader/invitations.json').read_text())
    if invites.get(invitation,0)<time.time(): return 403,{'error':'Этот файл подключения уже недействителен.'}
    with db() as c:
        c.execute("INSERT OR IGNORE INTO devices VALUES (?,?,?)",(key,pub,invitation))
        if not c.execute('SELECT 1 FROM devices WHERE k=? AND claimed=?',(key,invitation)).fetchone():
            return 403,{'error':'Этот файл уже привязан к другому браузеру.'}
    return 200,{'key':key}
def start(d):
    now=int(time.time()); rid=d['id']; topic=d['topic']; ts=d['ts']; key=d['key']
    if not isinstance(ts,int) or abs(now-ts)>180 or not ID.fullmatch(rid) or topic not in TOPICS: return 400,{'error':'Проверьте тему и время на устройстве.'}
    with db() as c:
        row=c.execute('SELECT pub FROM devices WHERE k=?',(key,)).fetchone()
        if not row:return 403,{'error':'Подключите этот браузер один раз.'}
        signature=b64(d['signature'])
        if len(signature)!=64:return 403,{}
        proof=encode_dss_signature(int.from_bytes(signature[:32],'big'),int.from_bytes(signature[32:],'big'))
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(),row[0]).verify(proof,('pulse-reader-v1\n'+rid+'\n'+topic+'\n'+str(ts)).encode(),ec.ECDSA(hashes.SHA256()))
        c.execute('BEGIN IMMEDIATE')
        prior=c.execute('SELECT k,topic,ts FROM requests WHERE id=?',(rid,)).fetchone()
        if prior and (prior[:2]!=(key,topic) or now-prior[2]>7200):return 409,{}
        if not prior:
            if c.execute('SELECT count(*) FROM requests WHERE ts>?',(now-3600,)).fetchone()[0]>=12:return 429,{'error':'Лимит ручных запусков за час достигнут. Попробуйте позже.'}
            c.execute('DELETE FROM requests WHERE ts<?',(now-86400,))
            c.execute('INSERT INTO requests VALUES(?,?,?,?)',(rid,key,topic,now))
    j=site_request('/edition/jobs',SECRETS,{'id':rid,'topic':topic})
    return 202,{k:j.get(k) for k in ('id','topic','state','run_id')}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,status,d):
        raw=json.dumps(d,ensure_ascii=False).encode();self.send_response(status)
        for k,v in {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,
                    'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type',
                    'Access-Control-Max-Age':'600','Content-Length':str(len(raw))}.items():self.send_header(k,v)
        self.end_headers()
        if raw:self.wfile.write(raw)
    def do_OPTIONS(self):self.reply(200,{} if self.headers.get('Origin')==ORIGIN else {'denied':True})
    def do_GET(self): self.reply(200 if self.path=='/v1/health' else 404,{'service':'pulse-reader'} if self.path=='/v1/health' else {})
    def do_POST(self):
        if self.headers.get('Origin')!=ORIGIN or self.headers.get_content_type()!='application/json':return self.reply(403,{})
        try:
            n=int(self.headers.get('Content-Length',0))
            if self.path not in ('/v1/pair','/v1/start') or not 1<=n<=1800:return self.reply(400,{})
            d=json.loads(self.rfile.read(n));status,out=(pair if self.path=='/v1/pair' else start)(d)
        except InvalidSignature:status,out=403,{}
        except (ValueError,KeyError,TypeError,AttributeError):status,out=400,{}
        except Exception:status,out=503,{'error':'Не удалось связаться с очередью. Повторите тот же запрос.'}
        self.reply(status,out)
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',19158),Handler).serve_forever()
