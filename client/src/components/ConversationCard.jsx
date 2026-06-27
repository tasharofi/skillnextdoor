import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { getMessageThread, sendMessage } from '../services/api';

function shortTime(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diff = Math.floor((now - date) / 86400000);
    if (diff < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function ConversationCard({ thread, defaultOpen = false, onRead }) {
    const [open, setOpen] = useState(defaultOpen);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [unread, setUnread] = useState(thread.unread || 0);
    const bottomRef = useRef(null);
    const loadedRef = useRef(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await getMessageThread(thread.id);
            setDetail(r);
            if (unread > 0) { setUnread(0); onRead?.(thread.id); }
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && !loadedRef.current) { loadedRef.current = true; load(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => { if (open) bottomRef.current?.scrollIntoView(); }, [detail?.messages?.length, open]);

    const send = async (e) => {
        e.preventDefault();
        const body = reply.trim();
        if (!body || sending) return;
        setSending(true);
        try {
            const r = await sendMessage(thread.id, body);
            setDetail((p) => (p ? { ...p, messages: [...p.messages, r.message] } : p));
            setReply('');
        } catch { /* ignore */ } finally {
            setSending(false);
        }
    };

    return (
        <div className={`conv-card ${open ? 'open' : ''}`}>
            <button className="conv-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <div className="avatar avatar-sm">{thread.otherName?.charAt(0) || '?'}</div>
                <div className="conv-head-main">
                    <div className="conv-head-top">
                        <span className="conv-name">{thread.otherName}</span>
                        {thread.status && <span className={`session-status ${thread.status.toLowerCase()}`}>{thread.status}</span>}
                    </div>
                    <div className="conv-preview">
                        {thread.lastMessage ? (thread.lastMessage.fromMe ? 'You: ' : '') + thread.lastMessage.body : 'New booking request'}
                    </div>
                </div>
                <span className="conv-time">{shortTime(thread.lastMessageAt)}</span>
                {unread > 0 && <span className="msg-item-unread" aria-label="unread" />}
                <span className={`conv-chevron ${open ? 'up' : ''}`}><ChevronDown size={18} /></span>
            </button>

            {open && (
                <div className="conv-body">
                    {loading && !detail ? (
                        <div className="msg-empty">Loading…</div>
                    ) : detail ? (
                        <>
                            <div className="conv-thread">
                                {detail.messages.length === 0 ? (
                                    <div className="msg-empty">No messages yet — say hello.</div>
                                ) : (
                                    detail.messages.map((m) => (
                                        <div key={m.id} className={`msg-bubble ${m.fromMe ? 'me' : 'them'}`}>
                                            {m.body}
                                            <span className="msg-bubble-time">{shortTime(m.createdAt)}</span>
                                        </div>
                                    ))
                                )}
                                <div ref={bottomRef} />
                            </div>
                            <form className="msg-reply" onSubmit={send}>
                                <textarea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
                                    placeholder="Write a reply…"
                                    rows={1}
                                    maxLength={4000}
                                />
                                <button type="submit" className="btn btn-primary" disabled={!reply.trim() || sending}>
                                    {sending ? 'Sending…' : 'Send'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="msg-empty">Could not load this conversation.</div>
                    )}
                </div>
            )}
        </div>
    );
}
