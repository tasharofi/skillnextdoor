import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { getUnreadMessageCount, getMessageThreads } from '../services/api';

function shortTime(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diff = Math.floor((now - date) / 86400000);
    if (diff < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [count, setCount] = useState(0);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        let alive = true;
        const load = () => getUnreadMessageCount().then((r) => { if (alive) setCount(r.count || 0); }).catch(() => {});
        load();
        const t = setInterval(load, 25000);
        return () => { alive = false; clearInterval(t); };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next) {
            setLoading(true);
            try {
                const r = await getMessageThreads();
                const threads = r.threads || [];
                const sorted = [...threads].sort(
                    (a, b) => (b.unread > 0) - (a.unread > 0) || new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
                );
                setItems(sorted.slice(0, 6));
            } catch { /* ignore */ } finally {
                setLoading(false);
            }
        }
    };

    const openThread = (id) => { setOpen(false); navigate(`/dashboard?c=${id}`); };
    const viewAll = () => { setOpen(false); navigate('/dashboard'); };

    return (
        <div className="notif" ref={ref}>
            <button className="notif-bell" onClick={toggle} aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}>
                <Bell size={20} strokeWidth={1.75} />
                {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
            </button>
            {open && (
                <div className="notif-dropdown">
                    <div className="notif-head"><span>Notifications</span></div>
                    {loading ? (
                        <div className="notif-empty">Loading…</div>
                    ) : items.length === 0 ? (
                        <div className="notif-empty">No messages yet</div>
                    ) : (
                        items.map((t) => (
                            <button key={t.id} className={`notif-item ${t.unread > 0 ? 'unread' : ''}`} onClick={() => openThread(t.id)}>
                                <div className="notif-item-main">
                                    <div className="notif-item-title">{t.otherName}</div>
                                    <div className="notif-item-preview">
                                        {t.lastMessage ? (t.lastMessage.fromMe ? 'You: ' : '') + t.lastMessage.body : 'New booking request'}
                                    </div>
                                </div>
                                <span className="notif-item-time">{shortTime(t.lastMessageAt)}</span>
                                {t.unread > 0 && <span className="notif-dot" aria-label="unread" />}
                            </button>
                        ))
                    )}
                    <button className="notif-foot" onClick={viewAll}>View all in dashboard →</button>
                </div>
            )}
        </div>
    );
}
