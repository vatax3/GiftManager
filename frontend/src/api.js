// Default to same-origin API (empty) so the SPA works when served by the backend.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'gm_token';

let onUnauthorized = null;

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Thin fetch wrapper: attaches the bearer token and clears the session on 401
// so an expired/invalid token doesn't get silently retried forever.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    setToken(null);
    onUnauthorized?.();
  }
  return res;
}

export const api = {
  setOnUnauthorized: (fn) => { onUnauthorized = fn; },
  setToken,
  getToken,

  // Auth
  login: async (username, password) => {
    const res = await request('/auth/login', { method: 'POST', body: { username, password } });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    setToken(data.access_token);
    return data;
  },

  register: async (username, password) => {
    const res = await request('/auth/register', { method: 'POST', body: { username, password } });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Register failed');
    }
    const data = await res.json();
    setToken(data.access_token);
    return data;
  },

  // Projects
  createProject: async (name, code) => {
    const res = await request('/projects', { method: 'POST', body: { name, code } });
    if (!res.ok) throw new Error('Error creating project');
    return res.json();
  },

  getProject: async (code) => {
    const res = await request(`/projects/${code}`);
    if (!res.ok) return null;
    return res.json();
  },

  joinProject: async (code, memberName, createNew) => {
    const res = await request(`/projects/${code}/join`, {
      method: 'POST',
      body: { member_name: memberName, create_new: createNew }
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error joining');
    }
  },

  // Expenses
  saveExpense: async (projectCode, expense) => {
    const res = await request(`/projects/${projectCode}/expenses`, { method: 'POST', body: expense });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur lors de la sauvegarde');
    }
  },

  saveSubEvent: async (projectCode, subEvent) => {
    const res = await request(`/projects/${projectCode}/subevents`, { method: 'POST', body: subEvent });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur lors de la sauvegarde du sous-evenement');
    }
  },

  // Admin
  getAdminStats: async () => {
      const res = await request('/admin/stats');
      if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Erreur de chargement');
      }
      return res.json();
  },

  deleteProject: async (code) => {
      const res = await request(`/admin/projects/${code}`, { method: 'DELETE' });
      if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Erreur de suppression');
      }
  },

  updateUserPassword: async (userId, newPassword, newUsername) => {
      const res = await request(`/admin/users/${userId}/password`, {
          method: 'PUT',
          body: { new_password: newPassword, new_username: newUsername }
      });
      if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Erreur de mise a jour');
      }
  }
};
