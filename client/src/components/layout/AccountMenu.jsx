import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, BellRing, LogOut, Settings, User } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import NotificationBell from "./NotificationBell";

export default function AccountMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event) => rootRef.current && !rootRef.current.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isAuthenticated) {
    return null;
  }

  const initial = (user?.name || user?.email || "?").trim()[0]?.toUpperCase();

  return (
    <>
      <NotificationBell />
      <div className="popover-root" ref={rootRef}>
        <button type="button" className="avatar" aria-label="Account menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
          {initial}
        </button>

        {open && (
          <div className="popover popover--menu" role="menu">
            <div className="popover__who">
              <User size={16} aria-hidden="true" />
              <span>
                <strong>{user?.name}</strong>
                <small>{user?.email}</small>
              </span>
            </div>
            <Link role="menuitem" to="/alerts" onClick={() => setOpen(false)}>
              <BellRing size={16} aria-hidden="true" /> Alerts
            </Link>
            <Link role="menuitem" to="/analytics" onClick={() => setOpen(false)}>
              <BarChart3 size={16} aria-hidden="true" /> Analytics
            </Link>
            <Link role="menuitem" to="/settings" onClick={() => setOpen(false)}>
              <Settings size={16} aria-hidden="true" /> Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await logout();
                navigate("/");
              }}
            >
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
