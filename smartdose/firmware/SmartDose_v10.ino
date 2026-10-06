/*
  ===========================================================
  SMART DOSE - Firmware ESP32 (integrado com o backend do repo
  github.com/maccachera/SistemasEmbarcados-G3)
  ===========================================================
  Dispenser automático de medicamentos com:
   - Relógio DS3231 (compara com os horários vindos do servidor)
   - Motor de passo (28BYJ-48 + ULN2003) com switch de referência (home)
   - Célula de carga (HX711) para confirmar queda/retirada do remédio
   - LED verde/vermelho + buzzer para alerta sonoro/visual
   - ESP32 como CLIENTE HTTP: busca a agenda no backend (Express/Prisma)
     e envia eventos de dose (dispensado / retirado / não retirado / erro)

  *** IMPORTANTE SOBRE O BACKEND ***
  O modelo `Schedule` do banco do Gabriel só tem `time` (HH:MM) por
  medicamento — NÃO existe campo de "dia da semana" nesse backend.
  Ou seja, um horário cadastrado se repete TODO DIA. Se vocês
  precisam de dias específicos da semana, isso tem que ser
  adicionado no schema.prisma/rotas do backend antes — o ESP32 não
  tem como inventar essa informação sozinho.

  BIBLIOTECAS NECESSÁRIAS (Gerenciador de Bibliotecas do Arduino IDE):
   - "RTClib" (Adafruit)
   - "HX711" (Bogdan Necula / bogde)
   - "ArduinoJson" (Benoit Blanchon) — versão 6.x ou 7.x
   - "WiFiManager" (tzapu) — só necessária se USAR_WIFI_MANAGER = true
  (WiFi.h, HTTPClient.h e WiFiClientSecure.h já vêm com o ESP32 core.)

  PINOUT (do esquemático "Smart Dose") — confirme fisicamente,
  principalmente LED1/LED2 e SW1:
   - I2C (DS3231):      SDA = GPIO21   SCL = GPIO22
   - HX711:             DT  = GPIO13   SCK = GPIO12
   - Buzzer ativo:      GPIO5
   - ULN2003 (motor):   IN1=GPIO14  IN2=GPIO27  IN3=GPIO26  IN4=GPIO25
   - LED "ok" (verde):  GPIO33
   - LED "alerta" (vermelho): GPIO32
   - Switch de referência (SW1): GPIO35

  *** ATENÇÃO HARDWARE ***
  O GPIO35 é "input only" e NÃO tem pull-up interno no ESP32. Se o
  switch só fecha pro GND sem resistor de pull-up externo (10kΩ até
  3.3V), a leitura pode ficar instável quando solto. Se o "home"
  falhar direto: solde o pull-up externo, ou troque o fio do switch
  pra um GPIO comum (ex: GPIO4) e use INPUT_PULLUP.

  *** SOBRE A HORA (RTC) ***
  Este código assume que o DS3231 está ajustado com a HORA LOCAL
  do Brasil (UTC-3) diretamente — não faz conversão de fuso.
  ===========================================================
*/

#include <WiFi.h>
#include <WiFiManager.h>
#include "esp_wifi.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <RTClib.h>
#include <HX711.h>

// ---------------- CONFIGURAÇÃO DE REDE ----------------
// true  = rede corporativa/universitária com RADIUS (WPA2-Enterprise, tipo eduroam)
//         pede usuário E senha separados (confirme no seu celular: se a tela de
//         conectar pedir "usuário" além da senha, é esse o caso).
// false = rede doméstica comum, só com senha (WPA2 pessoal).
const bool REDE_ENTERPRISE = false;

// Método de autenticação EAP da rede Enterprise. PEAP é o mais comum, mas
// se não conectar, troque para true aqui embaixo pra usar TTLS.
const bool USAR_TTLS = true; // false = PEAP, true = TTLS

const char* WIFI_SSID = "NOME_DA_REDE_DA_FACULDADE";

// Usados só se REDE_ENTERPRISE = true:
const char* EAP_IDENTITY = "seu_usuario_da_faculdade"; // geralmente igual ao EAP_USERNAME
const char* EAP_USERNAME = "seu_usuario_da_faculdade";
const char* EAP_PASSWORD = "sua_senha_da_faculdade";

