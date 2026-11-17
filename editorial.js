/* Manual editions: Pages reads public files; only the cloud desk or a GitHub editor can start the agent. */
'use strict';
const deskOrigin='https://puls-ii-novosti.dnpnik.chatgpt.site';
const editionRepo='https://github.com/DPProekt/Nov_II';
const editionAPI='https://api.github.com/repos/DPProekt/Nov_II/actions';
const editionTopics=['Все темы','Подробные новости ИИ','Прогноз экономики при быстром развитии ИИ','Развитие мышления ИИ образами','Пересборка прогноза 2026–2050','Новости GPT','Гипербола технологий Капицы с ИИ','Прогноз беспилотных авто','Пять технологических прорывов'];
const requestPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const editionPanel=document.querySelector('#edition-notice'),startButton=document.querySelector('#refresh');
let ongoing=null,deskWindow=null,monitorTimer=0,monitorBusy=false;
const timeLabel=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
function selection(){
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
function saveJob(){try{if(ongoing)sessionStorage.setItem('pulse-cloud-job-v1',JSON.stringify(ongoing));else sessionStorage.removeItem('pulse-cloud-job-v1')}catch{}}
function note(kind,title,body,actions=[]){
 editionPanel.hidden=false;editionPanel.dataset.kind=kind;
 editionPanel.querySelector('h2').textContent=title;editionPanel.querySelector('p').textContent=body;
 const links=editionPanel.querySelector('.edition-actions');links.replaceChildren();
 for(const [caption,url,fn] of actions){const a=document.createElement('a');a.textContent=caption;a.href=url;if(url.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer'}if(fn)a.addEventListener('click',fn);links.append(a)}
 startButton.setAttribute('aria-busy',String(!!ongoing));
 startButton.querySelector('span').textContent=ongoing&&['queued','running','publishing'].includes(ongoing.phase)?'Ход поиска':'Обновить';
}
function deskLink(j){return deskOrigin+'/edition?'+new URLSearchParams({t:String(editionTopics.indexOf(j.topic)),id:j.id})}
function githubLink(j){return editionRepo+'/issues/new?'+new URLSearchParams({title:'Пульс ИИ · обновить '+j.id,body:'Тема: '+j.topic+'\n\nЗапустить поиск новых публикаций и обновить аналитику на сайте «Пульс ИИ».'})}
function rememberTransport(value){try{localStorage.setItem('pulse-edition-transport',value)}catch{}}
function preferredTransport(){try{return localStorage.getItem('pulse-edition-transport')}catch{return null}}
function confirmGitHub(j){
 j.viaGithub=true;rememberTransport('github');saveJob();note('waiting','Подтвердите запуск в GitHub','Тема уже выбрана: «'+j.topic+'». Нажмите Create, затем вернитесь сюда. Результат появится автоматически.',[['Открыть запрос в GitHub ↗',githubLink(j)],['Вернуться к выбору','#',e=>{e.preventDefault();waiting(j)}]]);
}
function runLink(j){return j.run?editionRepo+'/actions/runs/'+j.run:editionRepo+'/actions/workflows/pulse-news.yml'}
function accessOptions(j){
 return [['Открыть панель владельца',deskLink(j),e=>{e.preventDefault();rememberTransport('desk');deskWindow=window.open(deskLink(j),'pulseEditionDesk','popup,width=540,height=500');if(!deskWindow)location.assign(deskLink(j))}],
 ['Подтвердить через GitHub ↗',githubLink(j),()=>confirmGitHub(j)],['Снять ожидание','#',e=>{e.preventDefault();finish('waiting','Ожидание снято','Можно выбрать другую тему. Уже отправленная команда продолжит выполняться в облаке.',[])}]];
}
function waiting(j){note('waiting','Обновление: '+j.topic,'Опубликованные материалы доступны сразу. Для нового поиска откроется панель владельца. Если она недоступна, подтвердите запуск через GitHub.',accessOptions(j))}
function jobStatus(j){
 if(j.phase==='auth'){waiting(j);return}
 const publishing=j.phase==='publishing';
 note('working',publishing?'Ответ готовится к публикации':(j.run?'Агент ищет новости':'Запрос принят'),'Тема: '+j.topic+'. '+(publishing?'Проверяем, что ответ уже доступен читателям.':'Ленту можно читать, пока идёт поиск.'),j.run?[['Ход запуска ↗',runLink(j)]]:[]);
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
 if(changed||force){archive=docs;sharedNews=news.items;newsAnalysis=Array.isArray(news.analysis)?news.analysis:[];combineNews();lastNewsStamp=news.updated_at;if(!root.querySelector('.update-entry[open]')||force)render();stamp()}
}
let lastNewsStamp=null;
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
        applyPublic(data,true);finish('success','Обновление опубликовано','Агент ответил по '+(matched.length===1?'теме «'+j.topic+'»':matched.length+' темам')+'. '+(articles?'С начала проверки в ленте добавилось статей: '+articles+'.':'Новых статей с подтверждёнными источниками не добавилось.'),[['Последние обновления →','#/updates'],...(j.run?[['Журнал запуска ↗',runLink(j)]]:[])]);return;
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
function runRefresh(){
 if(!archive){note('waiting','Загружаем ленту','Сначала загрузятся опубликованные материалы. После этого можно начать поиск.');return}
 if(ongoing){jobStatus(ongoing);queueCheck(20);editionPanel.scrollIntoView({block:'nearest'});return}
 const topic=selection();const id=crypto.randomUUID();const j={id,topic:editionTopics.includes(topic)?topic:editionTopics[0],started:Date.now(),before:sharedNews.map(n=>n.url),phase:'auth'};ongoing=j;saveJob();
 if(preferredTransport()==='github'){window.open(githubLink(j),'_blank','noopener');confirmGitHub(j)}else{deskWindow=window.open(deskLink(j),'pulseEditionDesk','popup,width=540,height=500');waiting(j)}queueCheck(0);
}
window.addEventListener('message',e=>{
 const j=ongoing;if(!j||e.origin!==deskOrigin||e.source!==deskWindow||e.data?.type!=='pulse-edition'||e.data.id!==(j.gateId||j.id))return;
 if(e.data.stage==='ready'){deskWindow.postMessage({type:'pulse-start',id:j.gateId||j.id},deskOrigin);return}
 if(e.data.stage==='error'){waiting(j);return}
 const job=e.data.job;if(e.data.stage!=='job'||!job||!requestPattern.test(job.id)||!editionTopics.includes(job.topic))return;
 if(job.id!==j.id&&job.topic!==j.topic&&job.topic!==editionTopics[0]){
   finish('waiting','Агент уже выполняет другой запрос','Сейчас обновляется «'+job.topic+'». Повторите обновление выбранной темы после завершения.',job.run_id&&/^\d+$/.test(job.run_id)?[['Журнал запуска ↗',editionRepo+'/actions/runs/'+job.run_id]]:[]);return;
 }
 if(job.state==='failed'){finish('error','Запрос не выполнен','Облачный агент сообщил об ошибке. Можно повторить поиск.',[]);return}
 j.gateId=j.gateId||j.id;j.id=job.id;j.topic=job.topic;j.run=/^\d+$/.test(String(job.run_id))?String(job.run_id):null;j.phase=j.run?'running':'queued';saveJob();jobStatus(j);queueCheck(4500)
});
startButton.addEventListener('click',runRefresh);
document.querySelector('#dismiss-edition').addEventListener('click',()=>{editionPanel.hidden=true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ongoing)queueCheck(200)});
try{const saved=JSON.parse(sessionStorage.getItem('pulse-cloud-job-v1'));if(saved&&requestPattern.test(saved.id)&&editionTopics.includes(saved.topic)&&Array.isArray(saved.before)&&Date.now()-saved.started<75*60000){ongoing=saved;jobStatus(saved);queueCheck(1000)}}catch{}
