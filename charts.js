'use strict';
function chartFromData(widget){
  const c=widget?.charts_widget_v2?.content;if(!c||!Array.isArray(c.data)||!Array.isArray(c.series)||c.data.length<2)return '<p class="status">График из исходного чата не удалось восстановить.</p>';
  const data=c.data.slice(0,50),series=c.series.slice(0,6),key=c.xKey||'year',colors=['#1742c7','#eb7b39','#008a78','#a63e72','#8257bd','#555'];
  const values=data.flatMap(row=>series.map(s=>Number(row[s.dataKey]))).filter(Number.isFinite);if(!values.length)return '';
  const low=Math.min(0,...values),high=Math.max(0,...values)||1,span=high-low||1;
  const xs=data.map((d,i)=>Number(d[key]));let numeric=xs.every(Number.isFinite)&&Math.max(...xs)>Math.min(...xs);let xmin=Math.min(...xs),xspan=Math.max(...xs)-xmin;
  const x=(d,i)=>50+(numeric?(Number(d[key])-xmin)/xspan:i/(data.length-1))*610;const y=v=>230-190*(v-low)/span;
  const paths=series.map((s,j)=>{let points=data.map((d,i)=>Number.isFinite(Number(d[s.dataKey]))?`${x(d,i).toFixed(1)},${y(Number(d[s.dataKey])).toFixed(1)}`:'').filter(Boolean).join(' ');return `<polyline points="${points}" fill="none" stroke="${colors[j]}" stroke-width="3"/>`}).join('');
  const ticks=data.map((d,i)=>`<text x="${x(d,i)}" y="253" text-anchor="middle">${escapeHtml(d[key])}</text>`).join('');
  const legend=series.map((s,i)=>`<span><i style="background:${colors[i]}"></i>${escapeHtml(s.label||s.dataKey)}</span>`).join('');
  const rows=data.map(d=>`<tr><td>${escapeHtml(d[key])}</td>${series.map(s=>`<td>${escapeHtml(d[s.dataKey]??'—')}${escapeHtml(s.valueSuffix||'')}</td>`).join('')}</tr>`).join('');
  return `<figure class="widget-chart"><figcaption><strong>${escapeHtml(c.meta?.title||'График из исходного ответа')}</strong><br>${escapeHtml(c.meta?.description||'Значения и сценарии приведены по материалу чата.')}</figcaption><svg viewBox="0 0 700 275" role="img" aria-label="График; точные значения приведены в таблице ниже"><line x1="50" y1="230" x2="660" y2="230" stroke="#aab2bf"/><line x1="50" y1="40" x2="50" y2="230" stroke="#aab2bf"/><text x="43" y="45" text-anchor="end">${high.toFixed(1)}</text><text x="43" y="234" text-anchor="end">${low.toFixed(1)}</text>${paths}${ticks}</svg><div class="legend">${legend}</div><details><summary>Показать данные графика</summary><div class="table-wrap"><table><thead><tr><th>${escapeHtml(key)}</th>${series.map(s=>`<th>${escapeHtml(s.label||s.dataKey)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details></figure>`;
}
function renderArticle(text){let widgets=[];let cleaned=text.replace(/genui([\s\S]*?)/g,(_,raw)=>{try{let html=chartFromData(JSON.parse(raw));let token='CHARTWIDGETTOKEN'+widgets.length+'END';widgets.push({token,html});return '\n\n'+token+'\n\n'}catch{return '\n\n[График из исходного чата недоступен]\n\n'}}).replace(/image_group[\s\S]*?/g,'').replace(/entity\[([^\]]*)\]/g,'$1');let result=markdown(cleaned);for(let w of widgets)result=result.replace('<p>'+w.token+'</p>',w.html);return result}

