import { NavLink, Outlet } from "react-router-dom";
import { Activity, Bell, Bot, BookOpen, Camera, LayoutDashboard, Plane, Wind } from "lucide-react";

const TABS = [
  { to: "/ai", label: "Dashboard", short: "Home", icon: LayoutDashboard, end: true },
  { to: "/ai/agents", label: "Agent Center", short: "Agents", icon: Bot },
  { to: "/ai/travel", label: "Travel Planner", short: "Travel", icon: Plane },
  { to: "/ai/air", label: "Air Quality", short: "Air", icon: Wind },
  { to: "/ai/alerts", label: "Smart Alerts", short: "Alerts", icon: Bell },
  { to: "/ai/sky", label: "Sky Check", short: "Sky", icon: Camera },
  { to: "/ai/research", label: "Research", icon: BookOpen },
  { to: "/ai/analytics", label: "Analytics", short: "Stats", icon: Activity },
];

/** Shared frame for the AI sections: one tab row, then the section. */
export default function AiLayout() {
  return (
    <div className="page ai">
      <nav className="ai__tabs" aria-label="AI sections">
        {TABS.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={16} aria-hidden /> <span className="ai__long">{label}</span><span className="ai__short">{short || label}</span>
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