// Só vale pra redes comuns (REDE_ENTERPRISE = false). Com isso ativado,
// você NÃO precisa mais editar WIFI_SSID/WIFI_PASSWORD aqui no código
// toda vez que mudar de lugar (facul -> casa -> hotspot etc).
// Como funciona: na primeira vez (ou se a rede salva não for encontrada),
// o ESP32 cria o próprio Wi-Fi chamado "SmartDose-Config". Conecte seu
// celular nele, uma tela deve abrir sozinha (senão abra um navegador e
// acesse 192.168.4.1); escolha ali a rede de verdade e digite a senha.
// Ele guarda isso na memória e usa sozinho nas próximas vezes.
// IMPORTANTE: isso NÃO funciona para rede Enterprise/RADIUS da faculdade
// (REDE_ENTERPRISE = true continua precisando dos campos fixos abaixo).
const bool USAR_WIFI_MANAGER = true;

// Usado só se REDE_ENTERPRISE = false:
const char* WIFI_PASSWORD = "SENHA_DO_HOTSPOT_AQUI"; // ignorado se USAR_WIFI_MANAGER = true

// ---------------- CONFIGURAÇÃO DO BACKEND ----------------
// Em desenvolvimento (backend rodando no seu PC): use o IP local, ex:
//   "http://192.168.1.50:3000"
// Em produção (backend publicado no Vercel): use a URL https, ex:
//   "https://smartdose-xxxx.vercel.app"
const char* SERVER_URL     = "https://smartdose-vertex-da61.vercel.app";
const char* DEVICE_CODE    = "SMARTDOSE-001";        // criado no painel web
const char* DEVICE_API_KEY = "SUA_DEVICE_API_KEY";   // igual ao DEVICE_API_KEY do backend/.env

const unsigned long SYNC_INTERVAL_MS = 5UL * 60UL * 1000UL; // busca agenda a cada 5 min
const unsigned long ALERTA_TIMEOUT_MS = 30UL * 60UL * 1000UL; // 30 min sem retirar = DOSE_NOT_REMOVED

// ---------------- MODO DE TESTE (sem fonte externa pro motor) ----------------
// true  = o motor NUNCA energiza as bobinas (só de mentirinha). Use isso
//         enquanto estiver testando só pela USB do PC, sem fonte externa de 5V.
// false = comportamento normal, motor gira de verdade.
// >>> LEMBRE DE MUDAR PRA "false" QUANDO TIVER A FONTE EXTERNA LIGADA <<<
const bool MODO_TESTE_SEM_MOTOR = false;

// ---------------- PINOUT ----------------
#define PIN_SDA         21
#define PIN_SCL         22
#define PIN_HX711_DT    13
#define PIN_HX711_SCK   12
#define PIN_BUZZER      5
#define PIN_LED_OK      33   // verde
#define PIN_LED_ALERT   32   // vermelho
#define PIN_SW_HOME     35   // switch de referência do motor (ver nota acima)
#define PIN_MOTOR_IN1   14
#define PIN_MOTOR_IN2   27
#define PIN_MOTOR_IN3   26
#define PIN_MOTOR_IN4   25

// ---------------- MOTOR DE PASSO ----------------
// 28BYJ-48 em modo half-step ~= 4096 passos por volta (varia um pouco
// de unidade pra unidade; se o "home" nunca bater direito, ajuste este valor).
const long STEPS_PER_REV = 4096;

// Quantidade de COMPARTIMENTOS FÍSICOS no disco do dispenser.
// >>> AJUSTE conforme o seu mecanismo real. <<<
// Usado só para calcular a distância (em passos) entre um compartimento
// e o próximo — não precisa bater com a quantidade de horários da agenda.
const int NUM_SLOTS = 7; // ex.: 7 = um compartimento por dose da semana
const long STEPS_PER_SLOT = STEPS_PER_REV / NUM_SLOTS;
const int STEP_DELAY_MS = 2; // menor = motor mais rápido (não exagere, ou perde passo)

