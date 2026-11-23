/* Dashboard Cuaca Aziz - Open-Meteo use on this PC.
   Open-Meteo is free for about 10,000 calls a day for one internet address (every device at home counts together).
   This counts this PC's calls (the phones on the PC use the PC's copy) and says how often model data may be fetched:
   the chosen minutes (3) while under half of the budget, then 10, 30 and 60 minutes; an hour's pause after HTTP 429. */
'use strict';
const core = require('../www/assets/js/core');

const BUDGET = 6000;
let day = '', n = 0, blockedUntil = 0;
function today(now) { return core.dateKey(now || Date.now()); }
function count(k, now) { const d = today(now); if (d !== day) { day = d; n = 0; } n += k || 1; }
function isOm(url) { return /^https:\/\/[a-z-]*\.?open-meteo\.com\//.test(String(url || '')) || /^https:\/\/(api|marine-api|ensemble-api|flood-api)\.open-meteo\.com\//.test(String(url || '')); }
/* fetchJson(url, ms) that counts Open-Meteo calls and notes a refusal */
function wrap(fetchJson) {
  return async (url, ms) => {
    if (!isOm(url)) return fetchJson(url, ms);
    if (Date.now() < blockedUntil) throw new Error('Open-Meteo: had harian, cuba semula ' + new Date(blockedUntil).toISOString().slice(11, 16) + ' UTC');
    count(/marine-api/.test(url) ? 1.2 : 1);
    try { return await fetchJson(url, ms); } catch (e) {
      if (/HTTP 429/.test(e && e.message)) blockedUntil = Date.now() + 3600000;
      throw e;
    }
  };
}
/* hidden = the window is not on screen (kept in the tray): 30 minutes at least */
function every(s, now, hidden) {
  const ms = core.omEvery(day === today(now) ? n : 0, BUDGET, s && s.omEveryMin, blockedUntil, now || Date.now());
  return hidden ? Math.max(ms, 30 * 60000) : ms;
}
function info(now) { return { day: today(now), calls: day === today(now) ? Math.round(n) : 0, budget: BUDGET, blockedUntil }; }
function reset() { day = ''; n = 0; blockedUntil = 0; }
module.exports = { BUDGET, wrap, every, info, count, reset, isOm };
