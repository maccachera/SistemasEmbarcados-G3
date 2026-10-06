const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { hashDeviceKey, verifyDeviceKey } = require('../services/deviceKeys');

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function deviceAuth(request, response, next) {
  const providedKey = String(request.get('X-Device-Key') ?? '');
  const deviceCode = String(request.params.deviceCode ?? '').toUpperCase();

  if (!providedKey) {
    return response.status(401).json({ message: 'Dispositivo não autorizado.' });
  }

  try {
    let device = await prisma.device.findUnique({ where: { deviceCode } });
    if (!device) {
      return response.status(404).json({ message: 'Dispositivo não encontrado.' });
    }

    if (device.apiKeyHash) {
      if (!verifyDeviceKey(providedKey, device.apiKeyHash)) {
        return response.status(401).json({ message: 'Dispositivo não autorizado.' });
      }
    } else {
      const legacyKey = process.env.DEVICE_API_KEY;
      const legacyDevice = device.deviceCode === 'SMARTDOSE-001';
      if (!legacyDevice || !legacyKey || !safeCompare(providedKey, legacyKey)) {
        return response.status(401).json({ message: 'Dispositivo não autorizado.' });
      }

      device = await prisma.device.update({
        where: { id: device.id },
        data: { apiKeyHash: hashDeviceKey(providedKey) },
      });
    }

    request.device = device;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = deviceAuth;
