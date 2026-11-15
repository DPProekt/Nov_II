'use strict';

let reviewArchive = null;
let historicalReviews = null;
let reviewArchiveStarted = false;
let historicalUnavailable = false;
const reviewSelection = new Map();
const reviewTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Omsk', dateStyle: 'medium', timeStyle: 'short'
});
const reviewDayFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC', day: 'numeric', month: 'short'
});
const reviewCutoffFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'
});
const reviewYearMonthFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC', year: 'numeric', month: 'long'
});

async function fetchReviewData(file) {
  const response = await fetch(file, {cache: 'no-store'});
  if (!response.ok) throw new Error('Review archive unavailable');
  const data = await response.json();
  if (data.schema_version !== 1 || !Array.isArray(data.versions)) throw new Error('Invalid review archive');
  return data;
}

async function loadReviewArchive() {
  if (reviewArchiveStarted) return;
  reviewArchiveStarted = true;
  await Promise.all([
    fetchReviewData('analysis-history.json').then(data => { reviewArchive = data.versions; }).catch(() => { reviewArchive = []; }),
    fetchReviewData('historical-analysis.json').then(data => {
      historicalReviews = data.versions.flatMap(entry => {
        if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.as_of) || !Number.isFinite(Date.parse(entry.as_of))) return [];
        const refs = (entry.source_ids ?? []).map(id => data.sources?.[id]).filter(Boolean);
        return [{...entry, sources: refs.map(ref => ref.url),
          source_titles: Object.fromEntries(refs.map(ref => [ref.url, ref.title])),
          source_dates: Object.fromEntries(refs.map(ref => [ref.url, ref.date]))}];
      });
    }).catch(() => { historicalUnavailable = true; historicalReviews = []; })
  ]);
  if (location.hash.startsWith('#/analysis')) render();
}

const reviewKey = review => review.as_of ? 'cutoff:' + review.as_of : 'update:' + Date.parse(review.updated_at);
const reviewMoment = review => Date.parse(review.as_of ?? review.updated_at);
const reviewLabel = review => review.as_of
  ? 'На ' + reviewCutoffFormat.format(new Date(review.as_of))
  : reviewTimeFormat.format(new Date(review.updated_at)) + ' · Омск';
const sourceDateLabel = date => /^\d{4}-\d{2}$/.test(date ?? '')
  ? reviewYearMonthFormat.format(new Date(date + '-01'))
  : /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? reviewCutoffFormat.format(new Date(date)) : '';
const historyForTopic = topic => (historicalReviews ?? []).filter(review => review.topic === topic)
  .sort((a, b) => b.as_of.localeCompare(a.as_of));
const historyHref = (index, day) => '#/analysis/' + index + (day ? '/' + day : '');

function renderHistoricalNavigation(topic, index, cutoff) {
  if (historicalUnavailable) return '<p class="review-hint">Исторические срезы не загрузились. Попробуйте обновить страницу.</p>';
  if (!historicalReviews) return '<p class="review-hint">Загружаем историю темы…</p>';
  const snapshots = historyForTopic(topic);
  if (!snapshots.length) return '';
  const options = snapshots.map(review => `<option value="${review.as_of}" ${review.as_of === cutoff ? 'selected' : ''}>${escapeHtml(reviewLabel(review))}</option>`).join('');
  const jumps = snapshots.slice().reverse().map(review => `<a href="${historyHref(index, review.as_of)}" title="${escapeHtml(reviewLabel(review))}" ${review.as_of === cutoff ? 'aria-current="date"' : ''}>${review.as_of.endsWith('-01-01') ? review.as_of.slice(0, 4) : escapeHtml(reviewDayFormat.format(new Date(review.as_of)))}</a>`).join('');
  return `<section class="history-nav" aria-label="История темы">
    <div class="history-nav-head"><h3>История темы</h3>
      <label for="history-cutoff">Дата среза<select id="history-cutoff"><option value="">Текущий обзор</option>${options}</select></label></div>
    <p class="review-hint">Для среза берём источники, доступные к выбранной дате. Срезы составлены ретроспективно.</p>
    <div class="history-timeline" aria-label="Хронология срезов">${jumps}</div></section>`;
}

