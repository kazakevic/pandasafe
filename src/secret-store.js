// The API key lives in the extension's own IndexedDB rather than in
// chrome.storage.local, which content scripts on youtube.com can read. Only
// extension pages and the service worker share this origin, so only the
// popup and background load this file.

const openSecrets = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("pandasafe-secrets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("secrets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const secretRequest = async (mode, run) => {
  const db = await openSecrets();
  try {
    return await new Promise((resolve, reject) => {
      const request = run(db.transaction("secrets", mode).objectStore("secrets"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

const getApiKey = async () => (await secretRequest("readonly", (store) => store.get("apiKey"))) ?? "";

// An empty key removes it.
const setApiKey = (key) =>
  secretRequest("readwrite", (store) => (key ? store.put(key, "apiKey") : store.delete("apiKey")));
