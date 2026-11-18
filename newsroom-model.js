'use strict';
// Pure edition rules, shared by the front page, archive search and checks journal.
const DeskModel = (() => {
  const norm = s => String(s ?? '').toLocaleLowerCase('ru').replace(/ё/g,'е');
  const plain = s => String(s ?? '').replace(/url([^]+)[^]*/g,'$1')
    .replace(/[^]*|:chatgpt-content-reference\{[^}]*\}/g,'')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g,'$1').replace(/https?:\/\/\S+/g,' ')
    .replace(/^[ \t]*#{1,6}\s*/gm,'').replace(/[*_\x60]/g,'').replace(/\s+/g,' ').trim();
  const segments = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ru',{granularity:'sentence'}) : null;
  function excerpt(text,limit=185) {
    const value=plain(text); if(value.length<=limit)return value;
    const sentences=segments?Array.from(segments.segment(value),x=>x.segment.trim()):value.split(/(?<=[.!?])\s+/u);
    let out='';
    for(const sentence of sentences){if((out+' '+sentence).trim().length>limit)break;out=(out+' '+sentence).trim()}
    return out || value.slice(0,limit-1).replace(/\s+\S*$/u,'').trimEnd()+'…';
  }
  const osmDay = t => new Date(t+21600000).toISOString().slice(0,10);
  function published(n){
    if(typeof n.published_at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(n.published_at))return null;
    const ms=Date.parse(n.published_at);return Number.isFinite(ms)?ms:null;
  }
  function frontStories(items,now=Date.now()){
    const today=osmDay(now);
    const rows=items.filter(n=>n.date_kind!=='chat_answer').map(n=>{
      const ms=published(n);return {n,ms,day:ms===null?n.date:osmDay(ms)}
    }).filter(x=>x.day<=today&&(x.ms===null||x.ms<=now));
    rows.sort((a,b)=>b.day.localeCompare(a.day)||Number(b.n.importance==='high')-Number(a.n.importance==='high')||(b.ms??-Infinity)-(a.ms??-Infinity));
    if(!rows.length)return null;
    const lead=rows[0],topics=new Set([lead.n.topic]),also=[];
    for(const {day,n} of rows){if(day!==lead.day||topics.has(n.topic))continue;also.push(n);topics.add(n.topic);if(also.length===2)break}
    return {day:lead.day,lead:lead.n,also};
  }
  function cleanKey(text){return norm(plain(text))}
  function findMatches(records,input){
    const needle=norm(input.trim()).replace(/\s+/g,' ');if(!needle)return [];
    const words=[...new Set(needle.split(/\s+/))];
    return records.map(r=>{
      if(!words.every(w=>r.haystack.includes(w)))return null;
      const score=(r.heading.includes(needle)?80:0)+(r.bodyKey.includes(needle)?9:0)+words.reduce((v,w)=>v+(r.heading.includes(w)?15:0),0);
      return {r,score};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||b.r.time-a.r.time).map(x=>x.r);
  }
  function snippet(s,query,limit=145){
    const text=String(s||'');if(text.length<=limit)return text;
    const value=norm(text),words=norm(query.trim()).split(/\s+/).filter(Boolean);
    const matches=words.map(w=>value.indexOf(w)).filter(x=>x>=0);
    const start=matches.length?Math.max(0,Math.min(...matches)-38):0;
    const cut=text.slice(start,start+limit);
    return (start?'…':'')+cut.trim()+(start+limit<text.length?'…':'');
  }
  function quiet(m){
    if(!m.agent_turn_id)return false;
    if(Number.isInteger(m.added_articles)&&m.added_articles>=0)return m.added_articles===0;
    // Old agent turns pre-date numeric receipts. Fold only explicit no-addition statements near the opening.
    const opening=norm(plain(m.text)).slice(0,440);
    if(/(?:добавлен[аоы]?|найден[аоы]?)\s+(?:[1-9]\d*|один|одна|два|две|три|четыре|пять)\s+(?:нов|материал|публикаци|новост|запис|стать|работ|событи)/u.test(opening))return false;
    const noun='(?:материалов|публикаций|новостей|записей|событий|результатов|сообщений|статей)';
    if(/новых записей в news\.json не добавлено(?:[\s.,;:]|$)/u.test(opening))return true;
    const newer='новых\\s+(?:(?:подтвержденных|проверенных|значимых)\\s+)?'+noun;
    return new RegExp('(?:^|[\\s:;—])0\\s+'+newer+'(?:[\\s.,:;—]|$)|'+newer+'(?: для архива| в архиве)?\\s*(?:[:—–-]\\s*)?(?:0(?![\\d.,]\\d)|нет)(?=$|[\\s.,;:—])|'+newer+'[^.!?;|]{0,150}\\s(?:не найдено|не нашлось|не обнаружено|не нашел|нет)(?:[\\s.,;:]|$)|(?:не нашел|не найдено|не нашлось|не обнаружено|нет)\\s+'+newer,'u').test(opening);
  }
  function makeJournal(answers,articles,filter){
    const days=new Map();
    const day=k=>{if(!days.has(k))days.set(k,{news:[],answers:[],runs:new Map()});return days.get(k)};
    if(filter!=='answer')for(const a of articles)day(a.day).news.push(a);
    if(filter!=='news')for(const a of answers){
      const d=day(a.day),m=a.message;
      if(!m.agent_turn_id){d.answers.push(a);continue}
      const slot=Math.floor(a.time/21600000),key=m.github_run_id?'r'+m.github_run_id:'w'+slot;
      if(!d.runs.has(key))d.runs.set(key,{type:'quiet',day:a.day,time:a.time,topics:new Set(),quiet:[],exact:!!m.github_run_id});
      const run=d.runs.get(key);run.time=Math.max(run.time,a.time);run.topics.add(a.index);
      if(quiet(m))run.quiet.push(a);else d.answers.push(a);
    }
    const out=[];
    for(const key of [...days.keys()].sort().reverse()){
      const d=days.get(key);
      d.news.sort((a,b)=>(b.time??-Infinity)-(a.time??-Infinity));
      const reports=[...d.answers,...[...d.runs.values()].filter(r=>r.quiet.length)];
      reports.sort((a,b)=>b.time-a.time);
      for(const r of reports)if(r.quiet)r.quiet.sort((a,b)=>b.time-a.time);
      out.push(...d.news,...reports);
    }
    return out;
  }
  return {norm,plain,cleanKey,excerpt,osmDay,published,frontStories,findMatches,snippet,quiet,makeJournal};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DeskModel;
