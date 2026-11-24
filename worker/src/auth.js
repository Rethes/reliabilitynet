import { Hono } from 'hono';
import { readJsonBody } from './http.js';
import {
  createUserToken,
  getJWTSecret,
  hashPassword,
  requireAuth,
  verifyPassword,
} from './security.js';

const auth = new Hono();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueEmailError(error) {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: users.email');
}

function logAuthFailure(message, error) {
  console.error(message, error instanceof Error ? error.name : 'UnknownError');
}

auth.post('/auth/register', async c => {
  const secret = getJWTSecret(c);
  if (!secret) return c.json({ error: 'Authentication service unavailable' }, 500);

  const parsed = await readJsonBody(c);
  if (parsed.response) return parsed.response;
  const { email, password } = parsed.value || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return c.json({ error: 'Email and password are required' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const passwordHash = await hashPassword(password);
    await c.env.DB.prepare('INSERT INTO users (email, password) VALUES (?, ?)')
      .bind(normalizedEmail, passwordHash)
      .run();
    const row = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first();
    if (!row) {
      console.error('Registered user lookup returned no row');
      return c.json({ error: 'Registration failed' }, 500);
    }

    const user = { id: row.id, email: row.email };
    const token = await createUserToken(user, secret);
    return c.json({ token, user });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      return c.json({ error: 'Email already registered' }, 409);
    }
    logAuthFailure('Registration failed:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

auth.post('/auth/login', async c => {
  const secret = getJWTSecret(c);
  if (!secret) return c.json({ error: 'Authentication service unavailable' }, 500);

  const parsed = await readJsonBody(c);
  if (parsed.response) return parsed.response;
  const { email, password } = parsed.value || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const row = await c.env.DB.prepare('SELECT id, email, password FROM users WHERE email = ?')
    .bind(normalizedEmail)
    .first();
  if (!row || !(await verifyPassword(password, row.password))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const user = { id: row.id, email: row.email };
  const token = await createUserToken(user, secret);
  return c.json({ token, user });
});

auth.get('/auth/me', requireAuth, c => c.json({ user: c.get('user') }));

auth.put('/auth/profile', requireAuth, async c => {
  const parsed = await readJsonBody(c);
  if (parsed.response) return parsed.response;
  const { email } = parsed.value || {};
  if (typeof email !== 'string' || !email.trim()) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!emailPattern.test(normalizedEmail)) {
    return c.json({ error: 'Please enter a valid email address' }, 400);
  }

  try {
    const result = await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?')
      .bind(normalizedEmail, c.get('user').id)
      .run();
    if (result.meta.changes === 0) return c.json({ error: 'User not found' }, 404);

    const user = { id: c.get('user').id, email: normalizedEmail };
    const token = await createUserToken(user, getJWTSecret(c));
    return c.json({ token, user });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      return c.json({ error: 'Email already in use' }, 409);
    }
    logAuthFailure('Email update failed:', error);
    return c.json({ error: 'Failed to update email' }, 500);
  }
});

auth.put('/auth/password', requireAuth, async c => {
  const parsed = await readJsonBody(c);
  if (parsed.response) return parsed.response;
  const { currentPassword, newPassword } = parsed.value || {};
  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Current and new password are required' }, 400);
  }
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return c.json({ error: 'Current and new password are required' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: 'New password must be at least 6 characters' }, 400);
  }

  const row = await c.env.DB.prepare('SELECT password FROM users WHERE id = ?')
    .bind(c.get('user').id)
    .first();
  if (!row) return c.json({ error: 'User not found' }, 404);
  if (!(await verifyPassword(currentPassword, row.password))) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
      .bind(passwordHash, c.get('user').id)
      .run();
    return c.json({ updated: true });
  } catch (error) {
    logAuthFailure('Password update failed:', error);
    return c.json({ error: 'Failed to update password' }, 500);
  }
});

export default auth;
