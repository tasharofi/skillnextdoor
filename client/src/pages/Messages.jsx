import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMessageThreads, getMessageThread, sendMessage } from '../services/api';

function shortTime(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function Messages() {
    const [threads, setThreads] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [active, setActive] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingThread, setLoadingThread] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const bottomRef = useRef(null);
    const activeIdRef = useRef(null);
    activeIdRef.current = activeId;

    const loadThreads = useCallback(async () => {
        try {
            const r = await getMessageThreads();
            setThreads(r.threads || []);
        } catch { /* ignore */ } finally {
            setLoadingList(false);
        }
    }, []);

    const loadThread = useCallback(async (id) => {
        try {
            const r = await getMessageThread(id);
            setActive(r);
        } catch { setActive(null); }
    }, []);

    const openThread = useCallback(async (id) => {
        setActiveId(id);
        setLoadingThread(true);
        setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('c', id); return p; }, { replace: true });
        await loadThread(id);
        setLoadingThread(false);
        loadThreads(); // refresh unread state in the list
    }, [loadThread, loadThreads, setSearchParams]);

    useEffect(() => { loadThreads(); }, [loadThreads]);

    // Open from ?c= on first load / deep link
    useEffect(() => {
        const c = searchParams.get('c');
        if (c && c !== activeIdRef.current) openThread(c);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Poll for new messages
    useEffect(() => {
        const t = setInterval(() => {
            loadThreads();
            if (activeIdRef.current) loadThread(activeIdRef.current);
        }, 20000);
        return () => clearInterval(t);
    }, [loadThreads, loadThread]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [active?.messages?.length]);

    const handleSend = async (e) => {
        e.preventDefault();
        const body = reply.trim();
        if (!body || sending || !activeId) return;
        setSending(true);
        try {
            const r = await sendMessage(activeId, body);
            setActive((prev) => (prev ? { ...prev, messages: [...prev.messages, r.message] } : prev));
            setReply('');
            loadThreads();
        } catch { /* ignore */ } finally {
            setSending(false);
        }
    };

    const backToList = () => {
        setActiveId(null);
        setActive(null);
        setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('c'); return p; }, { replace: true });
    };

    return (
        <div className="msg-page">
            <div className="msg-layout">
                <div className={`msg-list ${activeId ? 'mobile-hidden' : ''}`}>
                    {loadingList ? (
                        <div className="loading">Loading…</div>
                    ) : threads.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <div className="empty-state-icon">💬</div>
                            <p>No conversations yet. They'll appear here when you send or receive a booking request.</p>
                        </div>
                    ) : (
                        threads.map((t) => (
                            <div key={t.id} className={`msg-item ${activeId === t.id ? 'active' : ''}`} onClick={() => openThread(t.id)}>
                                <div className="msg-item-top">
                                    <span className="msg-item-name">{t.otherName}</span>
                                    <span className="msg-item-time">{shortTime(t.lastMessageAt)}</span>
                                </div>
                                <div className="msg-item-bottom">
                                    <span className="msg-item-preview">
                                        {t.lastMessage ? (t.lastMessage.fromMe ? 'You: ' : '') + t.lastMessage.body : 'New booking request'}
                                    </span>
                                    {t.unread > 0 && <span className="msg-item-unread" aria-label={`${t.unread} unread`} />}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className={`msg-thread-pane ${!activeId ? 'mobile-hidden' : ''}`}>
                    {!activeId ? (
                        <div className="msg-empty">Select a conversation</div>
                    ) : loadingThread && !active ? (
                        <div className="msg-empty">Loading…</div>
                    ) : active ? (
                        <>
                            <div className="msg-thread-header">
                                <button className="mobile-back-btn" onClick={backToList}>← Back</button>
                                <div className="msg-thread-title">{active.thread.otherName}</div>
                                <div className="msg-thread-sub">
                                    {active.thread.role === 'COACH' ? 'Learner enquiry' : `Coaching with ${active.thread.coachName}`}
                                </div>
                            </div>
                            <div className="msg-thread-body">
                                {active.messages.length === 0 ? (
                                    <div className="msg-empty">No messages yet — say hello.</div>
                                ) : (
                                    active.messages.map((m) => (
                                        <div key={m.id} className={`msg-bubble ${m.fromMe ? 'me' : 'them'}`}>
                                            {m.body}
                                            <span className="msg-bubble-time">{shortTime(m.createdAt)}</span>
                                        </div>
                                    ))
                                )}
                                <div ref={bottomRef} />
                            </div>
                            <form className="msg-reply" onSubmit={handleSend}>
                                <textarea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                                    placeholder="Write a message…"
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
            </div>
        </div>
    );
}
