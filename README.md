# SmartDose

Sistema web para gerenciamento de um dispenser automático de medicamentos baseado em IoT.

O SmartDose permite cadastrar medicamentos, configurar horários, acompanhar eventos do dispenser e disponibilizar a programação para um ESP32 por meio de uma API REST. O painel possui cadastro e login locais; o ESP32 permanece autenticado separadamente pela chave do dispositivo.

> **Aviso:** o evento “medicamento retirado” indica apenas que o dispenser detectou a retirada. Isso não confirma que o medicamento foi ingerido.

## Funcionalidades

- Cadastro, edição e exclusão de medicamentos.
- Configuração de múltiplos horários por medicamento.
- Ativação e desativação de horários.
- Dashboard com próxima dose e resumo da rotina.
- Histórico de eventos enviados pelo dispenser.
- Monitoramento do estado do dispositivo.
- API REST para comunicação com o frontend e o ESP32.
- Cadastro e login locais para acesso ao painel.
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

Altere os valores `change_me` nos arquivos `.env`. Use a mesma senha do PostgreSQL nas variáveis `DATABASE_URL` e `DIRECT_URL`, defina uma `DEVICE_API_KEY` segura e uma `AUTH_SESSION_SECRET` longa e aleatória no arquivo `backend/.env`.

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

Na primeira visita, use a opção **Criar conta** para cadastrar o acesso local ao painel.

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
- `User`: representa uma conta que acessa o painel.

Tipos de evento disponíveis:

- `DOSE_DISPENSED`
- `MEDICATION_REMOVED`
- `DOSE_NOT_REMOVED`
- `DEVICE_ERROR`

## API REST

### Autenticação

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Os endpoints administrativos abaixo exigem uma sessão iniciada pelo navegador.

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

O ESP32 não usa o login do painel: ele continua usando somente o cabeçalho `X-Device-Key`.

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
- Senhas de usuários são armazenadas como hash e a sessão é mantida por cookie HTTP-only.
- Para produção, devem ser adicionados HTTPS e chaves individuais por dispositivo.

## Demonstração no Vercel

O backend já contém a configuração necessária para publicar uma demonstração no Vercel, com o Supabase fornecendo o PostgreSQL. As URLs de conexão e chaves devem ser cadastradas apenas nas variáveis de ambiente do Vercel; consulte [`smartdose/README.md`](smartdose/README.md) para os nomes e o tipo de conexão de cada variável.

## Encerrando o ambiente

Interrompa a API com `Ctrl+C` e pare o PostgreSQL com:

```bash
docker compose down
```
