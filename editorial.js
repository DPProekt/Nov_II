/* Manual editions: Pages reads public files; only the cloud desk or a GitHub editor can start the agent. */
'use strict';

const editionRepo='https://github.com/DPProekt/Nov_II';
const editionAPI='https://api.github.com/repos/DPProekt/Nov_II/actions';
const editionTopics=['Все темы','Подробные новости ИИ','Прогноз экономики при быстром развитии ИИ','Развитие мышления ИИ образами','Пересборка прогноза 2026–2050','Новости GPT','Гипербола технологий Капицы с ИИ','Прогноз беспилотных авто','Пять технологических прорывов'];
const requestPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const editionPanel=document.querySelector('#edition-notice'),startButton=document.querySelector('#refresh');
let ongoing=null,monitorTimer=0,monitorBusy=false;
const timeLabel=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
function selection(){
 if(location.hash.startsWith('#/read/')&&Newsroom.readTopic())return Newsroom.readTopic();
 const m=location.hash.match(/^#\/(?:topic|analysis)\/(\d+)/);
 if(m&&archive)return topicDocument(+m[1])?.title||editionTopics[0];
 if(location.hash==='#/analysis'&&archive)return topicDocument(0)?.title||editionTopics[0];
 if(location.hash==='#/forecast')return document.querySelector('#forecast-topic option:checked')?.textContent||editionTopics[0];
 return editionTopics[0];
}
function stamp(){
 const latest=archive?.docs.flatMap(d=>d.messages.filter(m=>m.agent_turn_id).map(m=>Number(m.date)||0))||[];
 if(latest.length)document.querySelector('#mast-stamp').textContent=timeLabel(Math.max(...latest)*1000)+' · Омск';
}
function saveJob(){try{if(ongoing)sessionStorage.setItem('pulse-direct-job-v1',JSON.stringify(ongoing));else sessionStorage.removeItem('pulse-direct-job-v1')}catch{}}
function note(kind,title,body,actions=[]){
 document.querySelector('#edition-setup').hidden=true;document.querySelector('#edition-result').replaceChildren();editionPanel.hidden=false;editionPanel.dataset.kind=kind;
 editionPanel.querySelector('h2').textContent=title;editionPanel.querySelector('p').textContent=body;
 const links=editionPanel.querySelector('.edition-actions');links.replaceChildren();
 for(const [caption,url,fn] of actions){const a=document.createElement('a');a.textContent=caption;a.href=url;if(url.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer'}if(fn)a.addEventListener('click',fn);links.append(a)}
 startButton.setAttribute('aria-busy',String(!!ongoing));
 startButton.querySelector('span').textContent=ongoing&&['queued','running','publishing'].includes(ongoing.phase)?'Ход поиска':'Обновить';
}
async function publicData(){
 const q='?edition='+Date.now(),rs=await Promise.all(['news.json','archive.json'].map(f=>fetch(f+q,{cache:'no-store',signal:AbortSignal.timeout(22000)})));
 if(rs.some(r=>!r.ok))throw Error('Не удалось загрузить выпуск');
 const [news,docs]=await Promise.all(rs.map(r=>r.json()));
 if(!Array.isArray(news.items)||!Array.isArray(docs.docs))throw Error('Неверный формат выпуска');
 return {news,docs};
}
function applyPublic(data,force=false){
 const {news,docs}=data;
 const changed=!archive||docs.generatedAt!==archive.generatedAt||news.items.length!==sharedNews.length||news.updated_at!==lastNewsStamp;
 if(changed||force){archive=docs;sharedNews=news.items;newsAnalysis=Array.isArray(news.analysis)?news.analysis:[];combineNews();lastNewsStamp=news.updated_at;if(!root.querySelector('details[open]')||force)render();stamp()}
}
let lastNewsStamp=null;
function runLink(j){return j.run?editionRepo+'/actions/runs/'+j.run:editionRepo+'/actions/workflows/pulse-news.yml'}
function queueCheck(delay){clearTimeout(monitorTimer);if(ongoing)monitorTimer=setTimeout(checkJob,delay)}
function finish(kind,title,message,links){ongoing=null;saveJob();clearTimeout(monitorTimer);note(kind,title,message,links)}
async function githubJSON(url){const r=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',signal:AbortSignal.timeout(15000)});return r.ok?r.json():null}
async function checkJob(){
 const j=ongoing;if(!j)return;
 if(monitorBusy){queueCheck(3500);return}monitorBusy=true;
 try{
   if(Date.now()-j.started>75*60000){
     finish('waiting','Проверка завершена','Не удалось подтвердить публикацию по этому запросу. Журнал покажет, был ли запущен поиск.',[['Журнал GitHub ↗',runLink(j)]]);return;
   }
   const data=await publicData();if(j!==ongoing)return;applyPublic(data);
   const docs=data.docs.docs.filter(d=>j.topic===editionTopics[0]||canonicalTopic(d.title)===j.topic);
   const matched=docs.filter(d=>d.messages.some(m=>m.web_request===j.id));
   if(matched.length){
      const turn=matched.flatMap(d=>d.messages).find(m=>m.web_request===j.id);
      if(!j.run&&/^\d+$/.test(String(turn.github_run_id)))j.run=String(turn.github_run_id);
      if(matched.length>=(j.topic===editionTopics[0]?8:1)){
        const prior=new Set(j.before||[]);const articles=data.news.items.filter(n=>(j.topic===editionTopics[0]||canonicalTopic(n.topic)===j.topic)&&!prior.has(n.url)).length;
        applyPublic(data,true);finish('success','Обновление опубликовано','Агент ответил по '+(matched.length===1?'теме «'+j.topic+'»':matched.length+' темам')+'. '+(articles?'С начала проверки в ленте добавилось статей: '+articles+'.':'Новых статей с подтверждёнными источниками не добавилось.'),[]);const result=document.querySelector('#edition-result');
        for(const d of matched){const m=d.messages.find(x=>x.web_request===j.id);const entry=document.createElement('details'),label=document.createElement('summary'),article=document.createElement('div');
          label.textContent='Ответ агента · '+timeLabel(m.date*1000)+' · '+canonicalTopic(d.title);article.className='prose';article.innerHTML=renderArticle(m.text);entry.open=matched.length===1;entry.append(label,article);result.append(entry)}
        return;
      }
   }
   if(Date.now()-(j.lastGithub||0)>65000&&(j.phase!=='auth'||j.viaGithub||Date.now()-j.started>45000)){
     j.lastGithub=Date.now();
     if(!j.run){const runs=await githubJSON(editionAPI+'/workflows/pulse-news.yml/runs?event=workflow_dispatch&per_page=25');const r=runs?.workflow_runs?.find(r=>r.display_title==='Пульс ИИ · запрос '+j.id);if(r){j.run=String(r.id);j.phase='running'}}
     else{const r=await githubJSON(editionAPI+'/runs/'+j.run);
       if(r?.status==='completed'&&r.conclusion!=='success'){finish('error','Поиск не завершён','Проверьте журнал запуска. Уже опубликованные материалы остаются в ленте.',[['Журнал запуска ↗',runLink(j)]]);return}
       if(r?.status==='completed')j.phase='publishing';
     }
   }
   if(j===ongoing){saveJob();if(j.phase!=='auth')jobStatus(j)}
 }catch{if(j===ongoing&&j.phase!=='auth')note('waiting','Связь с лентой прервалась','Сайт попробует снова. Закрывать поиск или запускать его повторно не нужно.',j.run?[['Журнал запуска ↗',runLink(j)]]:[])}
 finally{monitorBusy=false;queueCheck(j.phase==='auth'?40000:17000)}
}
function jobStatus(j){
 const text=j.phase==='submitting'?'Передаём тему агенту':j.phase==='publishing'?'Ответ готовится к публикации':j.run?'Агент ищет новости':'Запрос принят';
 note('working',text,'Тема: '+j.topic+'. Когда появится ответ, он будет показан здесь.');
}
function setupNotice(message){
 note('waiting','Подключение браузера',message||'Для первого входа откройте личный ярлык «Пульс ИИ — подключить браузер». Дальше достаточно нажать «Обновить».');
 const form=document.querySelector('#edition-setup');form.hidden=false;
}
async function submitEdition(j){
 if(j.sending)return;j.sending=true;jobStatus(j);
 try{
  const job=await ReaderDevice.start(j);if(ongoing!==j)return;
  if(!requestPattern.test(job.id)||!editionTopics.includes(job.topic))throw Error('Не удалось подтвердить запуск.');
  if(job.topic!==j.topic&&job.topic!==editionTopics[0]){finish('waiting','Уже идёт другой поиск','Агент сейчас проверяет «'+job.topic+'». Повторите запрос после завершения.',[]);return}
  if(job.state==='failed'){finish('error','Запрос не выполнен','Облачный агент не завершил поиск. Попробуйте ещё раз.',[]);return}
  j.id=job.id;j.topic=job.topic;j.run=/^\d+$/.test(String(job.run_id))?String(job.run_id):null;j.phase=j.run?'running':'queued';saveJob();jobStatus(j);queueCheck(100);
 }catch(e){if(j!==ongoing)return;
   if(e.setup){ongoing=null;saveJob();setupNotice();return}
   if([400,403,409,429].includes(e.status)){finish('error','Запуск не принят',e.message,[]);return}
   j.phase='retry';saveJob();note('waiting','Не получено подтверждение','Нажмите «Обновить», чтобы повторить этот же запрос. Второго выпуска не будет.');
 }finally{j.sending=false}
}
function runRefresh(){
 if(!archive){note('waiting','Лента загружается','Подождите несколько секунд и нажмите снова.');return}
 if(ongoing){if(ongoing.phase==='retry'||ongoing.phase==='submitting'){submitEdition(ongoing)}else{jobStatus(ongoing);queueCheck(50)}return}
 const topic=selection();const j={id:crypto.randomUUID(),topic:editionTopics.includes(topic)?topic:editionTopics[0],started:Date.now(),before:sharedNews.map(n=>n.url),phase:'submitting'};ongoing=j;saveJob();submitEdition(j)
}
async function connectReader(d){try{await ReaderDevice.pair(d);note('success','Браузер подключён','Выберите тему и нажмите «Обновить». Дополнительных подтверждений не потребуется.')}catch(e){setupNotice(e.status||e.message?.includes('файл')?e.message:'Не удалось подключить браузер. Повторите подключение из личного ярлыка.')}}
document.querySelector('#edition-file').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.size>1300)throw Error();await connectReader(JSON.parse(await f.text()))}catch{setupNotice('Нужен личный файл подключения Пульса ИИ.')}});
if(location.hash.startsWith('#device=')){
 const endpoint=decodeURIComponent(location.hash.slice(8));history.replaceState(null,'',location.pathname+location.search+'#/topic/5');
 ReaderDevice.publicCode(endpoint).then(pub=>{note('waiting','Привязка этого браузера','Открытый идентификатор для администратора:');const code=document.createElement('code');code.id='device-public-id';code.style.overflowWrap='anywhere';code.textContent=pub;document.querySelector('#edition-result').append(code)}).catch(()=>setupNotice('Не удалось подготовить профиль устройства.'));
}
if(location.hash.startsWith('#connect=')){
 const arg=location.hash.slice(9);history.replaceState(null,'',location.pathname+location.search+'#/updates');
 try{const d=JSON.parse(atob(arg.replace(/-/g,'+').replace(/_/g,'/')));connectReader(d)}catch{setupNotice('Недействительный ярлык подключения.')}
}
startButton.addEventListener('click',runRefresh);
document.querySelector('#dismiss-edition').addEventListener('click',()=>{editionPanel.hidden=true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ongoing)queueCheck(200)});
try{const saved=JSON.parse(sessionStorage.getItem('pulse-direct-job-v1'));if(saved&&requestPattern.test(saved.id)&&editionTopics.includes(saved.topic)&&Array.isArray(saved.before)&&Date.now()-saved.started<75*60000){ongoing=saved;delete saved.sending;if(['retry','submitting'].includes(saved.phase)){saved.phase='retry';note('waiting','Можно продолжить поиск','Нажмите «Обновить», чтобы проверить этот же запрос.')}else{jobStatus(saved);queueCheck(1000)}}}catch{}
