'use strict';
const root=document.querySelector('#app');let archive=null;let query='';let fresh=[];let sharedNews=[];let newsAnalysis=[];let localNews=[];let newsView='latest';let newsPage=0;let newsAnchor=Date.now();try{fresh=JSON.parse(localStorage.getItem('pulse-ii-news')||'[]');if(!Array.isArray(fresh))fresh=[];localNews=fresh.slice()}catch{fresh=[]}
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
function newsSources(item) {
  const found = new Set();
  const extra = Array.isArray(item.references) ? item.references.slice(0, 5) : [];
  return [{title: item.source, url: item.url}, ...extra].flatMap(ref => {
    if (!ref || typeof ref.title !== 'string' || !ref.title.trim()) return [];
    try {
      const url = new URL(ref.url);
      if (url.protocol !== 'https:' || url.username || url.password || found.has(url.href)) return [];
      found.add(url.href);
      return [`<a class="read-link" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ref.title)} ↗</a>`];
    } catch { return []; }
  }).join(' · ');
}

function newsComparison(table) {
  const columns = table?.columns;
  const rows = table?.rows;
  const hasText = value => typeof value === 'string' && value.trim();
  if (!hasText(table?.caption) || !Array.isArray(columns) || columns.length < 2 ||
      columns.length > 5 || !columns.every(hasText) || !Array.isArray(rows) ||
      rows.length < 2 || rows.length > 8 || !rows.every(row =>
        Array.isArray(row) && row.length === columns.length && row.every(hasText))) return '';
  return `<div class="table-wrap news-comparison" tabindex="0" aria-label="Сравнение данных">
    <table><caption>${escapeHtml(table.caption)}</caption>
      <thead><tr>${columns.map(cell => `<th scope="col">${escapeHtml(cell)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, ...values]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function newsHighlights(items, periodLabel) {
  const marked = items.filter(item => item.importance === 'high');
  if (!marked.length && items.length < 2) return '';
  const stories = (marked.length ? marked : items).slice(0, 3);
  return `<aside class="news-highlights" aria-label="Главное за период">
    <h3>Главное за период</h3><p class="meta">${escapeHtml(periodLabel)} · Омск</p>
    <ul>${stories.map(item => `<li><strong>${escapeHtml(item.title)}</strong>${typeof item.brief === 'string' && item.brief.trim() ? `<span>${escapeHtml(item.brief)}</span>` : ''}</li>`).join('')}</ul></aside>`;
}

const newsDateFormat = new Intl.DateTimeFormat('ru-RU', {timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'});
const updateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Omsk', dateStyle: 'medium', timeStyle: 'short'
});
let updateLimit = 30;
let updatesReading = false;

function feedCards(items, showTopic = false) {
  return items.map(item => {
    const question = typeof item.question === 'string' && item.question.trim();
    const mark = item.importance === 'high' ? 'Главное' : 'Новое';
    const url = escapeHtml(item.url);
    const published = Date.parse(item.date);
    const shownDate = Number.isFinite(published) ? newsDateFormat.format(published) : item.date;
    return `<article class="feed-row news-card"><div class="meta"><span class="tag">${mark}</span>${showTopic ? `<span>${escapeHtml(canonicalTopic(item.topic))}</span>` : ''}${item.date_kind === 'chat_answer' ? '<span>Дата ответа GPT</span>' : ''}<time datetime="${escapeHtml(item.date)}">${escapeHtml(shownDate)}</time></div>
      <div><h3><a class="article-link" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)} ↗</a></h3>
      ${question ? `<p class="news-question"><strong>Вопрос к GPT</strong> ${escapeHtml(question)}</p>` : ''}
      <p class="news-answer"><strong>${question ? 'Ответ GPT' : 'Что произошло'}</strong> ${escapeHtml(item.summary)}</p>
      ${newsComparison(item.comparison)}
      ${typeof item.analysis === 'string' && item.analysis.trim() ? `<p class="news-inference"><strong>Что это меняет</strong> ${escapeHtml(item.analysis)}</p>` : ''}
      ${typeof item.watch === 'string' && item.watch.trim() ? `<p class="news-watch"><strong>Что отслеживать дальше</strong> ${escapeHtml(item.watch)}</p>` : ''}
      <p class="news-sources"><strong>Источники</strong> ${newsSources(item)}</p></div></article>`;
  }).join('');
}
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
  const sections = Array.isArray(entry.details) ? entry.details.filter(section =>
    section && typeof section.heading === 'string' && typeof section.text === 'string') : [];
  const newsByUrl = new Map(sharedNews.filter(validNews).map(item => [item.url, item]));
  const links = (Array.isArray(entry.sources) ? entry.sources : []).flatMap(url => {
    if (typeof url !== 'string') return [];
    let parsed;
    try { parsed = new URL(url); } catch { return []; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return [];
    const name = entry.source_titles?.[url] || newsByUrl.get(url)?.title || parsed.hostname;
    const published = sourceDateLabel(entry.source_dates?.[url]);
    return [`<li><a class="read-link" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} ↗</a>${published ? ` <small class="source-date">· ${escapeHtml(published)}</small>` : ''}</li>`];
  }).join('');
  return `<article class="prose review-reading"><h2>Подробный разбор</h2>
    <h3>Что изменилось</h3><p>${escapeHtml(entry.changes)}</p>
    ${sections.map(section => `<h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.text)}</p>`).join('')}
    ${links ? `<h3>Источники</h3><ul>${links}</ul>` : ''}</article>`;
}
function showAnalysis(index, cutoff) {
  const topics = topicEntries();
  const selected = topics.find(({i}) => i === topicIndex(index)) ?? topics[0];
  if (!selected) return;
  loadReviewArchive();
  const current = analysisFor(selected.d.title);
  const snapshot = historyForTopic(selected.d.title).find(review => review.as_of === cutoff);
  const entry = snapshot ?? current;
  const selector = topics.map(({i,d}) => `<option value="${i}" ${i===selected.i?'selected':''}>${escapeHtml(d.title)}</option>`).join('');
  root.innerHTML = `<div class="analysis-page">
    <section class="analysis-toolbar">
      <h1>Аналитика</h1>
      <label for="analysis-topic">Тема<select id="analysis-topic">${selector}</select></label>
    </section>
    <section class="analysis-intro">
      <h2>${escapeHtml(selected.d.title)}</h2>
      ${entry ? `<p class="meta">${snapshot ? 'Исторический срез · ' + escapeHtml(reviewLabel(snapshot).toLowerCase()) : 'Обновлено ' + escapeHtml(reviewLabel(current))}</p>
        <p class="analysis-conclusion"><strong>Вывод</strong> ${escapeHtml(entry.conclusion)}</p>` : ''}
      <a class="read-link" href="#/topic/${selected.i}">Новости и архив темы →</a>
    </section>
    ${renderHistoricalNavigation(selected.d.title, snapshot?.as_of)}
    ${cutoff && historicalReviews && !historicalUnavailable && !snapshot ? '<p class="review-hint">На выбранную дату среза нет. Открыт текущий обзор.</p>' : ''}
    ${entry ? renderAnalysisDetail(entry) : '<p class="empty">Обзор по этой теме готовится.</p>'}
    ${renderReviewDashboard(selected.d.title, current, snapshot)}
  </div>`;
  wireReviewDashboard(selected.d.title, selected.i, cutoff);
  document.querySelector('#analysis-topic').addEventListener('change', ({target}) => {
    location.hash = historyHref(target.value, snapshot?.as_of);
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
      ${newsHighlights(candidates, 'Последние публикации')}
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
  return `<section class="news-period" aria-label="Лента по времени"><h2 class="section-title">${topicName?'Новые материалы по теме':'Лента новостей'}</h2><div class="period-controls" role="group" aria-label="Период новостей">${buttons}</div><div class="period-nav"><button type="button" data-news-page="older">← ${older}</button><span>${escapeHtml(periodLabel)} · Омск</span><button type="button" data-news-page="newer" ${newsPage===0?'disabled':''}>${newer} →</button></div><p class="period-note">${note}</p>${newsHighlights(candidates, periodLabel)}<div aria-live="polite">${candidates.length?feedCards(candidates):'<p class="empty">За выбранный период материалов пока нет.</p>'}</div></section>`
}
function wireNews(){root.querySelectorAll('[data-news-view]').forEach(b=>b.addEventListener('click',()=>{newsView=b.dataset.newsView;newsPage=0;newsAnchor=Date.now();render()}));root.querySelectorAll('[data-news-page]').forEach(b=>b.addEventListener('click',()=>{newsPage=Math.max(0,newsPage+(b.dataset.newsPage==='older'?1:-1));render()}))}
const editionDay = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Asia/Omsk', day: 'numeric', month: 'long', year: 'numeric'});
const editionClock = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Asia/Omsk', hour: '2-digit', minute: '2-digit'});
let updateFilter = 'all';
function answerPreview(text) {
  const clean = text.replace(/url([^]+)[^]*/g, '$1').replace(/[^]*/g, '')
    .replace(/:chatgpt-content-reference\{[^}]*\}/g, '').replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '').replace(/^[\t ]*#{1,6}\s+/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length <= 170 ? clean : clean.slice(0, 170).replace(/\s+\S*$/, '').trimEnd() + '…';
}
function showAllUpdates() {
  const answers = topicEntries().flatMap(({d, i}) => d.messages.filter(m => typeof m.text === 'string' && Number.isFinite(Number(m.date)))
    .map(message => ({type: 'answer', time: Number(message.date) * 1000, title: d.title, index: i, message})));
  const articles = fresh.filter(validNews).map(item => ({type: 'news', time: itemTime(item) ?? Date.parse(item.date + 'T12:00:00+06:00'), item}));
  const all = [...answers, ...articles].filter(entry => Number.isFinite(entry.time)).sort((a, b) => b.time - a.time);
  const entries = all.filter(entry => updateFilter === 'all' || updateFilter === entry.type);
  const visible = entries.slice(0, updateLimit);
  let previousDay = '';
  const list = visible.map(entry => {
    const day = omskDate(entry.time);
    const heading = day === previousDay ? '' : `<h2 class="edition-day"><span>${escapeHtml(editionDay.format(entry.time))}</span></h2>`;
    previousDay = day;
    if (entry.type === 'news') return heading + feedCards([entry.item], true);
    return heading + `<details class="update-entry"><summary><span class="update-date"><span class="kind-label">Ответ GPT</span><time datetime="${new Date(entry.time).toISOString()}" aria-label="${escapeHtml(updateTimeFormat.format(entry.time))}">${escapeHtml(editionClock.format(entry.time))}</time></span>
      <span class="summary-copy"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(answerPreview(entry.message.text))}</small></span><span class="disclosure" aria-hidden="true"></span></summary>
      <div class="update-content prose"><p><a class="read-link" href="#/topic/${entry.index}">Все материалы по теме →</a></p>${renderArticle(entry.message.text)}</div></details>`;
  }).join('');
  root.innerHTML = `<section class="updates-page"><header class="edition-hero"><div class="edition-lead"><div class="overline">Хроника / Все темы</div><h1>Последние обновления</h1><p class="updates-intro">Исследования, релизы и прогнозы в порядке выхода. Откройте ответ агента целиком или перейдите к статье с источниками.</p></div><aside class="edition-facts" aria-label="Об архиве"><div><strong>${topicEntries().length}</strong><span>тем в обзоре</span></div><div><strong>${sharedNews.length}</strong><span>статей в архиве</span></div><p>Плановый выпуск · каждые 6 часов</p></aside></header>
    <div class="edition-controls" role="group" aria-label="Тип материала">${[['all','Все'],['answer','Ответы GPT'],['news','Статьи']].map(([id,label])=>`<button type="button" data-edition-filter="${id}" aria-pressed="${updateFilter === id}">${label}</button>`).join('')}</div>
    <div class="updates-list">${list || '<p class="empty">В этой ленте пока нет материалов.</p>'}</div>${entries.length > visible.length ? '<button type="button" class="updates-more">Показать ещё</button>' : ''}</section>`;
  root.querySelectorAll('[data-edition-filter]').forEach(button => button.addEventListener('click', () => {
    updateFilter = button.dataset.editionFilter; updateLimit = 30; showAllUpdates(); root.querySelector(`[data-edition-filter="${updateFilter}"]`).focus({preventScroll:true});
  }));
  root.querySelector('.updates-more')?.addEventListener('click', () => {
    const firstNew = visible.length; updateLimit += 30; showAllUpdates();
    const target = root.querySelectorAll('.updates-list > :is(details,article)')[firstNew];
    (target?.querySelector('summary,a') || root.querySelector('.updates-more'))?.focus({preventScroll:true});
  });
}
async function checkPublishedUpdates() {
  if (!archive || location.hash !== '#/updates' || document.hidden || updatesReading ||
      root.querySelector('.update-entry[open]') || document.querySelector('#refresh').disabled) return;
  updatesReading = true;
  try {
    const query = '?published=' + Math.floor(Date.now() / 60000);
    const [archiveResponse, newsResponse] = await Promise.all([
      fetch('archive.json' + query, {cache: 'no-store'}),
      fetch('news.json' + query, {cache: 'no-store'})
    ]);
    if (!archiveResponse.ok || !newsResponse.ok) return;
    const [nextArchive, nextNews] = await Promise.all([archiveResponse.json(), newsResponse.json()]);
    if (!Array.isArray(nextArchive.docs) || !Array.isArray(nextNews.items) ||
        location.hash !== '#/updates' || root.querySelector('.update-entry[open]') ||
        document.querySelector('#refresh').disabled) return;
    const archiveChanged = Date.parse(nextArchive.generatedAt) > Date.parse(archive.generatedAt);
    const newsChanged = nextNews.items.length !== sharedNews.length ||
      nextNews.items.some((item, i) => item.url !== sharedNews[i]?.url);
    if (!archiveChanged && !newsChanged) return;
    if (archiveChanged) archive = nextArchive;
    sharedNews = nextNews.items;
    newsAnalysis = Array.isArray(nextNews.analysis) ? nextNews.analysis : [];
    combineNews();
    showAllUpdates();
  } catch {
    // The visible list stays available during a temporary network error.
  } finally {
    updatesReading = false;
  }
}
document.addEventListener('visibilitychange', checkPublishedUpdates);
setInterval(checkPublishedUpdates, 60000);
function home(){let items=topicEntries().filter(({d,i})=>(d.title+' '+descriptions[i]+' '+d.messages.map(m=>m.text).join(' ')).toLowerCase().includes(query.toLowerCase()));root.innerHTML=`<div class="layout"><section><div class="hero"><div class="overline">Обзор / Искусственный интеллект</div><h1>Новости искусственного интеллекта</h1><p>Исследования, открытия и прогнозы — важные события развития ИИ и их влияние на будущее.</p></div><form class="search" role="search"><input id="search" type="search" aria-label="Поиск по архиву" placeholder="Поиск по архиву: новости, модели, прогнозы..." value="${escapeHtml(query)}"></form>${renderNews()}<h2 class="section-title">Архив подборок из чатов</h2><div id="results">${items.length?rows(items):'<p class="empty">Ничего не найдено. Попробуйте другой запрос.</p>'}</div>${graph()}</section>${side()}</div>`;wireNews();document.querySelector('.search').addEventListener('submit',e=>e.preventDefault());document.querySelector('#search').addEventListener('input',e=>{query=e.target.value;let matches=topicEntries().filter(({d,i})=>(d.title+' '+descriptions[i]+' '+d.messages.map(m=>m.text).join(' ')).toLowerCase().includes(query.toLowerCase()));document.querySelector('#results').innerHTML=matches.length?rows(matches):'<p class="empty">Ничего не найдено. Попробуйте другой запрос.</p>'})}
function topic(i){i=topicIndex(i);let d=topicDocument(i);if(!d){home();return}const latest=d.messages.find(m=>m.agent_turn_id);
const rail=`<aside class="reader-rail" aria-label="Разделы обзора"><div class="rail-head">ТЕМЫ ОБЗОРА</div><nav aria-label="Перейти к теме">${topicEntries().map(({d:doc,i:n},k)=>`<a href="#/topic/${n}" ${n===i?'aria-current="page"':''}><span>${String(k+1).padStart(2,'0')}</span>${escapeHtml(doc.title)}</a>`).join('')}</nav></aside>`;
root.innerHTML=`<div class="reader-grid">${rail}<div class="reader-column"><section class="article-top"><a class="back" href="#/">← Все материалы</a><h1>${escapeHtml(d.title)}</h1><p><a class="read-link" href="#/analysis/${i}">Аналитика темы →</a></p><div class="meta">${labels[i]} · последнее изменение чата ${date(d.updatedAt)}</div></section><div class="article-body">${latest?`<div class="latest-brief"><div class="rail-head">ПОСЛЕДНИЙ ОТВЕТ АГЕНТА · ${escapeHtml(editionClock.format(latest.date*1000))} ОМСК</div><p>${escapeHtml(answerPreview(latest.text))}</p><button type="button" class="brief-link" id="read-latest">Читать ответ ↓</button></div>`:''}${renderNews(d.title)}${i===8?graph():''}${d.note?`<div class="status">${escapeHtml(d.note)}</div>`:""}${d.messages.map((m,n)=>`<section class="message"><div class="message-date">Ответ ${n+1} · ${date(m.date)}</div>${m.truncated?'<div class="status">Ответ получен не полностью: показаны первые 20 000 символов.</div>':''}<div class="prose">${renderArticle(m.text)}</div></section>`).join('')}</div></div></div>`;wireNews();document.querySelector('#read-latest')?.addEventListener('click',()=>{const m=root.querySelectorAll('.message')[d.messages.indexOf(latest)];if(m){m.tabIndex=-1;m.focus({preventScroll:true});m.scrollIntoView({block:'start'})}})}
function render(){if(!archive)return;if(typeof stamp==='function')stamp();markCurrentNavigation();const analysisRoute=location.hash.match(/^#\/analysis(?:\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?)?$/);if(analysisRoute){showAnalysis(Number(analysisRoute[1]??0),analysisRoute[2]);return;}if(location.hash==='#/updates'){showAllUpdates();return}if(location.hash==='#/forecast'){showForecast();return}let match=location.hash.match(/^#\/topic\/(\d+)$/);if(match)topic(Number(match[1]));else{home();if(location.hash==='#/chart')document.querySelector('#chart')?.scrollIntoView();if(location.hash==='#/topics')document.querySelector('#results')?.scrollIntoView()}}
function markCurrentNavigation() {
  let route = location.hash || '#/';
  if (route.startsWith('#/analysis')) route = '#/analysis';
  document.querySelectorAll('.mast-nav a').forEach(link => {
    if (link.getAttribute('href') === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
async function loadArchive(){try{const r=await fetch('archive.json?v1',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.docs))throw Error();archive=d;render()}catch{root.innerHTML='<p class="empty">Не удалось загрузить архив. Перезагрузите страницу.</p>'}}
const sizeButton = document.getElementById('reader-size');
function readerSize(large) { document.documentElement.classList.toggle('large-type', large); sizeButton.setAttribute('aria-pressed', String(large)); }
try { readerSize(localStorage.getItem('pulse-reading-large') === 'yes'); } catch { readerSize(false); }
sizeButton.addEventListener('click', () => { const large = sizeButton.getAttribute('aria-pressed') !== 'true'; readerSize(large); try { localStorage.setItem('pulse-reading-large', large ? 'yes' : 'no'); } catch {} });
document.querySelector('.skip').addEventListener('click', e => { e.preventDefault(); root.focus(); root.scrollIntoView(); });
window.addEventListener('hashchange',()=>{render();if(!['#/chart','#/topics'].includes(location.hash))window.scrollTo(0,0)});fetch('news.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&Array.isArray(d.items)){sharedNews=d.items;newsAnalysis=Array.isArray(d.analysis)?d.analysis:[];combineNews();render()}}).catch(()=>{});loadArchive();
