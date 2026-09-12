import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEligibleCardPrinting, canonicalSetForCard, recordOracleCandidate, resolveOracleCandidates } from './card-eligibility.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const publicDir = path.join(root, 'public');
const outputPath = path.join(dataDir, 'cards.mjs');
const metaPath = path.join(publicDir, 'card-data-meta.json');
const indexPath = path.join(publicDir, 'card-index.json');
const setIndexPath = path.join(publicDir, 'set-index.json');

const USER_AGENT = 'ManaMatch/2.4 (self-hosted MTG guessing game)';
const ACCEPT = 'application/json;q=0.9,*/*;q=0.8';
const BULK_URL = 'https://api.scryfall.com/bulk-data';
const SETS_URL = 'https://api.scryfall.com/sets';
const SUPERTYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Ongoing', 'Elite']);
const CARD_TYPES = new Set([
  'Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment',
  'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker',
  'Scheme', 'Sorcery', 'Vanguard'
]);

await mkdir(dataDir, { recursive: true });
await mkdir(publicDir, { recursive: true });

if (process.env.SKIP_CARD_UPDATE === '1') {
  const existing = await readFile(outputPath, 'utf8');
  const count = (existing.match(/\bid:/g) || []).length;
  console.log(`SKIP_CARD_UPDATE=1: using bundled sample data (${count} cards).`);
  process.exit(0);
}

function headers() {
  return { 'User-Agent': USER_AGENT, Accept: ACCEPT };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return response.json();
}

async function fetchList(url) {
  const items = [];
  let next = url;
  while (next) {
    const page = await fetchJson(next);
    if (Array.isArray(page.data)) items.push(...page.data);
    next = page.has_more && page.next_page ? page.next_page : null;
  }
  return items;
}

function splitTypeLine(typeLine = '') {
  const supertypes = new Set();
  const types = new Set();
  const subtypes = new Set();

  for (const face of typeLine.split(' // ')) {
    const [leftRaw = '', rightRaw = ''] = face.split(/\s+—\s+/);
    for (const token of leftRaw.trim().split(/\s+/).filter(Boolean)) {
      if (SUPERTYPES.has(token)) supertypes.add(token);
      else if (CARD_TYPES.has(token)) types.add(token);
      else types.add(token);
    }
    for (const token of rightRaw.trim().split(/\s+/).filter(Boolean)) {
      subtypes.add(token);
    }
  }

  return {
    supertypes: [...supertypes].sort(),
    types: [...types].sort(),
    subtypes: [...subtypes].sort()
  };
}

function imageFor(card) {
  if (card.image_uris?.normal) return card.image_uris.normal;
  for (const face of card.card_faces || []) {
    if (face.image_uris?.normal) return face.image_uris.normal;
  }
  return null;
}


function compact(card, setInfo) {
  const parsed = splitTypeLine(card.type_line);
  return {
    id: card.oracle_id,
    name: card.name,
    cmc: Number(card.cmc ?? 0),
    colors: [...(card.color_identity || [])].sort(),
    rarity: card.rarity || 'special',
    supertypes: parsed.supertypes,
    types: parsed.types,
    subtypes: parsed.subtypes,
    typeLine: card.type_line || '',
    setCode: setInfo.code,
    setName: setInfo.name,
    setType: setInfo.setType,
    releaseDate: setInfo.releaseDate,
    year: Number(String(setInfo.releaseDate).slice(0, 4)),
    image: imageFor(card),
    scryfallUri: card.scryfall_uri || null
  };
}

async function* jsonlObjects(response, gzipped) {
  if (!response.body) throw new Error('Bulk-data response has no body.');
  const nodeStream = Readable.fromWeb(response.body);
  const input = gzipped ? nodeStream.pipe(createGunzip()) : nodeStream;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    yield JSON.parse(line);
  }
}

