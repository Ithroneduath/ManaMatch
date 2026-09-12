// Shared card/set eligibility rules for the Scryfall updater.
// Keeping these rules separate makes it easy to test filtering without
// downloading the full bulk dataset.

export const EXCLUDED_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series'
]);

// Scryfall uses `memorabilia` for non-game pieces and collector/front-card
// products such as Jumpstart front cards (FONE, FDMU, FJ22, etc.).
// They can share names/art with cards from the associated playable release,
// so allowing them creates duplicate-looking sets in the ManaMatch timeline.
export const EXCLUDED_SET_TYPES = new Set([
  'memorabilia'
]);

export function isPromoPrinting(card) {
  return card?.promo === true || card?.set_type === 'promo';
}

export function isEligibleCardPrinting(card) {
  return card?.object === 'card'
    && Boolean(card.oracle_id)
    && card.lang === 'en'
    && card.digital !== true
    && Array.isArray(card.games)
    && card.games.includes('paper')
    && !EXCLUDED_LAYOUTS.has(card.layout)
    && !EXCLUDED_SET_TYPES.has(card.set_type)
    && !isPromoPrinting(card)
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
