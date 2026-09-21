const express = require('express');
const prisma = require('../lib/prisma');
const { createDoseEvent, EventValidationError } = require('../services/doseEvents');

const router = express.Router();

router.get('/', async (request, response, next) => {
  const requestedLimit = Number(request.query.limit ?? 100);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 200)
    : 100;

  try {
    const events = await prisma.doseEvent.findMany({
      take: limit,
      include: {
        device: true,
        medication: true,
        schedule: true,
      },
      orderBy: { occurredAt: 'desc' },
    });

    return response.json(events);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const deviceId = Number(request.body.deviceId);

  if (!Number.isInteger(deviceId)) {
    return response.status(400).json({ message: 'Dispositivo inválido.' });
  }

  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      return response.status(404).json({ message: 'Dispositivo não encontrado.' });
    }

    const event = await createDoseEvent({ deviceId, payload: request.body });
    return response.status(201).json(event);
  } catch (error) {
    if (error instanceof EventValidationError) {
      return response.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

module.exports = router;
