'use strict';
const root=document.querySelector('#app');let archive=null;let query='';let fresh=[];let sharedNews=[];let newsAnalysis=[];let localNews=[];let newsView='latest';let newsPage=0;let newsAnchor=Date.now();let popup=null;let selectedTopic='Новости ИИ';const backendOrigin='https://puls-ii-novosti.dnpnik.chatgpt.site';try{fresh=JSON.parse(localStorage.getItem('pulse-ii-news')||'[]');if(!Array.isArray(fresh))fresh=[];localNews=fresh.slice()}catch{fresh=[]}
const labels=['Новости','Новости','Экономика','Исследование','Прогноз','Новости','Аналитика','Прогноз','Прогноз'];
const descriptions=['Подробный обзор событий и исследований в области искусственного интеллекта.','Новости и обсуждение последних событий в мире ИИ.','Возможное влияние искусственного интеллекта на экономику.','Как ИИ работает с изображениями, пространством и визуальными представлениями.','Сценарии развития искусственного интеллекта и экономики до 2050 года.','Новости моделей GPT и технологий OpenAI.','Модель технологического развития и её связь с искусственным интеллектом.','Сценарии развития и распространения беспилотного транспорта.','Пять возможных направлений технологических изменений и сценарные сроки.'];
function validNews(n){try{return n&&typeof n.title==='string'&&typeof n.summary==='string'&&typeof n.source==='string'&&typeof n.topic==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n.date)&&new URL(n.url).protocol==='https:'}catch{return false}}
function combineNews(){const seen=new Set();fresh=[...sharedNews,...localNews].filter(n=>validNews(n)&&!seen.has(n.url)&&seen.add(n.url)).sort((a,b)=>b.date.localeCompare(a.date));}
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){let x=escapeHtml(s).replace(/url([^]+)(https?:\/\/[^\s]+)/g,'[$1]($2)').replace(/cite[^]*/g,'').replace(/:chatgpt-content-reference\{[^}]*\}/g,'');x=x.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,t,u)=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`);return x.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\\([.!:])/g,'$1')}
function markdown(text){let lines=text.split('\n'),out=[],list=false;const endList=()=>{if(list){out.push('</ul>');list=false}};for(let i=0;i<lines.length;i++){let line=lines[i].trim();if(!line){endList();continue}if(/^\|/.test(line)&&i+1<lines.length&&/^\|?\s*:?-{3,}/.test(lines[i+1].trim())){endList();let rows=[line];i+=2;while(i<lines.length&&/^\s*\|/.test(lines[i]))rows.push(lines[i++].trim());i--;let cells=row=>row.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());out.push('<div class="table-wrap"><table><thead><tr>'+cells(rows[0]).map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+cells(r).map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue}let h=line.match(/^(#{1,4})\s+(.+)/);if(h){endList();let n=Math.min(h[1].length+1,4);out.push(`<h${n}>${inline(h[2])}</h${n}>`);continue}let l=line.match(/^[-*]\s+(.+)/);if(l){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(l[1])+'</li>');continue}endList();if(/^---+$/.test(line))out.push('<hr>');else out.push('<p>'+inline(line)+'</p>')}endList();return out.join('')}
function date(ts){return ts?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(ts*1000)):'дата не указана'}
function graph(){return `<div class="chart" id="chart"><h3>Когда возможны первые результаты</h3><p>Сценарные оценки из чата «Пять технологических прорывов», сентябрь 2026 года. Показаны начальные годы диапазонов, а не гарантированные сроки.</p>${[['ИИ в исследованиях',2027],['Термоядерная энергетика',2033],['Восстановление тканей',2028],['Роботизированное производство',2030]].map(([n,y])=>`<div class="bar-row"><span>${n}</span><div class="track"><div class="bar" style="width:${(y-2025)/10*100}%"></div></div><strong>${y}</strong></div>`).join('')}<p>По сверхпроводнику срок в исходном прогнозе не определён. <a class="read-link" href="#/topic/8">Открыть исходный материал →</a></p></div>`}
function side(){return `<aside class="side"><h2>Темы</h2><a class="selected" href="#/topics">Все материалы</a>${topicEntries().map(({d,i})=>`<a href="#/topic/${i}">${escapeHtml(d.title)}</a>`).join('')}<div class="notice"><strong>Личный архив</strong>Материалы сохранены из выбранных чатов. Даты относятся к ответам, а прогнозы не являются установленными фактами.</div></aside>`}
function rows(items){return items.map(({d,i})=>`<article class="feed-row"><div class="meta"><span class="tag">${labels[i]}</span>${date(d.updatedAt)}</div><div><h3><a class="article-link" href="#/topic/${i}">${escapeHtml(d.title)}</a></h3><p>${descriptions[i]}</p></div></article>`).join('')}
function feedCards(items){return items.map(n=>`<article class="feed-row"><div class="meta"><span class="tag">${n.importance==='high'?'Главное':'Новое'}</span>${escapeHtml(n.date)}</div><div><h3><a class="article-link" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.title)} ↗</a></h3><p>${escapeHtml(n.summary)}</p>${typeof n.analysis==='string'&&n.analysis.trim()?`<p><strong>Вывод</strong> ${escapeHtml(n.analysis)}</p>`:''}<p><a class="read-link" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">Источник: ${escapeHtml(n.source)} ↗</a></p></div></article>`).join('')}
function itemTime(n){if(typeof n.published_at==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(n.published_at)){let t=Date.parse(n.published_at);if(Number.isFinite(t))return t}return null}

