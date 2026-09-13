const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  modeEyebrow: $('#modeEyebrow'),
  gameTitle: $('#gameTitle'),
  gameSubtitle: $('#gameSubtitle'),
  puzzleBadge: $('#puzzleBadge'),
  modeTabs: $$('.mode-tab'),
  archiveControl: $('#archiveControl'),
  archiveDate: $('#archiveDate'),
  loadArchiveButton: $('#loadArchiveButton'),
  practiceControl: $('#practiceControl'),
  newPracticeButton: $('#newPracticeButton'),
  remainingText: $('#remainingText'),
  remainingDie: $('#remainingDie'),
  remainingDieValue: $('#remainingDieValue'),
  cardSearch: $('#cardSearch'),
  suggestions: $('#suggestions'),
  guessButton: $('#guessButton'),
  inputHint: $('#inputHint'),
  setStrip: $('#setStrip'),
  setCount: $('#setCount'),
  errorBanner: $('#errorBanner'),
  guessRows: $('#guessRows'),
  emptyRow: $('#emptyRow'),
  answerPanel: $('#answerPanel'),
  answerArt: $('#answerArt'),
  answerEyebrow: $('#answerEyebrow'),
  answerName: $('#answerName'),
  answerDetails: $('#answerDetails'),
  shareButton: $('#shareButton'),
  scryfallLink: $('#scryfallLink'),
  playAgainButton: $('#playAgainButton'),
  copyStatus: $('#copyStatus'),
  dataNote: $('#dataNote'),
  helpButton: $('#helpButton'),
  statsButton: $('#statsButton'),
  helpDialog: $('#helpDialog'),
  statsDialog: $('#statsDialog'),
  statPlayed: $('#statPlayed'),
  statWinRate: $('#statWinRate'),
  statStreak: $('#statStreak'),
  statBest: $('#statBest'),
  distribution: $('#distribution'),
  toast: $('#toast'),
  hoverCardPreview: $('#hoverCardPreview'),
  brandButton: $('#brandButton')
};

const state = {
  info: null,
  mode: 'daily',
  date: null,
  rows: [],
  answer: null,
  finished: false,
  won: false,
  statsRecorded: false,
  practiceToken: null,
  selectedCard: null,
  suggestions: [],
  activeSuggestion: -1,
  searchTimer: null,
  searchAbort: null,
  cardIndex: [],
  setIndex: [],
  busy: false
};

const STORAGE_PREFIX = 'manamatch:v2';
const STATUS_EMOJI = { exact: '🟩', partial: '🟨', miss: '⬛' };
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

function storageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // The game still works when storage is blocked; persistence is simply unavailable.
  }
}

function puzzleStorageKey(date) {
  return `puzzle:${date}`;
}

function practiceStorageKey() {
  return 'practice:current';
}

function statsDefaults() {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastWinDate: null,
    lastPlayedDate: null,
    distribution: {}
  };
}

function loadStats() {
  const current = storageGet('stats', null);
  if (current) return { ...statsDefaults(), ...current };

  // v2 intentionally starts fresh puzzle-state storage because set-clue semantics
  // changed, but daily performance statistics are safe to carry forward from v1.
  try {
    const legacyRaw = localStorage.getItem('manamatch:v1:stats');
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const migrated = { ...statsDefaults(), ...(legacy || {}) };
      storageSet('stats', migrated);
      return migrated;
    }
  } catch {
    // Ignore malformed or blocked legacy storage.
  }

  return statsDefaults();
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.code = data.code;
    throw error;
  }
  return data;
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.classList.remove('is-hidden');
}

function clearError() {
  els.errorBanner.classList.add('is-hidden');
  els.errorBanner.textContent = '';
}

let toastTimer;
let dieRollTimer = null;
let dieRollFinishTimer = null;

function clearDieRollAnimation() {
  clearTimeout(dieRollTimer);
  clearTimeout(dieRollFinishTimer);
  dieRollTimer = null;
  dieRollFinishTimer = null;
  els.remainingDie?.classList.remove('is-rolling');
}

