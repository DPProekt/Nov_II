'use strict';
const Newsroom = (() => {
  const M=DeskModel, E=value=>escapeHtml(value);
  let searchCache=null, expansions={},activeRead=null;
  const articleHref=n=>'#/read/article/'+encodeURIComponent(n.url);
  function answerKey(m){
    if(m.agent_turn_id)return m.agent_turn_id;
    let h=0;for(const ch of String(m.text))h=(Math.imul(h,31)+ch.charCodeAt(0))|0;
    return 'archive-'+m.date+'-'+(h>>>0).toString(36);
  }
  const answerHref=(index,m)=>'#/read/answer/'+index+'/'+encodeURIComponent(answerKey(m));
  const ref=(link,label,cls='')=>'<a class="'+cls+'" href="'+E(link)+'">'+E(label)+'</a>';
  function sourceLink(n){
    try{const u=new URL(n.url);if(u.protocol!=='https:'||u.username||u.password)return '';
      return '<a class="front-source" href="'+E(u.href)+'" target="_blank" rel="noopener noreferrer">Источник: '+E(n.source)+' ↗</a>';
    }catch{return ''}
  }
  const dFmt=new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long'});
  const plural=(n,one,few,many)=>n%10===1&&n%100!==11?one:n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?few:many;
  const dayText=day=>dFmt.format(new Date(day+'T12:00:00Z'));
  function feature(front){
    if(!front)return '<header class="front-lead"><div class="front-kicker">Пульс ИИ · новости</div><h1>Последний выпуск</h1><p>'+(newsLoadState==='loading'?'Загружаем статьи…':newsLoadState==='error'?'Не удалось загрузить статьи. Попробуйте перечитать страницу.':'Пока нет опубликованных статей с датой и источником.')+'</p></header>';
    const n=front.lead,h=articleHref(n);
    return '<header class="front-lead"><div class="front-kicker"><span class="front-dash" aria-hidden="true"></span>Главное за '+E(dayText(front.day))+'<span class="front-dot">·</span><span>'+E(canonicalTopic(n.topic))+'</span></div>'+
      '<h1>'+ref(h,n.title)+'</h1><p class="front-deck">'+E(M.excerpt(n.brief||n.summary,205))+'</p>'+
      (n.analysis?'<p class="front-impact"><strong>Почему важно</strong> '+E(M.excerpt(n.analysis,185))+'</p>':'')+
      '<div class="front-links">'+ref(h,'Читать разбор →','front-primary')+sourceLink(n)+'</div></header>';
  }
  function further(front){
    if(!front?.also.length)return '';
    return '<section class="front-further" aria-label="Ещё в выпуске"><h2>Ещё в выпуске</h2><div>'+front.also.map(n=>
      '<article><span>'+E(canonicalTopic(n.topic))+'</span>'+ref(articleHref(n),n.title)+'</article>').join('')+'</div></section>';
  }
  function home(){
    const front=M.frontStories(fresh.filter(validNews));
    const oldInput=root.querySelector('#search'), focused=oldInput&&document.activeElement===oldInput, caret=focused?oldInput.selectionStart:null;
    root.innerHTML='<div class="front-page"><div class="front-tools"><div class="front-edition"><span>Пульс дня</span><small>Новости и разборы</small></div>'+
      '<form class="front-search" role="search"><label for="search" class="front-sr">Поиск по статьям, ответам и темам</label><span class="search-lens" aria-hidden="true"></span>'+
      '<input id="search" type="search" autocomplete="off" placeholder="Найти статью, ответ или тему" aria-controls="front-results" value="'+E(query)+'">'+
      '<button type="button" id="search-clear" hidden>Сбросить</button></form></div>'+
      '<div id="search-announcement" class="front-sr" role="status" aria-live="polite" aria-atomic="true"></div><div id="front-results" hidden><h1 class="front-sr">Результаты поиска</h1><p class="result-count"></p><div id="match-groups"></div></div>'+
      '<div class="layout front-layout" id="front-dashboard"><section class="front-main">'+feature(front)+further(front)+renderNews(undefined,front?.lead?.url)+
      '<h2 class="section-title">Архив подборок из чатов</h2><div id="results">'+rows(topicEntries())+'</div>'+graph()+'</section>'+side()+'</div></div>';
    const input=root.querySelector('#search'),clear=root.querySelector('#search-clear'),form=root.querySelector('.front-search');
    const reset=()=>{input.value='';query='';expansions={};paintSearch();input.focus()};
    input.addEventListener('input',()=>{query=input.value;expansions={};paintSearch()});
    input.addEventListener('keydown',e=>{if(e.key==='Escape'&&query){e.preventDefault();reset()}});
    clear.addEventListener('click',reset);
    form.addEventListener('submit',e=>{e.preventDefault();root.querySelector('#match-groups a')?.focus()});
    root.querySelector('#match-groups').addEventListener('click',e=>{
      const btn=e.target.closest('button[data-more-results]');if(!btn)return;
      const kind=btn.dataset.moreResults,offset=expansions[kind]||4;expansions[kind]=offset+8;paintSearch();
      root.querySelectorAll('[data-result-kind="'+kind+'"] .result-item a')[offset]?.focus();
    });
    wireNews();paintSearch();if(focused){input.focus({preventScroll:true});if(caret!=null)input.setSelectionRange(caret,caret)}
  }
  function records(){
    if(searchCache?.news===fresh&&searchCache?.docs===archive)return searchCache.rows;
    const rows=[];
    function add(kind,title,body,meta,url,time,topic){
      const clean=M.plain(body),heading=M.cleanKey(title),bodyKey=M.norm(clean);
      rows.push({kind,title,body:clean,meta,url,time,heading,bodyKey,topic,haystack:heading+' '+bodyKey+' '+M.norm(meta)});
    }
    for(const n of fresh.filter(validNews)){
      const day=newsDateFormat.format(Date.parse(n.date+'T12:00:00Z'));
      add('news',n.title,[n.brief,n.question,n.summary,n.analysis,n.watch,n.source].filter(Boolean).join(' '),
        [canonicalTopic(n.topic),(n.date_kind==='chat_answer'?'Дата ответа GPT: ':'')+day,n.source].join(' · '),articleHref(n),M.published(n)??Date.parse(n.date+'T00:00:00Z'),canonicalTopic(n.topic));
    }
    for(const {i,d} of topicEntries()){
      add('topic',d.title,descriptions[i],labels[i],'#/topic/'+i,d.updatedAt*1000,d.title);
      for(const m of d.messages){if(!m.text||!Number.isFinite(Number(m.date)))continue;
        const t=m.date*1000;add('answer',d.title,m.text,updateTimeFormat.format(t)+' · Омск',answerHref(i,m),t,d.title);
      }
    }
    searchCache={news:fresh,docs:archive,rows};return rows;
  }
  function marked(text,terms){
    const v=M.norm(text);let pos=0,html='';
    while(pos<v.length){
      let next=-1,word='';
      for(const t of terms){const at=v.indexOf(t,pos);if(at>=0&&(next<0||at<next||(at===next&&t.length>word.length))){next=at;word=t}}
      if(next<0)break;html+=E(text.slice(pos,next))+'<mark>'+E(text.slice(next,next+word.length))+'</mark>';pos=next+word.length;
    }
    return html+E(text.slice(pos));
  }
  function paintSearch(){
    const q=query.trim(),results=root.querySelector('#front-results'),groups=results.querySelector('#match-groups'),count=results.querySelector('.result-count');
    root.querySelector('#search-clear').hidden=!q;results.hidden=!q;root.querySelector('#front-dashboard').hidden=!!q;
    const announce=root.querySelector('#search-announcement');
    if(!q){announce.textContent=count.textContent?'Поиск сброшен. Показан выпуск.':'';count.textContent='';groups.replaceChildren();return}
    const items=M.findMatches(records(),q),terms=[...new Set(M.norm(q).split(/\s+/).filter(Boolean))];
    const directTopics=new Set(items.filter(r=>r.kind==='topic').map(r=>r.topic));
    const linked=new Map();for(const r of items)if(r.kind!=='topic'&&!linked.has(r.topic))linked.set(r.topic,r);
    for(const r of records())if(r.kind==='topic'&&!directTopics.has(r.topic)&&linked.has(r.topic)){
      const hit=linked.get(r.topic);items.push({...r,body:'В этой теме: '+M.snippet(hit.title+' · '+hit.body,q,135)});
    }
    count.textContent=items.length?'Найдено: '+items.length+' · по запросу «'+q+'»':'По запросу «'+q+'» ничего не найдено';
    announce.textContent=count.textContent;
    if(!items.length){groups.innerHTML='<p class="search-hint">Попробуйте название модели, компании или темы либо сбросьте поиск.</p>';return}
    groups.innerHTML=[['news','Статьи'],['answer','Ответы GPT'],['topic','Темы']].map(([k,label])=>{
      const list=items.filter(r=>r.kind===k);if(!list.length)return '';
      const limit=expansions[k]||4;
      return '<section data-result-kind="'+k+'" class="result-group"><h2>'+label+' <small>'+list.length+'</small></h2>'+list.slice(0,limit).map(r=>
        '<article class="result-item"><h3><a href="'+E(r.url)+'">'+marked(r.title,terms)+'</a></h3><div class="result-meta">'+E(r.meta)+'</div><p>'+marked(M.snippet(r.body,q),terms)+'</p></article>').join('')+
        (list.length>limit?'<button type="button" class="result-more" data-more-results="'+k+'">Показать ещё · '+E(label)+'</button>':'')+'</section>';
    }).join('');
  }
  function readRoute(){
    activeRead=null;
    const hit=location.hash.match(/^#\/read\/(article|answer)\/(.*)$/);
    if(!hit)return false;
    let title='',meta='',content='',top='',topic=null;
    try{
      if(hit[1]==='article'){
        const n=fresh.find(n=>n.url===decodeURIComponent(hit[2]));
        if(n){title=n.title;topic=canonicalTopic(n.topic);meta=(n.date_kind==='chat_answer'?'Дата ответа GPT · ':'Дата публикации · ')+newsDateFormat.format(Date.parse(n.date+'T12:00:00Z'));
          top=topic;content=(n.question?'<p class="news-question"><strong>Вопрос к GPT</strong> '+E(n.question)+'</p>':'')+'<p class="story-text">'+E(n.summary)+'</p>'+newsComparison(n.comparison)+
            (n.analysis?'<h2>Почему важно</h2><p class="story-text">'+E(n.analysis)+'</p>':'')+(n.watch?'<h2>Что отслеживать</h2><p>'+E(n.watch)+'</p>':'')+
            '<div class="story-sources"><h2>Источники</h2>'+newsSources(n)+'</div>';
        }
      }else{
        const parts=hit[2].match(/^(\d+)\/(.+)$/),d=parts&&topicDocument(Number(parts[1])),key=parts&&decodeURIComponent(parts[2]);
        const m=d?.messages.find(v=>answerKey(v)===key);
        if(m){topic=d.title;title=d.title;top='Ответ GPT';meta=updateTimeFormat.format(m.date*1000)+' · Омск';
          content=(m.truncated?'<p class="notice">В архиве сохранена только часть ответа.</p>':'')+renderArticle(m.text);}
      }
    }catch{/* malformed link */}
    activeRead=topic;
    const topicId=topic&&topicEntries().find(t=>t.d.title===topic)?.i;
    const back=ref('#/',query.trim()?'← К результатам поиска':'← На главную','back');
    root.innerHTML='<article class="story-page">'+back+(title?'<header><div class="front-kicker">'+E(top)+'</div><h1>'+E(title)+'</h1><p class="result-meta">'+E(meta)+'</p></header><div class="story-body prose">'+content+'</div>'+
      (topicId!=null?ref('#/topic/'+topicId,'Все материалы по теме →','read-link'):''):newsLoadState==='loading'&&hit[1]==='article'?'<p>Загружаем статью…</p>':'<h1>Материал недоступен</h1><p>Проверьте ссылку или вернитесь к поиску на главной.</p>')+'</article>';
    return true;
  }
  function answerMarkup(entry){
    return '<details class="update-entry"><summary><span class="update-date"><span class="kind-label">Ответ GPT</span><time datetime="'+new Date(entry.time).toISOString()+'" aria-label="'+E(updateTimeFormat.format(entry.time))+'">'+editionClock.format(entry.time)+'</time></span>'+
      '<span class="summary-copy"><strong>'+E(entry.title)+'</strong><small>'+E(answerPreview(entry.message.text))+'</small></span><span class="disclosure" aria-hidden="true"></span></summary>'+
      '<div class="update-content prose"><p>'+ref(answerHref(entry.index,entry.message),'Открыть этот ответ →','read-link')+'</p>'+renderArticle(entry.message.text)+'</div></details>';
  }
  function quietMarkup(run){
    const rows=run.quiet,quietTopics=new Set(rows.map(r=>r.index)).size;
    const label='Проверено: '+run.topics.size+' '+plural(run.topics.size,'тема','темы','тем')+' · без новых материалов: '+quietTopics;
    return '<details class="quiet-group"><summary><span class="quiet-meta">'+(run.exact?'Проверка агента':'Проверки за период')+' · '+editionClock.format(run.time)+' Омск</span><strong>'+label+'</strong><span class="disclosure" aria-hidden="true"></span></summary>'+
      '<div class="quiet-body"><p>Ответы сохранены полностью. Выберите проверку:</p>'+rows.map(answerMarkup).join('')+'</div></details>';
  }
  function compactStory(n){
    return '<article class="update-story"><div class="update-date"><span class="kind-label">Статья</span><span>'+E(canonicalTopic(n.topic))+'</span></div><div><h3>'+ref(articleHref(n),n.title)+'</h3>'+
      '<p>'+E(M.excerpt(n.brief||n.summary,160))+'</p><div class="update-byline">'+(n.date_kind==='chat_answer'?'Дата ответа GPT · ':'')+
      newsDateFormat.format(Date.parse(n.date+'T12:00:00Z'))+' · '+sourceLink(n)+'</div></div></article>';
  }
  function journal(){
    const answers=topicEntries().flatMap(({i,d})=>d.messages.filter(m=>m.text&&Number.isFinite(Number(m.date))).map(message=>{
      const time=message.date*1000;return {type:'answer',time,day:M.osmDay(time),title:d.title,index:i,message};
    }));
    const articles=fresh.filter(validNews).map(item=>{const t=M.published(item);return {type:'news',day:t===null?item.date:M.osmDay(t),time:t,item}});
    return M.makeJournal(answers,articles,updateFilter);
  }
  function journalRow(entry){
    if(entry.type==='quiet')return quietMarkup(entry);
    if(entry.type==='answer')return answerMarkup(entry);
    return updateFilter==='news'?feedCards([entry.item],true):compactStory(entry.item);
  }
  function topicBrief(m){
    if(!m)return '';
    const meta='Последний ответ агента · '+updateTimeFormat.format(m.date*1000)+' · Омск';
    return '<details class="latest-brief inline-answer'+(M.quiet(m)?' is-quiet':'')+'"><summary><span class="rail-head">'+E(meta)+'</span>'+
      (M.quiet(m)?'<strong>Без новых материалов</strong>':'<span class="brief-excerpt">'+E(answerPreview(m.text))+'</span>')+
      '<span class="brief-link">Читать ответ</span></summary><div class="prose">'+renderArticle(m.text)+'</div></details>';
  }
  function topicMessage(m,n){
    const stamp=updateTimeFormat.format(m.date*1000)+' · Омск';
    const body=(m.truncated?'<div class="status">Ответ получен не полностью: показаны первые 20 000 символов.</div>':'')+
      '<div class="prose">'+renderArticle(m.text)+'</div>';
    if(M.quiet(m))return '<details class="message quiet-topic"><summary><span>Проверено · '+E(stamp)+'</span> Без новых материалов</summary>'+body+'</details>';
    return '<section class="message"><div class="message-date">Ответ '+(n+1)+' · '+E(stamp)+'</div>'+body+'</section>';
  }
  return {home,articleHref,topicBrief,topicMessage,readRoute,readTopic:()=>activeRead,journal,journalRow};
})();
