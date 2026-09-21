require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');
const prisma = require('./lib/prisma');
const medicationRoutes = require('./routes/medications');
const scheduleRoutes = require('./routes/schedules');
const deviceRoutes = require('./routes/devices');
const eventRoutes = require('./routes/events');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get('/api/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return response.json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    console.error('Falha ao verificar a conexão com o PostgreSQL:', error.message);

    return response.status(503).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

app.use('/api/medications', medicationRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/events', eventRoutes);

app.use('/api', (_request, response) => {
  return response.status(404).json({ message: 'Endpoint não encontrado.' });
});

const frontendPath = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

app.use((error, _request, response, _next) => {
  console.error('Erro inesperado:', error.message);

  return response.status(500).json({
    message: 'Não foi possível concluir a operação.',
  });
});

const server = app.listen(port, () => {
  console.log(`SmartDose API disponível em http://localhost:${port}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} recebido. Encerrando a API...`);

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