const topicAliases = new Map([
  ['Новости ИИ подробно', 'Подробные новости ИИ'],
  ['Новости ИИ', 'Подробные новости ИИ'],
  ['Прогноз экономики ИИ', 'Прогноз экономики при быстром развитии ИИ']
]);
function canonicalTopic(name) { return topicAliases.get(name) ?? name; }
function topicIndex(index) { return index === 1 ? 0 : index; }
function topicDocument(index) {
  const doc = archive.docs[topicIndex(index)];
  if (!doc) return undefined;
  if (topicIndex(index) !== 0) return {...doc, title: canonicalTopic(doc.title)};
  const duplicate = archive.docs[1];
  const messages = [...doc.messages, ...(duplicate?.messages ?? [])];
  const seen = new Set();
  return {...doc, updatedAt: Math.max(doc.updatedAt, duplicate?.updatedAt ?? 0),
    messages: messages.filter(message => !seen.has(message.text) && seen.add(message.text))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))};
}
function topicEntries() {
  return archive.docs.flatMap((_, i) => i === topicIndex(i) ? [{i, d: topicDocument(i)}] : []);
}
function analysisFor(title) {
  return newsAnalysis.find(entry => entry && canonicalTopic(entry.topic) === title
    && typeof entry.changes === 'string' && typeof entry.conclusion === 'string'
    && Number.isFinite(Date.parse(entry.updated_at)));
}
function renderAnalysisDetail(entry) {
  const dateFormat = new Intl.DateTimeFormat('ru-RU', {dateStyle:'long', timeZone:'Asia/Omsk'});
  const sections = Array.isArray(entry.details) ? entry.details.filter(section =>
    section && typeof section.heading === 'string' && typeof section.text === 'string') : [];
  const newsByUrl = new Map(sharedNews.filter(validNews).map(item => [item.url, item]));
  const links = (Array.isArray(entry.sources) ? entry.sources : []).flatMap(url => {
    if (typeof url !== 'string') return [];
    let parsed;
    try { parsed = new URL(url); } catch { return []; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return [];
    const name = entry.source_titles?.[url] || newsByUrl.get(url)?.title || parsed.hostname;
    return [`<li><a class="read-link" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} ↗</a></li>`];
  }).join('');
  return `<article class="prose"><p class="meta">Обновлено ${dateFormat.format(new Date(entry.updated_at))}</p>
    <h3>Что изменилось</h3><p>${escapeHtml(entry.changes)}</p>
    <h3>Вывод</h3><p>${escapeHtml(entry.conclusion)}</p>
    ${sections.map(section => `<h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.text)}</p>`).join('')}
    ${links ? `<h3>Источники</h3><ul>${links}</ul>` : ''}</article>`;
}
function showAnalysis(index) {
  const topics = topicEntries();
  const selected = topics.find(({i}) => i === topicIndex(index)) ?? topics[0];
  if (!selected) return;
  const current = analysisFor(selected.d.title);
  const selector = topics.map(({i,d}) => `<option value="${i}" ${i===selected.i?'selected':''}>${escapeHtml(d.title)}</option>`).join('');
  root.innerHTML = `<section class="article-top"><a class="back" href="#/">← Новости</a>
    <h1>Аналитика</h1><label for="analysis-topic">Тема</label> <select id="analysis-topic" style="max-width:100%">${selector}</select>
    </section><div class="article-body"><h2>${escapeHtml(selected.d.title)}</h2>
    <p><a class="read-link" href="#/topic/${selected.i}">Новости и архив темы →</a></p>
    ${current ? renderAnalysisDetail(current) : '<p class="empty">Обзор по этой теме готовится.</p>'}</div>`;
  document.querySelector('#analysis-topic').addEventListener('change', ({target}) => {
    location.hash = '#/analysis/' + target.value;
  });
}
function renderAnalysisPreview(topicName) {
  if (!topicName) return '<p><a class="read-link" href="#/analysis">Открыть подробную аналитику по темам →</a></p>';
  const topic = topicEntries().find(({d}) => d.title === topicName);
  if (!topic) return '';
  const entry = analysisFor(topicName);
  return `<aside class="notice">${entry ? `<p>${escapeHtml(entry.conclusion)}</p>` : ''}
    <a class="read-link" href="#/analysis/${topic.i}">Подробная аналитика темы →</a>
  </aside>`;
}
function renderNews(topicName){
  const available = fresh.filter(n => !topicName || canonicalTopic(n.topic) === topicName);
  const buttons = [
    ['latest', 'Последние'], ['six', '6 часов'], ['week', 'Главное за неделю'],
    ['month', 'Главное за месяц'], ['year', 'Главное за год']
  ].map(([value, label]) => `<button type="button" data-news-view="${value}" aria-pressed="${newsView===value}">${label}</button>`).join('');
  if (newsView === 'latest') {
    const anchorDate = omskDate(newsAnchor);
    const candidates = available.filter(n => {
      const time = itemTime(n);
      return time === null ? n.date <= anchorDate : time <= newsAnchor;
    }).slice(0, 12);
    return `<section class="news-period" aria-label="Лента по времени">
      <h2 class="section-title">${topicName ? 'Новые материалы по теме' : 'Лента новостей'}</h2>
      <div class="period-controls" role="group" aria-label="Период новостей">${buttons}</div>
      ${renderAnalysisPreview(topicName)}
      <div aria-live="polite">${candidates.length ? feedCards(candidates) : '<p class="empty">Новых публикаций пока нет.</p>'}</div>
    </section>`;
  }
  const {start,end}=newsPeriod(newsView,newsPage,newsAnchor);
  const visibleEnd=Math.min(end,newsAnchor+1);
  let candidates=available.filter(n=>{
    const time=itemTime(n);
    if(time!==null)return time>=start&&time<visibleEnd;
    if(newsView==='six')return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(n.date)&&n.date>=omskDate(start)&&n.date<omskDate(end)&&n.date<=omskDate(newsAnchor);
  });
  const ranked=candidates.filter(n=>n.importance==='high');
  const fallback=newsView!=='six'&&!ranked.length&&candidates.length>0;
  if(newsView!=='six'&&ranked.length)candidates=ranked;
  const shortDate=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'numeric',month:'short',year:'numeric'});
  const timeDate=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  let periodLabel;
  if(newsView==='six')periodLabel=`${timeDate.format(new Date(start))} — ${timeDate.format(new Date(end))}`;
  else if(newsView==='month')periodLabel=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',month:'long',year:'numeric'}).format(new Date(start));
  else if(newsView==='year')periodLabel=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',year:'numeric'}).format(new Date(start));
  else periodLabel=`${shortDate.format(new Date(start))} — ${shortDate.format(new Date(end-1))}`;
  const navLabels={six:['Предыдущие 6 часов','Следующие 6 часов'],week:['Предыдущая неделя','Следующая неделя'],month:['Предыдущий месяц','Следующий месяц'],year:['Предыдущий год','Следующий год']};
  const [older,newer]=navLabels[newsView];
  const note=newsView==='six'?'Здесь показаны публикации с подтверждённым временем. Публикации с одной только датой доступны во вкладке «Последние» и в календарных обзорах.':'Календарный период по времени Омска.'+(fallback?' Важность ещё не размечена — показаны все материалы.':'');
  return `<section class="news-period" aria-label="Лента по времени"><h2 class="section-title">${topicName?'Новые материалы по теме':'Лента новостей'}</h2><div class="period-controls" role="group" aria-label="Период новостей">${buttons}</div><div class="period-nav"><button type="button" data-news-page="older">← ${older}</button><span>${escapeHtml(periodLabel)} · Омск</span><button type="button" data-news-page="newer" ${newsPage===0?'disabled':''}>${newer} →</button></div><p class="period-note">${note}</p><div aria-live="polite">${candidates.length?feedCards(candidates):'<p class="empty">За выбранный период материалов пока нет.</p>'}</div></section>`
}
function wireNews(){root.querySelectorAll('[data-news-view]').forEach(b=>b.addEventListener('click',()=>{newsView=b.dataset.newsView;newsPage=0;newsAnchor=Date.now();render()}));root.querySelectorAll('[data-news-page]').forEach(b=>b.addEventListener('click',()=>{newsPage=Math.max(0,newsPage+(b.dataset.newsPage==='older'?1:-1));render()}))}
function home(){let items=topicEntries().filter(({d,i})=>(d.title+' '+descriptions[i]+' '+d.messages.map(m=>m.text).join(' ')).toLowerCase().includes(query.toLowerCase()));root.innerHTML=`<div class="layout"><section><div class="hero"><h1>Новости искусственного интеллекта</h1><p>Исследования, открытия и прогнозы — важные события развития ИИ и их влияние на будущее.</p></div><form class="search" role="search"><input id="search" type="search" aria-label="Поиск по архиву" placeholder="Поиск по архиву: новости, модели, прогнозы..." value="${escapeHtml(query)}"></form>${renderNews()}<h2 class="section-title">Архив подборок из чатов</h2><div id="results">${items.length?rows(items):'<p class="empty">Ничего не найдено. Попробуйте другой запрос.</p>'}</div>${graph()}</section>${side()}</div>`;wireNews();document.querySelector('.search').addEventListener('submit',e=>e.preventDefault());document.querySelector('#search').addEventListener('input',e=>{query=e.target.value;let matches=topicEntries().filter(({d,i})=>(d.title+' '+descriptions[i]+' '+d.messages.map(m=>m.text).join(' ')).toLowerCase().includes(query.toLowerCase()));document.querySelector('#results').innerHTML=matches.length?rows(matches):'<p class="empty">Ничего не найдено. Попробуйте другой запрос.</p>'})}
function topic(i){i=topicIndex(i);let d=topicDocument(i);if(!d){home();return}root.innerHTML=`<section class="article-top"><a class="back" href="#/">← Все материалы</a><h1>${escapeHtml(d.title)}</h1><p><a class="read-link" href="#/analysis/${i}">Аналитика темы →</a></p><div class="meta">${labels[i]} · последнее изменение чата ${date(d.updatedAt)}</div><div class="status">Это сохранённые ответы из чата GPT. Сообщения и прогнозы не проверены повторно и могут устареть. Встроенные ссылки на конкретные источники сохранены, где они доступны.</div></section><div class="article-body">${renderNews(d.title)}${i===8?graph():''}${d.note?`<div class="status">${escapeHtml(d.note)}</div>`:""}${d.messages.map((m,n)=>`<section class="message"><div class="message-date">Ответ ${n+1} · ${date(m.date)}</div>${m.truncated?'<div class="status">Ответ получен не полностью: показаны первые 20 000 символов.</div>':''}<div class="prose">${renderArticle(m.text)}</div></section>`).join('')}</div>`;wireNews()}
function render(){if(!archive)return;const analysisRoute=location.hash.match(/^#\/analysis(?:\/(\d+))?$/);if(analysisRoute){showAnalysis(Number(analysisRoute[1]??0));return;}if(location.hash==='#/forecast'){showForecast();return}let match=location.hash.match(/^#\/topic\/(\d+)$/);if(match)topic(Number(match[1]));else{home();if(location.hash==='#/chart')document.querySelector('#chart')?.scrollIntoView();if(location.hash==='#/topics')document.querySelector('#results')?.scrollIntoView()}}
async function loadArchive(manual=false){try{let r=await fetch('archive.json?'+(manual?Date.now():'v1'),{cache:'no-store'});if(!r.ok)throw Error();archive=await r.json();render();if(manual){let msg=document.createElement('div');msg.className='status';msg.setAttribute('role','status');msg.textContent='Данные сайта перечитаны. Автоматическое получение новых ответов из закрытых чатов GPT пока не подключено.';root.prepend(msg)}}catch{if(manual&&archive){let msg=document.createElement('div');msg.className='status';msg.textContent='Не удалось перечитать архив. Показаны ранее загруженные материалы.';root.prepend(msg)}else root.innerHTML='<p class="empty">Не удалось загрузить архив. Проверьте подключение и попробуйте снова.</p>'}}
function updateStatus(text){document.querySelector('#refresh-status')?.remove();let m=document.createElement('div');m.className='status';m.id='refresh-status';m.setAttribute('role','status');m.textContent=text;root.prepend(m)}
async function refreshNews(){const match=location.hash.match(/^#\/(?:topic|analysis)\/(\d+)$/);const d=match&&archive&&topicDocument(Number(match[1]));selectedTopic=d?.title||'Новости ИИ';let cutoff=d?new Date(d.updatedAt*1000).toISOString().slice(0,10):'2026-11-14';for(const n of fresh)if(n.topic===selectedTopic&&n.date>cutoff)cutoff=n.date;const button=document.querySelector('#refresh');button.disabled=true;button.textContent='Ищем новости…';updateStatus('Ищем новые публикации по теме «'+selectedTopic+'»…');try{const r=await fetch('http://127.0.0.1:8766/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:selectedTopic,cutoff})});const body=await r.json();if(!r.ok)throw Error(body.error||'Поиск недоступен');localNews=Array.isArray(body.items)?body.items:[];combineNews();try{localStorage.setItem('pulse-ii-news',JSON.stringify(fresh))}catch{}render();updateStatus(body.added?'Добавлено новостей: '+body.added+'. Даты и ссылки следует проверить.':'Новых публикаций по этой теме после '+body.cutoff+' не найдено.')}catch(e){updateStatus('Поиск не завершён: '+(e.message||'локальный сервер недоступен')+'. Сохранённые материалы не изменены.')}finally{button.disabled=false;button.textContent='↻ Обновить'}}
window.addEventListener('message',event=>{if(event.origin!==backendOrigin||event.source!==popup)return;if(event.data?.type==='pulse-ready'){const match=location.hash.match(/^#\/(?:topic|analysis)\/(\d+)$/);const d=match&&archive&&topicDocument(Number(match[1]));let cutoff=d?new Date(d.updatedAt*1000).toISOString().slice(0,10):'2026-11-14';for(const n of fresh)if(n.topic===selectedTopic&&n.date>cutoff)cutoff=n.date;popup.postMessage({type:'pulse-context',topic:selectedTopic,cutoff},backendOrigin)}else if(event.data?.type==='pulse-news'&&Array.isArray(event.data.items)){const seen=new Set(fresh.map(x=>x.url));let items=event.data.items.filter(x=>{try{return typeof x.title==='string'&&typeof x.summary==='string'&&typeof x.source==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&new URL(x.url).protocol==='https:'&&!seen.has(x.url)}catch{return false}}).map(x=>({...x,topic:selectedTopic}));fresh=[...items,...fresh];try{localStorage.setItem('pulse-ii-news',JSON.stringify(fresh))}catch{updateStatus('Не удалось сохранить новости в браузере.');return}render();updateStatus(items.length?'Добавлено новостей: '+items.length+'. Даты и ссылки следует проверить.':'Новых публикаций по этой теме не найдено.');}});
document.querySelector('#refresh').addEventListener('click',refreshNews);window.addEventListener('hashchange',()=>{render();if(!['#/chart','#/topics'].includes(location.hash))window.scrollTo(0,0)});fetch('news.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&Array.isArray(d.items)){sharedNews=d.items;newsAnalysis=Array.isArray(d.analysis)?d.analysis:[];combineNews();render()}}).catch(()=>{});fetch('http://127.0.0.1:8766/api/news').then(r=>r.ok?r.json():null).then(d=>{if(d&&Array.isArray(d.items)){localNews=d.items;combineNews();render()}}).catch(()=>{});loadArchive();