// true  = existe o switch físico (SW1) e o código usa ele pra achar a
//         posição de referência e se recalibrar sempre que passar por ali.
// false = SEM switch físico. O código assume, em malha aberta, que o disco
//         já está no compartimento inicial no momento em que liga (você
//         precisa girar o disco manualmente até lá ANTES de ligar o ESP32)
//         e so vai contando os passos dali pra frente. Funciona bem para um
//         protótipo, mas se o motor perder algum passo (travar, por exemplo),
//         não tem como se corrigir sozinho até a próxima vez que ligar.
const bool TEM_SWITCH_HOME = false;

// sequência half-step para o ULN2003
const int stepSequence[8][4] = {
  {1,0,0,0},
  {1,1,0,0},
  {0,1,0,0},
  {0,1,1,0},
  {0,0,1,0},
  {0,0,1,1},
  {0,0,0,1},
  {1,0,0,1}
};
int  currentStepIndex = 0;
long motorPosition = 0; // posição absoluta (em passos) desde o home

// ---------------- CÉLULA DE CARGA ----------------
HX711 balanca;
const float LIMIAR_PESO = 1.0; // gramas mínimas p/ considerar "tem remédio na bandeja"
                                // (ajuste depois de calibrar a célula)

// ---------------- RELÓGIO ----------------
RTC_DS3231 rtc;

// ---------------- AGENDA (vinda do backend) ----------------
// Espelha o que a API devolve em GET /api/devices/:code/schedule
struct ScheduleItem {
  int scheduleId = -1;
  int medicationId = -1;
  String name = "";
  String dosage = "";
  String time = "";              // "HH:MM", igual ao campo do banco
  String ultimaDataDispensada = ""; // "YYYY-MM-DD"; controla p/ nao repetir no mesmo dia
};
#define MAX_SCHEDULES 20
ScheduleItem agenda[MAX_SCHEDULES];
int numAgenda = 0;
unsigned long ultimoSync = 0;

// ---------------- ESTADO DO ALERTA (pos-dispensa) ----------------
bool alertaAtivo = false;
unsigned long alertaInicio = 0;
unsigned long ultimoBip = 0;
bool buzzerLigado = false;
bool alertaTimeoutEnviado = false;
int alertaScheduleId = -1;
int alertaMedicationId = -1;

// ---------------- ESTADO GERAL ----------------
bool motorHomed = false;
int ultimoMinutoChecado = -1;

// ===========================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_ALERT, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_IN3, OUTPUT);
  pinMode(PIN_MOTOR_IN4, OUTPUT);
  pinMode(PIN_SW_HOME, INPUT); // ver nota sobre pull-up no topo do arquivo

  digitalWrite(PIN_LED_OK, LOW);
  digitalWrite(PIN_LED_ALERT, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  Wire.begin(PIN_SDA, PIN_SCL);

  if (!rtc.begin()) {
    Serial.println("ERRO: DS3231 nao encontrado! Confira a fiacao I2C.");
  }
  // Se o relógio estiver com a hora zerada/errada (ex: bateria nova),
  // DESCOMENTE a linha abaixo, suba o código UMA vez, depois comente
  // de novo (senão ele volta pra hora de compilação toda vez que reiniciar):
  //rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));

  balanca.begin(PIN_HX711_DT, PIN_HX711_SCK);
  balanca.set_scale();  // depois de calibrar, use balanca.set_scale(FATOR_REAL)
  balanca.tare();       // zera com a bandeja vazia

  // [T3] Imprime a hora atual do RTC, para comparar com um relogio de
  // referencia (ex: celular sincronizado) e medir o desvio ao longo do tempo.
  DateTime agoraRtc = rtc.now();
  Serial.printf("[T3] Hora do RTC no boot: %04d-%02d-%02d %02d:%02d:%02d\n",
                agoraRtc.year(), agoraRtc.month(), agoraRtc.day(),
                agoraRtc.hour(), agoraRtc.minute(), agoraRtc.second());

  conectarWiFi();

  homeStepper(); // posiciona o motor no switch de referência ao ligar

  sincronizarAgenda(); // primeira busca de horários no backend
  ultimoSync = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  if (millis() - ultimoSync >= SYNC_INTERVAL_MS) {
    sincronizarAgenda();
    ultimoSync = millis();
  }

  verificarHorarios();
  gerenciarAlerta();
  verificarComandoManual();
  delay(1000);
}

