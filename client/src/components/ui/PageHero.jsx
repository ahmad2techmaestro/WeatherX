/** Shared page header: a small label, a serif title, one line of context and optional actions. */
export default function PageHero({ eyebrow, title, subtitle, meta, children }) {
  return (
    <header className="phero">
      <div className="phero__text">
        {eyebrow && <p className="phero__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="phero__sub">{subtitle}</p>}
        {meta?.length > 0 && (
          <ul className="phero__meta" role="list">
            {meta.filter(Boolean).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>
      {children && <div className="phero__actions">{children}</div>}
    </header>
  );
}
