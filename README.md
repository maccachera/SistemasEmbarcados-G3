# SmartDose

Sistema web para gerenciamento de um dispenser automático de medicamentos baseado em IoT.

O SmartDose permite cadastrar medicamentos, configurar horários, acompanhar eventos do dispenser e disponibilizar a programação para um ESP32 por meio de uma API REST.

> **Aviso:** o evento “medicamento retirado” indica apenas que o dispenser detectou a retirada. Isso não confirma que o medicamento foi ingerido.

## Funcionalidades

- Cadastro, edição e exclusão de medicamentos.
- Configuração de múltiplos horários por medicamento.
- Ativação e desativação de horários.
- Dashboard com próxima dose e resumo da rotina.
- Histórico de eventos enviados pelo dispenser.
- Monitoramento do estado do dispositivo.
- API REST para comunicação com o frontend e o ESP32.
- Autenticação dos endpoints do ESP32 por API key.
- Armazenamento persistente no PostgreSQL.
- Interface responsiva para celular, tablet e computador.

## Tecnologias

### Frontend

- HTML
- CSS
- JavaScript puro
- Fetch API

### Backend

- Node.js
- Express
- Prisma ORM
- PostgreSQL

### Ambiente

- Docker
- Docker Compose

## Arquitetura

```text
Navegador
    |
    | HTTP / JSON
    v
Express API ---- Prisma ---- PostgreSQL
    ^
    | HTTP / JSON + API key
    |
  ESP32
```

O ESP32 não acessa o PostgreSQL diretamente. Toda comunicação passa pela API.

## Estrutura do projeto

```text
smartdose/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── docs/
│   └── esp32-example.ino
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── .env.example
├── docker-compose.yml
└── README.md
```

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Git
- Docker
- Docker Compose

## Instalação

Clone o repositório:

```bash
git clone https://github.com/maccachera/SistemasEmbarcados-G3.git
cd SistemasEmbarcados-G3/smartdose
```

Crie os arquivos locais de ambiente:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Altere os valores `change_me` nos arquivos `.env`. Use a mesma senha do PostgreSQL na variável `DATABASE_URL` e defina uma `DEVICE_API_KEY` segura.

Os arquivos `.env` são ignorados pelo Git e não devem ser versionados.

## Executando o projeto

Inicie o PostgreSQL:

```bash
docker compose up -d
```

Instale e prepare o backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

Inicie o servidor:

```bash
npm run dev
```

Acesse:

- Aplicação: [http://localhost:3000](http://localhost:3000)
- Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

Resposta esperada do health check:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Banco de dados

O sistema utiliza as seguintes entidades:

- `Device`: representa um dispenser físico.
- `Medication`: representa um medicamento cadastrado.
- `Schedule`: representa um horário de medicamento.
- `DoseEvent`: representa um evento enviado pelo dispenser.

Tipos de evento disponíveis:

- `DOSE_DISPENSED`
- `MEDICATION_REMOVED`
- `DOSE_NOT_REMOVED`
- `DEVICE_ERROR`

## API REST

### Medicamentos

```text
GET    /api/medications
GET    /api/medications/:id
POST   /api/medications
PUT    /api/medications/:id
DELETE /api/medications/:id
```

### Horários

```text
GET    /api/schedules
POST   /api/schedules
PUT    /api/schedules/:id
DELETE /api/schedules/:id
```

### Dispositivos

```text
GET  /api/devices
GET  /api/devices/:id
POST /api/devices
```

### Eventos

```text
GET  /api/events
POST /api/events
```

## Comunicação com o ESP32

O ESP32 consulta sua programação por meio de:

```http
GET /api/devices/SMARTDOSE-001/schedule
X-Device-Key: sua_api_key
```

Para enviar eventos:

```http
POST /api/devices/SMARTDOSE-001/events
Content-Type: application/json
X-Device-Key: sua_api_key
```

Exemplo de corpo:

```json
{
  "scheduleId": 1,
  "medicationId": 1,
  "eventType": "MEDICATION_REMOVED",
  "occurredAt": "2026-09-21T20:32:00-03:00"
}
```

Um exemplo de firmware está disponível em [`smartdose/docs/esp32-example.ino`](smartdose/docs/esp32-example.ino).

Durante o desenvolvimento, o ESP32 deve utilizar o IP local do computador em vez de `localhost`.

## Scripts disponíveis

Dentro de `smartdose/backend`:

```text
npm run dev              Executa com reinicialização automática
npm start                Executa com Node.js
npm run prisma:generate  Gera o Prisma Client
npm run prisma:deploy    Aplica as migrations existentes
npm run prisma:seed      Cria os dados iniciais de desenvolvimento
```

## Segurança

- Credenciais não são armazenadas no código.
- Arquivos `.env` não são enviados ao Git.
- O Prisma é utilizado para acesso ao banco.
- Entradas da API são validadas.
- Endpoints do ESP32 exigem uma API key.
- Para produção, devem ser adicionados HTTPS, autenticação de usuários e chaves individuais por dispositivo.

## Encerrando o ambiente

Interrompa a API com `Ctrl+C` e pare o PostgreSQL com:

```bash
docker compose down
```
