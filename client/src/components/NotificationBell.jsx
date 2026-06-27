import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CircleCheck, CircleAlert } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api';

function shortTime(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diff = Math.floor((now - date) / 86400000);
    if (diff < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function AlertIcon({ type }) {
    if (type === 'COACH_APPROVED' || type === 'EDIT_APPROVED') return <CircleCheck size={18} />;
    if (type === 'COACH_REJECTED' || type === 'EDIT_REJECTED') return <CircleAlert size={18} />;
    return <Bell size={18} />;
}

export default function NotificationBell() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [count, setCount] = useState(0);
    const [items, setItems] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const ref = useRef(null);

    const load = async () => {
        try {
            const r = await getNotifications();
            setCount(r.unread || 0);
            setItems(r.items || []);
        } catch { /* ignore */ } finally {
            setLoaded(true);
        }
    };

    useEffect(() => {
        let alive = true;
        const tick = () => { if (alive) load(); };
        tick();
        const t = setInterval(tick, 25000);
        return () => { alive = false; clearInterval(t); };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const toggle = () => { const next = !open; setOpen(next); if (next) load(); };

    const handleItem = (item) => {
        setOpen(false);
        if (item.kind === 'alert' && item.unread) {
            markNotificationRead(item.id).catch(() => {});
            setCount((c) => Math.max(0, c - 1));
        }
        navigate(item.link || '/dashboard');
    };

    const handleMarkAll = async (e) => {
        e.stopPropagation();
        try { await markAllNotificationsRead(); } catch { /* ignore */ }
        load();
    };

    return (
        <div className="notif" ref={ref}>
            <button className="notif-bell" onClick={toggle} aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}>
                <Bell size={20} strokeWidth={1.75} />
                {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
            </button>
            {open && (
                <div className="notif-dropdown">
                    <div className="notif-head">
                        <span>Notifications</span>
                        {count > 0 && <button className="notif-markall" onClick={handleMarkAll}>Mark all read</button>}
                    </div>
                    {!loaded ? (
                        <div className="notif-empty">Loading…</div>
                    ) : items.length === 0 ? (
                        <div className="notif-empty">You're all caught up</div>
                    ) : (
                        items.map((item) => (
                            <button
                                key={`${item.kind}-${item.id}`}
                                className={`notif-item ${item.unread ? 'unread' : ''}`}
                                onClick={() => handleItem(item)}
                            >
                                {item.kind === 'message' ? (
                                    <span className="notif-avatar">{item.title?.charAt(0) || '?'}</span>
                                ) : (
                                    <span className="notif-icon"><AlertIcon type={item.type} /></span>
                                )}
                                <div className="notif-item-main">
                                    <div className="notif-item-title">{item.title}</div>
                                    <div className="notif-item-preview">{item.preview || 'New booking request'}</div>
                                </div>
                                <span className="notif-item-time">{shortTime(item.time)}</span>
                                {item.unread && <span className="notif-dot" aria-label="unread" />}
                            </button>
                        ))
                    )}
                    <button className="notif-foot" onClick={() => { setOpen(false); navigate('/dashboard'); }}>
                        View all in dashboard →
                    </button>
                </div>
            )}
        </div>
    );
}
