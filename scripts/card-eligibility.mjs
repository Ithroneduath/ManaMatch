// Shared card/set eligibility rules for the Scryfall updater.
// Keeping these rules separate makes it easy to test filtering without
// downloading the full bulk dataset.

export const EXCLUDED_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series'
]);

// These Scryfall set categories are supplemental/reprint/non-card products
// that add noise to a first-printing guessing game. Scryfall defines masters
// as reprint-only; masterpiece sets are premium/bonus-sheet printings; Duel
// Decks and From the Vault are reprint products; token/memorabilia products
// are not normal card releases; Vanguard cards are oversized game pieces.
export const EXCLUDED_SET_TYPES = new Set([
  'memorabilia',
  'token',
  'masters',
  'masterpiece',
  'from_the_vault',
  'duel_deck',
  'vanguard'
]);

// A few historical/special products do not fall cleanly into the categories
// above, or are intentionally omitted for ManaMatch's streamlined timeline.
// PH## is handled separately so future Heroes of the Realm yearly sets are
// also removed automatically.
export const EXCLUDED_SET_CODES = new Set([
  'MGB',   // Multiverse Gift Box
  'PVAN',  // Vanguard/promotional companion material
  'TSB',   // Time Spiral Timeshifted bonus sheet
  'HHO',   // Happy Holidays
  'TSOM',  // Scars of Mirrodin companion/token product
  'TC15',  // Commander 2015 companion/token product
  'E01',   // Archenemy: Nicol Bolas specialty release
  'PHTR',  // Heroes of the Realm specialty/promo release
  'MED',   // Masters Edition / digital-era supplemental entry
  'TUND',  // Unsanctioned companion/token product
  'MUL',   // Multiverse Legends bonus sheet
  'PLST',  // The List
  'SZNR',  // Zendikar Rising substitute-card companion
  'STA',   // Strixhaven Mystical Archive bonus sheet
  'TAFR',  // Adventures in the Forgotten Realms tokens
  'SUNF',  // Unfinity sticker/companion product
  'TUNF',  // Unfinity tokens
  'TWOE',  // Wilds of Eldraine tokens
  'MB2'    // Mystery Booster 2
]);

export function isPromoPrinting(card) {
  return card?.promo === true || card?.set_type === 'promo';
}

export function isSecretLairPrinting(card) {
  return String(card?.set || '').toUpperCase() === 'SLD';
}


export function preferPrinting(candidate, current) {
  if (!current) return true;
  if (candidate.released_at < current.released_at) return true;
  if (candidate.released_at > current.released_at) return false;
  return String(candidate.set).localeCompare(String(current.set)) < 0;
}

export function recordOracleCandidate(card, nonSecretByOracle, secretByOracle) {
  const target = isSecretLairPrinting(card) ? secretByOracle : nonSecretByOracle;
  const current = target.get(card.oracle_id);
  if (preferPrinting(card, current)) target.set(card.oracle_id, card);
}

export function resolveOracleCandidates(nonSecretByOracle, secretByOracle) {
  const selectedByOracle = new Map(nonSecretByOracle);
  let secretLairExclusiveCards = 0;
  for (const [oracleId, card] of secretByOracle) {
    if (selectedByOracle.has(oracleId)) continue;
    selectedByOracle.set(oracleId, card);
    secretLairExclusiveCards += 1;
  }
  return { selectedByOracle, secretLairExclusiveCards };
}

export function isHeroesOfTheRealmCode(code) {
  return /^PH\d+$/i.test(String(code || ''));
}

function metaForCard(card, setMetaByCode) {
  const code = String(card?.set || '').toUpperCase();
  return setMetaByCode?.get(code) || null;
}

// Scryfall commonly gives token/substitute/front-card companion products the
// parent code with one extra leading letter (TWOE -> WOE, SZNR -> ZNR, etc.).
// Remove those child products automatically when the metadata confirms the
// parent relationship. O-prefixed oversized Planechase companions are the one
// exception: those are folded into their main set by canonicalSetForCard so
// unique Plane cards can remain playable without a duplicate timeline symbol.
export function isRedundantPrefixedCompanion(card, setMetaByCode) {
  const rawCode = String(card?.set || '').toUpperCase();
  if (!rawCode || rawCode.startsWith('O')) return false;

  const rawMeta = metaForCard(card, setMetaByCode);
  const parent = String(rawMeta?.parent_set_code || '').toUpperCase();
  return Boolean(parent)
    && rawCode.length === parent.length + 1
    && rawCode.endsWith(parent);
}

export function isEligibleCardPrinting(card, setMetaByCode = null) {
  const code = String(card?.set || '').toUpperCase();
  const meta = metaForCard(card, setMetaByCode);
  const setType = meta?.set_type || card?.set_type;

  return card?.object === 'card'
    && Boolean(card.oracle_id)
    && card.lang === 'en'
    && card.digital !== true
    && Array.isArray(card.games)
    && card.games.includes('paper')
    && !EXCLUDED_LAYOUTS.has(card.layout)
    && !EXCLUDED_SET_TYPES.has(setType)
    && !isPromoPrinting(card)
    && !EXCLUDED_SET_CODES.has(code)
    && !isHeroesOfTheRealmCode(code)
    && !isRedundantPrefixedCompanion(card, setMetaByCode)
    && !(card.promo_types || []).includes('playtest')
    && Boolean(card.name)
    && Boolean(card.released_at)
    && Boolean(card.set)
    && Boolean(card.set_name);
}

function iconKey(uri) {
  if (!uri) return null;
  return String(uri).split('?')[0].toLowerCase();
}

// Scryfall occasionally models an oversized/non-promo companion component as
// a separate set code formed by prefixing O to the main set code. Example:
// OHOP (Planechase Planes) accompanies HOP (Planechase). When the companion
// shares the same release date and canonical symbol, treat it as the main set
// for game purposes so the set strip has one meaningful entry while unique
// cards (such as Plane cards) remain playable.
export function canonicalSetForCard(card, setMetaByCode) {
  const rawCode = String(card?.set || '').toUpperCase();
  const rawMeta = setMetaByCode?.get(rawCode) || null;

  if (rawCode.length >= 4 && rawCode.startsWith('O')) {
    const baseCode = rawCode.slice(1);
    const baseMeta = setMetaByCode?.get(baseCode) || null;
    if (baseMeta) {
      const explicitParent = String(rawMeta?.parent_set_code || '').toUpperCase() === baseCode;
      const sameDate = Boolean(rawMeta?.released_at && baseMeta?.released_at)
        && rawMeta.released_at === baseMeta.released_at;
      const rawIcon = iconKey(rawMeta?.icon_svg_uri);
      const baseIcon = iconKey(baseMeta?.icon_svg_uri);
      const sameIcon = Boolean(rawIcon && baseIcon && rawIcon === baseIcon);

      if (sameDate && (explicitParent || sameIcon)) {
        return {
          code: baseCode,
          name: baseMeta.name || card.set_name,
          setType: baseMeta.set_type || card.set_type || null,
          releaseDate: baseMeta.released_at || card.released_at,
          iconSvgUri: baseMeta.icon_svg_uri || null
        };
      }
    }
  }

  return {
    code: rawCode,
    name: rawMeta?.name || card.set_name,
    setType: rawMeta?.set_type || card.set_type || null,
    releaseDate: rawMeta?.released_at || card.released_at,
    iconSvgUri: rawMeta?.icon_svg_uri || null
  };
}
