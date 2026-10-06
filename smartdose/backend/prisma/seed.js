const { PrismaClient } = require('@prisma/client');
const { hashDeviceKey } = require('../src/services/deviceKeys');

const prisma = new PrismaClient();

async function main() {
  const legacyDeviceKey = process.env.DEVICE_API_KEY;
  const owner = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
  const device = await prisma.device.upsert({
    where: { deviceCode: 'SMARTDOSE-001' },
    update: { name: 'SmartDose Principal' },
    create: {
      name: 'SmartDose Principal',
      deviceCode: 'SMARTDOSE-001',
      userId: owner?.id,
      ...(legacyDeviceKey ? { apiKeyHash: hashDeviceKey(legacyDeviceKey) } : {}),
    },
  });

  if (owner && device.userId === null) {
    await prisma.device.update({
      where: { id: device.id },
      data: { userId: owner.id },
    });
  }

  const medicationCount = await prisma.medication.count();

  if (medicationCount === 0) {
    await prisma.medication.create({
      data: {
        userId: owner?.id,
        name: 'Losartana',
        dosage: '1 comprimido',
        schedules: {
          create: [
            { time: '08:00', deviceId: device.id },
            { time: '20:00', deviceId: device.id },
          ],
        },
      },
    });
  }

  console.log(`Seed concluído para o dispositivo ${device.deviceCode}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
