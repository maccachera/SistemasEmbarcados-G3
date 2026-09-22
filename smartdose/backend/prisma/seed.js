const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const device = await prisma.device.upsert({
    where: { deviceCode: 'SMARTDOSE-001' },
    update: { name: 'SmartDose Principal' },
    create: {
      name: 'SmartDose Principal',
      deviceCode: 'SMARTDOSE-001',
    },
  });

  const medicationCount = await prisma.medication.count();

  if (medicationCount === 0) {
    await prisma.medication.create({
      data: {
        name: 'Losartana',
        dosage: '1 comprimido',
        schedules: {
          create: [
            { time: '08:00' },
            { time: '20:00' },
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
