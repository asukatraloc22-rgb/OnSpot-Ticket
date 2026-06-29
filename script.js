// script.js
const HISTORY_KEY = 'onspot_ticket_history';
const MAX_HISTORY = 50;

const form = document.getElementById('ticket-form');
const submitBtn = document.getElementById('submit-btn');
const clearBtn = document.getElementById('clear-btn');
const errorMsg = document.getElementById('error-msg');

const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const resultsContent = document.getElementById('results-content');

const historyToggle = document.getElementById('history-toggle');
const historyDrawer = document.getElementById('history-drawer');
const historyClose = document.getElementById('history-close');
const historyList = document.getElementById('history-list');
const historyClearBtn = document.getElementById('history-clear');

// ---------- Soumission du formulaire ----------

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const payload = {
    ticketNumber: document.getElementById('ticket-number').value.trim(),
    clientName: document.getElementById('client-name').value.trim(),
    ticketContent: document.getElementById('ticket-content').value.trim(),
    canal: document.getElementById('canal').value,
    ton: document.getElementById('ton').value,
    segment: document.getElementById('segment').value,
  };

  if (!payload.ticketContent) {
    showError('Le contenu du ticket est vide.');
    return;
  }

  setLoading(true);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erreur inconnue lors de l\'analyse.');
    }

    renderResults(data.result, payload);
    saveToHistory(payload, data.result);

  } catch (err) {
    showError(err.message);
    setLoading(false);
    showEmpty();
  }
});

clearBtn.addEventListener('click', () => {
  form.reset();
  hideError();
  showEmpty();
});

// ---------- États d'affichage ----------

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  if (isLoading) {
    emptyState.hidden = true;
    resultsContent.hidden = true;
    loadingState.hidden = false;
  } else {
    loadingState.hidden = true;
  }
}

function showEmpty() {
  resultsContent.hidden = true;
  loadingState.hidden = true;
  emptyState.hidden = false;
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.hidden = false;
}

function hideError() {
  errorMsg.hidden = true;
  errorMsg.textContent = '';
}

// ---------- Affichage des résultats ----------

function renderResults(result, payload) {
  setLoading(false);
  emptyState.hidden = true;
  resultsContent.hidden = false;

  // Résumé interne
  const r = result.resume || {};
  document.getElementById('resume-text').innerHTML = `
    <dl>
      <dt>Issue</dt><dd>${escapeHtml(r.issue)}</dd>
      <dt>Pax request</dt><dd>${escapeHtml(r.pax_request)}</dd>
      <dt>Contexte</dt><dd>${escapeHtml(r.contexte_prestataire)}</dd>
      <dt>Actions faites</dt><dd>${escapeHtml(r.actions_effectuees)}</dd>
      <dt>À faire</dt><dd>${escapeHtml(r.a_faire)}</dd>
      <dt>Note</dt><dd>${escapeHtml(r.note)}</dd>
      <dt>Statut</dt><dd>${escapeHtml(r.statut)}</dd>
    </dl>`;

  // Par pôle
  const p = result.par_pole || {};
  let poleHtml = '';
  poleHtml += poleSection('Front Office (FO)', p.fo);
  poleHtml += poleSection('Back Office (BO)', p.bo);
  poleHtml += poleSection('Agence', p.agence);
  if (p.non_identifie && p.non_identifie.trim()) {
    poleHtml += poleSection('Non identifié', p.non_identifie);
  }
  document.getElementById('pole-text').innerHTML = poleHtml;

  // Message client
  const mc = result.message_client || {};
  let clientHtml = '';
  if (mc.objet && mc.objet.trim()) {
    clientHtml += `<p><strong>Objet :</strong> ${escapeHtml(mc.objet)}</p>`;
  }
  clientHtml += `<div>${escapeHtml(mc.corps).replace(/\n/g, '<br>')}</div>`;
  document.getElementById('client-text').innerHTML = clientHtml;

  // Message agence (masqué si vide)
  const ma = result.message_agence || {};
  const agenceBlock = document.getElementById('agence-block');
  if (ma.corps && ma.corps.trim()) {
    let agenceHtml = '';
    if (ma.objet && ma.objet.trim()) {
      agenceHtml += `<p><strong>Objet :</strong> ${escapeHtml(ma.objet)}</p>`;
    }
    agenceHtml += `<div>${escapeHtml(ma.corps).replace(/\n/g, '<br>')}</div>`;
    document.getElementById('agence-text').innerHTML = agenceHtml;
    agenceBlock.hidden = false;
  } else {
    agenceBlock.hidden = true;
  }

  // Instructions internes
  const ins = result.instructions_internes || {};
  let insHtml = '<dl>';
  if (ins.fo && ins.fo.trim()) insHtml += `<dt>FO</dt><dd>${escapeHtml(ins.fo)}</dd>`;
  if (ins.bo && ins.bo.trim()) insHtml += `<dt>BO</dt><dd>${escapeHtml(ins.bo)}</dd>`;
  if (ins.agv && ins.agv.trim()) insHtml += `<dt>Agence</dt><dd>${escapeHtml(ins.agv)}</dd>`;
  if (ins.priorite) insHtml += `<dt>Priorité</dt><dd>${escapeHtml(ins.priorite)}</dd>`;
  if (ins.delai && ins.delai.trim()) insHtml += `<dt>Délai</dt><dd>${escapeHtml(ins.delai)}</dd>`;
  insHtml += '</dl>';
  document.getElementById('instructions-text').innerHTML = insHtml;

  // Stocke le texte brut pour la copie
  resultsContent.dataset.rawResult = JSON.stringify(result);
}

