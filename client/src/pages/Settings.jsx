import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

import { Segmented } from "../components/ui/States";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { errorMessage } from "../lib/api";
import { TEMP_UNITS, WIND_UNITS } from "../lib/units";
import { disablePush, enablePush, pushState } from "../lib/push";

const THEMES = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Toggle({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

/** Keep only digits, with at most one leading +. */
const cleanPhone = (v) => {
  const digits = v.replace(/\D/g, "").slice(0, 15);

  return v.trim().startsWith("+") ? `+${digits}` : digits;
};

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const { theme, setTheme, units, setTemperature, setWind, serverPrefs, setServerPrefs } = useSettings();
  const [status, setStatus] = useState("");
  const notif = serverPrefs?.notifications || {};
  const channels = notif.channels || {};
  const [push, setPush] = useState("off");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);

  const phoneBad = phone !== "" && !/^\+?\d{7,15}$/.test(phone);
  const commitPhone = () => {
    if (!phoneBad && phone !== (notif.phoneNumber || "")) saveNotif({ phoneNumber: phone });
  };

  useEffect(() => {
    setPhone(notif.phoneNumber || "");
  }, [notif.phoneNumber]);

  const togglePush = async (on) => {
    setStatus("");

    try {
      if (on) await enablePush();
      else await disablePush();

      setPush(on ? "on" : "off");
      setStatus(on ? "This device will now receive weather alerts." : "Push turned off for this device.");
    } catch (error) {
      setPush(await pushState().catch(() => "off"));
      setStatus(error.message || "Couldn't change push notifications.");
    }
  };

  useEffect(() => {
    document.title = "Settings — WeatherX";
  }, []);

  const saveNotif = async (patch) => {
    setStatus("");

    try {
      const { data } = await axios.put("/api/preferences", { notifications: patch });

      setServerPrefs(data?.data || { ...serverPrefs, notifications: patch });
      setStatus("Saved.");
    } catch (error) {
      setStatus(errorMessage(error, "That couldn't be saved. Please try again."));
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Preferences are saved on this device{isAuthenticated ? " and to your account" : ""}.</p>
        </div>
      </header>

      <section className="card" aria-labelledby="disp">
        <h2 id="disp" className="card__title">Display</h2>
        <div className="setting-row">
          <div><strong>Theme</strong><p>Auto matches your device setting.</p></div>
          <Segmented label="Theme" options={THEMES} value={theme} onChange={setTheme} />
        </div>
        <div className="setting-row">
          <div><strong>Temperature</strong><p>Fahrenheit also switches rainfall, distance and pressure to imperial units.</p></div>
          <Segmented label="Temperature unit" options={TEMP_UNITS} value={units.temperature} onChange={setTemperature} />
        </div>
        <div className="setting-row">
          <div><strong>Wind speed</strong></div>
          <Segmented label="Wind unit" options={WIND_UNITS} value={units.wind} onChange={setWind} />
        </div>
      </section>

      <section className="card" aria-labelledby="notif">
        <h2 id="notif" className="card__title">Notifications</h2>
        {!isAuthenticated ? (
          <p className="muted">
            <Link to="/login" className="link-btn">Sign in</Link> to receive in-app weather notifications and keep these settings across devices.
          </p>
        ) : (
          <>
            <div className="setting-row">
              <div><strong>Severe weather alerts</strong><p>Heat, cold, storms, heavy rain and strong wind at your saved places.</p></div>
              <Toggle label="Severe weather alerts" checked={notif.severeWeatherAlerts !== false} onChange={(v) => saveNotif({ severeWeatherAlerts: v })} />
            </div>
            <div className="setting-row">
              <div><strong>Daily forecast</strong><p>A morning briefing at about 7 am, in your place’s local time.</p></div>
              <Toggle label="Daily forecast" checked={Boolean(notif.dailyForecast)} onChange={(v) => saveNotif({ dailyForecast: v })} />
            </div>
            <div className="setting-row">
              <div><strong>Weather updates</strong><p>Coming soon.</p></div>
              <Toggle label="Weather updates" checked={Boolean(notif.weatherUpdates)} onChange={(v) => saveNotif({ weatherUpdates: v })} />
            </div>
            <h3 className="card__subtitle">Delivery</h3>
            <div className="setting-row">
              <div><strong>In the app</strong><p>Appears in the notification bell.</p></div>
              <Toggle label="In-app" checked={channels.inApp !== false} onChange={(v) => saveNotif({ channels: { inApp: v } })} />
            </div>
            <div className="setting-row">
              <div>
                <strong>Push on this device</strong>
                <p>
                  {push === "unsupported" && "Push isn't supported in this browser."}
                  {push === "denied" && "Blocked by your browser. Allow notifications for this site to enable push."}
                  {(push === "on" || push === "off") && "Instant alerts on this device, even when WeatherX is closed."}
                </p>
              </div>
              <Toggle label="Push" checked={push === "on"} onChange={(v) => push !== "unsupported" && push !== "denied" && togglePush(v)} />
            </div>
            <div className="setting-row">
              <div><strong>Email</strong><p>Sent to your account email address.</p></div>
              <Toggle label="Email" checked={Boolean(channels.email)} onChange={(v) => saveNotif({ channels: { email: v } })} />
            </div>
            <div className="setting-row">
              <div><strong>SMS</strong><p>Requires a phone number below.</p></div>
              <Toggle label="SMS" checked={Boolean(channels.sms)} onChange={(v) => saveNotif({ channels: { sms: v } })} />
            </div>
            <div className="setting-row">
              <div><strong>WhatsApp</strong></div>
              <Toggle label="WhatsApp" checked={Boolean(channels.whatsapp)} onChange={(v) => saveNotif({ channels: { whatsapp: v } })} />
            </div>
            <div className="setting-row">
              <div><strong>Phone number</strong><p>Digits only, with the country code.</p></div>
              <div className="phonefield">
                <input
                  className="input input--phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={22}
                  pattern="\+?[0-9]{7,15}"
                  value={phone}
                  placeholder="+919876543210"
                  aria-label="Phone number"
                  aria-invalid={phoneBad}
                  onChange={(e) => setPhone(cleanPhone(e.target.value))}
                  onBlur={commitPhone}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
                {phoneBad && <small role="alert">Digits only, 7 to 15, with the country code.</small>}
              </div>
            </div>
            <p className="muted small">Alerts and the morning briefing follow your saved places, starting with Home. Save a place to begin receiving them.</p>
            {status && <p className="muted small" role="status">{status}</p>}
          </>
        )}
      </section>
    </div>
  );
}
