# SmartDose

An IoT-based web system for managing an automatic medication dispenser.

SmartDose allows users to register medications, configure schedules, monitor dispenser events, and make the active schedule available to an ESP32 through a REST API. The dashboard uses local account registration and login, while the ESP32 is authenticated separately with a device API key.

> **Important:** a “medication removed” event only means that the dispenser detected that the medication was taken from the device. It does not confirm that the medication was ingested.

## Features

- Create, edit, and delete medications.
- Configure multiple schedules for each medication.
- Enable and disable schedules.
- Dashboard with the next dose and a summary of the medication routine.
- Event history reported by the dispenser.
- Device status monitoring.
- REST API for communication with the frontend and the ESP32.
- Local account registration and login for dashboard access.
- API key authentication for ESP32 endpoints.
- Persistent storage in PostgreSQL.
- Responsive interface for mobile phones, tablets, and desktop computers.

## Technology stack

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Fetch API

### Backend

- Node.js
- Express
- Prisma ORM
- PostgreSQL

### Environment

- Docker
- Docker Compose

## Architecture

```text
Browser
    |
    | HTTP / JSON
    v
Express API ---- Prisma ---- PostgreSQL
    ^
    | HTTP / JSON + API key
    |
  ESP32
```

The ESP32 does not access PostgreSQL directly. All communication goes through the API.

## Project structure

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

## Requirements

- Node.js 20 or later
- npm
- Git
- Docker
- Docker Compose

## Installation

Clone the repository:

```bash
git clone https://github.com/maccachera/SistemasEmbarcados-G3.git
cd SistemasEmbarcados-G3/smartdose
```

Create the local environment files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Replace the `change_me` values in the `.env` files. Use the same PostgreSQL password in `DATABASE_URL` and `DIRECT_URL`, set a secure `DEVICE_API_KEY`, and define a long, random `AUTH_SESSION_SECRET` in `backend/.env`.

The `.env` files are ignored by Git and must never be committed.

## Running the project

Start PostgreSQL:

```bash
docker compose up -d
```

Install and prepare the backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

Start the server:

```bash
npm run dev
```

Open:

- Application: [http://localhost:3000](http://localhost:3000)
- Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

On the first visit, select **Create account** to register a local dashboard account.

Expected health-check response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Database

The system uses the following entities:

- `Device`: represents a physical dispenser.
- `Medication`: represents a registered medication.
- `Schedule`: represents a medication schedule.
- `DoseEvent`: represents an event reported by the dispenser.
- `User`: represents an account with access to the dashboard.

Available event types:

- `DOSE_DISPENSED`
- `MEDICATION_REMOVED`
- `DOSE_NOT_REMOVED`
- `DEVICE_ERROR`

## REST API

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

The administrative endpoints below require an authenticated browser session.

### Medications

```text
GET    /api/medications
GET    /api/medications/:id
POST   /api/medications
PUT    /api/medications/:id
DELETE /api/medications/:id
```

### Schedules

```text
GET    /api/schedules
POST   /api/schedules
PUT    /api/schedules/:id
DELETE /api/schedules/:id
```

### Devices

```text
GET  /api/devices
GET  /api/devices/:id
POST /api/devices
```

### Events

```text
GET  /api/events
POST /api/events
```

## ESP32 communication

The ESP32 retrieves its schedule through:

```http
GET /api/devices/SMARTDOSE-001/schedule
X-Device-Key: your_api_key
```

To report events:

```http
POST /api/devices/SMARTDOSE-001/events
Content-Type: application/json
X-Device-Key: your_api_key
```

Example request body:

```json
{
  "scheduleId": 1,
  "medicationId": 1,
  "eventType": "MEDICATION_REMOVED",
  "occurredAt": "2026-09-21T20:32:00-03:00"
}
```

An example firmware integration is available at [`smartdose/docs/esp32-example.ino`](smartdose/docs/esp32-example.ino).

During development, the ESP32 must use the computer's local IP address instead of `localhost`.

The ESP32 does not use the dashboard login. It authenticates exclusively through the `X-Device-Key` header.

## Available scripts

Run these commands inside `smartdose/backend`:

```text
npm run dev              Runs the API with automatic restart
npm start                Runs the API with Node.js
npm run prisma:generate  Generates the Prisma Client
npm run prisma:deploy    Applies the existing migrations
npm run prisma:seed      Creates the initial development data
```

## Security

- Credentials are not stored in the source code.
- `.env` files are not committed to Git.
- Prisma is used for database access.
- API inputs are validated.
- ESP32 endpoints require an API key.
- User passwords are stored as hashes, and sessions are maintained through HTTP-only cookies.
- Production deployments should use HTTPS and an individual API key for each device.

## Vercel demo deployment

The backend already includes the configuration required to deploy a demo on Vercel, using Supabase as the PostgreSQL provider. Connection URLs and keys must only be added as Vercel environment variables. See [`smartdose/README.md`](smartdose/README.md) for the required variable names and connection types.

## Stopping the environment

Stop the API with `Ctrl+C`, then stop PostgreSQL with:

```bash
docker compose down
```