function poleSection(label, content) {
  const text = (content && content.trim()) ? content : 'Aucun élément identifié';
  return `<div class="pole-section">
    <span class="pole-label">${escapeHtml(label)}</span>
    <div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>
  </div>`;
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------- Copier dans le presse-papier ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-copy');
  if (!btn) return;

  const targetId = btn.dataset.copyTarget;
  const el = document.getElementById(targetId);
  if (!el) return;

  const text = el.innerText;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    const original = btn.textContent;
    btn.textContent = 'Copié';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = original;
    }, 1500);
  });
});

// ---------- Historique (localStorage) ----------

function saveToHistory(payload, result) {
  const history = getHistory();
  history.unshift({
    ticketNumber: payload.ticketNumber,
    clientName: payload.clientName,
    date: new Date().toISOString(),
    payload,
    result,
  });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryList();
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function renderHistoryList() {
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<p class="history-empty">Aucun ticket traité pour le moment.</p>';
    return;
  }

  historyList.innerHTML = history.map((entry, idx) => {
    const date = new Date(entry.date);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="history-item" data-idx="${idx}">
      <div class="h-ticket">${escapeHtml(entry.ticketNumber || 'Sans numéro')} — ${escapeHtml(entry.clientName || 'Client inconnu')}</div>
      <div class="h-meta">${dateStr}</div>
    </div>`;
  }).join('');
}

historyList.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;
  const idx = parseInt(item.dataset.idx, 10);
  const history = getHistory();
  const entry = history[idx];
  if (!entry) return;

  document.getElementById('ticket-number').value = entry.payload.ticketNumber || '';
  document.getElementById('client-name').value = entry.payload.clientName || '';
  document.getElementById('ticket-content').value = entry.payload.ticketContent || '';
  document.getElementById('canal').value = entry.payload.canal || 'email';
  document.getElementById('ton').value = entry.payload.ton || 'empathique';
  document.getElementById('segment').value = entry.payload.segment || 'standard';

  renderResults(entry.result, entry.payload);
  closeHistory();
});

historyClearBtn.addEventListener('click', () => {
  if (confirm('Vider tout l\'historique des tickets traités ?')) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistoryList();
  }
});

function openHistory() {
  renderHistoryList();
  historyDrawer.hidden = false;
}
function closeHistory() {
  historyDrawer.hidden = true;
}

historyToggle.addEventListener('click', openHistory);
historyClose.addEventListener('click', closeHistory);

// Initialisation
renderHistoryList();
