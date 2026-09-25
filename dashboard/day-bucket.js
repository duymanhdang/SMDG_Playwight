/**
 * day-bucket.js — timezone-aware "YYYY-MM-DD" day-bucketing helper.
 *
 * §3.7 fix: analytics endpoints used to bucket by
 * `new Date(ts).toISOString().slice(0, 10)`, which buckets in UTC. For a
 * UTC+7 team, a run started at 06:00 ICT (= 23:00 UTC the previous day)
 * would land in yesterday's column on the trend/sparkline charts.
 *
 * `HUB_TZ` env var overrides the default timezone.
 */

function makeDayKeyFn(timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (ts) => fmt.format(new Date(ts));
}

const DEFAULT_TZ = process.env.HUB_TZ || 'Asia/Ho_Chi_Minh';
const dayKey = makeDayKeyFn(DEFAULT_TZ);

module.exports = { dayKey, makeDayKeyFn, DEFAULT_TZ };
