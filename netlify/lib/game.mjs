import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomInt,
  timingSafeEqual
} from 'node:crypto';
import cards, { CARD_DATA_UPDATED_AT } from '../../data/cards.mjs';

export const MAX_GUESSES = 20;
export const DEFAULT_EPOCH = '2026-09-11';
export const DEFAULT_TIME_ZONE = 'America/Chicago';
export const GAME_EPOCH = process.env.GAME_EPOCH || DEFAULT_EPOCH;
export const GAME_TIME_ZONE = process.env.GAME_TIME_ZONE || DEFAULT_TIME_ZONE;

const RAW_SECRET = process.env.DAILY_SECRET || 'development-only-secret-change-before-production';
const PRACTICE_KEY = createHash('sha256').update(`${RAW_SECRET}:practice-token:v1`).digest();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const byId = new Map(cards.map((card) => [card.id, card]));
const eligibleCache = new Map();
const answerCache = new Map();

// The set timeline contains only sets represented by at least one card's first
// eligible printing. Adjacency in this timeline drives the yellow set clue.
const firstSetByCode = new Map();
for (const card of cards) {
  const current = firstSetByCode.get(card.setCode);
  if (!current || card.releaseDate < current.releaseDate) {
    firstSetByCode.set(card.setCode, { code: card.setCode, name: card.setName, releaseDate: card.releaseDate });
  }
}
const SET_TIMELINE = [...firstSetByCode.values()]
  .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.code.localeCompare(b.code));
const SET_POSITION = new Map(SET_TIMELINE.map((set, index) => [set.code, index]));

const RARITY_RANK = new Map([
  ['common', 1],
  ['uncommon', 2],
  ['rare', 3],
  ['mythic', 4]
]);

export function puzzleDateNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: GAME_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isIsoDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validatePuzzleDate(value, { allowToday = true } = {}) {
  const date = String(value || '');
  if (!isIsoDate(date)) throw new GameError('Invalid puzzle date.', 400, 'BAD_DATE');
  if (date < GAME_EPOCH) throw new GameError(`Archive begins on ${GAME_EPOCH}.`, 400, 'DATE_BEFORE_EPOCH');
  const today = puzzleDateNow();
  if (date > today || (!allowToday && date === today)) throw new GameError('That puzzle is not available yet.', 400, 'FUTURE_DATE');
  return date;
}

export function puzzleNumber(date) {
  validatePuzzleDate(date);
  const start = Date.parse(`${GAME_EPOCH}T00:00:00Z`);
  const target = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((target - start) / 86400000) + 1;
}

export function eligibleCardsThrough(date) {
  if (eligibleCache.has(date)) return eligibleCache.get(date);
  const list = cards.filter((card) => card.releaseDate <= date);
  eligibleCache.set(date, list);
  return list;
}

function secretDigest(label) {
  return createHmac('sha256', RAW_SECRET).update(label).digest();
}

export function dailyAnswer(date) {
  validatePuzzleDate(date);
  if (answerCache.has(date)) return answerCache.get(date);
  const pool = eligibleCardsThrough(date);
  if (!pool.length) throw new GameError('No eligible cards are available for this date.', 500, 'NO_CARDS');
  const digest = secretDigest(`daily:${date}`);
  const index = Number(digest.readBigUInt64BE(0) % BigInt(pool.length));
  const answer = pool[index];
  answerCache.set(date, answer);
  return answer;
}

export function currentCardCount() {
  return eligibleCardsThrough(puzzleDateNow()).length;
}

function normalizeSearch(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();
}

