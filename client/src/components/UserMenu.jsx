import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function UserMenu() {
    const { user, logout, isAdmin, isCoach, coachStatus } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    if (!user) return null;

    const initial = user.name?.charAt(0)?.toUpperCase() || '?';
    const isApprovedCoach = isCoach && coachStatus === 'APPROVED' && user.slug;
    const go = (to) => { setOpen(false); navigate(to); };
    const handleLogout = () => { setOpen(false); logout(); navigate('/'); };

    return (
        <div className="usermenu" ref={ref}>
            <button className="usermenu-trigger" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open}>
                {user.avatar
                    ? <img src={user.avatar} alt="" className="usermenu-avatar-img" />
                    : <span className="usermenu-avatar">{initial}</span>}
            </button>
            {open && (
                <div className="usermenu-dropdown">
                    <div className="usermenu-head">
                        <div className="usermenu-name">{user.name}</div>
                        {isApprovedCoach ? (
                            <Link to={`/coach/${user.slug}`} className="usermenu-sub" onClick={() => setOpen(false)}>View public profile</Link>
                        ) : (
                            <div className="usermenu-sub-muted">{user.email}</div>
                        )}
                    </div>
                    <div className="usermenu-section">
                        <button className="usermenu-item" onClick={() => go('/dashboard')}><LayoutDashboard size={18} />My dashboard</button>
                        <button className="usermenu-item" onClick={() => go('/profile')}><Settings size={18} />Profile settings</button>
                        {isAdmin && <button className="usermenu-item" onClick={() => go('/admin')}><ShieldCheck size={18} />Admin panel</button>}
                    </div>
                    <div className="usermenu-section usermenu-section-last">
                        <button className="usermenu-item danger" onClick={handleLogout}><LogOut size={18} />Log out</button>
                    </div>
                </div>
            )}
        </div>
    );
}
