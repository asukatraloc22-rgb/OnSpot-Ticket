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
    langue: document.getElementById('langue').value,
    consigneSpecifique: document.getElementById('consigne').value.trim(),
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
      const detailMsg = data.details ? ` (${typeof data.details === 'string' ? data.details.slice(0, 200) : ''})` : '';
      throw new Error((data.error || 'Erreur inconnue lors de l\'analyse.') + detailMsg);
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

  currentChatHistory = [];
  document.getElementById('chat-messages').innerHTML = '';

  // 1. Résumé interne (Adapté au nouveau JSON)
  const r = result.resume || {};
  // 1.5 Problem Solving
  const ps = result.problem_solving;
  const psBlock = document.querySelector('[data-block="problem-solving"]');
  if (ps) {
    let optionsHtml = Array.isArray(ps.options_client) && ps.options_client.length > 0 
      ? `<ul style="margin: 0; padding-left: 16px;">${ps.options_client.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` 
      : 'Aucune option spécifique identifiée.';
      
    let verifsHtml = Array.isArray(ps.verifications_internes) && ps.verifications_internes.length > 0
      ? `<ul style="margin: 0; padding-left: 16px;">${ps.verifications_internes.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`
      : 'Aucune vérification interne spécifique requise.';

    document.getElementById('problem-solving-text').innerHTML = `
      <dl>
        <dt>Analyse du blocage</dt><dd>${escapeHtml(ps.analyse_blocage || 'Non défini')}</dd>
        <dt>Options à proposer au client</dt><dd>${optionsHtml}</dd>
        <dt>Vérifications internes à faire</dt><dd>${verifsHtml}</dd>
      </dl>
    `;
    psBlock.hidden = false;
  } else {
    if(psBlock) psBlock.hidden = true;
  }
  // Formatage de la chronologie (liste à puces)
  let chronologieHtml = '';
  if (Array.isArray(r.details_chronologiques)) {
    chronologieHtml = `<ul style="margin: 0; padding-left: 16px;">${r.details_chronologiques.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;
  } else {
    chronologieHtml = escapeHtml(r.details_chronologiques);
  }

  // Formatage visuel des incohérences (en rouge si détectées)
  const incoherenceStyle = (r.incoherences_detectees && r.incoherences_detectees.length > 40) ? 'color: var(--warn); font-weight: bold;' : '';

  document.getElementById('resume-text').innerHTML = `
    <dl>
      <dt>Issue principale</dt><dd><strong>${escapeHtml(r.issue_principale)}</strong></dd>
      <dt>Chronologie</dt><dd>${chronologieHtml}</dd>
      <dt>Actions faites</dt><dd>${escapeHtml(r.actions_effectuees)}</dd>
      <dt>À faire</dt><dd>${escapeHtml(r.a_faire)}</dd>
      <dt style="${incoherenceStyle}">Incohérences</dt><dd style="${incoherenceStyle}">${escapeHtml(r.incoherences_detectees)}</dd>
      <dt>Infos manquantes</dt><dd>${escapeHtml(r.infos_manquantes)}</dd>
    </dl>`;

  // 2. Ce qui a été dit par pôle (Optionnel - à voir si tu veux le garder, sinon on peut le masquer)
  // Note: Ton backend API modifié ne renvoie plus 'par_pole', on peut donc masquer ce bloc si tu n'en as plus besoin.
  const poleBlock = document.querySelector('[data-block="par-pole"]');
  if(poleBlock) poleBlock.hidden = true;

  // 3. Message client (Masqué si vide grâce à la consigne spécifique)
  const mc = result.messages?.client || '';
  const clientBlock = document.querySelector('[data-block="message-client"]');
  if (mc.trim()) {
    document.getElementById('client-text').innerHTML = `<div>${escapeHtml(mc).replace(/\n/g, '<br>')}</div>`;
    clientBlock.hidden = false;
  } else {
    clientBlock.hidden = true;
  }

  // 4. Message agence (Masqué si vide)
  const ma = result.messages?.agence || '';
  const agenceBlock = document.getElementById('agence-block');
  if (ma.trim()) {
    document.getElementById('agence-text').innerHTML = `<div>${escapeHtml(ma).replace(/\n/g, '<br>')}</div>`;
    agenceBlock.hidden = false;
  } else {
    agenceBlock.hidden = true;
  }

  // 5. Instructions internes
  const ins = result.instructions_internes || {};
  let insHtml = '<dl>';
  if (ins.fo && ins.fo.trim()) insHtml += `<dt>FO</dt><dd>${escapeHtml(ins.fo)}</dd>`;
  if (ins.bo && ins.bo.trim()) insHtml += `<dt>BO</dt><dd>${escapeHtml(ins.bo)}</dd>`;
  if (ins.priorite) insHtml += `<dt>Priorité</dt><dd><strong>${escapeHtml(ins.priorite)}</strong></dd>`;
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
  document.getElementById('langue').value = entry.payload.langue || 'Français';
  document.getElementById('consigne').value = entry.payload.consigneSpecifique || '';

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


// ---------- Logique Q&A (Deep Dive) ----------
let currentChatHistory = [];

const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMessages = document.getElementById('chat-messages');

chatSendBtn.addEventListener('click', async () => {
  const question = chatInput.value.trim();
  if (!question) return;

  // 1. Afficher la question de l'utilisateur
  appendChatMessage('user', question);
  chatInput.value = '';
  chatSendBtn.disabled = true;

  // 2. Récupérer le contexte (ticket brut + analyse précédente stockée dans l'interface)
  const ticketContent = document.getElementById('ticket-content').value.trim();
  const analysePrecedente = resultsContent.dataset.rawResult || '';

  // 3. Ajouter un loader temporaire
  const loaderId = 'loader-' + Date.now();
  chatMessages.insertAdjacentHTML('beforeend', `<div id="${loaderId}" style="color: var(--ink-soft); font-size: 13px; font-style: italic;">L'IA fouille le ticket...</div>`);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketContent,
        analysePrecedente,
        question,
        historiqueChat: currentChatHistory
      }),
    });

    const data = await res.json();
    document.getElementById(loaderId).remove(); // on enlève le loader

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erreur lors de la réponse.');
    }

    // 4. Afficher la réponse de l'IA et sauvegarder l'historique
    appendChatMessage('assistant', data.reponse);
    
    currentChatHistory.push({ role: 'user', text: question });
    currentChatHistory.push({ role: 'assistant', text: data.reponse });

  } catch (err) {
    document.getElementById(loaderId).remove();
    appendChatMessage('assistant', 'Erreur : ' + err.message);
  } finally {
    chatSendBtn.disabled = false;
  }
});

