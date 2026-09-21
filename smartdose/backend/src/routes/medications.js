const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', async (_request, response, next) => {
  try {
    const medications = await prisma.medication.findMany({
      include: {
        schedules: {
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
    const medication = await prisma.medication.findUnique({
      where: { id },
      include: {
        schedules: { orderBy: { time: 'asc' } },
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
  const compartment = Number(request.body.compartment);

  if (!name || !dosage) {
    return response.status(400).json({
      message: 'Informe o nome e a dose do medicamento.',
    });
  }

  if (!Number.isInteger(compartment) || compartment < 1) {
    return response.status(400).json({
      message: 'O compartimento deve ser um número inteiro maior que zero.',
    });
  }

  try {
    const medication = await prisma.medication.create({
      data: { name, dosage, compartment },
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
  const compartment = Number(request.body.compartment);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: 'Medicamento inválido.' });
  }

  if (!name || !dosage) {
    return response.status(400).json({
      message: 'Informe o nome e a dose do medicamento.',
    });
  }

  if (!Number.isInteger(compartment) || compartment < 1) {
    return response.status(400).json({
      message: 'O compartimento deve ser um número inteiro maior que zero.',
    });
  }

  try {
    const medication = await prisma.medication.update({
      where: { id },
      data: { name, dosage, compartment },
      include: {
        schedules: { orderBy: { time: 'asc' } },
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
    await prisma.medication.delete({ where: { id } });
    return response.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return response.status(404).json({ message: 'Medicamento não encontrado.' });
    }

    return next(error);
  }
});

module.exports = router;
