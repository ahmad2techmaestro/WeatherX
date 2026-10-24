import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";

import PasswordField from "../components/auth/PasswordField";
import { useAuth } from "../context/AuthContext";

const RULES = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "mix", label: "A letter and a number", test: (p) => /[A-Za-z]/.test(p) && /\d/.test(p) },
  { id: "long", label: "12 or more for a stronger password", test: (p) => p.length >= 12 },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Create account — WeatherX";
  }, []);

  const passed = useMemo(() => RULES.filter((r) => r.test(form.password)).length, [form.password]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.name.trim().length < 2) return setError("Enter your name (at least 2 characters).");
    if (!form.email.trim()) return setError("Enter your email address.");
    if (form.password.length < 8) return setError("Use a password with at least 8 characters.");

    setBusy(true);

    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (e) {
      setError(e?.response?.data?.message || "We couldn't create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="aform" onSubmit={submit} noValidate>
      <header className="aform__head">
        <h1>Create your account</h1>
        <p>Free. Your places, units and alerts stay in sync on every device.</p>
      </header>

      {error && (
        <p className="aform__note aform__note--error" role="alert">
          {error}
        </p>
      )}

      <div className="afield">
        <label htmlFor="reg-name">Full name</label>
        <div className="afield__control">
          <input id="reg-name" autoComplete="name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" required />
        </div>
      </div>

      <div className="afield">
        <label htmlFor="reg-email">Email</label>
        <div className="afield__control">
          <input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
        </div>
      </div>

      <PasswordField
        value={form.password}
        autoComplete="new-password"
        minLength={8}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        hint={
          <div className="strength" aria-live="polite">
            <div className="strength__bar" data-level={form.password ? passed : 0} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <ul role="list">
              {RULES.map((r) => (
                <li key={r.id} className={r.test(form.password) ? "is-met" : ""}>
                  <Check size={13} aria-hidden="true" /> {r.label}
                </li>
              ))}
            </ul>
          </div>
        }
      />

      <button className="aform__submit" disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={18} className="spin" aria-hidden="true" /> Creating account
          </>
        ) : (
          "Create account"
        )}
      </button>

      <p className="aform__switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}