function rollRemainingDie(finalValue) {
  if (!els.remainingDie || !els.remainingDieValue) return;

  clearDieRollAnimation();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    els.remainingDieValue.textContent = String(finalValue);
    return;
  }

  // Restart the CSS animation even when consecutive guesses happen after a prior roll.
  void els.remainingDie.offsetWidth;
  els.remainingDie.classList.add('is-rolling');

  const startedAt = performance.now();
  const duration = 680;
  const tick = () => {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= duration) {
      els.remainingDieValue.textContent = String(finalValue);
      return;
    }

    // The flashed values are visual flavor only; accessibility text always reports
    // the real number of guesses remaining.
    let face = 1 + Math.floor(Math.random() * 20);
    if (face === finalValue && finalValue > 0) face = (face % 20) + 1;
    els.remainingDieValue.textContent = String(face);
    dieRollTimer = setTimeout(tick, 68 + Math.floor(elapsed / 6));
  };

  tick();
  dieRollFinishTimer = setTimeout(() => {
    els.remainingDieValue.textContent = String(finalValue);
    els.remainingDie.classList.remove('is-rolling');
    dieRollTimer = null;
    dieRollFinishTimer = null;
  }, duration + 45);
}

function toast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove('is-hidden');
  toastTimer = setTimeout(() => els.toast.classList.add('is-hidden'), 2200);
}

function resetSelection({ clearInput = true } = {}) {
  state.selectedCard = null;
  state.suggestions = [];
  state.activeSuggestion = -1;
  els.guessButton.disabled = true;
  if (clearInput) els.cardSearch.value = '';
  hideSuggestions();
}

function hideSuggestions() {
  els.suggestions.classList.add('is-hidden');
  els.suggestions.replaceChildren();
  els.cardSearch.setAttribute('aria-expanded', 'false');
}

function setBusy(busy) {
  state.busy = busy;
  els.guessButton.disabled = busy || !state.selectedCard || state.finished;
  els.cardSearch.disabled = busy || state.finished;
  els.newPracticeButton.disabled = busy;
  els.loadArchiveButton.disabled = busy;
}

function serializeGame() {
  return {
    date: state.date,
    rows: state.rows,
    answer: state.answer,
    finished: state.finished,
    won: state.won,
    statsRecorded: state.statsRecorded,
    practiceToken: state.practiceToken
  };
}

function saveGame() {
  if (state.mode === 'practice') storageSet(practiceStorageKey(), serializeGame());
  else if (state.date) storageSet(puzzleStorageKey(state.date), serializeGame());
}

function restoreGame(saved) {
  state.rows = Array.isArray(saved?.rows) ? saved.rows : [];
  state.answer = saved?.answer || null;
  state.finished = Boolean(saved?.finished);
  state.won = Boolean(saved?.won);
  state.statsRecorded = Boolean(saved?.statsRecorded);
  state.practiceToken = saved?.practiceToken || null;
}

function clearCurrentGame() {
  state.rows = [];
  state.answer = null;
  state.finished = false;
  state.won = false;
  state.statsRecorded = false;
  resetSelection();
}

function modeSearchDate() {
  return state.mode === 'practice' ? state.info.today : state.date;
}

function updateModeUI() {
  for (const tab of els.modeTabs) tab.classList.toggle('is-active', tab.dataset.mode === state.mode);
  els.archiveControl.classList.toggle('is-hidden', state.mode !== 'archive');
  els.practiceControl.classList.toggle('is-hidden', state.mode !== 'practice');

  if (state.mode === 'daily') {
    els.modeEyebrow.textContent = "Today's puzzle";
    els.gameTitle.textContent = 'Guess the Magic: The Gathering Card';
    els.gameSubtitle.textContent = 'Use each guess to narrow down mana value, colors, rarity, type, subtype, and first printing.';
    els.puzzleBadge.textContent = `#${state.info.puzzleNumber}`;
  } else if (state.mode === 'archive') {
    els.modeEyebrow.textContent = state.date ? `Archive · ${prettyDate(state.date)}` : 'Archive';
    els.gameTitle.textContent = 'Replay a daily puzzle';
    els.gameSubtitle.textContent = 'Archived puzzles use only cards that had been released by that date.';
    els.puzzleBadge.textContent = state.date ? `#${puzzleNumberFromDate(state.date)}` : '#—';
  } else {
    els.modeEyebrow.textContent = 'Practice mode';
    els.gameTitle.textContent = 'Unlimited card guessing';
    els.gameSubtitle.textContent = 'Each new practice game chooses a fresh random card from the released-card pool.';
    els.puzzleBadge.textContent = '∞';
  }
}

function puzzleNumberFromDate(date) {
  const start = Date.parse(`${state.info.epoch}T00:00:00Z`);
  const target = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((target - start) / 86400000) + 1;
}

