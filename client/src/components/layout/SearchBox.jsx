import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, Crosshair, Globe, Loader2, MapPin, Search, Star, X } from "lucide-react";

import useDebounce from "../../hooks/useDebounce";
import { errorMessage, isCanceled, searchPlaces } from "../../lib/api";
import { POPULAR_PLACES } from "../../lib/place";
import { KIND_LABEL } from "../../lib/weather";
import { usePlaces } from "../../context/PlacesContext";

const WEATHER_ROUTES = ["/", "/forecast", "/map", "/compare"];

/**
 * Place search with suggestions for cities, towns, villages, districts and states
 * across India (and, on request, the world). Implements the ARIA combobox pattern:
 * arrow keys move, Enter selects, Escape closes.
 */
export default function SearchBox({ variant = "header", onPick, onSelect, placeholder = "Search city, village, district or state", autoFocus = false, collapsible = false }) {
  const id = useId();
  const listId = `${id}-list`;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { setPlace, favourites, recents, locate, locating, locateError, clearLocateError } = usePlaces();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("india");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(!collapsible);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const debounced = useDebounce(query.trim(), 260);
  const searching = debounced.length >= 2;

  // Fetch suggestions for the debounced query; a newer query cancels the older one.
  useEffect(() => {
    if (!searching) {
      setResults([]);
      setError("");
      setLoading(false);

      return undefined;
    }

    const controller = new AbortController();

    setLoading(true);
    setError("");

    searchPlaces(debounced, { scope, signal: controller.signal })
      .then((data) => {
        setResults(data);
        setActive(data.length ? 0 : -1);
        setLoading(false);
      })
      .catch((err) => {
        if (isCanceled(err)) return;

        setResults([]);
        setError(errorMessage(err, "Search is unavailable right now."));
        setLoading(false);
      });

    return () => controller.abort();
  }, [debounced, scope, searching]);

  // Close on outside click.
  useEffect(() => {
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        if (collapsible && !query) setExpanded(false);
      }
    };

    document.addEventListener("pointerdown", onDown);

    return () => document.removeEventListener("pointerdown", onDown);
  }, [collapsible, query]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const finish = useCallback(
    (place) => {
      // onSelect: the caller handles the choice itself (e.g. adding a place to Compare).
      if (onSelect) onSelect(place);
      else setPlace(place);

      setQuery("");
      setOpen(false);
      setResults([]);
      if (collapsible) setExpanded(false);
      inputRef.current?.blur();
      onPick?.(place);

      if (!onSelect && !WEATHER_ROUTES.includes(pathname)) navigate("/");
    },
    [setPlace, onPick, onSelect, pathname, navigate, collapsible]
  );

  const handleLocate = async () => {
    clearLocateError();

    const place = await locate();

    if (place) {
      setOpen(false);
      onPick?.(place);
      if (!WEATHER_ROUTES.includes(pathname)) navigate("/");
    }
  };

  // The list shown when the box is empty: favourites, then recents, then popular places.
  const idle = [
    ...favourites.slice(0, 4).map((p) => ({ ...p, _group: "Favourites", _icon: "fav" })),
    ...recents.filter((r) => !favourites.some((f) => f.id === r.id)).slice(0, 5).map((p) => ({ ...p, _group: "Recent", _icon: "recent" })),
  ];

  if (idle.length < 4) idle.push(...POPULAR_PLACES.slice(0, 6).map((p) => ({ ...p, _group: "Popular", _icon: "pin" })));

  const options = searching ? results : idle;

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();

      if (open && options[active]) finish(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const optionId = (index) => `${id}-opt-${index}`;

  if (!expanded) {
    return (
      <button type="button" className="icon-btn search-toggle" aria-label="Search places" onClick={() => { setExpanded(true); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
        <Search size={20} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className={`search search--${variant}`} ref={rootRef}>
      <div className="search__field">
        <Search size={18} aria-hidden="true" className="search__icon" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-label="Search for a place"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && <Loader2 size={16} className="spin" aria-label="Searching" />}
        {query && !loading && (
          <button type="button" className="icon-btn icon-btn--tiny" aria-label="Clear search" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="icon-btn icon-btn--tiny search__locate" aria-label="Use my current location" title="Use my current location" onClick={handleLocate} disabled={locating}>
          {locating ? <Loader2 size={17} className="spin" aria-hidden="true" /> : <Crosshair size={17} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div className="search__panel">
          {locateError && (
            <p className="search__note search__note--error" role="alert">
              {locateError}
            </p>
          )}

          <ul id={listId} role="listbox" aria-label={searching ? "Search results" : "Suggested places"}>
            {options.map((option, index) => {
              const showGroup = !searching && (index === 0 || options[index - 1]._group !== option._group);

              return (
                <li key={`${option.id}-${index}`} role="presentation">
                  {showGroup && <div className="search__group">{option._group}</div>}
                  <div id={optionId(index)} role="option" aria-selected={index === active} className={`search__option ${index === active ? "is-active" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => finish(option)} onMouseEnter={() => setActive(index)}>
                    <span className="search__optIcon" aria-hidden="true">
                      {option._icon === "fav" ? <Star size={16} /> : option._icon === "recent" ? <Clock size={16} /> : <MapPin size={16} />}
                    </span>
                    <span className="search__optText">
                      <strong>{option.name}</strong>
                      <small>{option.subtitle}</small>
                    </span>
                    {option.kind && searching && <span className={`chip chip--kind chip--${option.kind}`}>{KIND_LABEL[option.kind] || "Place"}</span>}
                  </div>
                </li>
              );
            })}
          </ul>

          {searching && !loading && !error && results.length === 0 && (
            <p className="search__note">
              No {scope === "india" ? "places in India" : "places"} match “{debounced}”. Check the spelling, or try a nearby town or the district name.
            </p>
          )}

          {error && (
            <p className="search__note search__note--error" role="alert">
              {error}
            </p>
          )}

          {searching && (
            <button type="button" className="search__scope" onClick={() => setScope((s) => (s === "india" ? "world" : "india"))}>
              <Globe size={15} aria-hidden="true" />
              {scope === "india" ? "Not in India? Search the whole world" : "Back to India only"}
            </button>
          )}

          <div className="sr-only" aria-live="polite">
            {searching && !loading ? `${results.length} suggestions` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