export function searchCards(query, date = puzzleDateNow(), limit = 12) {
  validatePuzzleDate(date);
  const needle = normalizeSearch(query);
  if (needle.length < 2) return [];

  const matches = [];
  for (const card of eligibleCardsThrough(date)) {
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
  return matches.slice(0, Math.max(1, Math.min(Number(limit) || 12, 20))).map(({ card }) => ({
    id: card.id,
    name: card.name,
    setCode: card.setCode,
    year: card.year
  }));
}

export function cardById(id) {
  return byId.get(String(id || '')) || null;
}

function sortedUnique(values) {
  return [...new Set(values || [])].sort();
}

function arrayStatus(guessValues, answerValues) {
  const g = sortedUnique(guessValues);
  const a = sortedUnique(answerValues);
  if (g.length === a.length && g.every((value, i) => value === a[i])) return 'exact';
  if (g.some((value) => a.includes(value))) return 'partial';
  return 'miss';
}

function numericClue(guess, answer) {
  if (guess === answer) return { status: 'exact', direction: null };
  return { status: 'miss', direction: answer > guess ? 'up' : 'down' };
}

function rarityClue(guess, answer) {
  if (guess === answer) return { status: 'exact', direction: null };
  const g = RARITY_RANK.get(guess);
  const a = RARITY_RANK.get(answer);
  return {
    status: 'miss',
    direction: g && a ? (a > g ? 'up' : 'down') : null
  };
}

function typeValues(card) {
  return sortedUnique([...(card.supertypes || []), ...(card.types || [])]);
}

export function compareCards(guess, answer) {
  const sameSet = guess.setCode === answer.setCode;
  const guessSetPosition = SET_POSITION.get(guess.setCode);
  const answerSetPosition = SET_POSITION.get(answer.setCode);
  const adjacentSet = !sameSet
    && Number.isInteger(guessSetPosition)
    && Number.isInteger(answerSetPosition)
    && Math.abs(guessSetPosition - answerSetPosition) === 1;
  return {
    cmc: numericClue(guess.cmc, answer.cmc),
    colors: { status: arrayStatus(guess.colors, answer.colors), direction: null },
    rarity: rarityClue(guess.rarity, answer.rarity),
    types: { status: arrayStatus(typeValues(guess), typeValues(answer)), direction: null },
    subtypes: { status: arrayStatus(guess.subtypes, answer.subtypes), direction: null },
    set: {
      status: sameSet ? 'exact' : (adjacentSet ? 'partial' : 'miss'),
      direction: sameSet ? null : (answerSetPosition > guessSetPosition ? 'up' : 'down')
    }
  };
}

export function publicGuessCard(card) {
  return {
    id: card.id,
    name: card.name,
    cmc: card.cmc,
    colors: card.colors,
    rarity: card.rarity,
    supertypes: card.supertypes,
    types: card.types,
    subtypes: card.subtypes,
    typeLine: card.typeLine,
    setCode: card.setCode,
    setName: card.setName,
    year: card.year,
    image: card.image || null
  };
}

export function revealedCard(card) {
  return {
    ...publicGuessCard(card),
    releaseDate: card.releaseDate,
    scryfallUri: card.scryfallUri
  };
}

function b64urlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function b64urlDecode(text) {
  return Buffer.from(String(text || ''), 'base64url');
}

export function startPractice() {
  const today = puzzleDateNow();
  const pool = eligibleCardsThrough(today);
  if (!pool.length) throw new GameError('No cards are available for practice.', 500, 'NO_CARDS');
  const answer = pool[randomInt(pool.length)];
  const payload = Buffer.from(JSON.stringify({ cardId: answer.id, createdAt: Date.now(), v: 1 }), 'utf8');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', PRACTICE_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${b64urlEncode(iv)}.${b64urlEncode(ciphertext)}.${b64urlEncode(tag)}`;
}

export function practiceAnswer(token) {
  try {
    const [ivPart, cipherPart, tagPart] = String(token || '').split('.');
    if (!ivPart || !cipherPart || !tagPart) throw new Error('Malformed token');
    const iv = b64urlDecode(ivPart);
    const ciphertext = b64urlDecode(cipherPart);
    const tag = b64urlDecode(tagPart);
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Malformed token');
    const decipher = createDecipheriv('aes-256-gcm', PRACTICE_KEY, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (payload.v !== 1 || !payload.cardId || !Number.isFinite(payload.createdAt)) throw new Error('Bad payload');
    if (Date.now() - payload.createdAt > 7 * 86400000) throw new GameError('This practice game has expired. Start a new one.', 400, 'PRACTICE_EXPIRED');
    const answer = cardById(payload.cardId);
    if (!answer) throw new Error('Unknown card');
    return answer;
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError('Invalid practice game token. Start a new practice game.', 400, 'BAD_PRACTICE_TOKEN');
  }
}

export function safeSecretConfigured() {
  return RAW_SECRET !== 'development-only-secret-change-before-production';
}

export function dataInfo() {
  return {
    source: 'Scryfall',
    sourceUpdatedAt: CARD_DATA_UPDATED_AT,
    totalKnownPaperCards: cards.length,
    releasedCardCount: currentCardCount(),
    gameSetCount: SET_TIMELINE.length
  };
}

export class GameError extends Error {
  constructor(message, status = 400, code = 'GAME_ERROR') {
    super(message);
    this.name = 'GameError';
    this.status = status;
    this.code = code;
  }
}