function updateRemaining() {
  const remaining = Math.max(0, state.info.maxGuesses - state.rows.length);
  const remainingLabel = `${remaining} ${remaining === 1 ? 'guess' : 'guesses'} remaining`;

  els.remainingDieValue.textContent = String(remaining);
  els.remainingDie.setAttribute('aria-label', remainingLabel);
  els.remainingDie.title = remainingLabel;
  els.remainingDie.classList.toggle('is-low', remaining > 0 && remaining <= 5);
  els.remainingDie.classList.toggle('is-empty', remaining === 0);

  if (state.finished && state.won) {
    const count = state.rows.length;
    els.remainingText.textContent = `Solved in ${count} ${count === 1 ? 'guess' : 'guesses'} · ${remainingLabel}`;
  } else if (state.finished) {
    els.remainingText.textContent = 'No guesses remaining';
  } else {
    els.remainingText.textContent = remainingLabel;
  }
}

function textOrDash(values) {
  return Array.isArray(values) && values.length ? values.join(' · ') : '—';
}

function createColorPips(colors) {
  const wrap = document.createElement('span');
  wrap.className = 'pips';
  const list = colors?.length ? [...colors].sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b)) : ['C'];
  for (const color of list) {
    const pip = document.createElement('span');
    pip.className = `color-pip pip-${color}`;
    pip.textContent = color;
    pip.title = color === 'C' ? 'Colorless' : color;
    wrap.append(pip);
  }
  return wrap;
}

function createCell(status, content, direction = null, className = '') {
  const td = document.createElement('td');
  const div = document.createElement('div');
  div.className = `cell ${status || ''} ${className}`.trim();
  if (content instanceof Node) div.append(content);
  else div.append(document.createTextNode(String(content)));
  if (direction) {
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = direction === 'up' ? '↑' : '↓';
    arrow.title = direction === 'up' ? 'The answer is higher/later' : 'The answer is lower/earlier';
    div.append(arrow);
  }
  td.append(div);
  return td;
}

function setStatusByCode() {
  const statuses = new Map();
  const rank = { miss: 1, partial: 2, exact: 3 };
  for (const row of state.rows) {
    const code = row.guess?.setCode;
    const status = row.clues?.set?.status;
    if (!code || !status) continue;
    const previous = statuses.get(code);
    if (!previous || (rank[status] || 0) > (rank[previous] || 0)) statuses.set(code, status);
  }
  return statuses;
}

function visibleGameSets() {
  const cutoff = modeSearchDate();
  return state.setIndex.filter((set) => !cutoff || set.releaseDate <= cutoff);
}

function renderSetTimeline() {
  els.setStrip.replaceChildren();
  const sets = visibleGameSets();
  els.setCount.textContent = `${sets.length.toLocaleString()} ${sets.length === 1 ? 'set' : 'sets'}`;
  const statuses = setStatusByCode();

  if (!sets.length) {
    const empty = document.createElement('div');
    empty.className = 'set-strip-empty';
    empty.textContent = 'Set symbols will appear after card data loads.';
    els.setStrip.append(empty);
    return;
  }

  for (const set of sets) {
    const status = statuses.get(set.code) || 'unknown';
    const item = document.createElement('div');
    item.className = `set-symbol status-${status}`;
    item.dataset.setCode = set.code;
    item.title = `${set.name} (${set.code}) · ${set.year}`;
    item.setAttribute('aria-label', `${set.name}, ${set.year}${status === 'unknown' ? '' : `, ${status === 'exact' ? 'correct set' : status === 'partial' ? 'adjacent to the correct set' : 'incorrect set'}`}`);

    const icon = document.createElement('div');
    icon.className = 'set-icon-wrap';
    if (set.iconSvgUri) {
      const img = document.createElement('img');
      img.src = set.iconSvgUri;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove(), { once: true });
      icon.append(img);
    }

    const code = document.createElement('span');
    code.className = 'set-code';
    code.textContent = set.code;
    item.append(icon, code);
    els.setStrip.append(item);
  }
}

