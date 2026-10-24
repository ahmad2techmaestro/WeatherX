import { Crosshair, Loader2, LocateOff } from "lucide-react";

import { usePlaces } from "../../context/PlacesContext";

const accuracyText = (m) => (m < 1000 ? `±${Math.max(5, Math.round(m / 5) * 5)} m` : `±${(m / 1000).toFixed(1)} km`);

/** Shows whether the page is following the device location, and how to get back to it. */
export default function LocationBadge({ onGlass = false }) {
  const { follow, gps, fix, placeSource, locate, locating } = usePlaces();
  const cls = `locbadge${onGlass ? " locbadge--glass" : ""}`;

  if (follow && gps === "active" && placeSource === "gps") {
    const rough = fix?.accuracy > 1500;

    return (
      <span className={`${cls} is-live${rough ? " is-rough" : ""}`} title={rough ? "Your device gave an approximate position, so this may be off by a few kilometres." : "Following your device location"}>
        <i aria-hidden="true" /> {rough ? "Approximate location" : "Live location"}
        {fix?.accuracy ? ` · ${accuracyText(fix.accuracy)}` : ""}
      </span>
    );
  }

  if (follow && (gps === "locating" || locating)) {
    return (
      <span className={cls} role="status">
        <Loader2 size={13} className="spin" aria-hidden="true" /> Finding your location
      </span>
    );
  }

  if (gps === "denied" || gps === "unavailable") {
    return (
      <button type="button" className={`${cls} is-warn`} onClick={locate}>
        <LocateOff size={13} aria-hidden="true" /> Location is off · Try again
      </button>
    );
  }

  if (!follow) {
    return (
      <button type="button" className={`${cls} is-button`} onClick={locate}>
        <Crosshair size={13} aria-hidden="true" /> Back to my location
      </button>
    );
  }

  return null;
}
