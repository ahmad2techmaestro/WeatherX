/** localStorage that never throws (private mode, blocked storage, quota). */

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);

    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the app keeps working without persistence */
  }
}

export function readString(key, fallback = null) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
