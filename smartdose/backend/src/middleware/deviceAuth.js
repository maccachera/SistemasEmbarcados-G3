const crypto = require('crypto');

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function deviceAuth(request, response, next) {
  const configuredKey = process.env.DEVICE_API_KEY;

  if (!configuredKey) {
    return response.status(503).json({
      message: 'Autenticação do dispositivo não configurada.',
    });
  }

  const providedKey = String(request.get('X-Device-Key') ?? '');

  if (!providedKey || !safeCompare(providedKey, configuredKey)) {
    return response.status(401).json({
      message: 'Dispositivo não autorizado.',
    });
  }

  return next();
}

module.exports = deviceAuth;
