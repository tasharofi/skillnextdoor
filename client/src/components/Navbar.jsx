import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

export default function Navbar() {
    const { user, loading, isCoach } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <nav className="nav">
            <div className="nav-inner">
                <Link to="/" className="nav-logo" aria-label="Skill Next Door">
                    <img src="/logo-horizontal.png" srcSet="/logo-horizontal.png 1x, /logo-horizontal-2x.png 2x" alt="Skill Next Door" className="nav-logo-img" />
                </Link>

                <div className="nav-right">
                    {!loading && !user && (
                        <div className="nav-actions">
                            <Link to="/register" className="nav-text-link">Sign up</Link>
                            <Link to="/login" className="nav-text-link">Log in</Link>
                            <Link to="/become-coach" className="btn nav-cta">Start Teaching</Link>
                        </div>
                    )}

                    {!loading && user && (
                        <>
                            {!isCoach && (
                                <Link to="/become-coach" className="btn nav-cta nav-cta-compact">Start Teaching</Link>
                            )}
                            <NotificationBell />
                            <UserMenu />
                        </>
                    )}

                    {!loading && !user && (
                        <button className="nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
                            {menuOpen ? '✕' : '☰'}
                        </button>
                    )}
                </div>
            </div>

            {!loading && !user && (
                <div className={`nav-mobile-menu ${menuOpen ? 'open' : ''}`}>
                    <Link to="/register" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Sign up</Link>
                    <Link to="/login" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Log in</Link>
                    <Link to="/become-coach" className="nav-mobile-link nav-mobile-accent" onClick={() => setMenuOpen(false)}>Start Teaching</Link>
                </div>
            )}
        </nav>
    );
}
