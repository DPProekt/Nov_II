'use strict';

let reviewArchive = null;
let reviewArchiveUnavailable = false;
const reviewSelection = new Map();
const reviewTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Omsk', dateStyle: 'medium', timeStyle: 'short'
});
const reviewDayFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC', day: 'numeric', month: 'short'
});

async function loadReviewArchive() {
  try {
    const response = await fetch('analysis-history.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Review archive unavailable');
    const data = await response.json();
    if (data.schema_version !== 1 || !Array.isArray(data.versions)) throw new Error('Invalid review archive');
    reviewArchive = data.versions;
  } catch {
    reviewArchiveUnavailable = true;
  }
  if (location.hash.startsWith('#/analysis')) render();
}

function reviewVersions(topic, current, items) {
  const versions = new Map();
  const saved = (reviewArchive ?? []).filter(review =>
    review && canonicalTopic(review.topic) === topic && Number.isFinite(Date.parse(review.updated_at)));
  for (const item of saved) versions.set(Date.parse(item.updated_at), item);
  if (current) {
    const date = Date.parse(current.updated_at);
    const recorded = versions.get(date);
    const dates = Object.create(null);
    for (const item of items) dates[item.date] = (dates[item.date] ?? 0) + 1;
    versions.set(date, {...current, publication_dates: recorded?.publication_dates ?? dates});
  }
  return [...versions.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function recentPublicationChart(items) {
  const end = omskDate(Date.now());
  const start = Date.parse(end) - 13 * 86400000;
  const dates = Array.from({length: 14}, (_, index) => new Date(start + index * 86400000));
  const counts = new Map(dates.map(day => [day.toISOString().slice(0, 10), 0]));
  for (const item of items) {
    if (counts.has(item.date)) counts.set(item.date, counts.get(item.date) + 1);
  }
  const maximum = Math.max(1, ...counts.values());
  const bars = dates.map((day, index) => {
    const count = counts.get(day.toISOString().slice(0, 10));
    const date = reviewDayFormat.format(day);
    const axis = [0, 4, 8, 13].includes(index) ? date : '';
    return `<div class="review-day" title="${escapeHtml(date)} · ${count}">
      <div class="review-day-plot"><div class="review-day-bar" style="--bar-height:${count / maximum * 100}%">${count ? `<b>${count}</b>` : ''}</div></div>
      <span>${escapeHtml(axis)}</span></div>`;
  });
  const chartLabel = dates.map(day => `${reviewDayFormat.format(day)}: ${counts.get(day.toISOString().slice(0, 10))}`).join(', ');
  return `<figure class="review-chart"><figcaption><strong>Публикации по дням</strong><span>Последние 14 дней по датам статей в ленте темы</span></figcaption>
    <div class="review-day-grid" role="img" aria-label="${escapeHtml(chartLabel)}">${bars.join('')}</div></figure>`;
}

function versionSourceCount(review) {
  return new Set(Array.isArray(review?.sources) ? review.sources.filter(url => typeof url === 'string') : []).size;
}

function sourceHistoryChart(versions) {
  const recent = versions.slice(0, 5);
  const maximum = Math.max(1, ...recent.map(versionSourceCount));
  return `<figure class="review-chart"><figcaption><strong>Источники в обзорах</strong><span>Количество ссылок в каждой из последних версий</span></figcaption>
    ${recent.map(review => {
      const count = versionSourceCount(review);
      const label = reviewTimeFormat.format(new Date(review.updated_at));
      return `<div class="review-source-bar"><span>${escapeHtml(label)}</span><span class="review-bar-track" aria-hidden="true"><i style="width:${count / maximum * 100}%"></i></span><strong>${count}</strong></div>`;
    }).join('')}</figure>`;
}

function reviewPublicationTable(items) {
  const rows = items.slice(0, 12).map(item => `<tr><td class="review-nowrap">${escapeHtml(item.date)}</td>
    <th scope="row">${escapeHtml(item.title)}</th><td>${escapeHtml(item.analysis || '—')}</td>
    <td><a class="read-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source)} ↗</a></td></tr>`);
  return `<section class="review-panel"><h3>Публикации и источники</h3>${rows.length
    ? `<div class="table-wrap" tabindex="0" aria-label="Таблица публикаций"><table><thead><tr><th scope="col">Дата</th><th scope="col">Публикация</th><th scope="col">Ключевой вывод</th><th scope="col">Источник</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : '<p class="review-hint">В новостной ленте темы пока нет публикаций. Источники обзора приведены в подробном разборе.</p>'}</section>`;
}

function compareReviews(topic, versions) {
  if (reviewArchiveUnavailable) return '<p class="review-hint">Архив сейчас недоступен. Обновите страницу, чтобы повторить загрузку.</p>';
  if (!reviewArchive) return '<p class="review-hint">Загружаем архив версий…</p>';
  if (versions.length < 2) return '<p class="review-hint">Сохранена одна версия. Сравнение станет доступно после следующего пересмотра темы.</p>';

  const previousSelection = reviewSelection.get(topic) ?? {};
  const [left, right] = [
    versions.find(review => Date.parse(review.updated_at) === previousSelection.left) ?? versions[1],
    versions.find(review => Date.parse(review.updated_at) === previousSelection.right) ?? versions[0]
  ];
  const options = selected => versions.map(review => {
    const key = Date.parse(review.updated_at);
    return `<option value="${key}" ${review === selected ? 'selected' : ''}>${escapeHtml(reviewTimeFormat.format(key))}</option>`;
  }).join('');
  const formatCell = value => escapeHtml(value || '—');
  const detailCell = review => (Array.isArray(review.details) ? review.details : []).map(section =>
    section && `<p><strong>${formatCell(section.heading)}</strong><br>${formatCell(section.text)}</p>`).join('') || '—';
  const sourcesOf = review => new Set(Array.isArray(review.sources) ? review.sources : []);
  const changeList = (before, after) => [...sourcesOf(after)].filter(url => !sourcesOf(before).has(url));
  const addedLinks = changeList(left, right);
  const droppedLinks = changeList(right, left);
  const sourceCell = (review, urls) => urls.map(url => {
    if (typeof url !== 'string') return '';
    let parsed;
    try { parsed = new URL(url); } catch { return ''; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return `<li><a class="read-link" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(review.source_titles?.[url] || parsed.hostname)} ↗</a></li>`;
  }).filter(Boolean).join('');
  const publicationCount = review => escapeHtml(review.publication_dates
    ? Object.values(review.publication_dates).filter(Number.isSafeInteger).reduce((sum, n) => sum + n, 0)
    : '—');
  const rows = [
    ['Публикаций в ленте', publicationCount(left), publicationCount(right)],
    ['Что изменилось', formatCell(left.changes), formatCell(right.changes)],
    ['Вывод', formatCell(left.conclusion), formatCell(right.conclusion)],
    ['Разбор по разделам', detailCell(left), detailCell(right)],
    ['Источники', `<ul>${sourceCell(left, [...sourcesOf(left)])}</ul>`, `<ul>${sourceCell(right, [...sourcesOf(right)])}</ul>`]
  ];
  return `<div class="review-compare-pickers"><label for="review-left">Первая версия<select id="review-left">${options(left)}</select></label>
    <label for="review-right">Вторая версия<select id="review-right">${options(right)}</select></label></div>
    <p class="review-hint">Во второй версии по сравнению с первой: ${addedLinks.length} добавленных и ${droppedLinks.length} исключённых ссылок.</p>
    ${left === right ? '<p class="review-hint">Выбрана одна и та же версия. Измените одну из дат для сравнения.</p>' : ''}
    <div class="table-wrap" tabindex="0" aria-label="Сравнение аналитики"><table class="review-compare-table"><thead><tr><th scope="col">Раздел</th>
    <th scope="col">${escapeHtml(reviewTimeFormat.format(new Date(left.updated_at)))}</th><th scope="col">${escapeHtml(reviewTimeFormat.format(new Date(right.updated_at)))}</th></tr></thead>
    <tbody>${rows.map(([label, a, b]) => `<tr><th scope="row">${label}</th><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderReviewDashboard(topic, current) {
  const items = sharedNews.filter(validNews).filter(item => canonicalTopic(item.topic) === topic)
    .sort((a, b) => b.date.localeCompare(a.date));
  const versions = reviewVersions(topic, current, items);
  return `<div class="review-data-band">${recentPublicationChart(items)}${sourceHistoryChart(versions)}</div>
    ${reviewPublicationTable(items)}
    <section class="review-panel"><h3>Архив аналитики</h3>${compareReviews(topic, versions)}</section>`;
}

function wireReviewDashboard(topic, index) {
  for (const name of ['left', 'right']) {
    document.querySelector('#review-' + name)?.addEventListener('change', event => {
      const selection = reviewSelection.get(topic) ?? {};
      const container = event.target.closest('.review-panel');
      const offset = container.getBoundingClientRect().top;
      reviewSelection.set(topic, {...selection, [name]: Number(event.target.value)});
      showAnalysis(index);
      const replacement = document.querySelector('#review-' + name);
      window.scrollBy(0, replacement.closest('.review-panel').getBoundingClientRect().top - offset);
      replacement.focus({preventScroll:true});
    });
  }
}

