import { AlertTriangle, RefreshCw } from "lucide-react";

export function ErrorState({ title = "Couldn't load this", message, onRetry, compact = false }) {
  return (
    <div className={`state state--error ${compact ? "state--compact" : ""}`} role="alert">
      <AlertTriangle size={compact ? 20 : 28} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
      </div>
      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="state">
      {icon}
      <div>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 16, radius = 8, className = "" }) {
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function Segmented({ label, options, value, onChange, size = "md" }) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
          title={option.name}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