function appendChatMessage(role, text) {
  const isUser = role === 'user';
  const align = isUser ? 'align-self: flex-end;' : 'align-self: flex-start;';
  const bg = isUser ? 'background: var(--accent); color: white;' : 'background: var(--accent-soft); color: var(--ink);';
  
  const formattedText = escapeHtml(text).replace(/\n/g, '<br>');
  
  const msgHtml = `<div style="${align} ${bg} padding: 10px 14px; border-radius: 8px; max-width: 85%; font-size: 13.5px;">
    ${formattedText}
  </div>`;
  
  chatMessages.insertAdjacentHTML('beforeend', msgHtml);
  chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll vers le bas
}

// Optionnel : permettre d'envoyer avec la touche "Entrée"
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    chatSendBtn.click();
  }
});

// ---------- Gestion du Thème (Multi-Palettes) ----------
const themeSelector = document.getElementById('theme-selector');

// Charger le thème sauvegardé
const savedTheme = localStorage.getItem('onspot_theme') || 'brand';
document.body.setAttribute('data-palette', savedTheme);
themeSelector.value = savedTheme;

// Changer le thème au clic
themeSelector.addEventListener('change', (e) => {
  const newTheme = e.target.value;
  document.body.setAttribute('data-palette', newTheme);
  localStorage.setItem('onspot_theme', newTheme);
});
