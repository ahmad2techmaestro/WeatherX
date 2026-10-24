import { useId } from "react";

/** Compact tab switcher. Pair each option with a panel rendered by the caller. */
export default function Tabs({ label, options, value, onChange }) {
  const id = useId();

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} id={`${id}-${o.value}`} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? "is-active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
