import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DAILY_SECRET = 'unit-test-secret-that-does-not-change';
process.env.GAME_EPOCH = '2026-09-11';
process.env.GAME_TIME_ZONE = 'America/Chicago';

const game = await import('../netlify/lib/game.mjs');
const apiModule = await import('../netlify/functions/api.mjs');
const apiHandler = apiModule.default;

function card(name) {
  const found = game.searchCards(name, game.puzzleDateNow(), 20).find((c) => c.name === name);
  assert.ok(found, `Expected fixture card ${name}`);
  return game.cardById(found.id);
}

async function callApi(path, { method = 'GET', body } = {}) {
  return apiHandler(new Request(`http://localhost${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  }));
}

test('daily answer is deterministic for a date', () => {
  const today = game.puzzleDateNow();
  const a = game.dailyAnswer(today);
  const b = game.dailyAnswer(today);
  assert.equal(a.id, b.id);
});

test('comparison returns directions and partial matches', () => {
  const lightning = card('Lightning Bolt');
  const shivan = card('Shivan Dragon');
  const clues = game.compareCards(lightning, shivan);
  assert.equal(clues.cmc.direction, 'up');
  assert.equal(clues.colors.status, 'exact');
  assert.equal(clues.rarity.direction, 'up');
  assert.equal(clues.types.status, 'miss');
});



test('set clue is yellow only for the immediately adjacent first-printing set', () => {
  const jace = card('Jace, the Mind Sculptor');      // WWK
  const snapcaster = card('Snapcaster Mage');        // ISD, directly after WWK in fixture timeline
  const lotus = card('Black Lotus');                 // LEA, not directly adjacent to ISD

  assert.equal(game.compareCards(jace, snapcaster).set.status, 'partial');
  assert.equal(game.compareCards(snapcaster, jace).set.status, 'partial');
  assert.equal(game.compareCards(lotus, snapcaster).set.status, 'miss');
  assert.equal(game.compareCards(jace, jace).set.status, 'exact');
});

test('public guessed-card data carries an image field for hover previews without revealing the answer', () => {
  const lightning = card('Lightning Bolt');
  const publicCard = game.publicGuessCard(lightning);
  assert.equal(Object.hasOwn(publicCard, 'image'), true);
  assert.equal(Object.hasOwn(publicCard, 'scryfallUri'), false);
});

test('practice token round-trips without exposing plaintext answer', () => {
  const token = game.startPractice();
  assert.equal(token.includes('Black Lotus'), false);
  const answer = game.practiceAnswer(token);
  assert.ok(answer?.id);
});

test('info endpoint does not reveal the daily answer', async () => {
  const response = await callApi('/api/info');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal('answer' in payload, false);
  assert.equal(payload.maxGuesses, 20);
});

test('search endpoint finds released cards', async () => {
  const response = await callApi(`/api/search?q=light&date=${game.puzzleDateNow()}`);
  const payload = await response.json();
  assert.ok(payload.results.some((r) => r.name === 'Lightning Bolt'));
});

test('guess endpoint hides answer before game ends and reveals it on attempt 20', async () => {
  const today = game.puzzleDateNow();
  const answer = game.dailyAnswer(today);
  const guess = [card('Lightning Bolt'), card('Counterspell'), card('Serra Angel')].find((c) => c.id !== answer.id);
  assert.ok(guess);

  const first = await callApi('/api/guess', {
    method: 'POST',
    body: { mode: 'daily', date: today, cardId: guess.id, attempt: 1 }
  });
  const firstPayload = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstPayload.finished, false);
  assert.equal('answer' in firstPayload, false);

  const last = await callApi('/api/guess', {
    method: 'POST',
    body: { mode: 'daily', date: today, cardId: guess.id, attempt: 20 }
  });
  const lastPayload = await last.json();
  assert.equal(last.status, 200);
  assert.equal(lastPayload.finished, true);
  assert.equal(lastPayload.answer.id, answer.id);
});