// Digite 'd' + Enter no Monitor Serial a qualquer momento pra forçar um
// teste de dispensa, sem precisar esperar o horario bater nem depender
// da agenda. Util pra testar motor/Wi-Fi/backend enquanto outras partes
// (tipo a celula de carga) ainda estao sendo ajustadas.
void verificarComandoManual() {
  if (!Serial.available()) return;
  char c = Serial.read();
  while (Serial.available()) Serial.read(); // limpa o resto (ex: Enter)

  if (c == 't' || c == 'T') {
    DateTime agoraRtc = rtc.now();
    Serial.printf("[T3] Hora atual do RTC: %04d-%02d-%02d %02d:%02d:%02d\n",
                  agoraRtc.year(), agoraRtc.month(), agoraRtc.day(),
                  agoraRtc.hour(), agoraRtc.minute(), agoraRtc.second());
    return;
  }

  if (c == 'd' || c == 'D') {
    if (numAgenda > 0) {
      // Usa a primeira dose real da agenda sincronizada: o evento vai
      // aparecer certinho no painel do Gabriel, com nome/ID verdadeiros.
      Serial.println(">>> Comando manual: forcando dispensa de teste usando a agenda real...");
      dispensarDose(agenda[0]);
    } else {
      // Sem agenda sincronizada ainda: testa só motor/sensor, mas o
      // evento provavelmente será rejeitado pelo backend (sem IDs válidos).
      Serial.println(">>> Comando manual: sem agenda sincronizada, testando so motor/sensor...");
      ScheduleItem teste;
      teste.scheduleId = -1;
      teste.medicationId = -1;
      teste.name = "TESTE_MANUAL";
      teste.dosage = "";
      teste.time = "manual";
      dispensarDose(teste);
    }
  }
}

// ===========================================================
// WI-FI
// ===========================================================
void conectarWiFi() {
  WiFi.mode(WIFI_STA); // garante que o driver Wi-Fi já está inicializado

  // Força a regulamentação de Wi-Fi do Brasil (canais 1-13). Por padrão o
  // ESP32 vem limitado aos canais 1-11 (norma dos EUA), e alguns hotspots
  // de celular escolhem automaticamente canal 12 ou 13, que ficaria
  // invisível pro ESP32 sem isso.
  wifi_country_t country = {
    .cc = "BR",
    .schan = 1,
    .nchan = 13,
    .policy = WIFI_COUNTRY_POLICY_MANUAL
  };
  esp_wifi_set_country(&country);

  if (REDE_ENTERPRISE) {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_STA);
    wpa2_auth_method_t metodo = USAR_TTLS ? WPA2_AUTH_TTLS : WPA2_AUTH_PEAP;
    WiFi.begin(WIFI_SSID, metodo, EAP_IDENTITY, EAP_USERNAME, EAP_PASSWORD);

    Serial.print("Conectando ao Wi-Fi (Enterprise)");
    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
      tentativas++;
      if (tentativas >= 60) { // 30s sem conectar -> reinicia e tenta de novo
        Serial.println("\nNao consegui conectar, reiniciando...");
        ESP.restart();
      }
    }
    Serial.println(" conectado.");

  } else if (USAR_WIFI_MANAGER) {
    WiFiManager wm;
    wm.setConfigPortalTimeout(180); // 3 min esperando configuracao antes de desistir
    Serial.println("Conectando via WiFiManager (ou abrindo portal 'SmartDose-Config')...");
    bool conectou = wm.autoConnect("SmartDose-Config");
    if (!conectou) {
      Serial.println("Nao configurou a tempo, reiniciando...");
      ESP.restart();
    }
    Serial.println("Conectado via WiFiManager.");

  } else {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Conectando ao Wi-Fi");
    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
      tentativas++;
      if (tentativas >= 60) {
        Serial.println("\nNao consegui conectar, reiniciando...");
        ESP.restart();
      }
    }
    Serial.println(" conectado.");
  }
}

