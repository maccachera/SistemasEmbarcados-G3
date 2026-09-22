# SmartDose

Sistema web do dispenser automático de medicamentos SmartDose.

A aplicação permite cadastrar medicamentos, programar horários, acompanhar eventos e verificar o estado do dispenser. O frontend estático se comunica com a API Express, que persiste os dados no PostgreSQL através do Prisma.

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Git
- Docker
- Docker Compose

## Configuração inicial

Na pasta `smartdose`, crie os arquivos locais de ambiente:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Substitua `change_me` pela mesma senha nos dois arquivos, defina uma `DEVICE_API_KEY` e uma `AUTH_SESSION_SECRET` longa e aleatória no arquivo `backend/.env`. Para execução local, use o mesmo valor de conexão em `DATABASE_URL` e `DIRECT_URL`. Esses arquivos são ignorados pelo Git e não devem ser versionados.

Para gerar uma chave de sessão, por exemplo:

```bash
openssl rand -hex 32
```

## Executar o PostgreSQL

Certifique-se de que o Docker esteja em execução. Neste ambiente Fedora com Docker Desktop, ele pode ser iniciado com:

```bash
systemctl --user start docker-desktop
```

Na pasta `smartdose`:

```bash
docker compose up -d
docker compose ps
```

O PostgreSQL ficará disponível em `localhost:5432`, usando por padrão o banco e o usuário `smartdose`.

## Executar a API

Em outro terminal:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000`.

Na página inicial, crie a primeira conta ou entre com uma conta existente. Após o login é possível acessar a visão geral, medicamentos, horários, histórico e informações do dispositivo.

Para testar a conexão entre Express, Prisma e PostgreSQL:

```bash
curl http://localhost:3000/api/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Endpoints disponíveis

- `GET /api/health`: verifica a API e a conexão com o banco.
- `POST /api/auth/register`: cria uma conta e inicia a sessão.
- `POST /api/auth/login`: inicia a sessão de uma conta existente.
- `POST /api/auth/logout`: encerra a sessão atual.
- `GET /api/auth/me`: informa o usuário autenticado.
- `GET /api/medications`: lista medicamentos e seus horários.
- `GET /api/medications/:id`: consulta um medicamento.
- `POST /api/medications`: cadastra um medicamento.
- `PUT /api/medications/:id`: altera um medicamento.
- `DELETE /api/medications/:id`: exclui um medicamento e seus horários.
- `GET /api/schedules`: lista horários.
- `POST /api/schedules`: adiciona um horário.
- `PUT /api/schedules/:id`: altera ou ativa/desativa um horário.
- `DELETE /api/schedules/:id`: remove um horário.
- `GET /api/devices`: lista dispositivos.
- `GET /api/devices/:id`: consulta um dispositivo.
- `POST /api/devices`: cadastra um dispositivo.
- `GET /api/events`: lista o histórico.
- `POST /api/events`: registra um evento pela API administrativa.

Os endpoints do painel (medicamentos, horários, dispositivos e histórico) exigem uma sessão de usuário. As senhas são armazenadas como hash; a sessão é mantida por cookie HTTP-only no navegador.

## Comunicação com o ESP32

Os endpoints do dispositivo exigem o cabeçalho `X-Device-Key` com o valor configurado em `DEVICE_API_KEY`:

- `GET /api/devices/:deviceCode/schedule`: entrega a programação ativa.
- `POST /api/devices/:deviceCode/events`: recebe eventos do dispenser.

O ESP32 deve usar o IP local do computador, por exemplo `http://192.168.1.100:3000`, pois `localhost` no firmware aponta para o próprio ESP32.

O login do painel não é usado pelo ESP32: o dispositivo continua se autenticando somente com sua `DEVICE_API_KEY`.

Um exemplo de integração está disponível em [`docs/esp32-example.ino`](docs/esp32-example.ino). Em produção, substitua HTTP por HTTPS e utilize uma chave exclusiva por dispositivo.

## Scripts do backend

- `npm run dev`: executa a API com reinicialização automática pelo Nodemon.
- `npm start`: executa a API com Node.js.
- `npm run prisma:generate`: gera o Prisma Client.
- `npm run prisma:deploy`: aplica migrations existentes.
- `npm run prisma:seed`: cria o dispositivo e os dados iniciais de desenvolvimento.

## Publicar demonstração: Vercel + Supabase

O projeto pode ser publicado no Vercel usando o Supabase somente como banco PostgreSQL.

1. No Supabase, crie o projeto e abra **Connect**.
2. No Vercel, importe o repositório do GitHub e defina `smartdose/backend` como **Root Directory**. Confirme que a opção para incluir arquivos fora da pasta raiz do projeto está ativada.
3. Em **Environment Variables** do Vercel, crie as variáveis abaixo para os ambientes Production, Preview e Development:

   - `DATABASE_URL`: use a conexão **Transaction pooler** do Supabase (porta `6543`) e acrescente `?pgbouncer=true&connection_limit=1` ao final.
   - `DIRECT_URL`: use a conexão **Direct connection** do Supabase; ela é usada pelas migrations do Prisma.
   - `DEVICE_API_KEY`: gere uma chave exclusiva para o ESP32.
   - `AUTH_SESSION_SECRET`: gere uma chave aleatória longa, por exemplo com `openssl rand -hex 32`.
   - `NODE_ENV`: `production`.

4. Faça o deploy. O script de build aplica migrations pendentes e prepara o frontend estático para ser servido pelo Vercel.

Não use nem versione URLs de conexão, senhas ou chaves do projeto. Depois do deploy, o endereço público do Vercel será o endereço usado pelo navegador e, futuramente, pelo ESP32.

## Encerrar o ambiente

Interrompa a API com `Ctrl+C`. Para parar o PostgreSQL sem apagar seus dados:

```bash
docker compose down
```
