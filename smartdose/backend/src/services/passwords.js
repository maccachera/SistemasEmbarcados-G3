const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, storedValue) {
  const [salt, storedHash] = String(storedValue || '').split(':');
  if (!salt || !storedHash) {
    return false;
  }

  const hash = await scrypt(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, 'hex');
  return storedBuffer.length === hash.length && crypto.timingSafeEqual(storedBuffer, hash);
}

module.exports = { hashPassword, verifyPassword };
