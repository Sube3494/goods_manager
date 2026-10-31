/** Keep local map data separate when accounts share the same browser. */
export function createLocationStorage(userId: string) {
  const prefix = `store-location:user:${encodeURIComponent(userId)}:`;
  const keyFor = (key: string) => prefix + key.replace(/^store-location:/, "");
  return {
    getItem: (key: string) => window.localStorage.getItem(keyFor(key)),
    setItem: (key: string, value: string) => window.localStorage.setItem(keyFor(key), value),
    removeItem: (key: string) => window.localStorage.removeItem(keyFor(key)),
  };
}
