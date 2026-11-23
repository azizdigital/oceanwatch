'use strict';
/* Builds a new ad blocker engine from downloaded list texts, away from the main thread (parsing takes a few seconds). */
const { parentPort, workerData } = require('worker_threads');
const { FiltersEngine } = require('@ghostery/adblocker');
const { CONFIG } = require('./adblock-lists');

try {
  const engine = FiltersEngine.parse(workerData.lists.join('\n'), CONFIG);
  if (workerData.resources) engine.updateResources(workerData.resources, '' + workerData.resources.length);
  const buf = engine.serialize();
  parentPort.postMessage({ ok: true, buf }, [buf.buffer]);
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message || e) });
}
