'use strict';
/* Filter lists for the ad blocker in the site webviews.
   Ghostery's mirror on GitHub: EasyList + uBlock Origin filters (ads, pop-ups, empty ad boxes) and both cookie-notice
   lists (EasyList Cookie, uBlock Cookie Notices). No tracking/privacy lists: they break more sites than they help here. */
/* Straight from the list authors on GitHub (updated daily); Ghostery's mirror only for what exists nowhere else. */
const GH = 'https://raw.githubusercontent.com/';
const UBO = GH + 'uBlockOrigin/uAssets/master/filters/';
const GHOSTERY = GH + 'ghostery/adblocker/master/packages/adblocker/assets/';
const LISTS = [
  GH + 'easylist/easylist/gh-pages/easylist.txt',
  GHOSTERY + 'peter-lowe/serverlist.txt',
  ...['filters', 'filters-2020', 'filters-2021', 'filters-2022', 'filters-2023', 'filters-2024', 'filters-2025', 'filters-2026',
    'badware', 'quick-fixes', 'resource-abuse', 'unbreak', 'annoyances-cookies'].map(n => UBO + n + '.txt'),
  GHOSTERY + 'easylist/easylist-cookie.txt'
];
/* uBlock "scriptlets" (small scripts some filters need), in the format this engine reads */
const RESOURCES = GHOSTERY + 'ublock-origin/resources.json';
const CONFIG = {
  loadNetworkFilters: true, loadCosmeticFilters: true, loadGenericCosmeticsFilters: true,
  loadExtendedSelectors: true, loadPreprocessors: true, loadCSPFilters: true, loadExceptionFilters: true,
  enableMutationObserver: true, enableCompression: true, guessRequestTypeFromUrl: true
};
module.exports = { LISTS, RESOURCES, CONFIG };
