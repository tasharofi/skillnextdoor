import { useState, useEffect, useRef, useCallback } from 'react';
import { getMessageThread, sendMessage } from '../services/api';

const MODE = { IN_PERSON: 'In Person', ONLINE: 'Online', BOTH: 'In Person & Online', EITHER: 'Either' };

function shortTime(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diff = Math.floor((now - date) / 86400000);
    if (diff < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function parseList(s) {
    try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Map a thread's raw data to a display status per role.
function statusFor(t) {
    if (!t) return { label: '', cls: '' };
    if (t.status === 'RESOLVED') return { label: 'Closed', cls: 'closed' };
    const unread = (t.unread || 0) > 0;
    const lastFromMe = t.lastMessage?.fromMe;
    if (t.role === 'COACH') {
        if (unread) return t.iHaveReplied ? { label: 'Unread', cls: 'unread' } : { label: 'New request', cls: 'new' };
        if (!t.iHaveReplied) return { label: 'New request', cls: 'new' };
        if (lastFromMe) return { label: 'Awaiting learner', cls: 'awaiting' };
        return { label: 'In discussion', cls: 'discussion' };
    }
    if (unread) return { label: 'Unread', cls: 'unread' };
    if (lastFromMe) return { label: 'Awaiting reply', cls: 'awaiting' };
    return { label: 'In discussion', cls: 'discussion' };
}

function contextLine(t, role) {
    if (role === 'LEARNER') return t.headline || 'Session request';
    const bits = [t.suburb, t.sessionMode && t.sessionMode !== 'EITHER' ? MODE[t.sessionMode] : ''].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'Session request';
}

export default function MessagesInbox({ threads, role, openId, onRead }) {
    const [selectedId, setSelectedId] = useState(openId || null);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    const selected = threads.find((t) => t.id === selectedId) || null;

    const loadDetail = useCallback(async (id) => {
        setLoading(true);
        try { const r = await getMessageThread(id); setDetail(r); onRead?.(id); }
        catch { setDetail(null); } finally { setLoading(false); }
    }, [onRead]);

    useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);
    useEffect(() => { if (openId) setSelectedId(openId); }, [openId]);
    useEffect(() => { if (detail) bottomRef.current?.scrollIntoView(); }, [detail?.messages?.length]);

    const send = async (e) => {
        e.preventDefault();
        const body = reply.trim();
        if (!body || sending || !selectedId) return;
        setSending(true);
        try {
            const r = await sendMessage(selectedId, body);
            setDetail((p) => (p ? { ...p, messages: [...p.messages, r.message] } : p));
            setReply('');
        } catch { /* ignore */ } finally {
            setSending(false);
        }
    };

    const st = statusFor(selected);
    const emptyList = role === 'COACH'
        ? { text: 'No learner requests yet.', cta: null }
        : { text: "You haven't sent any requests yet.", cta: { to: '/search', label: 'Find a coach' } };

    const summaryRows = (th) => {
        if (!th) return [];
        const rows = [];
        if (th.preferredMode) rows.push(['Session', MODE[th.preferredMode] || th.preferredMode]);
        if (th.suburb) rows.push(['Location', th.suburb]);
        if (role === 'LEARNER' && th.rate > 0) rows.push(['Rate', `$${th.rate}/hr`]);
        const days = parseList(th.preferredDays), times = parseList(th.preferredTimes);
        if (role === 'COACH' && (days.length || times.length)) {
            rows.push(['Preferred', [days.join(', '), times.join(', ')].filter(Boolean).join(' · ')]);
        }
        rows.push(['Status', st.label]);
        return rows;
    };

    return (
        <div className="inbox">
            <div className={`inbox-list ${selectedId ? 'mobile-hidden' : ''}`}>
                {threads.length === 0 ? (
                    <div className="inbox-empty">
                        <p>{emptyList.text}</p>
                        {emptyList.cta && <a className="btn btn-primary btn-sm" href={emptyList.cta.to} style={{ marginTop: 'var(--space-3)' }}>{emptyList.cta.label}</a>}
                    </div>
                ) : (
                    threads.map((t) => {
                        const ts = statusFor(t);
                        return (
                            <button key={t.id} className={`inbox-card ${selectedId === t.id ? 'selected' : ''}`} onClick={() => setSelectedId(t.id)}>
                                <div className="inbox-card-top">
                                    <span className="inbox-card-name">{t.otherName}</span>
                                    <span className={`reqbadge ${ts.cls}`}>{ts.label}</span>
                                </div>
                                <div className="inbox-card-context">{contextLine(t, role)}</div>
                                <div className="inbox-card-preview">
                                    {t.lastMessage ? (t.lastMessage.fromMe ? 'You: ' : '') + t.lastMessage.body : 'New booking request'}
                                </div>
                                <div className="inbox-card-foot">
                                    <span className="inbox-card-time">{shortTime(t.lastMessageAt)}</span>
                                    {t.unread > 0 && <span className="inbox-dot" aria-label="unread" />}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            <div className={`inbox-detail ${!selectedId ? 'mobile-hidden' : ''}`}>
                {!selectedId ? (
                    <div className="inbox-empty inbox-empty-detail">Select a request to view the conversation.</div>
                ) : loading && !detail ? (
                    <div className="inbox-empty inbox-empty-detail">Loading…</div>
                ) : detail ? (
                    <>
                        <div className="inbox-thread-head">
                            <button className="inbox-back" onClick={() => setSelectedId(null)}>← Back to messages</button>
                            <div className="inbox-thread-title-row">
                                <span className="inbox-thread-title">{detail.thread.otherName}</span>
                                <span className={`reqbadge ${st.cls}`}>{st.label}</span>
                            </div>
                            <div className="inbox-summary">
                                <div className="inbox-summary-title">
                                    {role === 'LEARNER' ? (detail.thread.headline || 'Session request') : 'Learner request'}
                                </div>
                                <div className="inbox-summary-grid">
                                    {summaryRows(detail.thread).map(([label, value]) => (
                                        <div key={label} className="inbox-summary-row">
                                            <span className="inbox-summary-label">{label}</span>
                                            <span className="inbox-summary-value">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="inbox-thread-body">
                            {detail.messages.length === 0 ? (
                                <div className="inbox-empty">No messages yet.</div>
                            ) : (
                                detail.messages.map((m, i) => {
                                    const prev = detail.messages[i - 1];
                                    const showAvatar = !m.fromMe && (!prev || prev.fromMe);
                                    return (
                                        <div key={m.id} className={`msg-row ${m.fromMe ? 'me' : 'them'}`}>
                                            {!m.fromMe && (showAvatar
                                                ? <span className="msg-avatar">{m.senderName?.charAt(0)?.toUpperCase() || '?'}</span>
                                                : <span className="msg-avatar-spacer" />)}
                                            <div className={`msg-bubble ${m.fromMe ? 'me' : 'them'}`}>
                                                {m.body}
                                                <span className="msg-bubble-time">{shortTime(m.createdAt)}</span>
                                            </div>
                                        </div>
                                    );
                                })
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
                    <div className="inbox-empty inbox-empty-detail">Could not load this conversation.</div>
                )}
            </div>
        </div>
    );
}
