'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../newsroom-model.js');
test('front follows the latest Omsk publication day, then priority, never an answer or a future event',()=>{
  const base={date:'2026-11-18',topic:'новости',importance:'normal'};
  const high={...base,topic:'экономика',importance:'high'};
  const old={...high,date:'2026-11-17',topic:'вчера'};
  const evening={...base,date:'2026-11-17',topic:'технологии',published_at:'2026-11-17T20:00:00Z'};
  const items=[old,{...base,date:'2026-11-19'}, {...high,date_kind:'chat_answer'}, {...high,published_at:'2026-11-18T20:00:00Z'},base,high,evening];
  const front=M.frontStories(items,Date.parse('2026-11-18T12:00Z'));
  assert.equal(front.lead,high);assert.equal(front.day,'2026-11-18');assert.deepEqual(new Set(front.also),new Set([base,evening]));
  assert.equal(M.frontStories([old],Date.parse('2026-11-19T12:00Z')).day,'2026-11-17');
  assert.equal(M.frontStories([{...old,date_kind:'chat_answer'}]),null);
});
test('legacy reports need an explicit no-additions statement; measured counts override the prose',()=>{
  const check=(text,extra={})=>M.quiet({agent_turn_id:'turn',text,...extra});
  for(const s of ['**Новых материалов: 0.**','Обновление: 0 новых материалов','Новых записей: 0.','Новых материалов для архива — 0.','Новых подтверждённых событий за шесть часов не найдено.','Новых записей в news.json не добавлено: уже в архиве.'])assert.equal(check(s),true,s);
  for(const s of ['В проверке 0 ошибок.','Новых материалов: 10.','Новых материалов: 0,5 млн.','На прошлой неделе: 0 новых материалов. Сегодня добавлена одна статья.','Обзор повторных публикаций.'])assert.equal(check(s),false,s);
  assert.equal(M.quiet({text:'0 новых материалов'}),false);
  assert.equal(check('0 новых материалов',{added_articles:1}),false);assert.equal(check('Проверено',{added_articles:0}),true);
});
test('every reply survives grouping; duplicate checks count unique topics; the articles-only filter stays clean',()=>{
  const day='2026-11-18', mk=(index,time,run,zero)=>({day,type:'answer',index,time,message:{agent_turn_id:'t'+time,github_run_id:run,added_articles:zero?0:1,text:'ответ'}});
  const replies=[mk(0,100,'a',true),mk(0,101,'a',true),mk(1,103,'a',false),mk(7,95,'b',true)];
  const story={day,time:null,type:'news',item:{date:day}};
  const all=M.makeJournal(replies,[story],'all');assert.equal(all[0],story);
  const groups=all.filter(x=>x.type==='quiet');assert.equal(groups.length,2);assert.equal(groups[0].topics.size,2);assert.equal(groups[0].quiet.length,2);
  assert.deepEqual(new Set(all.flatMap(x=>x.type==='quiet'?x.quiet:x.type==='answer'?[x]:[])),new Set(replies));
  assert.deepEqual(M.makeJournal(replies,[story],'news'),[story]);
  assert.equal(M.makeJournal(replies,[story],'answer').some(x=>x.type==='news'),false);
});
test('archive search ranks a headline match ahead of a newer mention and handles punctuation as literal text',()=>{
  const mk=(title,body,time)=>({title,heading:M.norm(title),bodyKey:M.norm(body),haystack:M.norm(title+' '+body),time});
  const a=mk('Pony.ai: итоги','Отчёт',1),b=mk('Архив','Отчет о Pony.ai и других',2);
  assert.deepEqual(M.findMatches([b,a],'PONY.AI'),[a,b]);assert.deepEqual(M.findMatches([b,a],'отчет pony.ai'),[a,b]);
  assert.deepEqual(M.findMatches([b,a],'[.*]'),[]);assert.deepEqual(M.findMatches([b,a],'нет совпадений'),[]);
});
