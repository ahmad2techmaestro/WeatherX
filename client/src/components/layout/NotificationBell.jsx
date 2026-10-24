import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";

import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "../../services/notificationService";
import { timeAgo } from "../../lib/format";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);

  const load = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);

      const data = await getNotifications();

      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
      setError("");
    } catch {
      setError("Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const timer = setInterval(() => document.visibilityState === "visible" && load(), 90 * 1000);

    return () => clearInterval(timer);
  }, [load]);

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

  const markOne = async (item) => {
    if (item.isRead) return;

    setItems((list) => list.map((n) => (n._id === item._id ? { ...n, isRead: true } : n)));
    setUnread((n) => Math.max(0, n - 1));

    try {
      await markNotificationAsRead(item._id);
    } catch {
      load();
    }
  };

  const markAll = async () => {
    setItems((list) => list.map((n) => ({ ...n, isRead: true })));
    setUnread(0);

    try {
      await markAllNotificationsAsRead();
    } catch {
      load();
    }
  };

  return (
    <div className="popover-root" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load(true);
        }}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="popover popover--notifications" role="dialog" aria-label="Notifications">
          <div className="popover__head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="link-btn" onClick={markAll}>
                <CheckCheck size={15} aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>

          {loading && <p className="popover__empty">Loading…</p>}
          {error && <p className="popover__empty">{error}</p>}
          {!loading && !error && items.length === 0 && <p className="popover__empty">You're all caught up. Weather alerts you subscribe to will appear here.</p>}

          <ul role="list" className="notif-list">
            {items.map((item) => (
              <li key={item._id}>
                <button type="button" className={`notif ${item.isRead ? "" : "is-unread"}`} onClick={() => markOne(item)}>
                  <span className="notif__dot" aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <span className="notif__msg">{item.message}</span>
                    <small>{timeAgo(new Date(item.createdAt).getTime())}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <Link to="/alerts" className="popover__foot" onClick={() => setOpen(false)}>
            View all alerts
          </Link>
        </div>
      )}
    </div>
  );
}
