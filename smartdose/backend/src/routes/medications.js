const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const medications = await prisma.medication.findMany({
      where: { userId: request.user.id },
      include: {
        schedules: {
          where: { device: { userId: request.user.id } },
          orderBy: { time: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return response.json(medications);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Medicamento inválido.' });
  }

  try {
    const medication = await prisma.medication.findFirst({
      where: { id, userId: request.user.id },
      include: {
        schedules: {
          where: { device: { userId: request.user.id } },
          orderBy: { time: 'asc' },
        },
      },
    });

    if (!medication) {
      return response.status(404).json({ message: 'Medicamento não encontrado.' });
    }

    return response.json(medication);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (request, response, next) => {
  const name = String(request.body.name ?? '').trim();
  const dosage = String(request.body.dosage ?? '').trim();

  if (!name || !dosage) {
    return response.status(400).json({
      message: 'Informe o nome e a dose do medicamento.',
    });
  }

  try {
    const medication = await prisma.medication.create({
      data: { name, dosage, userId: request.user.id },
      include: { schedules: true },
    });

    return response.status(201).json(medication);
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (request, response, next) => {
  const id = Number(request.params.id);
  const name = String(request.body.name ?? '').trim();
  const dosage = String(request.body.dosage ?? '').trim();

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Medicamento inválido.' });
  }

  if (!name || !dosage) {
    return response.status(400).json({
      message: 'Informe o nome e a dose do medicamento.',
    });
  }

  try {
    const existingMedication = await prisma.medication.findFirst({
      where: { id, userId: request.user.id },
      select: { id: true },
    });
    if (!existingMedication) {
      return response.status(404).json({ message: 'Medicamento não encontrado.' });
    }

    const medication = await prisma.medication.update({
      where: { id },
      data: { name, dosage },
      include: {
        schedules: {
          where: { device: { userId: request.user.id } },
          orderBy: { time: 'asc' },
        },
      },
    });

    return response.json(medication);
  } catch (error) {
    if (error.code === 'P2025') {
      return response.status(404).json({ message: 'Medicamento não encontrado.' });
    }

    return next(error);
  }
});

router.delete('/:id', async (request, response, next) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Medicamento inválido.' });
  }

  try {
    const result = await prisma.medication.deleteMany({
      where: { id, userId: request.user.id },
    });
    if (result.count === 0) {
      return response.status(404).json({ message: 'Medicamento não encontrado.' });
    }
    return response.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return response.status(404).json({ message: 'Medicamento não encontrado.' });
    }

    return next(error);
  }
});

module.exports = router;
