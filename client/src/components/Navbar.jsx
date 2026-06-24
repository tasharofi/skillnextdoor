import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUnreadMessageCount } from '../services/api';

export default function Navbar() {
    const { user, loading, logout, isAdmin, isCoach, coachStatus } = useAuth();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        if (!user) { setUnread(0); return; }
        let alive = true;
        const load = () => getUnreadMessageCount().then((r) => { if (alive) setUnread(r.count || 0); }).catch(() => {});
        load();
        const t = setInterval(load, 25000);
        return () => { alive = false; clearInterval(t); };
    }, [user]);

    const handleLogout = () => {
        logout();
        navigate('/');
        setMenuOpen(false);
    };

    return (
        <nav className="nav">
            <div className="nav-inner">
                <Link to="/" className="nav-logo" aria-label="Skill Next Door">
                    <img src="/logo-horizontal.png" srcSet="/logo-horizontal.png 1x, /logo-horizontal-2x.png 2x" alt="Skill Next Door" className="nav-logo-img" />
                </Link>

                <div className="nav-actions">
                    {loading ? null : user ? (
                        <>
                            {isAdmin && (
                                <Link to="/admin" className="btn btn-sm" style={{ color: 'var(--color-text-secondary)' }}>Admin</Link>
                            )}
                            <Link to="/dashboard" className="btn btn-outline btn-sm">Dashboard</Link>
                            <Link to="/messages" className="btn btn-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                Messages{unread > 0 && <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>}
                            </Link>
                            <Link to="/profile" className="btn btn-sm" style={{ color: 'var(--color-text-secondary)' }}>Profile</Link>
                            <button onClick={handleLogout} className="btn btn-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/register" className="nav-text-link">Sign up</Link>
                            <Link to="/login" className="nav-text-link">Log in</Link>
                            <Link to="/become-coach" className="btn nav-cta">Start Teaching</Link>
                        </>
                    )}
                </div>

                <button className="nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
                    {menuOpen ? '✕' : '☰'}
                </button>
            </div>

            <div className={`nav-mobile-menu ${menuOpen ? 'open' : ''}`}>
                {loading ? null : user ? (
                    <>
                        {isAdmin && (
                            <Link to="/admin" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Admin Panel</Link>
                        )}
                        <Link to="/dashboard" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Dashboard</Link>
                        <Link to="/messages" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>
                            Messages{unread > 0 && <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>}
                        </Link>
                        <Link to="/profile" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Profile</Link>
                        <button className="nav-mobile-link" onClick={handleLogout} style={{ textAlign: 'left' }}>Sign Out</button>
                    </>
                ) : (
                    <>
                        <Link to="/register" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Sign up</Link>
                        <Link to="/login" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Log in</Link>
                        <Link to="/become-coach" className="nav-mobile-link nav-mobile-accent" onClick={() => setMenuOpen(false)}>Start Teaching</Link>
                    </>
                )}
            </div>
        </nav>
    );
}

