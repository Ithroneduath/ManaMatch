import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleCardPrinting, canonicalSetForCard, isHeroesOfTheRealmCode, isRedundantPrefixedCompanion, recordOracleCandidate, resolveOracleCandidates } from '../scripts/card-eligibility.mjs';

function baseCard(overrides = {}) {
  return {
    object: 'card',
    oracle_id: '00000000-0000-4000-8000-000000000099',
    lang: 'en',
    digital: false,
    games: ['paper'],
    layout: 'normal',
    promo: false,
    promo_types: [],
    name: 'Fixture Card',
    released_at: '2008-05-02',
    set: 'shm',
    set_name: 'Shadowmoor',
    set_type: 'expansion',
    ...overrides
  };
}

test('promo printings are excluded even when otherwise valid paper cards', () => {
  assert.equal(isEligibleCardPrinting(baseCard({ set: 'pshm', set_name: 'Shadowmoor Promos', set_type: 'promo', promo: true })), false);
  assert.equal(isEligibleCardPrinting(baseCard({ promo: true })), false);
});

test('ordinary non-promo paper printings remain eligible', () => {
  assert.equal(isEligibleCardPrinting(baseCard()), true);
});

test('memorabilia/front-card printings such as FONE are excluded', () => {
  assert.equal(isEligibleCardPrinting(baseCard({
    set: 'fone',
    set_name: 'Phyrexia: All Will Be One Jumpstart Front Cards',
    set_type: 'memorabilia',
    promo: false
  })), false);
});

test('memorabilia filtering is metadata-driven and also catches non-F front-card codes', () => {
  assert.equal(isEligibleCardPrinting(baseCard({
    set: 'jtla',
    set_name: 'Avatar: The Last Airbender Jumpstart Front Cards',
    set_type: 'memorabilia',
    promo: false
  })), false);
});

test('legitimate F-prefixed playable sets are not removed merely because their code starts with F', () => {
  assert.equal(isEligibleCardPrinting(baseCard({
    set: 'fdn',
    set_name: 'Magic: The Gathering Foundations',
    set_type: 'core',
    promo: false
  })), true);
  assert.equal(isEligibleCardPrinting(baseCard({
    set: 'fin',
    set_name: 'Magic: The Gathering—FINAL FANTASY',
    set_type: 'expansion',
    promo: false
  })), true);
});


test('OHOP-style oversized companion set folds into HOP when metadata matches', () => {
  const sets = new Map([
    ['HOP', {
      code: 'hop', name: 'Planechase', set_type: 'planechase', released_at: '2009-09-04',
      icon_svg_uri: 'https://svgs.scryfall.io/sets/hop.svg?123'
    }],
    ['OHOP', {
      code: 'ohop', name: 'Planechase Planes', set_type: 'planechase', released_at: '2009-09-04',
      icon_svg_uri: 'https://svgs.scryfall.io/sets/hop.svg?456'
    }]
  ]);
  const result = canonicalSetForCard(baseCard({
    set: 'ohop', set_name: 'Planechase Planes', set_type: 'planechase', released_at: '2009-09-04'
  }), sets);
  assert.equal(result.code, 'HOP');
  assert.equal(result.name, 'Planechase');
});

test('a legitimate four-character code is not stripped merely for being four characters', () => {
  const sets = new Map([
    ['ABCD', { code: 'abcd', name: 'Fixture Four-Letter Set', set_type: 'expansion', released_at: '2026-01-01', icon_svg_uri: 'https://example.test/abcd.svg' }]
  ]);
  const result = canonicalSetForCard(baseCard({
    set: 'abcd', set_name: 'Fixture Four-Letter Set', set_type: 'expansion', released_at: '2026-01-01'
  }), sets);
  assert.equal(result.code, 'ABCD');
});


test('reprint/supplemental set categories are excluded automatically', () => {
  for (const setType of ['token', 'masters', 'masterpiece', 'from_the_vault', 'duel_deck', 'vanguard', 'memorabilia']) {
    assert.equal(isEligibleCardPrinting(baseCard({ set_type: setType })), false, setType);
  }
});

