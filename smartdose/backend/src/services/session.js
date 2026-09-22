const crypto = require('crypto');

const SESSION_COOKIE = 'smartdose_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  if (process.env.AUTH_SESSION_SECRET) {
    return process.env.AUTH_SESSION_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET não foi configurado.');
  }

  return 'smartdose-local-development-session-secret';
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    exp: Date.now() + SESSION_DURATION_MS,
  })).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const [payload, signature, extraPart] = token.split('.');
  if (!payload || !signature || extraPart || !safeCompare(signature, sign(payload))) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(data.sub) || !Number.isFinite(data.exp) || data.exp <= Date.now()) {
      return null;
    }
    return data;
  } catch (_error) {
    return null;
  }
}

function readSessionToken(request) {
  const cookieHeader = request.get('cookie') || '';
  const entry = cookieHeader.split(';').map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`));

  if (!entry) {
    return null;
  }

  return decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1));
}

function setSessionCookie(response, user) {
  response.cookie(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

module.exports = {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
  verifySessionToken,
};
