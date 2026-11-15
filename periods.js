'use strict';

// Asia/Omsk is UTC+6 for the dates used by the news archive.
const OMSK_OFFSET = 6 * 60 * 60 * 1000;
const PERIOD_DAY = 24 * 60 * 60 * 1000;

function newsPeriod(view, page, anchor) {
  const offset = Math.max(0, Math.trunc(Number(page) || 0));
  if (view === 'six') {
    const end = anchor - offset * 6 * 60 * 60 * 1000;
    return { start: end - 6 * 60 * 60 * 1000, end };
  }
  const local = new Date(anchor + OMSK_OFFSET);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  if (view === 'week') {
    const midnight = Date.UTC(year, month, local.getUTCDate()) - OMSK_OFFSET;
    const sinceMonday = (local.getUTCDay() + 6) % 7;
    const start = midnight - (sinceMonday + offset * 7) * PERIOD_DAY;
    return { start, end: start + 7 * PERIOD_DAY };
  }
  if (view === 'month') {
    return { start: Date.UTC(year, month - offset, 1) - OMSK_OFFSET, end: Date.UTC(year, month - offset + 1, 1) - OMSK_OFFSET };
  }
  if (view === 'year') {
    return { start: Date.UTC(year - offset, 0, 1) - OMSK_OFFSET, end: Date.UTC(year - offset + 1, 0, 1) - OMSK_OFFSET };
  }
  throw new Error('Unknown news period');
}

function omskDate(ms) {
  return new Date(ms + OMSK_OFFSET).toISOString().slice(0, 10);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { newsPeriod, omskDate };

