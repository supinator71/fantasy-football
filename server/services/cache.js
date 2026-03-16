const cache = new Map();

module.exports = {
  get(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry;
  },

  set(key, value, ttlMs) {
    cache.set(key, {
      value,
      cachedAt: new Date().toISOString(),
      expiresAt: Date.now() + ttlMs
    });
  },

  clear(keyPrefix) {
    if (!keyPrefix) {
      cache.clear();
      return;
    }
    for (const key of cache.keys()) {
      if (key.includes(keyPrefix)) cache.delete(key);
    }
  },

  stats() {
    const keys = [...cache.keys()];
    return {
      entries: keys.length,
      keys: keys.slice(0, 30)
    };
  }
};
