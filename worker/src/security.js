const PASSWORD_HASH_ITERATIONS = 100000;
const PASSWORD_HASH_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const JWT_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const textEncoder = new TextEncoder();

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

async function derivePasswordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    PASSWORD_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  return `pbkdf2$${PASSWORD_HASH_ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(hash)}`;
}

export async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;

  const [algorithm, iterationValue, saltValue, hashValue, extra] = encodedHash.split('$');
  const iterations = Number(iterationValue);
  const salt = decodeBase64Url(saltValue || '');
  const expectedHash = decodeBase64Url(hashValue || '');

  if (
    algorithm !== 'pbkdf2'
    || extra !== undefined
    || !Number.isSafeInteger(iterations)
    || iterations < 1
    || iterations > PASSWORD_HASH_ITERATIONS
    || salt?.length !== PASSWORD_SALT_BYTES
    || expectedHash?.length !== PASSWORD_HASH_BYTES
  ) {
    return false;
  }

  const actualHash = await derivePasswordHash(password, salt, iterations);
  return constantTimeEqual(actualHash, expectedHash);
}

function encodeJWTPart(value) {
  return encodeBase64Url(textEncoder.encode(JSON.stringify(value)));
}

function decodeJWTPart(value) {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function importJWTKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export function getJWTSecret(c) {
  const secret = c.env.JWT_SECRET;
  if (secret) return secret;

  console.error('JWT_SECRET is not configured');
  return null;
}

export async function createUserToken(user, secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJWTPart({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJWTPart({
    id: user.id,
    email: user.email,
    iat: issuedAt,
    exp: issuedAt + JWT_LIFETIME_SECONDS,
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importJWTKey(secret),
    textEncoder.encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyUserToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJWTPart(encodedHeader);
  const payload = decodeJWTPart(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);

  if (
    !header
    || header.alg !== 'HS256'
    || !payload
    || !signature
    || typeof payload.email !== 'string'
    || payload.id === undefined
    || !Number.isFinite(payload.exp)
    || payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    await importJWTKey(secret),
    signature,
    textEncoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  return valid ? payload : null;
}

export async function requireAuth(c, next) {
  const secret = getJWTSecret(c);
  if (!secret) return c.json({ error: 'Authentication service unavailable' }, 500);

  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await verifyUserToken(authorization.slice(7), secret);
  if (!user) return c.json({ error: 'Invalid or expired token' }, 401);

  c.set('user', user);
  await next();
}