async function readBulk(uri) {
  const response = await fetch(uri, { headers: headers() });
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading Scryfall bulk data`);

  const contentType = response.headers.get('content-type') || '';
  const isGzip = uri.endsWith('.gz') || (response.headers.get('content-encoding') || '').includes('gzip');
  const looksJsonl = uri.includes('.jsonl') || contentType.includes('ndjson') || contentType.includes('jsonl');

  if (looksJsonl || isGzip) return { kind: 'jsonl', response, isGzip };
  return { kind: 'json', response, isGzip: false };
}

console.log('Discovering Scryfall bulk data…');
const bulkList = await fetchJson(BULK_URL);

let scryfallSets = [];
try {
  scryfallSets = await fetchList(SETS_URL);
  console.log(`Loaded metadata for ${scryfallSets.length.toLocaleString()} Scryfall sets.`);
} catch (error) {
  console.warn(`Could not load Scryfall set metadata (${error.message}). Set symbols will use predictable fallback URLs.`);
}
const setMetaByCode = new Map(scryfallSets.map((set) => [String(set.code || '').toUpperCase(), set]));

const defaultCards = bulkList.data?.find((item) => item.type === 'default_cards');
if (!defaultCards) throw new Error('Scryfall did not return the default_cards bulk dataset.');

const downloadUri = defaultCards.jsonl_download_uri || defaultCards.download_uri;
if (!downloadUri) throw new Error('Scryfall default_cards dataset did not include a download URI.');

console.log(`Downloading ${defaultCards.name || 'Default Cards'}…`);
const bulk = await readBulk(downloadUri);
// Secret Lair needs one additional cross-printing rule: ordinary SLD
// reprints should not make SLD a first-set answer. Keep two streaming
// candidates per Oracle ID. A non-SLD printing always wins when one exists;
// an SLD printing is retained only when that Oracle card has no eligible
// non-SLD printing anywhere in Scryfall. This keeps mechanically unique SLD
// cards (for example a card currently printed only in SLD) while dropping
// normal Secret Lair reprints/reskins from the SLD answer pool.
const earliestNonSecretByOracle = new Map();
const earliestSecretOnlyByOracle = new Map();
let scanned = 0;
let acceptedPrintings = 0;

function considerPrinting(card) {
  scanned += 1;
  if (!isEligibleCardPrinting(card, setMetaByCode)) return;
  acceptedPrintings += 1;

  recordOracleCandidate(card, earliestNonSecretByOracle, earliestSecretOnlyByOracle);
}

if (bulk.kind === 'jsonl') {
  for await (const card of jsonlObjects(bulk.response, bulk.isGzip)) considerPrinting(card);
} else {
  const bulkCards = await bulk.response.json();
  for (const card of bulkCards) considerPrinting(card);
}

const { selectedByOracle, secretLairExclusiveCards } = resolveOracleCandidates(
  earliestNonSecretByOracle,
  earliestSecretOnlyByOracle
);

const cards = [...selectedByOracle.values()]
  .map((card) => compact(card, canonicalSetForCard(card, setMetaByCode)))
  .sort((a, b) => a.id.localeCompare(b.id));

if (cards.length < 10000) {
  throw new Error(`Only ${cards.length} unique paper cards were produced; refusing to overwrite the game database.`);
}

const sourceUpdatedAt = defaultCards.updated_at || new Date().toISOString();
const moduleText = `// Generated from Scryfall default_cards. Do not edit by hand.\nexport const CARD_DATA_UPDATED_AT = ${JSON.stringify(sourceUpdatedAt)};\nexport default ${JSON.stringify(cards)};\n`;
await writeFile(outputPath, moduleText);
const publicIndex = cards.map(({ id, name, setCode, year, releaseDate }) => ({ id, name, setCode, year, releaseDate }));
await writeFile(indexPath, JSON.stringify(publicIndex));

// Only sets that are actually represented as a card's first eligible printing belong
// in the game strip. Promo and memorabilia/front-card printings were already
// removed, and non-promo oversized companion sets have already been folded
// into their main set code.
const gameSets = new Map();
for (const card of cards) {
  const code = card.setCode;
  const current = gameSets.get(code);
  if (!current || card.releaseDate < current.releaseDate) {
    const meta = setMetaByCode.get(code);
    gameSets.set(code, {
      code,
      name: meta?.name || card.setName,
      releaseDate: card.releaseDate,
      year: card.year,
      setType: meta?.set_type || card.setType || null,
      iconSvgUri: meta?.icon_svg_uri || `https://svgs.scryfall.io/sets/${code.toLowerCase()}.svg`
    });
  }
}
const setIndex = [...gameSets.values()].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.code.localeCompare(b.code));
await writeFile(setIndexPath, JSON.stringify(setIndex));

const meta = {
  source: 'Scryfall default_cards bulk data',
  sourceUpdatedAt,
  generatedAt: new Date().toISOString(),
  scannedPrintings: scanned,
  acceptedPaperPrintings: acceptedPrintings,
  secretLairExclusiveCards,
  uniqueCards: cards.length,
  gameSets: setIndex.length
};
await writeFile(metaPath, JSON.stringify(meta, null, 2));
console.log(`Wrote ${cards.length.toLocaleString()} unique paper cards and ${setIndex.length.toLocaleString()} game sets from ${acceptedPrintings.toLocaleString()} eligible printings (${secretLairExclusiveCards.toLocaleString()} SLD-exclusive Oracle cards).`);
