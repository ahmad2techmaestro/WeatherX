import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { reversePlace, searchPlaces } from "../lib/api";
import { coordLabel, DEFAULT_PLACE, distanceM, placeKey, slimPlace } from "../lib/place";
import { readJson, writeJson } from "../lib/storage";

const PLACE_KEY = "wx.place";
const RECENT_KEY = "wx.recents";
const FAV_KEY = "wx.favourites";
const FOLLOW_KEY = "wx.follow";
const SOURCE_KEY = "wx.placeSource";
const MAX_RECENTS = 8;
// A live position only replaces the shown place after moving this far, so GPS jitter never reloads the weather.
const MOVE_THRESHOLD_M = 120;
const RENAME_THRESHOLD_M = 400;

const PlacesContext = createContext(null);

const fromServer = (doc) =>
  slimPlace({
    name: doc.name,
    state: doc.state,
    country: doc.country,
    countryCode: doc.country,
    latitude: doc.latitude,
    longitude: doc.longitude,
    kind: "locality",
  });

export function PlacesProvider({ children }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { serverPrefs } = useSettings();

  const [place, setPlaceState] = useState(() => readJson(PLACE_KEY, null) || DEFAULT_PLACE);
  const [recents, setRecents] = useState(() => readJson(RECENT_KEY, []));
  const [guestFavourites, setGuestFavourites] = useState(() => readJson(FAV_KEY, []));
  const [serverFavourites, setServerFavourites] = useState([]);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const hadStoredPlace = useRef(Boolean(readJson(PLACE_KEY, null)));
  const [follow, setFollow] = useState(() => readJson(FOLLOW_KEY, true) !== false);
  const [placeSource, setPlaceSource] = useState(() => readJson(SOURCE_KEY, "manual"));
  const [gps, setGps] = useState(() => (readJson(FOLLOW_KEY, true) !== false && typeof navigator !== "undefined" && navigator.geolocation ? "locating" : "idle")); // idle | locating | active | denied | unavailable | error
  const [fix, setFix] = useState(null);
  const placeRef = useRef(place);
  const appliedRef = useRef(null);
  const namedRef = useRef(null);
  const nameSeq = useRef(0);
  const watchId = useRef(null);

  const favourites = isAuthenticated ? serverFavourites : guestFavourites;

  placeRef.current = place;

  useEffect(() => writeJson(PLACE_KEY, place), [place]);
  useEffect(() => writeJson(FOLLOW_KEY, follow), [follow]);
  useEffect(() => writeJson(SOURCE_KEY, placeSource), [placeSource]);
  useEffect(() => writeJson(RECENT_KEY, recents), [recents]);
  useEffect(() => writeJson(FAV_KEY, guestFavourites), [guestFavourites]);

  // `auto` marks programmatic changes (live location, saved default) that must not pause live following.
  const setPlace = useCallback((next, { remember = true, auto = false } = {}) => {
    const slim = slimPlace(next);

    setPlaceState(slim);
    setLocateError("");

    if (!auto) {
      hadStoredPlace.current = true;
      setFollow(false);
      setPlaceSource("manual");
    }

    if (remember) setRecents((current) => [slim, ...current.filter((p) => placeKey(p) !== placeKey(slim))].slice(0, MAX_RECENTS));
  }, []);

  const clearRecents = useCallback(() => setRecents([]), []);

  /* ── favourites: server when signed in, this browser otherwise ── */

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setServerFavourites([]);

      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await axios.get("/api/locations");
        let list = data?.data || [];

        // Carry favourites saved as a guest over to the account once.
        const guest = readJson(FAV_KEY, []);

        if (guest.length) {
          const known = new Set(list.map((l) => `${Number(l.latitude).toFixed(2)},${Number(l.longitude).toFixed(2)}`));

          await Promise.all(
            guest
              .filter((g) => !known.has(placeKey(g)))
              .map((g) => axios.post("/api/locations", { name: g.name, state: g.state, country: g.countryCode || g.country || "IN", latitude: g.latitude, longitude: g.longitude }).catch(() => null))
          );

          const refreshed = await axios.get("/api/locations");

          list = refreshed.data?.data || list;
          setGuestFavourites([]);
        }

        if (!cancelled) setServerFavourites(list.map((doc) => ({ ...fromServer(doc), _id: doc._id })));
      } catch {
        /* favourites stay empty until the next load */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  const isFavourite = useCallback((p) => favourites.some((f) => placeKey(f) === placeKey(p)), [favourites]);

  const addFavourite = useCallback(
    async (p) => {
      const slim = slimPlace(p);

      if (!isAuthenticated) {
        setGuestFavourites((list) => (list.some((f) => placeKey(f) === placeKey(slim)) ? list : [slim, ...list]));

        return;
      }

      try {
        const { data } = await axios.post("/api/locations", { name: slim.name, state: slim.state, country: slim.countryCode || slim.country || "IN", latitude: slim.latitude, longitude: slim.longitude });

        setServerFavourites((list) => [{ ...slim, _id: data.data._id }, ...list]);
      } catch (error) {
        if (error?.response?.status === 409 && error.response.data?.data) {
          setServerFavourites((list) => (list.some((f) => placeKey(f) === placeKey(slim)) ? list : [{ ...slim, _id: error.response.data.data._id }, ...list]));

          return;
        }

        throw error;
      }
    },
    [isAuthenticated]
  );

  const removeFavourite = useCallback(
    async (p) => {
      if (!isAuthenticated) {
        setGuestFavourites((list) => list.filter((f) => placeKey(f) !== placeKey(p)));

        return;
      }

      const match = serverFavourites.find((f) => placeKey(f) === placeKey(p));

      if (!match?._id) return;

      await axios.delete(`/api/locations/${match._id}`);
      setServerFavourites((list) => list.filter((f) => f._id !== match._id));
    },
    [isAuthenticated, serverFavourites]
  );

  const toggleFavourite = useCallback((p) => (isFavourite(p) ? removeFavourite(p) : addFavourite(p)), [isFavourite, addFavourite, removeFavourite]);

  /* ── "use my location" ── */

  /* Live location: follow the device's GPS so the app always opens on where you are. */

  const applyFix = useCallback((coords, { force = false } = {}) => {
    const { latitude, longitude, accuracy } = coords;
    const point = { latitude, longitude };

    setFix({ latitude, longitude, accuracy: Math.round(accuracy ?? 0), at: Date.now() });

    const prev = appliedRef.current;

    if (prev && !force && distanceM(prev, point) < MOVE_THRESHOLD_M) return;

    appliedRef.current = point;
    hadStoredPlace.current = true;

    const keepName = namedRef.current && distanceM(namedRef.current.point, point) < RENAME_THRESHOLD_M ? namedRef.current.place : null;
    const base = keepName || { name: "My location", subtitle: coordLabel(latitude, longitude), kind: "locality", state: "", country: "", countryCode: "" };

    setPlaceState(slimPlace({ ...base, latitude, longitude }));
    setPlaceSource("gps");
    setLocateError("");

    if (keepName) return;

    const seq = (nameSeq.current += 1);

    reversePlace(latitude, longitude)
      .then((named) => {
        if (!named || seq !== nameSeq.current) return;

        namedRef.current = { point, place: { ...named, kind: "locality" } };
        setPlaceState(slimPlace({ ...named, kind: "locality", latitude, longitude }));
      })
      .catch(() => {});
  }, []);

  const GPS_ERRORS = {
    1: "Location permission is blocked. Allow it in your browser's site settings to see weather for exactly where you are.",
    2: "Your position couldn't be determined right now.",
    3: "Finding your location took too long.",
  };

  useEffect(() => {
    if (authLoading || !isAuthenticated || !follow) return undefined;

    if (!navigator.geolocation) {
      setGps("unavailable");
      setLocateError("This browser doesn't support location access.");

      return undefined;
    }

    setGps("locating");
    appliedRef.current = null;

    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setGps("active");
        applyFix(coords);
      },
      (error) => {
        setGps(error.code === 1 ? "denied" : "error");

        if (error.code === 1) setLocateError(GPS_ERRORS[1]);
        // Timeouts and transient errors are retried by the watch itself; keep showing the last place.
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 25000 }
    );

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);

      watchId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, follow, applyFix]);

  /** Switch back to following the device location (the crosshair button, "Back to my location"). */
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateError("Your browser doesn't support location access.");

      return Promise.resolve(null);
    }

    setLocating(true);
    setLocateError("");
    appliedRef.current = null;
    setFollow(true);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          applyFix(coords, { force: true });
          setGps("active");
          setLocating(false);
          resolve({ latitude: coords.latitude, longitude: coords.longitude });
        },
        (error) => {
          setLocating(false);
          setGps(error.code === 1 ? "denied" : "error");
          setLocateError(GPS_ERRORS[error.code] || GPS_ERRORS[2]);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }, [applyFix]);

  const pauseFollow = useCallback(() => setFollow(false), []);

  // First visit after signing in on a new device: open the user's saved default location.
  useEffect(() => {
    const name = serverPrefs?.weather?.defaultLocation;

    if (!isAuthenticated || !name || hadStoredPlace.current) return;
    // While the device location is being followed it decides the place; the saved default is only a fallback.
    if (follow && gps !== "denied" && gps !== "unavailable") return;

    hadStoredPlace.current = true;

    searchPlaces(name)
      .then((results) => results[0] && setPlace(results[0], { remember: false, auto: true }))
      .catch(() => {});
  }, [isAuthenticated, serverPrefs, setPlace, follow, gps]);

  const value = useMemo(
    () => ({ place, setPlace, recents, clearRecents, favourites, isFavourite, addFavourite, removeFavourite, toggleFavourite, locate, locating, locateError, clearLocateError: () => setLocateError(""), follow, pauseFollow, gps, fix, placeSource }),
    [place, setPlace, recents, clearRecents, favourites, isFavourite, addFavourite, removeFavourite, toggleFavourite, locate, locating, locateError, follow, pauseFollow, gps, fix, placeSource]
  );

  return <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>;
}

export function usePlaces() {
  const ctx = useContext(PlacesContext);

  if (!ctx) throw new Error("usePlaces must be used within PlacesProvider");

  return ctx;
}
