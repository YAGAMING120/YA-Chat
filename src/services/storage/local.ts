/**
 * Thin typed wrappers over localStorage.
 * Key names are identical to the legacy app so existing user data keeps working.
 */

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

export function getFromStorage<T>(key: string, defaultValue: T): T;
export function getFromStorage<T>(key: string): T | null;
export function getFromStorage<T>(key: string, defaultValue?: T): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : (defaultValue ?? null);
  } catch (e) {
    console.error('Failed to parse from localStorage', e);
    return defaultValue ?? null;
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Failed to remove from localStorage', e);
  }
}

export function clearStorage(): void {
  try {
    localStorage.clear();
  } catch (e) {
    console.error('Failed to clear localStorage', e);
  }
}
