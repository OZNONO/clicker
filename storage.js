(function (global) {
  "use strict";

  const STORAGE_KEY = "lutie-like-clicker-v01";

  class LocalStorageAdapter {
    constructor(storage, key = STORAGE_KEY) {
      this.storage = storage;
      this.key = key;
    }

    saveGame(state) {
      const payload = { ...state, updatedAt: new Date().toISOString() };
      this.storage.setItem(this.key, JSON.stringify(payload));
      return payload;
    }

    loadGame() {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return null;
      }
    }

    resetGame() {
      this.storage.removeItem(this.key);
    }
  }

  global.GameStorage = Object.freeze({
    LocalStorageAdapter,
    createDefault: () => new LocalStorageAdapter(global.localStorage),
    STORAGE_KEY
  });
})(window);
