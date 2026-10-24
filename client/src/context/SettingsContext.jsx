import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { useAuth } from "./AuthContext";
import { readJson, writeJson } from "../lib/storage";

const KEY = "wx.settings";
const DEFAULTS = { theme: "system", temperature: "celsius", wind: "kmh" };

const SettingsContext = createContext(null);

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function SettingsProvider({ children }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...readJson(KEY, {}) }));
  const [serverPrefs, setServerPrefs] = useState(null);
  const [system, setSystem] = useState(() => systemTheme());
  const saveTimer = useRef(null);
  const loadedFromServer = useRef(false);

  const resolvedTheme = settings.theme === "system" ? system : settings.theme;

  // Follow the OS colour scheme while the user is on "system".
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");

    if (!query) return undefined;

    const onChange = () => setSystem(query.matches ? "dark" : "light");

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? "#0c0f13" : "#f3efe7");
  }, [resolvedTheme]);

  useEffect(() => {
    writeJson(KEY, settings);
  }, [settings]);

  // Signed-in users: server preferences win on load, and later changes are saved back.
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      loadedFromServer.current = false;
      setServerPrefs(null);

      return;
    }

    let cancelled = false;

    axios
      .get("/api/preferences")
      .then(({ data }) => {
        const prefs = data?.data;

        if (cancelled || !prefs) return;

        setServerPrefs(prefs);
        setSettings((current) => ({
          ...current,
          // A server theme of "system" is the untouched default, so it must not wipe an explicit local choice.
          theme: prefs.appearance?.theme && prefs.appearance.theme !== "system" ? prefs.appearance.theme : current.theme,
          temperature: prefs.weather?.temperatureUnit ?? current.temperature,
          wind: prefs.weather?.windUnit ?? current.wind,
        }));
        loadedFromServer.current = true;
      })
      .catch(() => {
        /* preferences are a convenience — the app works with local settings */
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  const persist = useCallback(
    (next) => {
      if (!isAuthenticated || !loadedFromServer.current) return;

      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        axios
          .put("/api/preferences", { weather: { temperatureUnit: next.temperature, windUnit: next.wind }, appearance: { theme: next.theme } })
          .catch(() => {});
      }, 600);
    },
    [isAuthenticated]
  );

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const update = useCallback(
    (patch) => {
      setSettings((current) => {
        const next = { ...current, ...patch };

        persist(next);

        return next;
      });
    },
    [persist]
  );

  const value = useMemo(
    () => ({
      theme: settings.theme,
      resolvedTheme,
      units: { temperature: settings.temperature, wind: settings.wind },
      serverPrefs,
      setTheme: (theme) => update({ theme }),
      setTemperature: (temperature) => update({ temperature }),
      setWind: (wind) => update({ wind }),
      toggleTheme: () => update({ theme: resolvedTheme === "dark" ? "light" : "dark" }),
      setServerPrefs,
    }),
    [settings, resolvedTheme, serverPrefs, update]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);

  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");

  return ctx;
}
