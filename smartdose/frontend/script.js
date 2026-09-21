const state = {
  medications: [],
  schedules: [],
  events: [],
  devices: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const medicationForm = $('#medicationForm');
const scheduleForm = $('#scheduleForm');
const medicationSelect = $('#scheduleMedication');
const toast = $('#toast');
let toastTimer;

const eventPresentation = {
  DOSE_DISPENSED: { label: 'Dose disponibilizada', symbol: '↓', tone: '' },
  MEDICATION_REMOVED: { label: 'Medicamento retirado', symbol: '✓', tone: '' },
  DOSE_NOT_REMOVED: { label: 'Dose não retirada', symbol: '!', tone: 'warning' },
  DEVICE_ERROR: { label: 'Erro no dispositivo', symbol: '×', tone: 'error' },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Não foi possível concluir a operação.');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast visible${type === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 3600);
}

function emptyState(title, description) {
  return `
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">＋</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function showView(view) {
  $$('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  $$('[data-view-panel]').forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });

  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatDateTime(value) {
  if (!value) return 'Sem comunicação';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatEventTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function activeSchedules() {
  return state.schedules.filter((schedule) => schedule.enabled);
}

function renderMedicationOptions(selectedId = medicationSelect.value) {
  medicationSelect.replaceChildren(new Option('Selecione um medicamento', ''));

  state.medications.forEach((medication) => {
    medicationSelect.add(
      new Option(
        `${medication.name} · compartimento ${medication.compartment}`,
        medication.id,
      ),
    );
  });

  if (selectedId) {
    medicationSelect.value = String(selectedId);
  }

  $('#scheduleSubmit').disabled = state.medications.length === 0;
}

function renderDashboard() {
  const schedules = activeSchedules().sort((a, b) => a.time.localeCompare(b.time));
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let next = schedules.find((schedule) => {
    const [hours, minutes] = schedule.time.split(':').map(Number);
    return hours * 60 + minutes >= currentMinutes;
  });
  let tomorrow = false;

  if (!next && schedules.length > 0) {
    next = schedules[0];
    tomorrow = true;
  }

  $('#nextDoseTime').textContent = next ? next.time : '—';
  $('#nextDoseLabel').textContent = next
    ? `${next.medication.name}${tomorrow ? ' · amanhã' : ''}`
    : 'Nenhum horário ativo';
  $('#medicationTotal').textContent = state.medications.length;
  $('#activeScheduleTotal').textContent = schedules.length;

  const device = state.devices[0];
  const deviceOnline = device?.status === 'online';
  $('#deviceStatusText').textContent = deviceOnline ? 'Online' : 'Offline';
  $('#deviceStatusText').className = `device-stat${deviceOnline ? ' online' : ''}`;
  $('#deviceLastSeen').textContent = device?.lastSeenAt
    ? `Último contato: ${formatDateTime(device.lastSeenAt)}`
    : 'Sem comunicação';

  const routine = $('#dashboardRoutine');
  if (schedules.length === 0) {
    routine.innerHTML = emptyState('Nenhum horário ativo', 'Adicione horários para montar a rotina diária.');
  } else {
    routine.innerHTML = schedules.map((schedule) => `
      <div class="routine-item">
        <span class="routine-time">${escapeHtml(schedule.time)}</span>
        <div class="item-info">
          <strong>${escapeHtml(schedule.medication.name)}</strong>
          <span>${escapeHtml(schedule.medication.dosage)} · Compartimento ${schedule.medication.compartment}</span>
        </div>
        <span class="event-badge">Programado</span>
      </div>
    `).join('');
  }

  renderEvents($('#dashboardEvents'), state.events.slice(0, 4), true);
}

function renderMedications() {
  const list = $('#medicationList');
  $('#medicationCount').textContent = `${state.medications.length} ${state.medications.length === 1 ? 'item' : 'itens'}`;

  if (state.medications.length === 0) {
    list.innerHTML = emptyState('Nenhum medicamento', 'Use o formulário para fazer o primeiro cadastro.');
    return;
  }

  list.innerHTML = state.medications.map((medication) => `
    <div class="medication-card">
      <div class="compartment" aria-label="Compartimento ${medication.compartment}">
        <div><small>Comp.</small>${medication.compartment}</div>
      </div>
      <div class="item-info">
        <strong>${escapeHtml(medication.name)}</strong>
        <span>${escapeHtml(medication.dosage)} · ${medication.schedules.length} ${medication.schedules.length === 1 ? 'horário' : 'horários'}</span>
      </div>
      <div class="item-actions">
        <button class="icon-button" type="button" data-edit-medication="${medication.id}">Editar</button>
        <button class="icon-button danger" type="button" data-delete-medication="${medication.id}">Excluir</button>
      </div>
    </div>
  `).join('');
}

function renderSchedules() {
  const list = $('#scheduleList');
  $('#scheduleCount').textContent = `${state.schedules.length} ${state.schedules.length === 1 ? 'horário' : 'horários'}`;

  if (state.schedules.length === 0) {
    list.innerHTML = emptyState('Nenhum horário', 'Selecione um medicamento e adicione o primeiro horário.');
    return;
  }

  list.innerHTML = state.schedules.map((schedule) => `
    <div class="routine-item${schedule.enabled ? '' : ' disabled'}">
      <span class="routine-time">${escapeHtml(schedule.time)}</span>
      <div class="item-info">
        <strong>${escapeHtml(schedule.medication.name)}</strong>
        <span>${escapeHtml(schedule.medication.dosage)} · Compartimento ${schedule.medication.compartment}</span>
      </div>
      <div class="item-actions">
        <button
          class="switch"
          type="button"
          role="switch"
          aria-checked="${schedule.enabled}"
          aria-label="${schedule.enabled ? 'Desativar' : 'Ativar'} horário das ${escapeHtml(schedule.time)}"
          data-toggle-schedule="${schedule.id}"
        ></button>
        <button class="icon-button" type="button" data-edit-schedule="${schedule.id}">Editar</button>
        <button class="icon-button danger" type="button" data-delete-schedule="${schedule.id}">Excluir</button>
      </div>
    </div>
  `).join('');
}

function renderEvents(container, events, compact = false) {
  if (events.length === 0) {
    container.innerHTML = emptyState('Nenhum evento recebido', 'Os eventos enviados pelo dispenser aparecerão aqui.');
    return;
  }

  container.innerHTML = events.map((event) => {
    const presentation = eventPresentation[event.eventType] || {
      label: event.eventType,
      symbol: '•',
      tone: '',
    };
    const medicationName = event.medication?.name || 'Evento do dispositivo';
    const detail = event.medication
      ? `${event.medication.dosage} · ${presentation.label}`
      : presentation.label;

    return `
      <div class="event-item">
        <span class="event-symbol ${presentation.tone}" aria-hidden="true">${presentation.symbol}</span>
        <div class="item-info">
          <strong>${escapeHtml(medicationName)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
        <time class="event-time" datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(formatEventTime(event.occurredAt))}</time>
      </div>
    `;
  }).join('');

  container.classList.toggle('compact', compact);
}

function renderHistory() {
  $('#eventCount').textContent = `${state.events.length} ${state.events.length === 1 ? 'evento' : 'eventos'}`;
  renderEvents($('#historyList'), state.events);
}

function renderDevice() {
  const container = $('#deviceCard');
  const device = state.devices[0];

  if (!device) {
    container.innerHTML = emptyState('Nenhum dispositivo', 'Cadastre um dispositivo pela API para iniciar a comunicação.');
    return;
  }

  const online = device.status === 'online';
  container.innerHTML = `
    <div class="device-hero">
      <div class="device-icon" aria-hidden="true">SD</div>
      <div>
        <h2>${escapeHtml(device.name)}</h2>
        <span class="device-code">${escapeHtml(device.deviceCode)}</span>
      </div>
    </div>
    <span class="status-pill ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
    <dl class="detail-list">
      <div class="detail-row">
        <dt>Última comunicação</dt>
        <dd>${escapeHtml(formatDateTime(device.lastSeenAt))}</dd>
      </div>
      <div class="detail-row">
        <dt>Horários ativos</dt>
        <dd>${activeSchedules().length}</dd>
      </div>
      <div class="detail-row">
        <dt>Autenticação</dt>
        <dd>API key configurada</dd>
      </div>
    </dl>
  `;
}

function renderAll() {
  renderMedicationOptions();
  renderDashboard();
  renderMedications();
  renderSchedules();
  renderHistory();
  renderDevice();
}

async function loadAll() {
  const [medications, schedules, events, devices] = await Promise.all([
    request('/api/medications'),
    request('/api/schedules'),
    request('/api/events?limit=100'),
    request('/api/devices'),
  ]);

  state.medications = medications;
  state.schedules = schedules;
  state.events = events;
  state.devices = devices;
  renderAll();
}

async function checkConnection() {
  const status = $('#connectionStatus');
  try {
    await request('/api/health');
    status.className = 'connection online';
    status.lastElementChild.textContent = 'Sistema conectado';
  } catch (_error) {
    status.className = 'connection offline';
    status.lastElementChild.textContent = 'Sistema indisponível';
  }
}

function resetMedicationForm() {
  medicationForm.reset();
  $('#medicationId').value = '';
  $('#medicationFormKicker').textContent = 'Novo cadastro';
  $('#medicationFormTitle').textContent = 'Adicionar medicamento';
  $('#medicationSubmit').textContent = 'Salvar medicamento';
  $('#cancelMedicationEdit').hidden = true;
}

function startMedicationEdit(id) {
  const medication = state.medications.find((item) => item.id === id);
  if (!medication) return;

  $('#medicationId').value = medication.id;
  $('#medicationName').value = medication.name;
  $('#medicationDosage').value = medication.dosage;
  $('#medicationCompartment').value = medication.compartment;
  $('#medicationFormKicker').textContent = 'Editando cadastro';
  $('#medicationFormTitle').textContent = medication.name;
  $('#medicationSubmit').textContent = 'Salvar alterações';
  $('#cancelMedicationEdit').hidden = false;
  $('#medicationName').focus();
}

function resetScheduleForm() {
  scheduleForm.reset();
  $('#scheduleId').value = '';
  $('#scheduleFormKicker').textContent = 'Novo horário';
  $('#scheduleFormTitle').textContent = 'Adicionar à rotina';
  $('#scheduleSubmit').textContent = 'Adicionar horário';
  $('#cancelScheduleEdit').hidden = true;
  renderMedicationOptions();
}

function startScheduleEdit(id) {
  const schedule = state.schedules.find((item) => item.id === id);
  if (!schedule) return;

  $('#scheduleId').value = schedule.id;
  medicationSelect.value = schedule.medicationId;
  $('#scheduleTime').value = schedule.time;
  $('#scheduleFormKicker').textContent = 'Editando horário';
  $('#scheduleFormTitle').textContent = schedule.medication.name;
  $('#scheduleSubmit').textContent = 'Salvar alterações';
  $('#cancelScheduleEdit').hidden = false;
  $('#scheduleTime').focus();
}

medicationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('#medicationId').value;
  const button = $('#medicationSubmit');
  button.disabled = true;

  try {
    await request(id ? `/api/medications/${id}` : '/api/medications', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: $('#medicationName').value,
        dosage: $('#medicationDosage').value,
        compartment: Number($('#medicationCompartment').value),
      }),
    });
    resetMedicationForm();
    await loadAll();
    showToast(id ? 'Medicamento atualizado.' : 'Medicamento cadastrado.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

scheduleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('#scheduleId').value;
  const button = $('#scheduleSubmit');
  button.disabled = true;

  try {
    await request(id ? `/api/schedules/${id}` : '/api/schedules', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        medicationId: Number(medicationSelect.value),
        time: $('#scheduleTime').value,
      }),
    });
    resetScheduleForm();
    await loadAll();
    showToast(id ? 'Horário atualizado.' : 'Horário adicionado à rotina.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = state.medications.length === 0;
  }
});

document.addEventListener('click', async (event) => {
  const navigation = event.target.closest('[data-view], [data-go-view]');
  if (navigation) {
    showView(navigation.dataset.view || navigation.dataset.goView);
    return;
  }

  const editMedication = event.target.closest('[data-edit-medication]');
  if (editMedication) {
    startMedicationEdit(Number(editMedication.dataset.editMedication));
    return;
  }

  const deleteMedication = event.target.closest('[data-delete-medication]');
  if (deleteMedication) {
    const id = Number(deleteMedication.dataset.deleteMedication);
    const medication = state.medications.find((item) => item.id === id);
    if (!medication || !window.confirm(`Excluir ${medication.name} e todos os seus horários?`)) return;
    try {
      await request(`/api/medications/${id}`, { method: 'DELETE' });
      resetMedicationForm();
      resetScheduleForm();
      await loadAll();
      showToast('Medicamento excluído.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const editSchedule = event.target.closest('[data-edit-schedule]');
  if (editSchedule) {
    startScheduleEdit(Number(editSchedule.dataset.editSchedule));
    return;
  }

  const toggleSchedule = event.target.closest('[data-toggle-schedule]');
  if (toggleSchedule) {
    const id = Number(toggleSchedule.dataset.toggleSchedule);
    const schedule = state.schedules.find((item) => item.id === id);
    if (!schedule) return;
    try {
      await request(`/api/schedules/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      await loadAll();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const deleteSchedule = event.target.closest('[data-delete-schedule]');
  if (deleteSchedule) {
    const id = Number(deleteSchedule.dataset.deleteSchedule);
    if (!window.confirm('Remover este horário da rotina?')) return;
    try {
      await request(`/api/schedules/${id}`, { method: 'DELETE' });
      resetScheduleForm();
      await loadAll();
      showToast('Horário removido.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
});

$('#cancelMedicationEdit').addEventListener('click', resetMedicationForm);
$('#cancelScheduleEdit').addEventListener('click', resetScheduleForm);

async function refreshLiveData() {
  try {
    const [events, devices] = await Promise.all([
      request('/api/events?limit=100'),
      request('/api/devices'),
    ]);
    state.events = events;
    state.devices = devices;
    renderDashboard();
    renderHistory();
    renderDevice();
    await checkConnection();
  } catch (_error) {
    await checkConnection();
  }
}

async function initialize() {
  $('#todayDate').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  const initialView = ['dashboard', 'medications', 'schedules', 'history', 'device']
    .includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'dashboard';
  showView(initialView);
  await checkConnection();

  try {
    await loadAll();
  } catch (error) {
    showToast(error.message, 'error');
  }

  setInterval(refreshLiveData, 30_000);
}

initialize();