function scrollSetIntoView(code) {
  if (!code) return;
  const item = [...els.setStrip.querySelectorAll('.set-symbol')].find((node) => node.dataset.setCode === code);
  item?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function hideCardPreview() {
  els.hoverCardPreview.classList.add('is-hidden');
  els.hoverCardPreview.replaceChildren();
  els.hoverCardPreview.setAttribute('aria-hidden', 'true');
}

function positionCardPreview(anchor) {
  if (els.hoverCardPreview.classList.contains('is-hidden')) return;
  const rect = anchor.getBoundingClientRect();
  const previewRect = els.hoverCardPreview.getBoundingClientRect();
  const gap = 12;
  let left = rect.right + gap;
  if (left + previewRect.width > window.innerWidth - gap) left = rect.left - previewRect.width - gap;
  left = Math.max(gap, Math.min(left, window.innerWidth - previewRect.width - gap));
  let top = rect.top + (rect.height - previewRect.height) / 2;
  top = Math.max(gap, Math.min(top, window.innerHeight - previewRect.height - gap));
  els.hoverCardPreview.style.left = `${Math.round(left)}px`;
  els.hoverCardPreview.style.top = `${Math.round(top)}px`;
}

function showCardPreview(anchor, card) {
  if (!card?.image) return;
  els.hoverCardPreview.replaceChildren();
  const img = document.createElement('img');
  img.src = card.image;
  img.alt = `${card.name} card image`;
  img.decoding = 'async';
  els.hoverCardPreview.append(img);
  els.hoverCardPreview.classList.remove('is-hidden');
  els.hoverCardPreview.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => positionCardPreview(anchor));
}

function createCardCell(result) {
  const td = document.createElement('td');
  const div = document.createElement('div');
  div.className = `cell card-cell ${result.won ? 'exact' : ''}`.trim();
  const span = document.createElement('span');
  span.className = 'card-name-preview';
  span.textContent = result.guess.name;
  const small = document.createElement('span');
  small.className = 'meta-small';
  small.textContent = `${result.guess.setCode} · ${result.guess.year}`;
  span.append(small);
  div.append(span);
  if (result.guess.image) {
    div.classList.add('has-preview');
    div.tabIndex = 0;
    div.title = 'Hover to preview this card';
    div.addEventListener('mouseenter', () => showCardPreview(div, result.guess));
    div.addEventListener('mouseleave', hideCardPreview);
    div.addEventListener('focus', () => showCardPreview(div, result.guess));
    div.addEventListener('blur', hideCardPreview);
  }
  td.append(div);
  return td;
}

function renderRow(result) {
  const tr = document.createElement('tr');
  tr.append(createCardCell(result));
  tr.append(createCell(result.clues.cmc.status, result.guess.cmc, result.clues.cmc.direction));
  tr.append(createCell(result.clues.colors.status, createColorPips(result.guess.colors)));
  tr.append(createCell(result.clues.rarity.status, result.guess.rarity, result.clues.rarity.direction, 'rarity'));
  tr.append(createCell(result.clues.types.status, textOrDash([...(result.guess.supertypes || []), ...(result.guess.types || [])])));
  tr.append(createCell(result.clues.subtypes.status, textOrDash(result.guess.subtypes)));

  const setWrap = document.createElement('span');
  setWrap.textContent = result.guess.setName;
  const small = document.createElement('span');
  small.className = 'meta-small';
  small.textContent = `${result.guess.setCode} · ${result.guess.year}`;
  setWrap.append(small);
  tr.append(createCell(result.clues.set.status, setWrap, result.clues.set.direction));
  return tr;
}

function renderRows() {
  els.guessRows.replaceChildren();
  if (!state.rows.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Your clues will appear here.';
    tr.append(td);
    els.guessRows.append(tr);
    return;
  }
  for (const result of state.rows) els.guessRows.append(renderRow(result));
}

function renderAnswer() {
  if (!state.finished || !state.answer) {
    els.answerPanel.classList.add('is-hidden');
    return;
  }
  els.answerPanel.classList.remove('is-hidden');
  els.answerEyebrow.textContent = state.won ? 'You found it' : 'The hidden card was';
  els.answerName.textContent = state.answer.name;
  const type = state.answer.typeLine || textOrDash([...(state.answer.supertypes || []), ...(state.answer.types || [])]);
  els.answerDetails.textContent = `${type} · ${state.answer.setName} (${state.answer.setCode}), ${state.answer.year} · ${state.answer.rarity}`;
  els.answerArt.replaceChildren();
  if (state.answer.image) {
    const img = document.createElement('img');
    img.src = state.answer.image;
    img.alt = `${state.answer.name} card art`;
    img.loading = 'lazy';
    els.answerArt.append(img);
  } else {
    const placeholder = document.createElement('span');
    placeholder.textContent = 'Card art appears here when using the live Scryfall database.';
    els.answerArt.append(placeholder);
  }

  if (state.answer.scryfallUri) {
    els.scryfallLink.href = state.answer.scryfallUri;
    els.scryfallLink.classList.remove('is-hidden');
  } else {
    els.scryfallLink.classList.add('is-hidden');
  }
  els.playAgainButton.classList.toggle('is-hidden', state.mode !== 'practice');
}

