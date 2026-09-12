import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleCardPrinting, canonicalSetForCard } from '../scripts/card-eligibility.mjs';

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
