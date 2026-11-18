import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, unreadNotificationCount, markNotificationsRead, supabaseConfigured, type AppNotification } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';

// A NEGATIVE HAND STOCK NOTIFICATION OPENS ITS LINE (the user, 2026-11-18:
// "Unable to open the Record from the Notification"). The notification's link
// is only /handstock (notify_negative_handstock, 0401/0413), but its body
// always begins "<engineer> · <part> · ...", so the line is read from there --
// for the ones already sent as much as for new ones, with no change to the
// database function.
function linkFor(n: AppNotification): string {
  const link = n.link ?? '';
  if (n.kind === 'negative_handstock' && link === '/handstock') {
    const [engineer, part] = String(n.body ?? '').split(' · ');
    if (engineer?.trim() && part?.trim()) {
      return `/handstock?${new URLSearchParams({ engineer: engineer.trim(), part: part.trim() }).toString()}`;
    }
  }
  return link;
}

// The header bell: shows an unread count, opens a list of recent notifications
// (call allotted, spare dispatched), and marks them read on click.
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);

  const refreshCount = async () => { try { setUnread(await unreadNotificationCount()); } catch { /* offline / not migrated */ } };
  useEffect(() => {
    if (!supabaseConfigured()) return;
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const openMenu = async () => {
    setOpen(true);
    try { setItems(await listNotifications(30)); loaded.current = true; } catch { /* ignore */ }
  };
  const markAll = async () => { try { await markNotificationsRead(); } catch { /* ignore */ } setItems((x) => x.map((n) => ({ ...n, read: true }))); setUnread(0); };
  // OPENED IS DONE (the user, 2026-11-18: "if Spare Co-ordinator has Opened it,
  // it should go away from Notification"): the list shows what is unread; a
  // notification opened is marked read and leaves it. "Show read" brings the
  // read ones back.
  const [showRead, setShowRead] = useState(false);
  const clickItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) { try { await markNotificationsRead([n.id]); } catch { /* ignore */ } setUnread((u) => Math.max(0, u - 1)); }
    setItems((x) => x.map((m) => (m.id === n.id ? { ...m, read: true } : m)));
    const to = linkFor(n);
    if (to) navigate(to);
  };

  if (!supabaseConfigured()) return null;
  return (
    <div className="notif">
      <button className="btn btn-ghost btn-sm notif-btn" title="Notifications" onClick={() => (open ? setOpen(false) : void openMenu())}>
        🔔{unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-menu">
            <div className="notif-head">
              <b>Notifications</b>
              {items.some((n) => !n.read) && <button className="btn btn-ghost btn-sm" onClick={() => void markAll()}>Mark all read</button>}
              {items.some((n) => n.read) && <button className="btn btn-ghost btn-sm" onClick={() => setShowRead((v) => !v)}>{showRead ? 'Hide read' : 'Show read'}</button>}
            </div>
            {items.filter((n) => showRead || !n.read).length === 0 ? (
              <div className="notif-empty">{loaded.current ? "You're all caught up." : 'Loading…'}</div>
            ) : (
              <div className="notif-list">
                {items.filter((n) => showRead || !n.read).map((n) => (
                  <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => void clickItem(n)}>
                    <div className="notif-title">{n.title}</div>
                    {n.body && <div className="notif-body">{n.body}</div>}
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