// Faz um HTTP GET/POST tratando http:// (rede local) e https:// (Vercel).
// Devolve o statusCode; a resposta (se houver) fica em `respostaOut`.
int httpRequest(const String& metodo, const String& url, const String& corpo, String& respostaOut) {
  bool isHttps = url.startsWith("https://");
  WiFiClientSecure clienteSeguro;
  WiFiClient clienteComum;
  HTTPClient http;

  if (isHttps) {
    clienteSeguro.setInsecure(); // protótipo: não valida o certificado do servidor
    http.begin(clienteSeguro, url);
  } else {
    http.begin(clienteComum, url);
  }

  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  if (corpo.length() > 0) {
    http.addHeader("Content-Type", "application/json");
  }

  int statusCode;
  if (metodo == "POST") {
    statusCode = http.POST(corpo);
  } else {
    statusCode = http.GET();
  }

  respostaOut = http.getString();
  http.end();
  return statusCode;
}

// ===========================================================
// AGENDA (GET /api/devices/:code/schedule)
// ===========================================================
void sincronizarAgenda() {
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long inicioMs = millis();

  String url = String(SERVER_URL) + "/api/devices/" + DEVICE_CODE + "/schedule";
  String resposta;
  int statusCode = httpRequest("GET", url, "", resposta);

  unsigned long duracaoMs = millis() - inicioMs;
  Serial.printf("[T2] Tempo da requisicao GET /schedule: %lu ms (HTTP %d)\n", duracaoMs, statusCode);

  if (statusCode != 200) {
    Serial.printf("Falha ao buscar agenda: HTTP %d\n", statusCode);
    return;
  }

  JsonDocument doc; // ArduinoJson 7: tamanho dinâmico automático
  DeserializationError err = deserializeJson(doc, resposta);
  if (err) {
    Serial.printf("JSON da agenda invalido: %s\n", err.c_str());
    return;
  }

  JsonArray itens = doc["schedule"].as<JsonArray>();
  ScheduleItem novaAgenda[MAX_SCHEDULES];
  int total = 0;

  for (JsonObject item : itens) {
    if (total >= MAX_SCHEDULES) break;
    novaAgenda[total].scheduleId = item["scheduleId"] | -1;
    novaAgenda[total].medicationId = item["medicationId"] | -1;
    novaAgenda[total].name = String((const char*)(item["name"] | ""));
    novaAgenda[total].dosage = String((const char*)(item["dosage"] | ""));
    novaAgenda[total].time = String((const char*)(item["time"] | ""));

    // preserva "ja dispensei hoje" pra nao duplicar dose ao ressincronizar
    for (int j = 0; j < numAgenda; j++) {
      if (agenda[j].scheduleId == novaAgenda[total].scheduleId) {
        novaAgenda[total].ultimaDataDispensada = agenda[j].ultimaDataDispensada;
        break;
      }
    }
    total++;
  }

  for (int i = 0; i < total; i++) agenda[i] = novaAgenda[i];
  numAgenda = total;

  Serial.printf("Agenda sincronizada: %d horario(s).\n", numAgenda);
}

// ===========================================================
// ENVIO DE EVENTOS (POST /api/devices/:code/events)
// ===========================================================
bool enviarEvento(int scheduleId, int medicationId, const char* eventType,
                   const String& occurredAt, const String& scheduledAt) {
  if (WiFi.status() != WL_CONNECTED) return false;

  JsonDocument doc;
  if (scheduleId >= 0) doc["scheduleId"] = scheduleId;
  if (medicationId >= 0) doc["medicationId"] = medicationId;
  doc["eventType"] = eventType;
  doc["occurredAt"] = occurredAt;
  if (scheduledAt.length() > 0) doc["scheduledAt"] = scheduledAt;

  String corpo;
  serializeJson(doc, corpo);

  String url = String(SERVER_URL) + "/api/devices/" + DEVICE_CODE + "/events";
  String resposta;
  int statusCode = httpRequest("POST", url, corpo, resposta);

  bool sucesso = (statusCode == 201);
  if (!sucesso) {
    Serial.printf("Falha ao enviar evento %s: HTTP %d - %s\n", eventType, statusCode, resposta.c_str());
  }
  return sucesso;
}