function renderGame() {
  updateModeUI();
  updateRemaining();
  renderSetTimeline();
  renderRows();
  renderAnswer();
  const disabled = state.finished || state.busy;
  els.cardSearch.disabled = disabled;
  els.guessButton.disabled = disabled || !state.selectedCard;
  els.inputHint.textContent = state.finished
    ? 'Puzzle complete.'
    : 'Start typing at least 2 characters, then choose a card.';
}

function renderSuggestions() {
  els.suggestions.replaceChildren();
  if (!state.suggestions.length) {
    const empty = document.createElement('div');
    empty.className = 'suggestion-empty';
    empty.textContent = 'No matching released cards.';
    els.suggestions.append(empty);
  } else {
    state.suggestions.forEach((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `suggestion ${index === state.activeSuggestion ? 'is-active' : ''}`.trim();
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === state.activeSuggestion ? 'true' : 'false');
      const name = document.createElement('span');
      name.textContent = card.name;
      const meta = document.createElement('small');
      meta.textContent = `${card.setCode} · ${card.year}`;
      button.append(name, meta);
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        chooseSuggestion(card);
      });
      els.suggestions.append(button);
    });
  }
  els.suggestions.classList.remove('is-hidden');
  els.cardSearch.setAttribute('aria-expanded', 'true');
}

function chooseSuggestion(card) {
  state.selectedCard = card;
  els.cardSearch.value = card.name;
  els.guessButton.disabled = state.finished || state.busy;
  hideSuggestions();
}

function normalizeSearch(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();
}

