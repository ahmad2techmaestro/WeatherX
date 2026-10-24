import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { CloudSun, Columns3, Heart, Map as MapIcon, Moon, Settings as SettingsIcon, Sun, CalendarDays, Compass } from "lucide-react";

import Logo from "../ui/Logo";
import { BrandIcon, HeartIcon } from "../ui/SocialIcons";
import { AUTHOR } from "../../lib/author";
import { Segmented } from "../ui/States";
import SearchBox from "./SearchBox";
import AccountMenu from "./AccountMenu";
import { useSettings } from "../../context/SettingsContext";
import { TEMP_UNITS } from "../../lib/units";

const NAV = [
  { to: "/", label: "Today", icon: CloudSun, end: true },
  { to: "/forecast", label: "Outlook", icon: CalendarDays },
  { to: "/planner", label: "Insights", icon: Compass },
  { to: "/map", label: "Atlas", icon: MapIcon },
  { to: "/compare", label: "Benchmark", icon: Columns3 },
  { to: "/places", label: "Locations", icon: Heart },
];

export default function AppShell() {
  const { resolvedTheme, toggleTheme, units, setTemperature } = useSettings();
  const { pathname } = useLocation();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="header">
        <div className="header__inner">
          <Link to="/" className="header__brand" aria-label="WeatherX home">
            <Logo />
          </Link>

          <nav className="header__nav" aria-label="Primary">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="header__search">
            <SearchBox variant="header" />
          </div>

          <div className="header__actions">
            <span className="header__units">
              <Segmented label="Temperature unit" size="sm" options={TEMP_UNITS} value={units.temperature} onChange={setTemperature} />
            </span>
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={resolvedTheme === "dark" ? "Light theme" : "Dark theme"}>
              {resolvedTheme === "dark" ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
            </button>
            <Link to="/settings" className="icon-btn header__settings" aria-label="Settings" title="Settings">
              <SettingsIcon size={20} aria-hidden="true" />
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <Logo size={26} />
            <p>Precise forecasts, air quality and live maps for every town and village in India.</p>
          </div>
        </div>
        <div className="footer__bar">
          <p className="footer__made">
            Developed with <HeartIcon /> by <strong>{AUTHOR.name}</strong>
            <span className="footer__data">
              {" · "}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
            </span>
          </p>
          <div className="footer__social">
            <a href={AUTHOR.github} target="_blank" rel="noreferrer noopener" aria-label={`${AUTHOR.name} on GitHub`} title="GitHub">
              <BrandIcon name="github" />
            </a>
            <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer noopener" aria-label={`${AUTHOR.name} on LinkedIn`} title="LinkedIn">
              <BrandIcon name="linkedin" />
            </a>
          </div>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Primary">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
