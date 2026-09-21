const express = require('express');
const prisma = require('../lib/prisma');
const deviceAuth = require('../middleware/deviceAuth');
const { createDoseEvent, EventValidationError } = require('../services/doseEvents');

const router = express.Router();
const onlineWindowMs = 5 * 60 * 1000;

function withStatus(device) {
  const online = device.lastSeenAt
    ? Date.now() - new Date(device.lastSeenAt).getTime() <= onlineWindowMs
    : false;

  return {
    ...device,
    status: online ? 'online' : 'offline',
  };
}

router.get('/', async (_request, response, next) => {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { name: 'asc' },
    });
    return response.json(devices.map(withStatus));
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const name = String(request.body.name ?? '').trim();
  const deviceCode = String(request.body.deviceCode ?? '').trim().toUpperCase();

  if (!name || !/^[A-Z0-9-]{3,50}$/.test(deviceCode)) {
    return response.status(400).json({
      message: 'Informe um nome e um código de dispositivo válido.',
    });
  }

  try {
    const device = await prisma.device.create({ data: { name, deviceCode } });
    return response.status(201).json(withStatus(device));
  } catch (error) {
    if (error.code === 'P2002') {
      return response.status(409).json({ message: 'Esse código de dispositivo já existe.' });
    }
    return next(error);
  }
});

router.get('/:deviceCode/schedule', deviceAuth, async (request, response, next) => {
  try {
    const device = await prisma.device.findUnique({
      where: { deviceCode: request.params.deviceCode.toUpperCase() },
    });

    if (!device) {
      return response.status(404).json({ message: 'Dispositivo não encontrado.' });
    }

    const [schedules] = await prisma.$transaction([
      prisma.schedule.findMany({
        where: { enabled: true },
        include: { medication: true },
        orderBy: { time: 'asc' },
      }),
      prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      }),
    ]);

    return response.json({
      deviceCode: device.deviceCode,
      schedule: schedules.map((item) => ({
        scheduleId: item.id,
        medicationId: item.medicationId,
        name: item.medication.name,
        dosage: item.medication.dosage,
        time: item.time,
        compartment: item.medication.compartment,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:deviceCode/events', deviceAuth, async (request, response, next) => {
  try {
    const device = await prisma.device.findUnique({
      where: { deviceCode: request.params.deviceCode.toUpperCase() },
    });

    if (!device) {
      return response.status(404).json({ message: 'Dispositivo não encontrado.' });
    }

    const event = await createDoseEvent({
      deviceId: device.id,
      payload: request.body,
    });

    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return response.status(201).json({
      message: 'Evento recebido.',
      event,
    });
  } catch (error) {
    if (error instanceof EventValidationError) {
      return response.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Dispositivo inválido.' });
  }

  try {
    const device = await prisma.device.findUnique({ where: { id } });

    if (!device) {
      return response.status(404).json({ message: 'Dispositivo não encontrado.' });
    }

    return response.json(withStatus(device));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