test('requested special set codes are excluded even if metadata type is otherwise ordinary', () => {
  const codes = ['MGB','PVAN','TSB','HHO','TSOM','TC15','E01','PHTR','MED','TUND','MUL','PLST','SZNR','STA','TAFR','SUNF','TUNF','TWOE','MB2'];
  for (const code of codes) {
    assert.equal(isEligibleCardPrinting(baseCard({ set: code.toLowerCase(), set_type: 'expansion' })), false, code);
  }
});

test('all PH-number Heroes of the Realm set codes are excluded, including future years', () => {
  assert.equal(isHeroesOfTheRealmCode('PH17'), true);
  assert.equal(isHeroesOfTheRealmCode('PH23'), true);
  assert.equal(isHeroesOfTheRealmCode('PH27'), true);
  assert.equal(isHeroesOfTheRealmCode('PHTR'), false);
  assert.equal(isEligibleCardPrinting(baseCard({ set: 'ph27', set_type: 'expansion' })), false);
});

test('metadata-confirmed one-letter prefixed child sets are removed while O-prefixed companions are preserved for folding', () => {
  const sets = new Map([
    ['WOE', { code: 'woe', name: 'Wilds of Eldraine', set_type: 'expansion', released_at: '2023-09-08' }],
    ['TWOE', { code: 'twoe', name: 'Wilds of Eldraine Tokens', set_type: 'token', released_at: '2023-09-08', parent_set_code: 'woe' }],
    ['HOP', { code: 'hop', name: 'Planechase', set_type: 'planechase', released_at: '2009-09-04', icon_svg_uri: 'https://svgs.scryfall.io/sets/hop.svg' }],
    ['OHOP', { code: 'ohop', name: 'Planechase Planes', set_type: 'planechase', released_at: '2009-09-04', parent_set_code: 'hop', icon_svg_uri: 'https://svgs.scryfall.io/sets/hop.svg' }]
  ]);
  const twoe = baseCard({ set: 'twoe', set_name: 'Wilds of Eldraine Tokens', set_type: 'token', released_at: '2023-09-08' });
  const ohop = baseCard({ set: 'ohop', set_name: 'Planechase Planes', set_type: 'planechase', released_at: '2009-09-04' });
  assert.equal(isRedundantPrefixedCompanion(twoe, sets), true);
  assert.equal(isEligibleCardPrinting(twoe, sets), false);
  assert.equal(isRedundantPrefixedCompanion(ohop, sets), false);
  assert.equal(isEligibleCardPrinting(ohop, sets), true);
});

test('Secret Lair reprints lose to any eligible non-SLD printing, but SLD-exclusive Oracle cards remain', () => {
  const nonSecret = new Map();
  const secret = new Map();
  const oracleA = '00000000-0000-4000-8000-0000000000aa';
  const oracleB = '00000000-0000-4000-8000-0000000000bb';

  recordOracleCandidate(baseCard({ oracle_id: oracleA, set: 'sld', set_name: 'Secret Lair Drop', set_type: 'box', released_at: '2026-07-27', name: 'Reprint Fixture' }), nonSecret, secret);
  recordOracleCandidate(baseCard({ oracle_id: oracleA, set: 'lea', set_name: 'Limited Edition Alpha', set_type: 'core', released_at: '1993-08-05', name: 'Reprint Fixture' }), nonSecret, secret);
  recordOracleCandidate(baseCard({ oracle_id: oracleB, set: 'sld', set_name: 'Secret Lair Drop', set_type: 'box', released_at: '2026-07-27', name: 'SLD Exclusive Fixture' }), nonSecret, secret);

  const { selectedByOracle, secretLairExclusiveCards } = resolveOracleCandidates(nonSecret, secret);
  assert.equal(selectedByOracle.get(oracleA).set, 'lea');
  assert.equal(selectedByOracle.get(oracleB).set, 'sld');
  assert.equal(secretLairExclusiveCards, 1);
});
