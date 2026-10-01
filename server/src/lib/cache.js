import { config } from '../config.js';

// Simple in-memory cache for the public API, invalidated per site on every admin change.
// For several server instances, swap this for Redis.
const store = new Map(); // siteId -> Map(key -> { exp, body })

export function getCached(siteId, key) {
  if (!config.publicCacheTtl) return null;
  const hit = store.get(siteId)?.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    store.get(siteId).delete(key);
    return null;
  }
  return hit.body;
}

export function setCached(siteId, key, body) {
  if (!config.publicCacheTtl) return;
  if (!store.has(siteId)) store.set(siteId, new Map());
  const bucket = store.get(siteId);
  if (bucket.size > 2000) bucket.clear();
  bucket.set(key, { exp: Date.now() + config.publicCacheTtl * 1000, body });
}

export function invalidateSite(siteId) {
  store.delete(siteId);
}

export function invalidateAll() {
  store.clear();
}
