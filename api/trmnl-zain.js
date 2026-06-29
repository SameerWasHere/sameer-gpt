// TRMNL e-ink display feed for Baby Zain.
//
// Computes Zain's current age and pushes it to a TRMNL custom-plugin webhook so
// an 800x480 e-ink display always shows his live stats. Callable via GET so a
// Vercel cron (see vercel.json) or a manual hit triggers the push.
//
// GET /api/trmnl-zain -> pushes to TRMNL, returns JSON of what was sent.

// Zain was born June 7, 2026 at 4:49 PM in San Francisco. June is Pacific
// Daylight Time (UTC-7), so that instant is 23:49 UTC on June 7, 2026.
const BIRTH = new Date('2026-06-07T16:49:00-07:00');

// His birth *calendar date* in San Francisco. Age is counted in whole calendar
// days in SF, so "days old" ticks over at SF midnight rather than at the
// 24-hour mark from his 4:49 PM birth time (which would lag by part of a day).
const BIRTH_SF = { year: 2026, month: 6, day: 7 };

const TRMNL_WEBHOOK =
  process.env.TRMNL_ZAIN_WEBHOOK ||
  'https://trmnl.com/api/custom_plugins/bb5ee47d-51e2-40e9-ac87-0f38e08cc7c5';

const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar date (Y/M/D) of an instant, as seen in San Francisco.
function sfDateParts(date) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return { year: y, month: m, day: d };
}

// Whole days from the birth date to `now`, both as SF calendar dates.
function daysOldSF(now) {
  const t = sfDateParts(now);
  const birthUTC = Date.UTC(BIRTH_SF.year, BIRTH_SF.month - 1, BIRTH_SF.day);
  const nowUTC = Date.UTC(t.year, t.month - 1, t.day);
  return Math.max(0, Math.round((nowUTC - birthUTC) / DAY_MS));
}

function addUTCMonths(date, n) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

// Completed calendar months between two dates.
function completedMonths(from, to) {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;

// The next age milestone after `now`: weekly through 4 weeks, then monthly
// through a year. Returns the label and whole days until it lands.
function nextMilestone(now) {
  const candidates = [];
  for (let w = 1; w <= 4; w++) {
    candidates.push({ label: plural(w, 'week'), date: new Date(BIRTH.getTime() + w * 7 * DAY_MS) });
  }
  for (let m = 1; m <= 12; m++) {
    candidates.push({ label: m === 12 ? '1 year' : plural(m, 'month'), date: addUTCMonths(BIRTH, m) });
  }
  const upcoming = candidates
    .filter((c) => c.date.getTime() > now.getTime())
    .sort((a, b) => a.date - b.date)[0];

  if (!upcoming) return { label: null, days: null };
  const days = Math.max(0, Math.ceil((upcoming.date.getTime() - now.getTime()) / DAY_MS));
  return { label: upcoming.label, days };
}

// Pick the first band whose `maxDays` is >= the baby's age (Infinity = open-ended).
function pickBand(days, bands) {
  return bands.find((b) => days <= b.maxDays) || bands[bands.length - 1];
}

// Typical breast milk per feeding (oz), by age.
function feedingRange(days) {
  const band = pickBand(days, [
    { maxDays: 3, min: 0.5, max: 1 },
    { maxDays: 7, min: 1, max: 2 },
    { maxDays: 14, min: 1.5, max: 2.5 },
    { maxDays: 28, min: 2, max: 3 },
    { maxDays: 60, min: 3, max: 4 },
    { maxDays: 90, min: 4, max: 5 },
    { maxDays: 180, min: 4, max: 6 },
    { maxDays: Infinity, min: 6, max: 8 },
  ]);
  return { min: band.min, max: band.max };
}

// Typical tummy time per day (minutes), by age.
function tummyRange(days) {
  const band = pickBand(days, [
    { maxDays: 14, min: 3, max: 10 },
    { maxDays: 28, min: 10, max: 20 },
    { maxDays: 60, min: 15, max: 30 },
    { maxDays: 90, min: 30, max: 60 },
    { maxDays: 120, min: 40, max: 60 },
    { maxDays: Infinity, min: 60, max: 90 },
  ]);
  return { min: band.min, max: band.max };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date();
  const days_old = daysOldSF(now);
  const weeks_old = Math.floor(days_old / 7);
  const months_old = completedMonths(BIRTH, now);
  const milestone = nextMilestone(now);
  const feeding = feedingRange(days_old);
  const tummy = tummyRange(days_old);

  const merge_variables = {
    name: 'Zain Francisco Bhutani',
    days_old,
    weeks_old,
    months_old,
    birth_date: 'June 7, 2026',
    birth_city: 'San Francisco',
    next_milestone: milestone.label,
    next_milestone_days: milestone.days,
    feeding_oz_min: String(feeding.min),
    feeding_oz_max: String(feeding.max),
    feeding_ml_min: String(Math.round(feeding.min * 30)),
    feeding_ml_max: String(Math.round(feeding.max * 30)),
    tummy_min: String(tummy.min),
    tummy_max: String(tummy.max),
  };

  try {
    const resp = await fetch(TRMNL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge_variables }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(502).json({
        ok: false,
        error: `TRMNL responded ${resp.status}`,
        detail: text.slice(0, 500),
        sent: merge_variables,
      });
    }

    return res.status(200).json({ ok: true, pushedTo: 'TRMNL', sent: merge_variables });
  } catch (error) {
    console.error('TRMNL push failed:', error.message);
    return res.status(500).json({ ok: false, error: error.message, sent: merge_variables });
  }
}