function reviewVersions(topic, current, items) {
  const versions = new Map();
  const saved = (reviewArchive ?? []).filter(review =>
    review && canonicalTopic(review.topic) === topic && Number.isFinite(Date.parse(review.updated_at)));
  for (const item of saved) versions.set(reviewKey(item), item);
  if (current) {
    const key = reviewKey(current);
    const recorded = versions.get(key);
    const dates = Object.create(null);
    for (const item of items) dates[item.date] = (dates[item.date] ?? 0) + 1;
    versions.set(key, {...current, publication_dates: recorded?.publication_dates ?? dates});
  }
  for (const item of historyForTopic(topic)) versions.set(reviewKey(item), item);
  return [...versions.values()].sort((a, b) => reviewMoment(b) - reviewMoment(a));
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
  const snapshots = versions.filter(review => review.as_of);
  const recent = snapshots.length ? snapshots.slice().reverse() : versions.slice(0, 5);
  const maximum = Math.max(1, ...recent.map(versionSourceCount));
  return `<figure class="review-chart"><figcaption><strong>Источники в обзорах</strong><span>${snapshots.length ? 'Число источников в каждом историческом срезе' : 'Число источников в каждой из последних версий'}</span></figcaption>
    ${recent.map(review => {
      const count = versionSourceCount(review);
      const label = reviewLabel(review);
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

function compareReviews(topic, versions, selectedSnapshot) {
  if (!reviewArchive || !historicalReviews) return '<p class="review-hint">Загружаем архив версий…</p>';
  if (versions.length < 2) return '<p class="review-hint">Сохранена одна версия. Сравнение станет доступно после следующего пересмотра темы.</p>';

  const previousSelection = reviewSelection.get(topic) ?? {};
  const older = selectedSnapshot && versions.slice(versions.indexOf(selectedSnapshot) + 1).find(review => review.as_of);
  const updated = versions.filter(review => !review.as_of);
  const [left, right] = [
    versions.find(review => reviewKey(review) === previousSelection.left) ?? older ?? selectedSnapshot ?? updated[1] ?? versions.find(review => review.as_of) ?? versions[1],
    versions.find(review => reviewKey(review) === previousSelection.right) ?? (older ? selectedSnapshot : updated[0] ?? versions[0])
  ];
  const options = selected => [
    ['Срезы на дату', versions.filter(review => review.as_of)],
    ['Обновления обзоров', updated]
  ].filter(([, entries]) => entries.length).map(([label, entries]) =>
    `<optgroup label="${label}">${entries.map(review =>
      `<option value="${reviewKey(review)}" ${review === selected ? 'selected' : ''}>${escapeHtml(reviewLabel(review))}</option>`).join('')}</optgroup>`).join('');
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
    const published = sourceDateLabel(review.source_dates?.[url]);
    return `<li><a class="read-link" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(review.source_titles?.[url] || parsed.hostname)} ↗</a>${published ? ` <small class="source-date">· ${escapeHtml(published)}</small>` : ''}</li>`;
  }).filter(Boolean).join('');
  const publicationCount = review => escapeHtml(review.publication_dates
    ? Object.values(review.publication_dates).filter(Number.isSafeInteger).reduce((sum, n) => sum + n, 0)
    : '—');
  const rows = [
    ...(!left.as_of || !right.as_of ? [['Публикаций в ленте', publicationCount(left), publicationCount(right)]] : []),
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
    <th scope="col">${escapeHtml(reviewLabel(left))}</th><th scope="col">${escapeHtml(reviewLabel(right))}</th></tr></thead>
    <tbody>${rows.map(([label, a, b]) => `<tr><th scope="row">${label}</th><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderReviewDashboard(topic, current, snapshot) {
  const items = sharedNews.filter(validNews).filter(item => canonicalTopic(item.topic) === topic)
    .sort((a, b) => b.date.localeCompare(a.date));
  const versions = reviewVersions(topic, current, items);
  return `<section class="review-panel"><h3>Сравнение аналитики</h3>${compareReviews(topic, versions, snapshot)}</section>
    <div class="review-data-band">${sourceHistoryChart(versions)}${recentPublicationChart(items)}</div>
    ${reviewPublicationTable(items)}`;
}

function wireReviewDashboard(topic, index, cutoff) {
  document.querySelector('#history-cutoff')?.addEventListener('change', ({target}) => {
    reviewSelection.delete(topic);
    location.hash = historyHref(index, target.value);
  });
  document.querySelectorAll('.history-timeline a').forEach(link => link.addEventListener('click', () => reviewSelection.delete(topic)));
  for (const name of ['left', 'right']) {
    document.querySelector('#review-' + name)?.addEventListener('change', event => {
      const selection = reviewSelection.get(topic) ?? {};
      const container = event.target.closest('.review-panel');
      const offset = container.getBoundingClientRect().top;
      reviewSelection.set(topic, {...selection, [name]: event.target.value});
      showAnalysis(index, cutoff);
      const replacement = document.querySelector('#review-' + name);
      if (!replacement) return;
      window.scrollBy(0, replacement.closest('.review-panel').getBoundingClientRect().top - offset);
      replacement.focus({preventScroll:true});
    });
  }
}
