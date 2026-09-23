const BASE = 'http://localhost:4000';

function getToken() {
  return localStorage.getItem('cn_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function register(email, password) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('cn_token', data.token);
  return data.user;
}

export async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('cn_token', data.token);
  return data.user;
}

export function logout() {
  localStorage.removeItem('cn_token');
}

export async function getMe() {
  if (!getToken()) return null;
  try {
    const data = await apiFetch('/auth/me');
    return data.user;
  } catch {
    localStorage.removeItem('cn_token');
    return null;
  }
}

// ── Profile management ──────────────────────────────────────────────────────
export async function updateEmail(email) {
  const data = await apiFetch('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({ email }),
  });
  localStorage.setItem('cn_token', data.token); // keep token in sync with new email
  return data.user;
}

export async function updatePassword(currentPassword, newPassword) {
  return apiFetch('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ── Saved articles ─────────────────────────────────────────────────────────────
export async function fetchSaved() {
  const data = await apiFetch('/saves');
  return data.articles; // array
}

export async function saveArticle(article) {
  return apiFetch('/saves', {
    method: 'POST',
    body: JSON.stringify({ article }),
  });
}

export async function unsaveArticle(articleId) {
  return apiFetch(`/saves/${encodeURIComponent(articleId)}`, { method: 'DELETE' });
}
