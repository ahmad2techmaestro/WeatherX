import { ErrorState, Skeleton } from "../ui/States";
import { timeAgo } from "../../lib/format";

export function WeatherSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading conditions…</span>
      <div className="skeleton-hero">
        <Skeleton width="30%" height={20} />
        <Skeleton width="55%" height={44} radius={12} />
        <Skeleton width="42%" height={96} radius={16} />
      </div>
      <div className="grid-2">
        <Skeleton height={190} radius={22} />
        <Skeleton height={190} radius={22} />
      </div>
      <Skeleton height={320} radius={22} />
    </div>
  );
}

/**
 * Shared loading / error handling for pages built on one overview. Cached data keeps
 * showing if a background refresh fails, with a quiet notice instead of an error wall.
 */
export default function WeatherGate({ data, error, loading, fetchedAt, onRetry, children }) {
  if (!data && loading) return <WeatherSkeleton />;

  if (!data) return <ErrorState title="Weather is unavailable" message={error || "We couldn't load conditions for this place."} onRetry={onRetry} />;

  return (
    <>
      {error && (
        <p className="notice notice--warn" role="status">
          Couldn't refresh just now. Showing the last update{fetchedAt ? ` from ${timeAgo(fetchedAt)}` : ""}.{" "}
          <button type="button" className="link-btn" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {children}
    </>
  );
}
