# SmartDose

Web-based system for managing an IoT-based automatic medication dispenser.

SmartDose allows users to register medications, configure schedules, monitor dispenser events, and provide scheduling information to an ESP32 through a REST API. The dashboard includes local registration and login, while the ESP32 is authenticated separately using the device key.

> **Notice:** the “medication removed” event only indicates that the dispenser detected the medication being removed. It does not confirm that the medication was ingested.

## Features

- Medication registration, editing, and deletion.
- Configuration of multiple schedules for each medication.
- Schedule activation and deactivation.
- Dashboard displaying the next dose and a summary of the medication routine.
- History of events sent by the dispenser.
- Device status monitoring.
- REST API for communication with the frontend and the ESP32.
- Local registration and login for dashboard access.
- ESP32 endpoint authentication using an API key.
- Persistent storage using PostgreSQL.
- Responsive interface for smartphones, tablets, and computers.

## Technologies

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

## Project Structure

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

## Prerequisites

- Node.js 20 or higher
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

Replace the `change_me` values in the `.env` files. Use the same PostgreSQL password in the `DATABASE_URL` and `DIRECT_URL` variables, define a secure `DEVICE_API_KEY`, and set a long, randomly generated `AUTH_SESSION_SECRET` in the `backend/.env` file.

The `.env` files are ignored by Git and should not be committed to version control.

## Running the Project

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

Access:

- Application: http://localhost:3000
- Health check: http://localhost:3000/api/health

On your first visit, use the **Create Account** option to create a local account for accessing the dashboard.

Expected health check response:

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
- `DoseEvent`: represents an event sent by the dispenser.
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

The administrative endpoints below require an active browser session.

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

## ESP32 Communication

The ESP32 retrieves its schedule through:

```http
GET /api/devices/SMARTDOSE-001/schedule
X-Device-Key: sua_api_key
```

To send events:

```http
POST /api/devices/SMARTDOSE-001/events
Content-Type: application/json
X-Device-Key: sua_api_key
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

A firmware example is available at `smartdose/docs/esp32-example.ino`.

During development, the ESP32 must use the computer's local IP address instead of `localhost`.

The ESP32 does not use the dashboard login system. It continues to authenticate exclusively through the `X-Device-Key` header.

## Available Scripts

Inside `smartdose/backend`:

```text
npm run dev              Runs with automatic restart
npm start                Runs with Node.js
npm run prisma:generate  Generates the Prisma Client
npm run prisma:deploy    Applies existing migrations
npm run prisma:seed      Creates the initial development data
```

## Security

- Credentials are not stored directly in the source code.
- `.env` files are not committed to Git.
- Prisma is used for database access.
- API inputs are validated.
- ESP32 endpoints require an API key.
- User passwords are stored as hashes, and sessions are maintained using HTTP-only cookies.
- For production environments, HTTPS and individual keys for each device should be implemented.

## Vercel Deployment

The backend already includes the configuration required to deploy a demonstration version on Vercel, with Supabase providing the PostgreSQL database. Connection URLs and keys should only be configured through Vercel environment variables. Refer to `smartdose/README.md` for the names and connection types of each variable.

## Stopping the Environment

Stop the API using `Ctrl+C` and stop PostgreSQL with:

```bash
docker compose down
```
