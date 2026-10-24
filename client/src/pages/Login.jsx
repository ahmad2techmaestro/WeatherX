import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import PasswordField from "../components/auth/PasswordField";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Sign in — WeatherX";
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.email.trim() || !form.password) return setError("Enter your email and password to continue.");

    setBusy(true);

    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(state?.from || "/", { replace: true });
    } catch (e) {
      setError(e?.response?.data?.message || "We couldn't sign you in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="aform" onSubmit={submit} noValidate>
      <header className="aform__head">
        <h1>Welcome back</h1>
        <p>Sign in to see the forecast for your places.</p>
      </header>

      {state?.registered && (
        <p className="aform__note aform__note--good" role="status">
          Your account is ready. Sign in to continue.
        </p>
      )}
      {state?.expired && (
        <p className="aform__note" role="status">
          Your session ended. Sign in again to continue.
        </p>
      )}
      {error && (
        <p className="aform__note aform__note--error" role="alert">
          {error}
        </p>
      )}

      <div className="afield">
        <label htmlFor="login-email">Email</label>
        <div className="afield__control">
          <input id="login-email" type="email" autoComplete="email" autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
        </div>
      </div>

      <PasswordField value={form.password} autoComplete="current-password" onChange={(e) => setForm({ ...form, password: e.target.value })} />

      <button className="aform__submit" disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={18} className="spin" aria-hidden="true" /> Signing in
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <p className="aform__switch">
        New to WeatherX? <Link to="/register">Create an account</Link>
      </p>
    </form>
  );
}