function localCardSearch(query, date, limit = 12) {
  const needle = normalizeSearch(query);
  const matches = [];
  for (const card of state.cardIndex) {
    if (card.releaseDate > date) continue;
    const haystack = normalizeSearch(card.name);
    const index = haystack.indexOf(needle);
    if (index === -1) continue;
    let score = 3;
    if (index === 0) score = 0;
    else if (/\s|,|—|\/|\(/.test(haystack[index - 1] || '')) score = 1;
    else if (haystack.split(/\s+/).some((word) => word.startsWith(needle))) score = 2;
    matches.push({ card, score, index });
  }
  matches.sort((a, b) => a.score - b.score || a.index - b.index || a.card.name.localeCompare(b.card.name));
  return matches.slice(0, limit).map(({ card }) => card);
}

async function searchNow() {
  const q = els.cardSearch.value.trim();
  if (q.length < 2 || state.finished) {
    state.suggestions = [];
    hideSuggestions();
    return;
  }
  try {
    if (state.cardIndex.length) {
      state.suggestions = localCardSearch(q, modeSearchDate(), 12);
    } else {
      state.searchAbort?.abort();
      state.searchAbort = new AbortController();
      const data = await api(`/api/search?q=${encodeURIComponent(q)}&date=${encodeURIComponent(modeSearchDate())}`, {
        signal: state.searchAbort.signal
      });
      state.suggestions = data.results || [];
    }
    state.activeSuggestion = -1;
    renderSuggestions();
  } catch (error) {
    if (error.name !== 'AbortError') showError(error.message);
  }
}

function scheduleSearch() {
  clearTimeout(state.searchTimer);
  state.selectedCard = null;
  els.guessButton.disabled = true;
  clearError();
  const q = els.cardSearch.value.trim();
  if (q.length < 2) {
    hideSuggestions();
    return;
  }
  state.searchTimer = setTimeout(searchNow, 140);
}

function isDuplicateGuess(cardId) {
  return state.rows.some((row) => row.guess?.id === cardId);
}

async function submitGuess() {
  if (!state.selectedCard || state.busy || state.finished) return;
  if (isDuplicateGuess(state.selectedCard.id)) {
    toast('You already guessed that card.');
    resetSelection();
    els.cardSearch.focus();
    return;
  }

  clearError();
  setBusy(true);
  const attempt = state.rows.length + 1;
  try {
    const payload = {
      mode: state.mode,
      date: state.mode === 'practice' ? undefined : state.date,
      token: state.mode === 'practice' ? state.practiceToken : undefined,
      cardId: state.selectedCard.id,
      attempt
    };
    const result = await api('/api/guess', { method: 'POST', body: JSON.stringify(payload) });
    state.rows.push(result);
    const guessedSetCode = result.guess?.setCode;
    state.finished = Boolean(result.finished);
    state.won = Boolean(result.won);
    if (result.answer) state.answer = result.answer;
    resetSelection();
    if (state.finished) recordDailyStatsIfNeeded();
    saveGame();
    renderGame();
    rollRemainingDie(Math.max(0, state.info.maxGuesses - state.rows.length));
    requestAnimationFrame(() => scrollSetIntoView(guessedSetCode));
    if (state.finished) {
      setTimeout(() => els.answerPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    } else {
      els.cardSearch.focus();
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
    renderGame();
  }
}

function recordDailyStatsIfNeeded() {
  if (state.mode !== 'daily' || state.statsRecorded || !state.finished) return;
  const stats = loadStats();
  stats.played += 1;
  stats.lastPlayedDate = state.date;

  if (state.won) {
    stats.wins += 1;
    const guesses = state.rows.length;
    stats.distribution[guesses] = (stats.distribution[guesses] || 0) + 1;
    if (stats.lastWinDate === addDays(state.date, -1)) stats.currentStreak += 1;
    else stats.currentStreak = 1;
    stats.lastWinDate = state.date;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }

  storageSet('stats', stats);
  state.statsRecorded = true;
}

function renderStats() {
  const stats = loadStats();
  els.statPlayed.textContent = stats.played;
  els.statWinRate.textContent = stats.played ? `${Math.round((stats.wins / stats.played) * 100)}%` : '0%';
  els.statStreak.textContent = stats.currentStreak;
  els.statBest.textContent = stats.bestStreak;
  els.distribution.replaceChildren();
  const max = Math.max(1, ...Object.values(stats.distribution).map(Number));
  for (let i = 1; i <= (state.info?.maxGuesses || 20); i += 1) {
    const count = Number(stats.distribution[i] || 0);
    const row = document.createElement('div');
    row.className = 'dist-row';
    const label = document.createElement('span');
    label.textContent = i;
    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    bar.style.width = `${Math.max(8, Math.round((count / max) * 100))}%`;
    bar.textContent = count;
    row.append(label, bar);
    els.distribution.append(row);
  }
}

function shareText() {
  const label = state.mode === 'practice' ? 'ManaMatch Practice' : `ManaMatch #${puzzleNumberFromDate(state.date)}`;
  const score = state.won ? `${state.rows.length}/${state.info.maxGuesses}` : `X/${state.info.maxGuesses}`;
  const grid = state.rows.map((row) => [
    row.clues.cmc.status,
    row.clues.colors.status,
    row.clues.rarity.status,
    row.clues.types.status,
    row.clues.subtypes.status,
    row.clues.set.status
  ].map((status) => STATUS_EMOJI[status] || '⬛').join('')).join('\n');
  return `${label} ${score}\n${grid}\n${location.origin}`;
}

async function shareResult() {
  if (!state.finished) return;
  const text = shareText();
  try {
    if (navigator.share) {
      await navigator.share({ text });
      els.copyStatus.textContent = 'Share sheet opened.';
    } else {
      await navigator.clipboard.writeText(text);
      els.copyStatus.textContent = 'Result copied to clipboard.';
      toast('Result copied.');
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    try {
      await navigator.clipboard.writeText(text);
      els.copyStatus.textContent = 'Result copied to clipboard.';
    } catch {
      els.copyStatus.textContent = 'Could not copy automatically.';
    }
  }
}

async function loadDaily() {
  state.mode = 'daily';
  state.date = state.info.today;
  restoreGame(storageGet(puzzleStorageKey(state.date), {}));
  state.practiceToken = null;
  resetSelection();
  renderGame();
}

async function loadArchive(date) {
  if (!date || date < state.info.epoch || date > state.info.today) {
    showError(`Choose a date from ${state.info.epoch} through ${state.info.today}.`);
    return;
  }
  state.mode = 'archive';
  state.date = date;
  storageSet('archive:lastDate', date);
  restoreGame(storageGet(puzzleStorageKey(date), {}));
  state.practiceToken = null;
  resetSelection();
  renderGame();
}

async function startPractice({ forceNew = false } = {}) {
  state.mode = 'practice';
  state.date = state.info.today;
  if (!forceNew) {
    const saved = storageGet(practiceStorageKey(), null);
    if (saved?.practiceToken && !saved.finished) {
      restoreGame(saved);
      resetSelection();
      renderGame();
      return;
    }
  }

  clearCurrentGame();
  setBusy(true);
  try {
    const data = await api('/api/practice/start', { method: 'POST', body: '{}' });
    state.practiceToken = data.token;
    saveGame();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
    renderGame();
  }
}

async function switchMode(mode) {
  clearError();
  if (mode === 'daily') {
    await loadDaily();
    return;
  }
  if (mode === 'practice') {
    await startPractice();
    return;
  }
  const lastDate = storageGet('archive:lastDate', null);
  const defaultDate = lastDate && lastDate >= state.info.epoch && lastDate <= state.info.today
    ? lastDate
    : (addDays(state.info.today, -1) >= state.info.epoch ? addDays(state.info.today, -1) : state.info.today);
  els.archiveDate.value = defaultDate;
  await loadArchive(defaultDate);
}

function renderDataNote() {
  const { data } = state.info;
  const updated = data.sourceUpdatedAt === 'sample'
    ? 'sample data (offline/test mode)'
    : `Scryfall snapshot ${new Date(data.sourceUpdatedAt).toLocaleString()}`;
  const count = Number(data.releasedCardCount || 0).toLocaleString();
  els.dataNote.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = 'Card data: ';
  els.dataNote.append(strong, document.createTextNode(`${count} released paper cards · ${updated}.`));
}

function bindEvents() {
  for (const tab of els.modeTabs) tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  els.cardSearch.addEventListener('input', scheduleSearch);
  els.cardSearch.addEventListener('keydown', (event) => {
    if (els.suggestions.classList.contains('is-hidden')) {
      if (event.key === 'Enter' && state.selectedCard) submitGuess();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.activeSuggestion = Math.min(state.suggestions.length - 1, state.activeSuggestion + 1);
      renderSuggestions();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.activeSuggestion = Math.max(0, state.activeSuggestion - 1);
      renderSuggestions();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const card = state.suggestions[state.activeSuggestion >= 0 ? state.activeSuggestion : 0];
      if (card) chooseSuggestion(card);
    } else if (event.key === 'Escape') {
      hideSuggestions();
    }
  });
  els.cardSearch.addEventListener('blur', () => setTimeout(hideSuggestions, 120));
  els.guessButton.addEventListener('click', submitGuess);
  els.newPracticeButton.addEventListener('click', () => startPractice({ forceNew: true }));
  els.playAgainButton.addEventListener('click', () => startPractice({ forceNew: true }));
  els.loadArchiveButton.addEventListener('click', () => loadArchive(els.archiveDate.value));
  els.archiveDate.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadArchive(els.archiveDate.value);
  });
  els.shareButton.addEventListener('click', shareResult);
  els.helpButton.addEventListener('click', () => els.helpDialog.showModal());
  els.statsButton.addEventListener('click', () => {
    renderStats();
    els.statsDialog.showModal();
  });
  els.brandButton.addEventListener('click', () => switchMode('daily'));
  window.addEventListener('scroll', hideCardPreview, { passive: true });
  window.addEventListener('resize', hideCardPreview);
}


async function init() {
  bindEvents();
  try {
    const [info, cardIndexResponse, setIndexResponse] = await Promise.all([
      api('/api/info'),
      fetch('/card-index.json', { cache: 'no-cache' }),
      fetch('/set-index.json', { cache: 'no-cache' })
    ]);
    state.info = info;
    if (cardIndexResponse.ok) state.cardIndex = await cardIndexResponse.json();
    if (setIndexResponse.ok) state.setIndex = await setIndexResponse.json();
    state.date = state.info.today;
    els.archiveDate.min = state.info.epoch;
    els.archiveDate.max = state.info.today;
    els.archiveDate.value = state.info.today;
    renderDataNote();
    await loadDaily();
  } catch (error) {
    showError(`Could not start the game: ${error.message}`);
    els.dataNote.textContent = 'The game API is unavailable. If running locally, use Netlify Dev rather than opening index.html directly.';
    els.cardSearch.disabled = true;
  }
}

init();
