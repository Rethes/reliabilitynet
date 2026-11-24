import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import app from '../src/index.js';
import {
  createUserToken,
  hashPassword,
  verifyPassword,
  verifyUserToken,
} from '../src/security.js';

test('password hashes use salted PBKDF2 and verify in constant-time path', async () => {
  const password = randomUUID();
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.match(firstHash, /^pbkdf2\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(firstHash, password);
  assert.notEqual(firstHash.split('$')[2], secondHash.split('$')[2]);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword(`${password}-wrong`, firstHash), false);
  assert.equal(await verifyPassword(password, 'bcrypt$hash'), false);
});

test('JWT verification accepts valid signatures and rejects tampering', async () => {
  const secret = randomUUID();
  const user = { id: 12, email: `${randomUUID()}@example.invalid` };
  const token = await createUserToken(user, secret);
  const verified = await verifyUserToken(token, secret);

  assert.equal(verified.id, user.id);
  assert.equal(verified.email, user.email);
  assert.equal(await verifyUserToken(token, randomUUID()), null);

  const finalCharacter = token.at(-1);
  const tampered = `${token.slice(0, -1)}${finalCharacter === 'a' ? 'b' : 'a'}`;
  assert.equal(await verifyUserToken(tampered, secret), null);
});

test('protected routes fail closed when JWT_SECRET is missing', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await app.request(
      '/api/auth/me',
      {},
      { ALLOWED_ORIGINS: 'http://localhost:5173' },
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Authentication service unavailable' });
  } finally {
    console.error = originalError;
  }
});
