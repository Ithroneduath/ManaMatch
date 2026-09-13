import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const toml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('footer credits Enchant Worldle and removes old unofficial wording', () => {
  assert.match(html, /Inspired by[\s\S]*Enchant Worldle/);
  assert.doesNotMatch(html, /Unofficial fan project/);
});

test('public data note no longer displays development secret warning', () => {
  assert.doesNotMatch(app, /Development secret is active/);
});

test('header includes WUBRG mana icons in order', () => {
  const w = html.indexOf('ms-w ms-cost');
  const u = html.indexOf('ms-u ms-cost');
  const b = html.indexOf('ms-b ms-cost');
  const r = html.indexOf('ms-r ms-cost');
  const g = html.indexOf('ms-g ms-cost');
  assert.ok(w >= 0 && w < u && u < b && b < r && r < g);
});

test('v2.6 uses versioned assets and revalidation', () => {
  assert.match(html, /styles\.css\?v=2\.6\.0/);
  assert.match(html, /app\.js\?v=2\.6\.0/);
  assert.doesNotMatch(toml, /max-age=31536000, immutable/);
  assert.match(toml, /max-age=3600, must-revalidate/);
});

test('README contains detailed build hook instructions and automatic icon explanation', () => {
  assert.match(readme, /Build & deploy → Continuous deployment → Build hooks/);
  assert.match(readme, /NETLIFY_BUILD_HOOK_URL/);
  assert.match(readme, /Do new set icons appear automatically\?/);
  assert.match(readme, /icon_svg_uri/);
});


test('daily heading uses the full Magic: The Gathering name', () => {
  assert.match(html, /Guess the Magic: The Gathering Card/);
  assert.match(app, /Guess the Magic: The Gathering Card/);
  assert.doesNotMatch(html, />Guess the Magic card</i);
});


test('header branding is enlarged and includes a d20 remaining-guesses indicator', async () => {
  const styles = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /brand-copy strong[\s\S]*clamp\(32px/);
  assert.match(styles, /mana-sequence \.ms[\s\S]*clamp\(24px/);
  assert.match(html, /class="remaining-die"/);
  assert.match(html, /id="remainingDieValue">20</);
  assert.match(html, /class="d20-art"/);
  assert.match(app, /remainingDieValue\.textContent = String\(remaining\)/);
  assert.match(app, /remainingDie\.setAttribute\('aria-label', remainingLabel\)/);
});