// Monta "YYYY-MM-DDTHH:MM:SS-03:00" a partir do RTC (hora local Brasil).
String isoAgora() {
  DateTime agora = rtc.now();
  char buf[26];
  sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02d-03:00",
          agora.year(), agora.month(), agora.day(),
          agora.hour(), agora.minute(), agora.second());
  return String(buf);
}

String dataDeHoje() {
  DateTime agora = rtc.now();
  char buf[11];
  sprintf(buf, "%04d-%02d-%02d", agora.year(), agora.month(), agora.day());
  return String(buf);
}

// ===========================================================
// VERIFICAÇÃO DE HORÁRIO / DISPARO DA DOSE
// ===========================================================
void verificarHorarios() {
  DateTime agora = rtc.now();

  // só reavalia quando o minuto muda, pra nao checar 1x por segundo à toa
  if (agora.minute() == ultimoMinutoChecado) return;
  ultimoMinutoChecado = agora.minute();

  char horaAtualStr[6];
  sprintf(horaAtualStr, "%02d:%02d", agora.hour(), agora.minute());
  String hoje = dataDeHoje();

  for (int i = 0; i < numAgenda; i++) {
    ScheduleItem &s = agenda[i];
    if (s.time == horaAtualStr && s.ultimaDataDispensada != hoje) {
      dispensarDose(s);
      s.ultimaDataDispensada = hoje;
    }
  }
}

// ===========================================================
// MOTOR DE PASSO
// ===========================================================
void passoMotor(bool sentidoHorario) {
  if (sentidoHorario) {
    currentStepIndex = (currentStepIndex + 1) % 8;
  } else {
    currentStepIndex = (currentStepIndex + 7) % 8;
  }
  digitalWrite(PIN_MOTOR_IN1, stepSequence[currentStepIndex][0]);
  digitalWrite(PIN_MOTOR_IN2, stepSequence[currentStepIndex][1]);
  digitalWrite(PIN_MOTOR_IN3, stepSequence[currentStepIndex][2]);
  digitalWrite(PIN_MOTOR_IN4, stepSequence[currentStepIndex][3]);
  delay(STEP_DELAY_MS);
}

void desligarBobinas() {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN4, LOW);
}

// Gira até o SW1 ser pressionado (posição de referência) e zera a posição.
// Se TEM_SWITCH_HOME = false, apenas assume que o disco já está no
// compartimento inicial (ver nota em TEM_SWITCH_HOME acima).
void homeStepper() {
  if (MODO_TESTE_SEM_MOTOR) {
    Serial.println("MODO TESTE: pulando home do motor (bobinas nao energizadas).");
    motorPosition = 0;
    motorHomed = true;
    return;
  }

  if (!TEM_SWITCH_HOME) {
    Serial.println("Sem switch de home: assumindo que o disco ja esta no compartimento inicial.");
    Serial.println(">>> Confirme que girou o disco manualmente ate o compartimento 0 antes de ligar! <<<");
    motorPosition = 0;
    motorHomed = true;
    return;
  }

  Serial.println("Fazendo home do motor...");
  long limiteSeguranca = (long)(STEPS_PER_REV * 1.2); // evita girar pra sempre se o switch falhar
  long contador = 0;
  while (digitalRead(PIN_SW_HOME) == HIGH && contador < limiteSeguranca) {
    passoMotor(true);
    contador++;
  }
  desligarBobinas();
  motorPosition = 0;
  motorHomed = (contador < limiteSeguranca);
  Serial.println(motorHomed ? "Motor homed com sucesso." : "ERRO: switch de referencia nao foi encontrado!");
}

