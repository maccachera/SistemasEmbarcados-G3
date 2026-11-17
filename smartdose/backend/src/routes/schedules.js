const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get('/', async (request, response, next) => {
  try {
    const schedules = await prisma.schedule.findMany({
      where: { device: { userId: request.user.id } },
      include: { medication: true, device: true },
      orderBy: [{ time: 'asc' }, { medicationId: 'asc' }],
    });

    return response.json(schedules);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const deviceId = Number(request.body.deviceId);
  const medicationId = Number(request.body.medicationId);
  const time = String(request.body.time ?? '').trim();

  if (!Number.isInteger(deviceId) || !Number.isInteger(medicationId) || !timePattern.test(time)) {
    return response.status(400).json({
      message: 'Selecione um dispositivo, um medicamento e informe um horário válido.',
    });
  }

  try {
    const [device, medication] = await Promise.all([
      prisma.device.findFirst({
        where: { id: deviceId, userId: request.user.id },
        select: { id: true },
      }),
      prisma.medication.findFirst({
        where: { id: medicationId, userId: request.user.id },
        select: { id: true },
      }),
    ]);
    if (!device || !medication) {
      return response.status(404).json({
        message: 'Dispositivo ou medicamento não encontrado.',
      });
    }

    const schedule = await prisma.schedule.create({
      data: { deviceId, medicationId, time },
      include: { medication: true, device: true },
    });

    return response.status(201).json(schedule);
  } catch (error) {
    if (error.code === 'P2002') {
      return response.status(409).json({
        message: 'Esse horário já foi adicionado ao medicamento neste dispositivo.',
      });
    }

    if (error.code === 'P2003') {
      return response.status(404).json({ message: 'Dispositivo ou medicamento não encontrado.' });
    }

    return next(error);
  }
});

router.put('/:id', async (request, response, next) => {
  const id = Number(request.params.id);
  const data = {};

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Horário inválido.' });
  }

  if (Object.hasOwn(request.body, 'enabled')) {
    if (typeof request.body.enabled !== 'boolean') {
      return response.status(400).json({ message: 'O status do horário é inválido.' });
    }
    data.enabled = request.body.enabled;
  }

  if (Object.hasOwn(request.body, 'time')) {
    const time = String(request.body.time).trim();
    if (!timePattern.test(time)) {
      return response.status(400).json({ message: 'Informe um horário válido.' });
    }
    data.time = time;
  }

  if (Object.hasOwn(request.body, 'medicationId')) {
    const medicationId = Number(request.body.medicationId);
    if (!Number.isInteger(medicationId)) {
      return response.status(400).json({ message: 'Medicamento inválido.' });
    }
    data.medicationId = medicationId;
  }

  if (Object.hasOwn(request.body, 'deviceId')) {
    const deviceId = Number(request.body.deviceId);
    if (!Number.isInteger(deviceId)) {
      return response.status(400).json({ message: 'Dispositivo inválido.' });
    }
    data.deviceId = deviceId;
  }

  if (Object.keys(data).length === 0) {
    return response.status(400).json({ message: 'Nenhuma alteração foi informada.' });
  }

  try {
    const existingSchedule = await prisma.schedule.findFirst({
      where: {
        id,
        device: { userId: request.user.id },
      },
      select: { deviceId: true, medicationId: true },
    });
    if (!existingSchedule) {
      return response.status(404).json({ message: 'Horário não encontrado.' });
    }

    const targetDeviceId = data.deviceId ?? existingSchedule.deviceId;
    const targetMedicationId = data.medicationId ?? existingSchedule.medicationId;
    const [device, medication] = await Promise.all([
      prisma.device.findFirst({
        where: { id: targetDeviceId, userId: request.user.id },
        select: { id: true },
      }),
      prisma.medication.findFirst({
        where: { id: targetMedicationId, userId: request.user.id },
        select: { id: true },
      }),
    ]);
    if (!device || !medication) {
      return response.status(404).json({
        message: 'Dispositivo ou medicamento não encontrado.',
      });
    }

    const schedule = await prisma.schedule.update({
      where: { id },
      data,
      include: { medication: true, device: true },
    });

    return response.json(schedule);
  } catch (error) {
    if (error.code === 'P2025') {
      return response.status(404).json({ message: 'Horário não encontrado.' });
    }

    if (error.code === 'P2002') {
      return response.status(409).json({
        message: 'Esse horário já foi adicionado ao medicamento neste dispositivo.',
      });
    }

    if (error.code === 'P2003') {
      return response.status(404).json({ message: 'Dispositivo ou medicamento não encontrado.' });
    }

    return next(error);
  }
});

router.delete('/:id', async (request, response, next) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Horário inválido.' });
  }

  try {
    const result = await prisma.schedule.deleteMany({
      where: {
        id,
        device: { userId: request.user.id },
      },
    });
    if (result.count === 0) {
      return response.status(404).json({ message: 'Horário não encontrado.' });
    }
    return response.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return response.status(404).json({ message: 'Horário não encontrado.' });
    }

    return next(error);
  }
});

module.exports = router;
