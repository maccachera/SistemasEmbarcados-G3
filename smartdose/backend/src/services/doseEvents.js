const prisma = require('../lib/prisma');

const eventTypes = new Set([
  'DOSE_DISPENSED',
  'MEDICATION_REMOVED',
  'DOSE_NOT_REMOVED',
  'DEVICE_ERROR',
]);

class EventValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parseDate(value, fieldName, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new EventValidationError(`Informe ${fieldName}.`);
    }
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new EventValidationError(`${fieldName} possui uma data inválida.`);
  }
  return date;
}

async function createDoseEvent({ deviceId, payload }) {
  const eventType = String(payload.eventType ?? '');
  let medicationId = payload.medicationId == null ? null : Number(payload.medicationId);
  const scheduleId = payload.scheduleId == null ? null : Number(payload.scheduleId);

  if (!eventTypes.has(eventType)) {
    throw new EventValidationError('Tipo de evento inválido.');
  }

  if (medicationId !== null && !Number.isInteger(medicationId)) {
    throw new EventValidationError('Medicamento inválido.');
  }

  if (scheduleId !== null && !Number.isInteger(scheduleId)) {
    throw new EventValidationError('Horário inválido.');
  }

  if (scheduleId !== null) {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });

    if (!schedule) {
      throw new EventValidationError('Horário não encontrado.', 404);
    }

    if (medicationId !== null && medicationId !== schedule.medicationId) {
      throw new EventValidationError('O horário não pertence ao medicamento informado.');
    }

    medicationId = schedule.medicationId;
  }

  if (medicationId !== null) {
    const medication = await prisma.medication.findUnique({ where: { id: medicationId } });
    if (!medication) {
      throw new EventValidationError('Medicamento não encontrado.', 404);
    }
  }

  const occurredAt = parseDate(payload.occurredAt, 'occurredAt', true);
  const scheduledAt = parseDate(payload.scheduledAt, 'scheduledAt');

  return prisma.doseEvent.create({
    data: {
      deviceId,
      medicationId,
      scheduleId,
      eventType,
      scheduledAt,
      occurredAt,
    },
    include: {
      device: true,
      medication: true,
      schedule: true,
    },
  });
}

module.exports = {
  createDoseEvent,
  EventValidationError,
};
