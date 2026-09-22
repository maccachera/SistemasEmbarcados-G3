#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// Use credenciais locais durante o desenvolvimento e não versione valores reais.
const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_PASSWORD = "SUA_SENHA";
const char* SERVER_URL = "http://192.168.1.100:3000";
const char* DEVICE_CODE = "SMARTDOSE-001";
const char* DEVICE_API_KEY = "SUA_DEVICE_API_KEY";

const unsigned long SYNC_INTERVAL_MS = 5UL * 60UL * 1000UL;

Preferences preferences;
unsigned long lastSyncAt = 0;

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }

  Serial.println(" conectado.");
}

bool syncSchedule() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/devices/" + DEVICE_CODE + "/schedule";
  http.begin(url);
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  int statusCode = http.GET();
  if (statusCode != HTTP_CODE_OK) {
    Serial.printf("Falha ao consultar programação: HTTP %d\n", statusCode);
    http.end();
    return false;
  }

  String payload = http.getString();
  JsonDocument document;
  DeserializationError error = deserializeJson(document, payload);

  if (error) {
    Serial.printf("JSON inválido: %s\n", error.c_str());
    http.end();
    return false;
  }

  // Mantém uma cópia local para o funcionamento sem internet.
  preferences.putString("schedule", payload);

  JsonArray schedules = document["schedule"];
  for (JsonObject schedule : schedules) {
    int scheduleId = schedule["scheduleId"];
    int medicationId = schedule["medicationId"];
    const char* time = schedule["time"];
    Serial.printf("Horário %s: schedule=%d medication=%d\n", time, scheduleId, medicationId);

    // Integre estes valores com o RTC DS3231 e o controle do motor.
  }

  http.end();
  return true;
}

bool sendDoseEvent(
  int scheduleId,
  int medicationId,
  const char* eventType,
  const char* occurredAt
) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  JsonDocument document;
  document["scheduleId"] = scheduleId;
  document["medicationId"] = medicationId;
  document["eventType"] = eventType;
  document["occurredAt"] = occurredAt;

  String body;
  serializeJson(document, body);

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/devices/" + DEVICE_CODE + "/events";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  int statusCode = http.POST(body);
  bool success = statusCode == HTTP_CODE_CREATED;

  if (!success) {
    Serial.printf("Falha ao enviar evento: HTTP %d\n", statusCode);
  }

  http.end();
  return success;
}

void setup() {
  Serial.begin(115200);
  preferences.begin("smartdose", false);
  connectWifi();
  syncSchedule();
  lastSyncAt = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (millis() - lastSyncAt >= SYNC_INTERVAL_MS) {
    syncSchedule();
    lastSyncAt = millis();
  }

  // O acionamento crítico deve usar o DS3231 e a programação salva na NVS.
  // Após dispensar ou detectar a retirada, chame sendDoseEvent(...).
  delay(1000);
}
