import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    updateUserProfile, updateCoachProfile, getCoachStatus, getMyPendingEdits,
    uploadPhoto, resolveSkill, getAIStatus,
    aiImproveBio, aiImproveHeadline, aiSuggestSkills,
} from '../services/api';
import SuburbAutocomplete from '../components/SuburbAutocomplete';
import AvailabilityPicker, { formatAvailability } from '../components/AvailabilityPicker';
import SkillAutocomplete from '../components/SkillAutocomplete';
import VerifyEmailBanner from '../components/VerifyEmailBanner';

const STATUS_CONFIG = {
    DRAFT: { label: 'Draft', className: 'draft', icon: '📝', message: 'Your coach application is saved as a draft.' },
    PENDING: { label: 'Under Review', className: 'pending', icon: '⏳', message: 'Your coach profile is under review and is not live yet.' },
    APPROVED: { label: 'Live', className: 'approved', icon: '✅', message: 'Your coach profile is live and visible to learners.' },
    REJECTED: { label: 'Not Approved', className: 'rejected', icon: '❌', message: 'Your coach application was not approved.' },
    SUSPENDED: { label: 'Suspended', className: 'suspended', icon: '🚫', message: 'Your coach profile has been suspended. Contact support.' },
};

const SESSION_MODE_LABELS = { IN_PERSON: 'In Person', ONLINE: 'Online', BOTH: 'Both' };

