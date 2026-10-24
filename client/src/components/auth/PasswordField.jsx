import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Password input with a show/hide toggle. */
export default function PasswordField({ label = "Password", value, onChange, autoComplete, hint, minLength }) {
  const id = useId();
  const [shown, setShown] = useState(false);

  return (
    <div className="afield">
      <label htmlFor={id}>{label}</label>
      <div className="afield__control">
        <input id={id} type={shown ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} required />
        <button type="button" className="afield__toggle" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {hint}
    </div>
  );
}
