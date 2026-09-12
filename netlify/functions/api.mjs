import {
  MAX_GUESSES,
  GAME_EPOCH,
  GAME_TIME_ZONE,
  GameError,
  puzzleDateNow,
  puzzleNumber,
  validatePuzzleDate,
  searchCards,
  cardById,
  dailyAnswer,
  startPractice,
  practiceAnswer,
  compareCards,
  publicGuessCard,
  revealedCard,
  safeSecretConfigured,
  dataInfo
} from '../lib/game.mjs';

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function routePath(req) {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, '');
  return pathname || '/';
}

function parseAttempt(value) {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_GUESSES) {
    throw new GameError(`Attempt must be an integer from 1 to ${MAX_GUESSES}.`, 400, 'BAD_ATTEMPT');
  }
  return attempt;
}

async function handleInfo() {
  const today = puzzleDateNow();
  return json({
    app: 'ManaMatch',
    today,
    epoch: GAME_EPOCH,
    timeZone: GAME_TIME_ZONE,
    puzzleNumber: puzzleNumber(today),
    maxGuesses: MAX_GUESSES,
    secretConfigured: safeSecretConfigured(),
    data: dataInfo()
  });
}

async function handleSearch(req) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const date = validatePuzzleDate(url.searchParams.get('date') || puzzleDateNow());
  return json({ results: searchCards(q, date, 12) });
}

async function handlePracticeStart(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  return json({ token: startPractice(), maxGuesses: MAX_GUESSES });
}

async function handleGuess(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await req.json().catch(() => ({}));
  const card = cardById(body.cardId);
  if (!card) throw new GameError('Please choose a card from the search results.', 400, 'UNKNOWN_CARD');
  const attempt = parseAttempt(body.attempt);
  const mode = body.mode === 'practice' ? 'practice' : (body.mode === 'archive' ? 'archive' : 'daily');

  let answer;
  let date = puzzleDateNow();
  if (mode === 'practice') {
    answer = practiceAnswer(body.token);
  } else {
    date = validatePuzzleDate(body.date || puzzleDateNow());
    if (mode === 'daily' && date !== puzzleDateNow()) {
      throw new GameError('Daily mode only accepts today’s puzzle. Use Archive for earlier dates.', 400, 'NOT_TODAY');
    }
    if (card.releaseDate > date) {
      throw new GameError('That card had not been released by this archive date.', 400, 'GUESS_AFTER_DATE');
    }
    answer = dailyAnswer(date);
  }

  const won = card.id === answer.id;
  const finished = won || attempt >= MAX_GUESSES;
  const response = {
    mode,
    date: mode === 'practice' ? null : date,
    puzzleNumber: mode === 'practice' ? null : puzzleNumber(date),
    attempt,
    maxGuesses: MAX_GUESSES,
    won,
    finished,
    guess: publicGuessCard(card),
    clues: compareCards(card, answer)
  };
  if (finished) response.answer = revealedCard(answer);
  return json(response);
}

export default async (req) => {
  try {
    const path = routePath(req);
    if (path === '/api/info' && req.method === 'GET') return handleInfo();
    if (path === '/api/search' && req.method === 'GET') return handleSearch(req);
    if (path === '/api/practice/start') return handlePracticeStart(req);
    if (path === '/api/guess') return handleGuess(req);
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    if (error instanceof GameError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error(error);
    return json({ error: 'Unexpected server error.' }, 500);
  }
};

export const config = {
  path: '/api/*'
};