// Avança o disco em um compartimento (STEPS_PER_SLOT) e libera o remédio.
// OBS: o hardware não tem como "mirar" um compartimento específico — ele só
// sabe girar e detectar quando completa uma volta (switch). Por isso, cada
// chamada aqui avança para o PRÓXIMO compartimento, na ordem em que os
// horários disparam. Isso só funciona corretamente se os compartimentos
// físicos forem preenchidos na mesma ordem cronológica dos horários do dia
// (a API já devolve a lista ordenada por "time" crescente).
void dispensarDose(ScheduleItem &s) {
  Serial.printf("Dispensando: %s (schedule %d) as %s\n", s.name.c_str(), s.scheduleId, s.time.c_str());

  float pesoAntes = balanca.get_units(5);

  if (MODO_TESTE_SEM_MOTOR) {
    Serial.println("MODO TESTE: pulando movimento do motor (bobinas nao energizadas).");
  } else {
    for (long i = 0; i < STEPS_PER_SLOT; i++) {
      passoMotor(true);
      motorPosition = (motorPosition + 1) % STEPS_PER_REV;
      if (TEM_SWITCH_HOME && digitalRead(PIN_SW_HOME) == LOW) {
        motorPosition = 0; // reaproveita a passagem pelo switch pra recalibrar
      }
    }
    desligarBobinas();
  }
  delay(500); // tempo pro remedio cair na bandeja (ou simular a espera, em modo teste)

  float pesoDepois = balanca.get_units(5);
  bool caiu = (pesoDepois - pesoAntes) > LIMIAR_PESO;

  String agoraIso = isoAgora();
  // Só monta a data prevista se "time" for um horario real tipo "HH:MM"
  // (o teste manual usa "manual" nesse campo, que não é uma data válida).
  String previstoIso = "";
  if (s.time.length() == 5 && s.time.charAt(2) == ':') {
    previstoIso = dataDeHoje() + "T" + s.time + ":00-03:00";
  }

  if (caiu) {
    enviarEvento(s.scheduleId, s.medicationId, "DOSE_DISPENSED", agoraIso, previstoIso);
    iniciarAlerta(s.scheduleId, s.medicationId);
  } else {
    Serial.println("AVISO: nao detectei aumento de peso — o remedio pode nao ter caido.");
    enviarEvento(s.scheduleId, s.medicationId, "DEVICE_ERROR", agoraIso, previstoIso);
  }
}

// ===========================================================
// LED + BUZZER (alerta sonoro/visual pós-dispensa)
// ===========================================================
void iniciarAlerta(int scheduleId, int medicationId) {
  alertaAtivo = true;
  alertaInicio = millis();
  alertaTimeoutEnviado = false;
  alertaScheduleId = scheduleId;
  alertaMedicationId = medicationId;
  digitalWrite(PIN_LED_OK, LOW);
}

void pararAlerta() {
  alertaAtivo = false;
  digitalWrite(PIN_LED_ALERT, LOW);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED_OK, HIGH);
}

// Pisca o LED vermelho + apita o buzzer em intervalos.
// - Encerra sozinho e avisa o backend (MEDICATION_REMOVED) quando o peso
//   da bandeja cair (remédio foi retirado).
// - Se passar de ALERTA_TIMEOUT_MS sem retirada, avisa o backend
//   (DOSE_NOT_REMOVED) uma única vez, mas continua alertando.
void gerenciarAlerta() {
  if (!alertaAtivo) return;

  float peso = balanca.get_units(3);
  if (peso < LIMIAR_PESO) {
    enviarEvento(alertaScheduleId, alertaMedicationId, "MEDICATION_REMOVED", isoAgora(), "");
    pararAlerta();
    return;
  }

  if (!alertaTimeoutEnviado && (millis() - alertaInicio > ALERTA_TIMEOUT_MS)) {
    enviarEvento(alertaScheduleId, alertaMedicationId, "DOSE_NOT_REMOVED", isoAgora(), "");
    alertaTimeoutEnviado = true;
  }

  unsigned long agoraMs = millis();
  if (agoraMs - ultimoBip > 500) {
    ultimoBip = agoraMs;
    buzzerLigado = !buzzerLigado;
    digitalWrite(PIN_BUZZER, buzzerLigado ? HIGH : LOW);
    digitalWrite(PIN_LED_ALERT, buzzerLigado ? HIGH : LOW);
  }
}
