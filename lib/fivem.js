'use strict';
// Live server status from the FiveM server's own HTTP endpoints.
// The host comes ONLY from server-side config (never from user input), so there is no SSRF surface.
const config = require('./config');

const TTL_MS = 15 * 1000;
let cache = { at: 0, value: { state: 'unknown', players: 0, max: config.server.maxPlayers } };
let inflight = null;

function validHost(h) {
  return /^[A-Za-z0-9.\-]{1,253}(:\d{2,5})?$/.test(h);
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 2_000_000) throw new Error('response too large');
  return JSON.parse(text);
}

async function refresh() {
  const host = config.server.statusHost;
  if (!host || !validHost(host)) return { state: 'unknown', players: 0, max: config.server.maxPlayers };
  try {
    const [players, info] = await Promise.all([
      fetchJson(`http://${host}/players.json`),
      fetchJson(`http://${host}/info.json`).catch(() => null),
    ]);
    const max = Number(info && info.vars && info.vars.sv_maxClients) || config.server.maxPlayers;
    return { state: 'online', players: Array.isArray(players) ? players.length : 0, max };
  } catch (_) {
    return { state: 'offline', players: 0, max: config.server.maxPlayers };
  }
}

async function getStatus() {
  const now = Date.now();
  if (now - cache.at < TTL_MS) return cache.value;
  if (!inflight) {
    inflight = refresh()
      .then((v) => {
        cache = { at: Date.now(), value: v };
        return v;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

module.exports = { getStatus };
