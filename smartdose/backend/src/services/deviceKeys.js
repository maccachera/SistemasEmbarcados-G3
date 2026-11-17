const crypto = require('crypto');

function hashDeviceKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateDeviceKey() {
  return `sd_${crypto.randomBytes(32).toString('base64url')}`;
}

function verifyDeviceKey(providedKey, storedHash) {
  if (!providedKey || !storedHash) {
    return false;
  }

  const providedHash = Buffer.from(hashDeviceKey(providedKey), 'hex');
  const expectedHash = Buffer.from(storedHash, 'hex');

  return providedHash.length === expectedHash.length
    && crypto.timingSafeEqual(providedHash, expectedHash);
}

module.exports = {
  generateDeviceKey,
  hashDeviceKey,
  verifyDeviceKey,
};
