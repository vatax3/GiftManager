// Default to same-origin API (empty) so the SPA works when served by the backend.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const api = {
  // Auth
  login: async (username, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
    }
    return res.json();
  },

  register: async (username, password) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Register failed');
    }
    return res.json();
  },

  // Projects
  createProject: async (name, code) => {
    const res = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code })
    });
    if (!res.ok) throw new Error('Error creating project');
    return res.json();
  },

  getProject: async (code) => {
    const res = await fetch(`${API_URL}/projects/${code}`);
    if (!res.ok) return null;
    return res.json();
  },

  joinProject: async (code, memberName, createNew, userId) => {
    const res = await fetch(`${API_URL}/projects/${code}/join?user_id=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_name: memberName, create_new: createNew })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error joining');
    }
  },

  // Expenses
  saveExpense: async (projectCode, expense) => {
    await fetch(`${API_URL}/projects/${projectCode}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense)
    });
  },

  // Admin
  getAdminStats: async () => {
      const res = await fetch(`${API_URL}/admin/stats`);
      return res.json();
  },

  deleteProject: async (code) => {
      await fetch(`${API_URL}/admin/projects/${code}`, { method: 'DELETE' });
  },

  updateUserPassword: async (userId, newPassword) => {
      await fetch(`${API_URL}/admin/users/${userId}/password`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_password: newPassword })
      });
  }
};
