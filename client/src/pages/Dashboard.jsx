import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMessageThreads, getCoachStatus } from '../services/api';
import ConversationCard from '../components/ConversationCard';
import VerifyEmailBanner from '../components/VerifyEmailBanner';

const STATUS_CONFIG = {
    DRAFT: { label: 'Draft', className: 'draft', message: 'Your coach application is saved as a draft. Complete and submit it to be reviewed.' },
    PENDING: { label: 'Under Review', className: 'pending', message: 'Your coach profile is under review and is not live yet. We\'ll let you know once your profile has been reviewed. Until then, learners will not see it in search results.' },
    APPROVED: { label: 'Live', className: 'approved', message: 'Your coach profile is live. Learners can now find your profile by skill and suburb and send session requests.' },
    REJECTED: { label: 'Not Approved', className: 'rejected', message: 'Your coach profile is not currently live. You can update and resubmit.' },
    SUSPENDED: { label: 'Suspended', className: 'suspended', message: 'Your coach profile is not currently live. Contact support for more information.' },
};

export default function Dashboard() {
    const { user, isCoach, isLearner, coachStatus } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const openId = searchParams.get('c');

    const [tab, setTab] = useState(isCoach ? 'coach' : 'learner');
    const [threads, setThreads] = useState([]);
    const [coachProfile, setCoachProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        const loadData = async () => {
            setLoading(true);
            try {
                const [threadRes, statusRes] = await Promise.all([
                    getMessageThreads().catch(() => ({ threads: [] })),
                    isCoach ? getCoachStatus().catch(() => ({ hasProfile: false })) : Promise.resolve({ hasProfile: false }),
                ]);
                setThreads(threadRes.threads || []);
                if (statusRes.hasProfile) setCoachProfile(statusRes.profile);
            } catch { /* ignore */ } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [user, isCoach, navigate]);

    const coachThreads = useMemo(() => threads.filter((t) => t.role === 'COACH'), [threads]);
    const learnerThreads = useMemo(() => threads.filter((t) => t.role === 'LEARNER'), [threads]);
    const coachUnread = useMemo(() => coachThreads.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0), [coachThreads]);
    const learnerUnread = useMemo(() => learnerThreads.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0), [learnerThreads]);

    // Deep-link: open the dashboard on the tab that owns thread ?c=
    useEffect(() => {
        if (!openId || !threads.length) return;
        const t = threads.find((x) => x.id === openId);
        if (t && isCoach && isLearner) setTab(t.role === 'COACH' ? 'coach' : 'learner');
    }, [openId, threads, isCoach, isLearner]);

    const markThreadRead = (id) => setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));

    if (!user) return null;
    const statusInfo = STATUS_CONFIG[coachStatus] || null;

    return (
        <div className="dashboard">
            <VerifyEmailBanner />
            <div className="dashboard-header">
                <div className="dashboard-header-row">
                    <div>
                        <h1 className="dashboard-title">Welcome, {user.name}</h1>
                        <p className="dashboard-subtitle">{user.email}</p>
                    </div>
                    {!isCoach && (
                        <Link to="/become-coach" className="btn btn-accent btn-sm">Start Teaching</Link>
                    )}
                </div>
            </div>

            {isCoach && isLearner && (
                <div className="tabs">
                    <button className={`tab ${tab === 'coach' ? 'active' : ''}`} onClick={() => setTab('coach')}>
                        Coach{coachUnread > 0 && <span className="tab-badge">{coachUnread}</span>}
                    </button>
                    <button className={`tab ${tab === 'learner' ? 'active' : ''}`} onClick={() => setTab('learner')}>
                        Learner{learnerUnread > 0 && <span className="tab-badge">{learnerUnread}</span>}
                    </button>
                </div>
            )}

            {loading ? (
                <div className="loading">Loading dashboard...</div>
            ) : tab === 'coach' && isCoach ? (
                <CoachDashboard
                    statusInfo={statusInfo}
                    coachStatus={coachStatus}
                    coachProfile={coachProfile}
                    threads={coachThreads}
                    openId={openId}
                    onRead={markThreadRead}
                    user={user}
                />
            ) : (
                <LearnerDashboard threads={learnerThreads} isCoach={isCoach} openId={openId} onRead={markThreadRead} />
            )}
        </div>
    );
}

function CoachDashboard({ statusInfo, coachStatus, coachProfile, threads, openId, onRead, user }) {
    const unreadCount = threads.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0);

    return (
        <>
            {statusInfo && (
                <div className={`coach-status-banner ${statusInfo.className}`}>
                    <div className="coach-status-label">{statusInfo.label}</div>
                    <p>{statusInfo.message}</p>
                    {(coachStatus === 'DRAFT' || coachStatus === 'REJECTED') && (
                        <Link to="/apply-coach" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-3)' }}>
                            {coachStatus === 'DRAFT' ? 'Complete Application' : 'Update & Resubmit'}
                        </Link>
                    )}
                    {coachStatus === 'APPROVED' && user?.slug && (
                        <Link to={`/coach/${user.slug}`} className="btn btn-outline btn-sm" style={{ marginTop: 'var(--space-3)' }}>
                            View My Profile
                        </Link>
                    )}
                </div>
            )}

            {coachStatus === 'APPROVED' && (
                <div className="dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-value">{threads.length}</div>
                        <div className="stat-label">Conversations</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{unreadCount}</div>
                        <div className="stat-label">Unread</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">${coachProfile?.hourlyRate || 0}</div>
                        <div className="stat-label">Hourly Rate</div>
                    </div>
                </div>
            )}

            {coachStatus === 'APPROVED' && coachProfile?.skills?.length > 0 && (
                <div className="dashboard-card" style={{ marginTop: 'var(--space-4)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>Your Skills</h3>
                    <div className="coach-card-skills">
                        {coachProfile.skills.map((s) => (
                            <span key={s.skill?.id || s.id} className="skill-tag">{s.skill?.name || s.name}</span>
                        ))}
                    </div>
                </div>
            )}

            {coachStatus === 'APPROVED' && (
                <div className="dashboard-card" style={{ marginTop: 'var(--space-4)' }}>
                    <h2 className="dashboard-card-title">Requests &amp; messages</h2>
                    {threads.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <div className="empty-state-icon">📬</div>
                            <p>No requests yet. Your profile is live — requests will appear here as conversations.</p>
                        </div>
                    ) : (
                        <div className="sessions-list">
                            {threads.map((t) => (
                                <ConversationCard key={t.id} thread={t} defaultOpen={t.id === openId} onRead={onRead} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

function LearnerDashboard({ threads, isCoach, openId, onRead }) {
    return (
        <>
            {!isCoach && (
                <div className="dashboard-card" style={{ marginBottom: 'var(--space-6)', background: 'var(--color-bg-secondary)' }}>
                    <h3 style={{ marginBottom: 'var(--space-2)' }}>Good at something? Teach it locally.</h3>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                        Create a profile, get discovered by learners nearby, and earn from the skills you already have.
                    </p>
                    <Link to="/become-coach" className="btn btn-accent btn-sm">Start Teaching →</Link>
                </div>
            )}

            <div className="dashboard-card">
                <h2 className="dashboard-card-title">My requests &amp; messages</h2>
                {threads.length === 0 ? (
                    <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                        <div className="empty-state-icon">📋</div>
                        <p>You haven't sent any session requests yet.</p>
                        <Link to="/search" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)' }}>Find a Coach</Link>
                    </div>
                ) : (
                    <div className="sessions-list">
                        {threads.map((t) => (
                            <ConversationCard key={t.id} thread={t} defaultOpen={t.id === openId} onRead={onRead} />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
