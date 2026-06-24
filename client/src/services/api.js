const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const handleResponse = async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
};

// Auth
export const googleAuth = (credential, intent) =>
    fetch(`${API_URL}/auth/google`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ credential, intent }) }).then(handleResponse);

export const register = (data) =>
    fetch(`${API_URL}/auth/register`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

export const login = (data) =>
    fetch(`${API_URL}/auth/login`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

export const getMe = () =>
    fetch(`${API_URL}/auth/me`, { headers: getHeaders() }).then(handleResponse);

export const verifyEmail = (token) =>
    fetch(`${API_URL}/auth/verify-email?token=${token}`, { headers: getHeaders() }).then(handleResponse);

export const resendVerification = () =>
    fetch(`${API_URL}/auth/resend-verification`, { method: 'POST', headers: getHeaders() }).then(handleResponse);

// Coaches
export const searchCoaches = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/coaches?${query}`, { headers: getHeaders() }).then(handleResponse);
};

export const getCoachBySlug = (slug) =>
    fetch(`${API_URL}/coaches/slug/${slug}`, { headers: getHeaders() }).then(handleResponse);

export const getCategories = () =>
    fetch(`${API_URL}/coaches/categories`, { headers: getHeaders() }).then(handleResponse);

export const getCoachStatus = () =>
    fetch(`${API_URL}/coaches/my-status`, { headers: getHeaders() }).then(handleResponse);

export const applyAsCoach = (data) =>
    fetch(`${API_URL}/coaches/apply`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

export const updateCoachProfile = (data) =>
    fetch(`${API_URL}/coaches/profile`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

// Contacts
export const submitContactRequest = (data) =>
    fetch(`${API_URL}/contacts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

export const getMyContactRequests = (role) => {
    const query = role ? `?role=${role}` : '';
    return fetch(`${API_URL}/contacts${query}`, { headers: getHeaders() }).then(handleResponse);
};

// Suburbs
export const searchSuburbs = (query) =>
    fetch(`${API_URL}/suburbs/search?q=${encodeURIComponent(query)}`, { headers: getHeaders() }).then(handleResponse);

// File upload
export const uploadPhoto = async (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    return handleResponse(res);
};

// Admin APIs
export const getAdminCoaches = (status) => {
    const query = status ? `?status=${status}` : '';
    return fetch(`${API_URL}/admin/coaches${query}`, { headers: getHeaders() }).then(handleResponse);
};

export const approveCoach = (id) =>
    fetch(`${API_URL}/admin/coaches/${id}/approve`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const rejectCoach = (id) =>
    fetch(`${API_URL}/admin/coaches/${id}/reject`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const suspendCoach = (id) =>
    fetch(`${API_URL}/admin/coaches/${id}/suspend`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const reactivateCoach = (id) =>
    fetch(`${API_URL}/admin/coaches/${id}/reactivate`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const deleteCoach = (id) =>
    fetch(`${API_URL}/admin/coaches/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);

export const getAdminUsers = () =>
    fetch(`${API_URL}/admin/users`, { headers: getHeaders() }).then(handleResponse);

export const suspendUser = (id) =>
    fetch(`${API_URL}/admin/users/${id}/suspend`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const unsuspendUser = (id) =>
    fetch(`${API_URL}/admin/users/${id}/unsuspend`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const deleteUser = (id) =>
    fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);

export const getAdminCategories = () =>
    fetch(`${API_URL}/admin/categories`, { headers: getHeaders() }).then(handleResponse);

export const createCategory = (name) =>
    fetch(`${API_URL}/admin/categories`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name }) }).then(handleResponse);

export const updateCategory = (id, name) =>
    fetch(`${API_URL}/admin/categories/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ name }) }).then(handleResponse);

export const toggleCategory = (id) =>
    fetch(`${API_URL}/admin/categories/${id}/toggle`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const deleteCategory = (id) =>
    fetch(`${API_URL}/admin/categories/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);

export const getAdminContacts = () =>
    fetch(`${API_URL}/admin/contacts`, { headers: getHeaders() }).then(handleResponse);

// Skills autocomplete & resolve
export const searchSkills = (query, mode) => {
    const params = new URLSearchParams({ q: query });
    if (mode) params.append('mode', mode);
    return fetch(`${API_URL}/coaches/skills/autocomplete?${params}`, { headers: getHeaders() }).then(handleResponse);
};

export const resolveSkill = (text, { createNew, source } = {}) =>
    fetch(`${API_URL}/coaches/skills/resolve`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ text, createNew, source }) }).then(handleResponse);

// Admin Skill Management
export const getAdminSkills = (proposed) => {
    const query = proposed !== undefined ? `?proposed=${proposed}` : '';
    return fetch(`${API_URL}/admin/skills${query}`, { headers: getHeaders() }).then(handleResponse);
};

export const createSkill = (data) =>
    fetch(`${API_URL}/admin/skills`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

export const updateSkill = (id, data) =>
    fetch(`${API_URL}/admin/skills/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

export const toggleSkill = (id) =>
    fetch(`${API_URL}/admin/skills/${id}/toggle`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const deleteSkill = (id) =>
    fetch(`${API_URL}/admin/skills/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);

export const addSkillAlias = (id, alias) =>
    fetch(`${API_URL}/admin/skills/${id}/aliases`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ alias }) }).then(handleResponse);

export const removeSkillAlias = (id, aliasId) =>
    fetch(`${API_URL}/admin/skills/${id}/aliases/${aliasId}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);

export const approveSkill = (id) =>
    fetch(`${API_URL}/admin/skills/${id}/approve`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const mergeSkill = (sourceId, targetId) =>
    fetch(`${API_URL}/admin/skills/${sourceId}/merge/${targetId}`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

export const rejectSkill = (id) =>
    fetch(`${API_URL}/admin/skills/${id}/reject`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

// User profile
export const updateUserProfile = (data) =>
    fetch(`${API_URL}/auth/profile`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

// Coach pending edits
export const getMyPendingEdits = () =>
    fetch(`${API_URL}/coaches/my-pending-edits`, { headers: getHeaders() }).then(handleResponse);

// Reports
export const submitReport = (data) =>
    fetch(`${API_URL}/reports`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse);

// Admin — Pending Edits
export const getAdminPendingEdits = (status) => {
    const query = status ? `?status=${status}` : '';
    return fetch(`${API_URL}/admin/pending-edits${query}`, { headers: getHeaders() }).then(handleResponse);
};

export const approvePendingEdit = (id, notes) =>
    fetch(`${API_URL}/admin/pending-edits/${id}/approve`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ notes }) }).then(handleResponse);

export const rejectPendingEdit = (id, notes) =>
    fetch(`${API_URL}/admin/pending-edits/${id}/reject`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ notes }) }).then(handleResponse);

// Admin — Reports
export const getAdminReports = (status) => {
    const query = status ? `?status=${status}` : '';
    return fetch(`${API_URL}/admin/reports${query}`, { headers: getHeaders() }).then(handleResponse);
};

export const reviewReport = (id, notes) =>
    fetch(`${API_URL}/admin/reports/${id}/review`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ notes }) }).then(handleResponse);

export const dismissReport = (id) =>
    fetch(`${API_URL}/admin/reports/${id}/dismiss`, { method: 'PATCH', headers: getHeaders() }).then(handleResponse);

// AI Helper APIs
export const getAIStatus = () =>
    fetch(`${API_URL}/ai/status`).then(handleResponse);

// (Removed: parseSearchQuery — learner search uses keyword/autocomplete only)

export const aiImproveBio = (text, context) =>
    fetch(`${API_URL}/ai/improve-bio`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ text, context }) }).then(handleResponse);

export const aiImproveHeadline = (text, context) =>
    fetch(`${API_URL}/ai/improve-headline`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ text, context }) }).then(handleResponse);

export const aiSuggestSkills = (context) =>
    fetch(`${API_URL}/ai/suggest-skills`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ context }) }).then(handleResponse);

// (Removed: aiNormaliseSkill — normalisation is handled server-side in resolve)

// Messaging APIs
export const getUnreadMessageCount = () =>
    fetch(`${API_URL}/messages/unread-count`, { headers: getHeaders() }).then(handleResponse);

export const getMessageThreads = () =>
    fetch(`${API_URL}/messages/threads`, { headers: getHeaders() }).then(handleResponse);

export const getMessageThread = (id) =>
    fetch(`${API_URL}/messages/threads/${id}`, { headers: getHeaders() }).then(handleResponse);

export const sendMessage = (id, body) =>
    fetch(`${API_URL}/messages/threads/${id}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ body }) }).then(handleResponse);

export const markThreadRead = (id) =>
    fetch(`${API_URL}/messages/threads/${id}/read`, { method: 'POST', headers: getHeaders() }).then(handleResponse);