export default function ProfileSettings() {
    const { user, isCoach, refreshUser } = useAuth();
    const navigate = useNavigate();

    const [tab, setTab] = useState('personal');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [editingTab, setEditingTab] = useState(null);

    // Snapshot refs for Cancel — stores the saved values before editing
    const savedPersonalRef = useRef(null);
    const savedCoachFormRef = useRef(null);
    const savedSkillsRef = useRef(null);

    // User-level fields
    const [personal, setPersonal] = useState({ name: '', phone: '', avatar: '' });
    const [photoPreview, setPhotoPreview] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Coach profile fields
    const [coachProfile, setCoachProfile] = useState(null);
    const [coachForm, setCoachForm] = useState({
        headline: '', bio: '',
        sessionMode: 'BOTH', suburb: '', state: '', postcode: '',
        lat: null, lng: null, serviceRadius: '',
        hourlyRate: '', yearsExp: '', certifications: '', linkedinUrl: '',
        phone: '', email: '', availability: [],
    });
    const [selectedSkills, setSelectedSkills] = useState([]);
    const [skillInput, setSkillInput] = useState('');
    const [pendingEdits, setPendingEdits] = useState([]);

    // AI helper state
    const [aiAvailable, setAiAvailable] = useState(false);
    const [aiLoading, setAiLoading] = useState('');
    const [headlineSuggestions, setHeadlineSuggestions] = useState(null);
    const [skillSuggestions, setSkillSuggestions] = useState(null);
    const [previousBio, setPreviousBio] = useState(null);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadData();
        // Check AI availability
        getAIStatus().then(r => setAiAvailable(r.available)).catch(() => setAiAvailable(false));
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            setPersonal({
                name: user.name || '',
                phone: user.phone || '',
                avatar: user.avatar || '',
            });
            setPhotoPreview(user.avatar ? (user.avatar.startsWith('http') ? user.avatar : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}${user.avatar}`) : null);

            if (isCoach) {
                const [statusData, pendingData] = await Promise.all([
                    getCoachStatus().catch(() => ({ hasProfile: false })),
                    getMyPendingEdits().catch(() => ({ pendingEdits: [] })),
                ]);

                if (statusData.hasProfile && statusData.profile) {
                    const p = statusData.profile;
                    setCoachProfile(p);
                    setCoachForm({
                        headline: p.headline || '', bio: p.bio || '',
                        sessionMode: p.sessionMode || 'BOTH',
                        suburb: p.suburb || '', state: p.state || '', postcode: p.postcode || '',
                        lat: p.lat, lng: p.lng, serviceRadius: p.serviceRadius || '',
                        hourlyRate: p.hourlyRate || '', yearsExp: p.yearsExp || '',
                        certifications: p.certifications || '', linkedinUrl: p.linkedinUrl || '',
                        phone: p.phone || '', email: p.email || user?.email || '',
                        availability: (() => { try { return JSON.parse(p.availability || '[]'); } catch { return []; } })(),
                    });
                    // Load existing skills as chips
                    if (p.skills?.length > 0) {
                        setSelectedSkills(p.skills.map(cs => ({
                            id: cs.skill?.id || cs.skillId,
                            name: cs.skill?.name || 'Unknown',
                        })));
                    }
                }

                setPendingEdits(pendingData.pendingEdits || []);
            }
        } catch (err) {
            console.error('Load profile data error:', err);
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    // --- Personal Info ---
    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const data = await uploadPhoto(file);
            const url = data.url.startsWith('http') ? data.url : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}${data.url}`;
            setPhotoPreview(url);
            await updateUserProfile({ avatar: data.url });
            await refreshUser();
            showToast('Photo updated');
        } catch (err) {
            showToast('Photo upload failed: ' + err.message, 'error');
        } finally {
            setUploading(false);
        }
    };

    // --- View/Edit toggle helpers ---
    const startEditing = (tabId) => {
        if (tabId === 'personal') {
            savedPersonalRef.current = { ...personal };
        } else if (tabId === 'coach') {
            savedCoachFormRef.current = { ...coachForm };
            savedSkillsRef.current = [...selectedSkills];
        } else if (tabId === 'availability') {
            savedCoachFormRef.current = { ...coachForm };
        } else if (tabId === 'certs') {
            savedCoachFormRef.current = { ...coachForm };
        }
        setEditingTab(tabId);
    };

    const cancelEditing = () => {
        if (editingTab === 'personal' && savedPersonalRef.current) {
            setPersonal(savedPersonalRef.current);
        } else if (editingTab === 'coach' && savedCoachFormRef.current) {
            setCoachForm(savedCoachFormRef.current);
            if (savedSkillsRef.current) setSelectedSkills(savedSkillsRef.current);
            setSkillSuggestions(null);
            setHeadlineSuggestions(null);
            setPreviousBio(null);
        } else if ((editingTab === 'availability' || editingTab === 'certs') && savedCoachFormRef.current) {
            setCoachForm(savedCoachFormRef.current);
        }
        setEditingTab(null);
    };

    const savePersonal = async () => {
        setSaving(true);
        try {
            await updateUserProfile({
                name: personal.name,
                phone: personal.phone,
            });
            await refreshUser();
            showToast('Personal info updated');
            setEditingTab(null);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const saveCoachProfile = async () => {
        setSaving(true);
        try {
            // All skills have real IDs — just collect and send
            const skillIds = selectedSkills.map(s => s.id).filter(Boolean);

            const response = await updateCoachProfile({
                headline: coachForm.headline,
                bio: coachForm.bio,
                skillId: skillIds,
            });

            // Update chips from server response
            if (response.profile?.skills) {
                setSelectedSkills(response.profile.skills.map(cs => ({
                    id: cs.skill?.id || cs.skillId,
                    name: cs.skill?.name || 'Unknown',
                    isProposed: cs.skill?.isProposed || false,
                })));
            }

            if (response.pendingFields?.length > 0) {
                showToast('Changes submitted for review. Your current live profile remains visible.', 'info');
            } else {
                showToast('Coach profile updated');
            }

            setEditingTab(null);
            const pendingData = await getMyPendingEdits().catch(() => ({ pendingEdits: [] }));
            setPendingEdits(pendingData.pendingEdits || []);
            await refreshUser();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // --- Availability & Pricing (instant save) ---
    const saveAvailability = async () => {
        setSaving(true);
        try {
            await updateCoachProfile({
                availability: JSON.stringify(coachForm.availability),
                hourlyRate: parseFloat(coachForm.hourlyRate) || 0,
                yearsExp: parseInt(coachForm.yearsExp) || 0,
                sessionMode: coachForm.sessionMode,
                suburb: coachForm.suburb,
                state: coachForm.state,
                postcode: coachForm.postcode,
                lat: coachForm.lat,
                lng: coachForm.lng,
                serviceRadius: coachForm.serviceRadius,
                phone: coachForm.phone,
                email: coachForm.email,
            });
            await refreshUser();
            showToast('Availability & pricing updated');
            setEditingTab(null);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // --- Certifications & Links (pending review) ---
    const saveCertifications = async () => {
        setSaving(true);
        try {
            const response = await updateCoachProfile({
                certifications: coachForm.certifications,
                linkedinUrl: coachForm.linkedinUrl,
            });

            if (response.pendingFields?.length > 0) {
                showToast('Changes submitted for review. Your current live profile remains visible.', 'info');
            } else {
                showToast('Certifications & links updated');
                setEditingTab(null);
            }

            const pendingData = await getMyPendingEdits().catch(() => ({ pendingEdits: [] }));
            setPendingEdits(pendingData.pendingEdits || []);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSuburbChange = (s) => {
        setCoachForm(prev => ({
            ...prev, suburb: s.suburb, state: s.state, postcode: s.postcode,
            lat: s.lat, lng: s.lng,
        }));
    };

    // --- AI Helper Handlers ---
    const handleAIImproveHeadline = async () => {
        setAiLoading('headline');
        setHeadlineSuggestions(null);
        try {
            const result = await aiImproveHeadline(coachForm.headline, {
                skillName: selectedSkills.map(s => s.name).join(', '),
                yearsExp: coachForm.yearsExp,
                bio: coachForm.bio,
            });
            if (result.suggestions?.length > 0) {
                setHeadlineSuggestions(result.suggestions);
            } else if (result.available === false) {
                setAiAvailable(false); // all providers exhausted — hide silently
            }
        } catch {
            /* network error — stay silent, no UI indication */
        } finally {
            setAiLoading('');
        }
    };

    const handleAIImproveBio = async () => {
        setAiLoading('bio');
        try {
            const result = await aiImproveBio(coachForm.bio, {
                skillName: selectedSkills.map(s => s.name).join(', '),
                yearsExp: coachForm.yearsExp,
                headline: coachForm.headline,
            });
            if (result.suggestion) {
                setPreviousBio(coachForm.bio);
                setCoachForm(prev => ({ ...prev, bio: result.suggestion }));
                showToast('Bio improved! Review the changes above.', 'success');
            } else if (result.available === false) {
                setAiAvailable(false); // all providers exhausted — hide silently
            }
        } catch {
            /* network error — stay silent, no UI indication */
        } finally {
            setAiLoading('');
        }
    };

    const handleAISuggestSkills = async () => {
        setAiLoading('skills');
        setSkillSuggestions(null);
        try {
            const result = await aiSuggestSkills({
                skillName: selectedSkills.map(s => s.name).join(', '),
                headline: coachForm.headline,
                bio: coachForm.bio,
            });
            if (result.suggestions?.length > 0) {
                // Filter out already-selected skills
                const existing = new Set(selectedSkills.map(s => s.name.toLowerCase()));
                const filtered = result.suggestions.filter(s => !existing.has(s.toLowerCase()));
                setSkillSuggestions(filtered.length > 0 ? filtered : null);
                if (filtered.length === 0) showToast('All suggested skills are already added.', 'info');
            } else if (result.available === false) {
                setAiAvailable(false); // all providers exhausted — hide silently
            }
        } catch {
            /* network error — stay silent, no UI indication */
        } finally {
            setAiLoading('');
        }
    };

    // --- Skill chip handlers ---
    const addSkillByName = async (name, options = {}) => {
        if (!name.trim()) return;
        if (selectedSkills.length >= 10) {
            showToast('Maximum 10 skills allowed.', 'info');
            return;
        }
        try {
            const result = await resolveSkill(name, {
                createNew: options.createNew,
                source: options.source || 'manual',
            });
            if (result.skill) {
                if (selectedSkills.some(s => s.id === result.skill.id)) {
                    const existing = selectedSkills.find(s => s.id === result.skill.id);
                    if (existing.name.toLowerCase() !== name.toLowerCase()) {
                        showToast(`"${name}" maps to "${existing.name}" which is already added.`, 'info');
                    } else {
                        showToast(`"${name}" is already added.`, 'info');
                    }
                    return;
                }
                setSelectedSkills(prev => [...prev, {
                    id: result.skill.id,
                    name: result.skill.name,
                    isProposed: result.isProposed || false,
                }]);
            }
        } catch (err) {
            showToast(err.message || 'Could not add skill.', 'error');
        }
    };

    const removeSkill = (skillId) => {
        setSelectedSkills(prev => prev.filter(s => s.id !== skillId));
    };

    const handleSkillAutocompleteSelect = (s) => {
        if (!s.id) return;
        const canonicalName = s.resolvedName || s.name;
        if (selectedSkills.length >= 5) {
            showToast('Maximum 5 skills allowed.', 'info');
            return;
        }
        if (selectedSkills.some(sk => sk.id === s.id)) {
            const displayName = s.name !== canonicalName ? `"${s.name}" maps to "${canonicalName}"` : `"${canonicalName}"`;
            showToast(`${displayName} is already in your skills.`, 'info');
            return;
        }
        setSelectedSkills(prev => [...prev, { id: s.id, name: canonicalName, isProposed: false }]);
    };

    const handleAddAISuggestion = async (name) => {
        // AI suggestions follow the exact same flow as manual entry
        setSkillSuggestions(prev => prev ? prev.filter(s => s !== name) : null);
        await addSkillByName(name, { source: 'ai' });
    };

    const handleIgnoreAISuggestion = (name) => {
        setSkillSuggestions(prev => {
            if (!prev) return null;
            const filtered = prev.filter(s => s !== name);
            return filtered.length > 0 ? filtered : null;
        });
    };

    if (!user) return null;
    if (loading) return <div className="loading">Loading profile...</div>;

    const coachStatus = coachProfile?.status || null;
    const statusInfo = STATUS_CONFIG[coachStatus] || null;
    const activePending = pendingEdits.filter(pe => pe.status === 'PENDING');
    const suburbDisplay = coachForm.suburb ? `${coachForm.suburb}, ${coachForm.state} ${coachForm.postcode}` : '';

    const coachTabs = isCoach && coachProfile;

    const TABS = [
        { id: 'personal', label: 'Personal Info' },
        ...(coachTabs ? [
            { id: 'coach', label: 'Coach Profile' },
            { id: 'availability', label: 'Availability & Pricing' },
            { id: 'certs', label: 'Certifications & Links' },
            { id: 'status', label: 'Status' },
        ] : []),
    ];

    return (
        <div className="profile-settings">
            <div className="profile-settings-header">
                <h1 className="profile-settings-title">Profile Settings</h1>
                <p className="profile-settings-subtitle">{user.email}</p>
            </div>

            <VerifyEmailBanner />

            {/* Toast notification */}
            {toast && (
                <div className={`profile-toast ${toast.type}`}>
                    {toast.type === 'success' && '✓ '}
                    {toast.type === 'info' && 'ℹ '}
                    {toast.type === 'error' && '✕ '}
                    {toast.message}
                </div>
            )}

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`tab ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                        {t.id === 'status' && activePending.length > 0 && (
                            <span className="tab-badge">{activePending.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="profile-settings-content">
                {tab === 'personal' && (
                    <div className="dashboard-card">
                        <div className="profile-card-header">
                            <h2 className="dashboard-card-title">Personal Information</h2>
                            {editingTab !== 'personal' && (
                                <button className="btn btn-outline btn-sm" onClick={() => startEditing('personal')}>Edit</button>
                            )}
                        </div>

                        {editingTab === 'personal' ? (
                            /* --- EDIT MODE --- */
                            <div className="apply-form">
                                <div className="form-group">
                                    <label className="form-label">Profile Photo</label>
                                    <div className="photo-upload">
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Preview" className="photo-preview" />
                                        ) : (
                                            <div className="photo-placeholder">
                                                {user.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                        <label className="btn btn-outline btn-sm photo-upload-btn">
                                            {uploading ? 'Uploading...' : 'Change Photo'}
                                            <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden />
                                        </label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="profile-name">Full Name</label>
                                    <input
                                        id="profile-name" className="form-input"
                                        value={personal.name}
                                        onChange={(e) => setPersonal({ ...personal, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" value={user.email} disabled
                                        style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="profile-phone">Phone</label>
                                    <input
                                        id="profile-phone" className="form-input" type="tel"
                                        value={personal.phone}
                                        onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                                        placeholder="04xx xxx xxx"
                                    />
                                </div>
                                <div className="profile-edit-actions">
                                    <button className="btn btn-primary" onClick={savePersonal} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button className="btn btn-outline" onClick={cancelEditing} disabled={saving}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            /* --- VIEW MODE --- */
                            <div className="profile-view">
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Photo</span>
                                    <span className="profile-view-value">
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Profile" className="photo-preview-sm" />
                                        ) : (
                                            <div className="photo-placeholder-sm">{user.name?.charAt(0)?.toUpperCase() || '?'}</div>
                                        )}
                                    </span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Full Name</span>
                                    <span className="profile-view-value">{personal.name || '—'}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Email</span>
                                    <span className="profile-view-value">{user.email}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Phone</span>
                                    <span className="profile-view-value">{personal.phone || '—'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'coach' && coachTabs && (
                    <div className="dashboard-card">
                        <div className="profile-card-header">
                            <h2 className="dashboard-card-title">Public Coach Profile</h2>
                            {editingTab !== 'coach' && (
                                <button className="btn btn-outline btn-sm" onClick={() => startEditing('coach')}>Edit</button>
                            )}
                        </div>
                        <p className="form-helper-text" style={{ marginBottom: 'var(--space-4)' }}>
                            Changes to headline, bio, and skills may require review before appearing publicly.
                        </p>

                        {activePending.length > 0 && (
                            <div className="pending-banner">
                                <strong>ℹ Pending review:</strong> Some recent changes are under review. Your current live profile remains visible until approved.
                            </div>
                        )}

                        {editingTab === 'coach' ? (
                            <div className="apply-form">
                                <div className="form-group">
                                    <label className="form-label">What do you teach?</label>
                                    <p className="form-helper-text" style={{ marginBottom: 'var(--space-2)' }}>
                                        Add the skills, subjects or activities you coach.
                                    </p>
                                    {selectedSkills.length > 0 && (
                                        <div className="skill-chips">
                                            {selectedSkills.map(s => (
                                                <span key={s.id} className={`skill-chip ${s.isProposed ? 'skill-chip-proposed' : ''}`}>
                                                    {s.name}
                                                    {s.isProposed && <span className="skill-chip-badge">Pending</span>}
                                                    <button type="button" className="skill-chip-remove" onClick={() => removeSkill(s.id)} title="Remove skill">×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <SkillAutocomplete
                                        value={skillInput} onChange={setSkillInput}
                                        onSelect={handleSkillAutocompleteSelect} onCustomSubmit={addSkillByName}
                                        clearOnSelect placeholder="Type a skill and select or press Enter..." id="edit-skill"
                                        excludeIds={new Set(selectedSkills.map(s => s.id))}
                                        excludeNames={new Set(selectedSkills.map(s => s.name.toLowerCase()))}
                                        mode="coach"
                                    />
                                    {aiAvailable && (
                                        <div style={{ marginTop: 'var(--space-3)' }}>
                                            <button type="button" className="btn-ai-helper" onClick={handleAISuggestSkills}
                                                disabled={aiLoading === 'skills' || (!coachForm.bio.trim() && !coachForm.headline.trim())}>
                                                {aiLoading === 'skills' ? '✨ Suggesting...' : '✨ Suggest skills with AI'}
                                            </button>
                                        </div>
                                    )}
                                    {skillSuggestions && skillSuggestions.length > 0 && (
                                        <div className="ai-suggestions-list" style={{ marginTop: 'var(--space-2)' }}>
                                            <p className="ai-suggestions-label">AI suggested skills:</p>
                                            {skillSuggestions.map((s, i) => (
                                                <div key={i} className="ai-suggestion-row">
                                                    <span className="ai-suggestion-name">{s}</span>
                                                    <div className="ai-suggestion-actions">
                                                        <button type="button" className="btn-ai-add" onClick={() => handleAddAISuggestion(s)}>Add</button>
                                                        <button type="button" className="btn-ai-ignore" onClick={() => handleIgnoreAISuggestion(s)}>Ignore</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="edit-headline">Headline / Title</label>
                                    <input id="edit-headline" className="form-input" value={coachForm.headline}
                                        onChange={(e) => { setCoachForm({ ...coachForm, headline: e.target.value }); setHeadlineSuggestions(null); }}
                                        placeholder="e.g. Certified Tennis Coach — All Levels" maxLength={120} />
                                    <div className="form-field-actions">
                                        <span className="form-char-count">{coachForm.headline.length}/120</span>
                                        {aiAvailable && (
                                            <button type="button" className="btn-ai-helper" onClick={handleAIImproveHeadline}
                                                disabled={aiLoading === 'headline' || !coachForm.headline.trim()}>
                                                {aiLoading === 'headline' ? '✨ Generating...' : '✨ Improve headline with AI'}
                                            </button>
                                        )}
                                    </div>
                                    {headlineSuggestions && (
                                        <div className="ai-suggestions-list">
                                            <p className="ai-suggestions-label">Choose a headline:</p>
                                            {headlineSuggestions.map((h, i) => (
                                                <button key={i} type="button" className="ai-suggestion-option"
                                                    onClick={() => { setCoachForm({ ...coachForm, headline: h }); setHeadlineSuggestions(null); }}>{h}</button>
                                            ))}
                                            <button type="button" className="ai-suggestion-dismiss" onClick={() => setHeadlineSuggestions(null)}>Dismiss</button>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="edit-bio">About / Bio</label>
                                    <textarea id="edit-bio" className="form-input form-textarea" value={coachForm.bio}
                                        onChange={(e) => setCoachForm({ ...coachForm, bio: e.target.value })}
                                        placeholder="Tell learners about your experience and teaching style..."
                                        rows={5} maxLength={2000} />
                                    <div className="form-field-actions">
                                        <span className="form-char-count">{coachForm.bio.length}/2000</span>
                                        {aiAvailable && (
                                            <button type="button" className="btn-ai-helper" onClick={handleAIImproveBio}
                                                disabled={aiLoading === 'bio' || !coachForm.bio.trim()}>
                                                {aiLoading === 'bio' ? '✨ Improving...' : '✨ Improve bio with AI'}
                                            </button>
                                        )}
                                    </div>
                                    {previousBio && (
                                        <button type="button" className="btn-ai-undo"
                                            onClick={() => { setCoachForm({ ...coachForm, bio: previousBio }); setPreviousBio(null); }}>↩ Undo AI change</button>
                                    )}
                                </div>
                                <div className="profile-edit-actions">
                                    <button className="btn btn-primary" onClick={saveCoachProfile} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Coach Profile'}
                                    </button>
                                    <button className="btn btn-outline" onClick={cancelEditing} disabled={saving}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="profile-view">
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Skills</span>
                                    <span className="profile-view-value">
                                        {selectedSkills.length > 0 ? (
                                            <div className="skill-chips skill-chips-view">
                                                {selectedSkills.map(s => (
                                                    <span key={s.id} className="skill-chip skill-chip-view">{s.name}</span>
                                                ))}
                                            </div>
                                        ) : <span className="profile-view-empty">No skills added</span>}
                                    </span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Headline</span>
                                    <span className="profile-view-value">{coachForm.headline || <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                                <div className="profile-view-row profile-view-row-bio">
                                    <span className="profile-view-label">Bio</span>
                                    <span className="profile-view-value profile-view-bio">{coachForm.bio || <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}



                {tab === 'availability' && coachTabs && (
                    <div className="dashboard-card">
                        <div className="profile-card-header">
                            <h2 className="dashboard-card-title">Availability & Pricing</h2>
                            {editingTab !== 'availability' && (
                                <button className="btn btn-outline btn-sm" onClick={() => startEditing('availability')}>Edit</button>
                            )}
                        </div>

                        {editingTab === 'availability' ? (
                            <div className="apply-form">
                                <div className="form-group">
                                    <label className="form-label">Service Mode</label>
                                    <div className="form-toggle">
                                        {['IN_PERSON', 'ONLINE', 'BOTH'].map(mode => (
                                            <button key={mode} type="button"
                                                className={`form-toggle-option ${coachForm.sessionMode === mode ? 'active' : ''}`}
                                                onClick={() => setCoachForm({ ...coachForm, sessionMode: mode })}>
                                                {SESSION_MODE_LABELS[mode]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Location</label>
                                    <SuburbAutocomplete value={suburbDisplay} onChange={handleSuburbChange}
                                        placeholder="Start typing your suburb..." id="edit-suburb" />
                                </div>
                                {coachForm.sessionMode !== 'ONLINE' && (
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="edit-radius">Service Area</label>
                                        <input id="edit-radius" className="form-input" value={coachForm.serviceRadius}
                                            onChange={(e) => setCoachForm({ ...coachForm, serviceRadius: e.target.value })}
                                            placeholder="e.g. Eastern Suburbs Sydney" />
                                    </div>
                                )}
                                <div className="form-row">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" htmlFor="edit-rate">Hourly Rate ($)</label>
                                        <input id="edit-rate" className="form-input" type="number" min="1" step="1"
                                            value={coachForm.hourlyRate}
                                            onChange={(e) => setCoachForm({ ...coachForm, hourlyRate: e.target.value })} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" htmlFor="edit-exp">Years of Experience</label>
                                        <input id="edit-exp" className="form-input" type="number" min="0"
                                            value={coachForm.yearsExp}
                                            onChange={(e) => setCoachForm({ ...coachForm, yearsExp: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" htmlFor="edit-email">Contact Email</label>
                                        <input id="edit-email" className="form-input" type="email" value={coachForm.email}
                                            onChange={(e) => setCoachForm({ ...coachForm, email: e.target.value })} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" htmlFor="edit-phone">Phone</label>
                                        <input id="edit-phone" className="form-input" type="tel" value={coachForm.phone}
                                            onChange={(e) => setCoachForm({ ...coachForm, phone: e.target.value })}
                                            placeholder="04xx xxx xxx" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Broad Availability</label>
                                    <AvailabilityPicker value={coachForm.availability}
                                        onChange={(v) => setCoachForm({ ...coachForm, availability: v })} />
                                </div>
                                <div className="profile-edit-actions">
                                    <button className="btn btn-primary" onClick={saveAvailability} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button className="btn btn-outline" onClick={cancelEditing} disabled={saving}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="profile-view">
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Service Mode</span>
                                    <span className="profile-view-value">{SESSION_MODE_LABELS[coachForm.sessionMode] || '—'}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Location</span>
                                    <span className="profile-view-value">{suburbDisplay || <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                                {coachForm.sessionMode !== 'ONLINE' && coachForm.serviceRadius && (
                                    <div className="profile-view-row">
                                        <span className="profile-view-label">Service Area</span>
                                        <span className="profile-view-value">{coachForm.serviceRadius}</span>
                                    </div>
                                )}
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Hourly Rate</span>
                                    <span className="profile-view-value">{coachForm.hourlyRate ? `$${coachForm.hourlyRate}/hr` : <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Experience</span>
                                    <span className="profile-view-value">{coachForm.yearsExp ? `${coachForm.yearsExp} years` : <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Contact Email</span>
                                    <span className="profile-view-value">{coachForm.email || <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Phone</span>
                                    <span className="profile-view-value">{coachForm.phone || <span className="profile-view-empty">Not set</span>}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">Availability</span>
                                    <span className="profile-view-value">
                                        {coachForm.availability?.length > 0
                                            ? formatAvailability(coachForm.availability)
                                            : <span className="profile-view-empty">Not set</span>}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {tab === 'certs' && coachTabs && (
                    <div className="dashboard-card">
                        <div className="profile-card-header">
                            <h2 className="dashboard-card-title">Certifications & Links</h2>
                            {editingTab !== 'certs' && (
                                <button className="btn btn-outline btn-sm" onClick={() => startEditing('certs')}>Edit</button>
                            )}
                        </div>
                        <p className="form-helper-text" style={{ marginBottom: 'var(--space-4)' }}>
                            Changes to this section may require review before they appear publicly.
                        </p>

                        {activePending.some(pe => pe.changes?.certifications || pe.changes?.linkedinUrl) && (
                            <div className="pending-banner">
                                <strong>ℹ Pending review:</strong> Your recent changes to this section are under review.
                            </div>
                        )}

                        {editingTab === 'certs' ? (
                            <div className="apply-form">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="edit-certs">Certifications & Qualifications</label>
                                    <textarea id="edit-certs" className="form-input form-textarea"
                                        value={coachForm.certifications}
                                        onChange={(e) => setCoachForm({ ...coachForm, certifications: e.target.value })}
                                        placeholder="List any relevant certifications, qualifications, or credentials"
                                        rows={3} maxLength={1000} />
                                    <span className="form-char-count">{coachForm.certifications.length}/1000</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="edit-linkedin">LinkedIn / Website</label>
                                    <input id="edit-linkedin" className="form-input" value={coachForm.linkedinUrl}
                                        onChange={(e) => setCoachForm({ ...coachForm, linkedinUrl: e.target.value })}
                                        placeholder="https://linkedin.com/in/you" />
                                </div>
                                <div className="profile-edit-actions">
                                    <button className="btn btn-primary" onClick={saveCertifications} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button className="btn btn-outline" onClick={cancelEditing} disabled={saving}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="profile-view">
                                <div className="profile-view-row profile-view-row-bio">
                                    <span className="profile-view-label">Certifications</span>
                                    <span className="profile-view-value profile-view-bio">{coachForm.certifications || <span className="profile-view-empty">None added</span>}</span>
                                </div>
                                <div className="profile-view-row">
                                    <span className="profile-view-label">LinkedIn / Website</span>
                                    <span className="profile-view-value">
                                        {coachForm.linkedinUrl ? (
                                            <a href={coachForm.linkedinUrl} target="_blank" rel="noopener noreferrer">{coachForm.linkedinUrl}</a>
                                        ) : <span className="profile-view-empty">Not set</span>}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {tab === 'status' && coachTabs && (
                    <div className="dashboard-card">
                        <h2 className="dashboard-card-title">Profile Status</h2>

                        {/* Status banner */}
                        {statusInfo && (
                            <div className={`coach-status-banner ${statusInfo.className}`} style={{ marginBottom: 'var(--space-6)' }}>
                                <div className="coach-status-label">
                                    <span style={{ marginRight: 'var(--space-2)' }}>{statusInfo.icon}</span>
                                    {statusInfo.label}
                                </div>
                                <p>{statusInfo.message}</p>
                                {coachStatus === 'APPROVED' && user?.slug && (
                                    <Link to={`/coach/${user.slug}`} className="btn btn-outline btn-sm" style={{ marginTop: 'var(--space-3)' }}>
                                        View My Public Profile
                                    </Link>
                                )}
                            </div>
                        )}

                        {/* Verification badges */}
                        <div style={{ marginBottom: 'var(--space-6)' }}>
                            <h3 style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>Verification</h3>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                {coachStatus === 'APPROVED' && (
                                    <span className="badge badge-success">✓ Coach Verified</span>
                                )}
                                {user.emailVerified && (
                                    <span className="badge badge-info">✓ Email Verified</span>
                                )}
                            </div>
                        </div>

                        {/* Pending edits */}
                        {pendingEdits.length > 0 && (
                            <div>
                                <h3 style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>Recent Edit History</h3>
                                <div className="pending-edits-list">
                                    {pendingEdits.map(pe => (
                                        <div key={pe.id} className={`pending-edit-item ${pe.status.toLowerCase()}`}>
                                            <div className="pending-edit-header">
                                                <span className={`pending-edit-status ${pe.status.toLowerCase()}`}>
                                                    {pe.status === 'PENDING' ? '⏳ Pending Review' :
                                                     pe.status === 'APPROVED' ? '✓ Approved' :
                                                     pe.status === 'REJECTED' ? '✕ Rejected' :
                                                     pe.status}
                                                </span>
                                                <span className="pending-edit-date">
                                                    {new Date(pe.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <div className="pending-edit-fields">
                                                {Object.keys(pe.changes || {}).map(field => (
                                                    <span key={field} className="pending-edit-field">{field}</span>
                                                ))}
                                            </div>
                                            {pe.adminNotes && (
                                                <div className="pending-edit-notes">
                                                    Admin notes: {pe.adminNotes}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
