# ManaMatch v2.6

ManaMatch is a self-updating daily **Magic: The Gathering** card guessing game designed for Netlify. It recreates the general idea of a card-attribute guessing game without copying EnchantWorldle's code or branding.

## Included game modes

- **Daily** — one hidden card per calendar day, shared by all players using the same `DAILY_SECRET`.
- **Practice** — unlimited random cards; the hidden card is stored in an encrypted, tamper-resistant session token rather than exposed to the browser.
- **Archive** — replay any daily puzzle back to the configured launch date.
- **20 guesses** per puzzle.
- Clues for **mana value, color identity, rarity, card type/supertype, subtype, and first printing**.
- Green = exact, amber = partial, gray = no match; arrows point toward higher/lower mana value or rarity and earlier/later first printing.
- **Scrollable set-symbol timeline** — every first-printing set represented in the game appears chronologically. A guessed set turns red when wrong, yellow when it is immediately before/after the hidden set, and green when correct.
- **Hover card previews** — after a guess, hover (or keyboard-focus) the card-name cell to see that guessed card’s Scryfall image.
- Local daily stats, streaks, guess distribution, and spoiler-free share grids.
- Responsive desktop/mobile interface.

## Version 2 additions

### Set-symbol timeline

The timeline is generated from the same first-printing data used by the server. Only sets represented by at least one eligible card appear. Symbols are ordered chronologically (release date, then set code as a stable tie-breaker). The server uses that same order when scoring set guesses:

- **Green** — exact first-printing set.
- **Yellow** — guessed set is exactly one position before or after the answer set.
- **Red** — any other incorrect set.

Archive games automatically hide sets that had not yet been released on the archive date. After a guess, the strip scrolls the guessed set into view.

Version 2 uses a new puzzle-storage namespace so previously saved v1 clue rows cannot conflict with the changed set logic. Existing v1 daily performance statistics are migrated automatically.

### Guessed-card hover preview

The API now includes the guessed card's image URL in the public guess payload. Desktop users can hover the card-name cell to see a floating full-card preview; keyboard users can focus the cell for the same preview. The hidden answer image is still withheld until the puzzle ends.




## Version 2.6 interface polish

- The **ManaMatch** site name is now substantially larger and the five W/U/B/R/G mana symbols scale up with it, so the branding is visually dominant rather than smaller than page copy.
- A stylized **20-sided die (d20)** now appears beside “Make a guess.” Its center number is driven by the game's actual remaining-guess count and updates from 20 down to 0.
- The d20 remains accessible: the same information is still shown as text and the die exposes an updated accessible label for screen readers.
- On small screens, the title, mana symbols, and d20 scale down responsively without changing the game logic.

## Version 2.5 automatic reprint-only set filtering

Version 2.5 adds a general rule for the set-symbol timeline: a set must introduce at least one mechanically new Oracle card to paper Magic in order to be eligible as a ManaMatch source set. The updater uses Scryfall's per-printing `reprint` flag when available and cross-checks Oracle-card history as a fallback. This check happens **before** ManaMatch applies its normal promo/reprint/supplemental filters, so a later all-reprint product cannot resurface merely because the card's true earlier printing came from a product ManaMatch hides.

For example, **The Zeta Set (`SLZ`)** contains only reprints, so it is now excluded automatically; `SLZ` is also retained as an explicit failsafe exclusion for this release. The same automatic rule will apply to future all-reprint products without needing their set codes to be manually added to a blacklist. Mixed sets remain eligible if they introduce at least one new Oracle card. Secret Lair (`SLD`) also remains eligible because it contains mechanically new cards, while the existing card-by-card SLD logic still prevents normal SLD reprints from being treated as first printings.

The generated `card-data-meta.json` now records how many otherwise-eligible reprint-only sets were skipped and lists their set codes, which makes future auditing easier.

This release performs a broader cleanup of the first-printing timeline. The updater now excludes Scryfall set categories that are supplemental/reprint/nonstandard products for ManaMatch purposes: **token, memorabilia, masters, masterpiece, From the Vault, Duel Deck, and Vanguard**. It also excludes the requested historical/special entries such as `MGB`, `TSB`, `HHO`, `E01`, `PHTR`, `PLST`, and `MB2`, plus every `PH##` Heroes of the Realm-style code.

ManaMatch also uses Scryfall's `parent_set_code` metadata to detect one-letter-prefixed companion products such as `TWOE` → `WOE` and `SZNR` → `ZNR`. Those child products are excluded automatically instead of requiring a growing manual list. The existing `O...` Planechase exception remains: entries such as `OHOP` are folded into `HOP` so unique Plane cards can stay in the game without a duplicate symbol.

### Secret Lair (`SLD`) rule

Secret Lair is handled at the **Oracle-card level**, not by deleting SLD entirely. During the bulk-data pass ManaMatch keeps separate candidates for SLD and non-SLD printings:

- If an Oracle card has **any eligible non-SLD printing**, ManaMatch uses the earliest eligible non-SLD printing and the SLD copy does not make SLD its first-set answer.
- If the Oracle card has **no eligible non-SLD printing**, the SLD printing remains eligible. This preserves mechanically/new-to-Magic Secret Lair cards while removing ordinary reprints/reskins from SLD's contribution to the game.

This means a mechanically unique card such as a new-to-Magic Secret Lair design can remain, while cards such as Sol Ring or Swords to Plowshares in the same drop resolve to their normal earlier printings.

The daily heading now reads **“Guess the Magic: The Gathering Card”**.

## Version 2.3 polish and automatic set icons

- The footer now reads **“Inspired by Enchant Worldle.”** instead of “Unofficial fan project.”
- The development-secret warning is no longer shown in the public interface. You should still configure a stable `DAILY_SECRET` before launch.
- The header now uses Magic-inspired serif typography and shows the five mana symbols in **White, Blue, Black, Red, Green (WUBRG)** order beside the ManaMatch title. Wizards' proprietary Beleren font is **not** bundled; the site uses freely hosted Cinzel/Libre Baskerville alternatives. The mana glyphs use Andrew Gioia's Mana icon font via jsDelivr.
- Asset URLs/cache settings were updated so future ManaMatch deployments do not leave returning players stuck on an old year-long cached JavaScript/CSS file.

### Do new set icons appear automatically?

**Yes.** No hand-maintained set-symbol list is used. Every normal build:

1. downloads the current Scryfall `default_cards` bulk data;
2. downloads Scryfall set metadata;
3. recalculates the eligible first-printing sets after promo, memorabilia, companion-set, Secret Lair, and **automatic all-reprint-set** cleanup;
4. takes each set's canonical `icon_svg_uri` from Scryfall (with a predictable Scryfall SVG fallback); and
5. rewrites `public/set-index.json`, which is what the horizontal set-symbol strip reads.

The browser hides a set until its release date is valid for the puzzle being played. Therefore a newly released normal set will appear automatically after the next successful data-refresh build, assuming Scryfall has added eligible cards and set metadata for it **and the set introduces at least one mechanically new Oracle card**. A newly released all-reprint product will be omitted automatically. Promo, memorabilia/front-card, token, masters, masterpiece/bonus-sheet, Duel Deck, From the Vault, Vanguard, and other configured supplemental sets remain intentionally excluded.

With the Build Hook configured in Step 5 below, the included scheduled function triggers this rebuild once per day. Without a Build Hook, new cards and set symbols still update whenever you manually deploy or push a code change.

## Version 2.2 front-card/memorabilia cleanup

A second audit found another source of duplicate-looking set symbols: Scryfall's **memorabilia** sets. These include Jumpstart/front-card products such as `FONE`, `FDMU`, `FJ22`, `FBRO`, `FJMP`, `FMOM`, `FLTR`, `FCLU`, `FFDN`, and newer equivalents. They are packaging/front-card or collector pieces rather than a distinct playable first printing for ManaMatch purposes.

ManaMatch now excludes every printing whose Scryfall `set_type` is `memorabilia`. This is deliberately metadata-driven instead of deleting every code beginning with `F`: legitimate sets such as `FDN`, `FIN`, `FUT`, and `FRF` remain eligible. It also catches front-card products whose codes do not begin with `F` (for example `JTLA`).

If a normal playable printing of the same Oracle card exists, that normal printing can now become the card's earliest eligible ManaMatch printing instead of the memorabilia/front-card copy. Future memorabilia/front-card products will be filtered automatically as long as Scryfall classifies them consistently.

## Version 2.1 card/set cleanup

To keep the set-symbol timeline focused on meaningful releases, the Scryfall updater now applies two additional rules:

- **All promo printings are excluded** (`promo: true` or Scryfall `set_type: "promo"`). This removes promo-only companion sets such as `PSHM` rather than allowing a promo printing to become a card's first-set answer.
- **Non-promo oversized companion sets are folded into their main release** when Scryfall represents them with an extra leading `O`, the corresponding base set exists, and the metadata identifies them as the same release/symbol. For example, `OHOP` is treated as `HOP`. Unique Plane cards can remain in the game without adding a duplicate Planechase symbol to the timeline.

The filtering is metadata-driven rather than simply deleting every four-letter code, so legitimate four- and five-character modern set codes are not accidentally removed.

## Automatic card data

A normal build runs `scripts/update-cards.mjs`, which:

1. Discovers Scryfall's current `default_cards` bulk dataset.
2. Supports the current gzipped JSONL bulk format and the older JSON-array format.
3. Keeps English, non-digital cards that have a paper printing.
4. Excludes tokens, emblems, art cards, playtest cards, **all promo printings**, and Scryfall **memorabilia/front-card, token, masters, masterpiece, From the Vault, Duel Deck, and Vanguard** printings.
5. Removes configured supplemental/bonus products and metadata-confirmed one-letter-prefixed child sets.
6. Folds recognized non-promo `O`-prefixed oversized companion entries (for example `OHOP`) into their main set (`HOP`).
7. Groups printings by Oracle ID and treats SLD as a fallback: an SLD printing is selected only when that Oracle card has no eligible non-SLD printing.
8. Uses the earliest eligible English paper printing for rarity/set/year.
9. Loads Scryfall set metadata and generates a chronological public set-symbol index using canonical set icon URIs.
10. Writes a compact server-side card database plus public autocomplete and set indexes.

Future cards can therefore enter the game without editing source code. Preview cards may exist in the generated database, but the game will not allow them as guesses or answers until their `released_at` date.

The repository includes only a tiny sample card fixture so the test suite works offline. A normal Netlify deployment replaces it during the build with the current Scryfall data.

## Requirements

- Node.js 20 or newer.
- A Netlify account for the recommended deployment.
- No database and no Scryfall API key.

## Local development

From the project directory:

```bash
npm run build
npx netlify dev
```

`npm run build` needs internet access because it downloads Scryfall bulk data. To run the test suite against the included sample fixture:

```bash
npm test
```

For UI work without downloading the full database, on macOS/Linux you can also use:

```bash
SKIP_CARD_UPDATE=1 npx netlify dev
```

## Deploy to Netlify

### 1. Put the project in a Git repository

Create a new GitHub/GitLab repository and push this folder. The included `netlify.toml` already defines:

- build command: `npm run build`
- publish directory: `public`
- functions directory: `netlify/functions`
- the scheduled data-refresh function

### 2. Import the repository into Netlify

Use **Add new project / Import an existing project** and select the repository. Netlify should read the build settings from `netlify.toml`.

### 3. Set a stable secret

In Netlify project environment variables, add:

```text
DAILY_SECRET=<a long random value>
```

A good way to generate one locally is:

```bash
openssl rand -hex 32
```

**Do not change this after launch.** The secret determines daily answers and encrypts practice tokens. If you change it, historical daily answers will change.

The code has a development fallback so local/test builds can run before this is configured. The public interface no longer displays a development-secret warning, so make sure `DAILY_SECRET` is set before launch.

### 4. Optional game settings

These defaults are built in:

```text
GAME_EPOCH=2026-09-11
GAME_TIME_ZONE=America/Chicago
```

- `GAME_EPOCH` is the first archive date and puzzle #1.
- `GAME_TIME_ZONE` controls when the daily puzzle changes. It accepts an IANA timezone name.

If you want different values, set them as Netlify environment variables before public launch.

### 5. Turn on automatic Scryfall refreshes (Build Hook setup)

The project includes `netlify/functions/refresh-data.mjs`, scheduled by `netlify.toml` for **07:17 UTC every day**. That time is intentionally after midnight in the U.S. Central time zone year-round.

The scheduled function cannot directly rewrite files inside an already-published deploy, so it calls a Netlify **Build Hook**. That hook starts a normal production build, and the normal build downloads fresh Scryfall data and regenerates the card/set indexes.

#### A. Create the Build Hook

1. Open your ManaMatch project in Netlify.
2. Open **Project configuration**.
3. Go to **Build & deploy → Continuous deployment → Build hooks**.
4. Select **Add build hook**.
5. For the name, enter something descriptive such as `Daily Scryfall Refresh`.
6. Choose your **production branch** (normally `main` or `master`). Netlify only lists branches that have already been deployed at least once, so if your branch is missing, complete one normal deploy first and return to this screen.
7. Save/create the hook. Netlify will display a unique URL that looks similar to `https://api.netlify.com/build_hooks/...`.
8. Copy that entire URL. **Treat it like a secret**: anyone with the URL can trigger builds of that branch.

Official Netlify reference: https://docs.netlify.com/build/configure-builds/build-hooks/

#### B. Give the scheduled function the hook URL

1. Still in the ManaMatch Netlify project, open **Project configuration → Environment variables**.
2. Select **Add a variable**.
3. Use this key exactly:

```text
NETLIFY_BUILD_HOOK_URL
```

4. Paste the Build Hook URL as the value.
5. Make sure the variable's scope includes **Functions**. For this project, using the production deploy context (or all deploy contexts) is fine.
6. Save the variable.

Official Netlify reference: https://docs.netlify.com/build/environment-variables/get-started/

#### C. Redeploy once

Environment-variable changes take effect after a build/deploy. Trigger one new production deploy (or push a small commit). After that deploy, the scheduled `refresh-data` function can see `NETLIFY_BUILD_HOOK_URL`.

From then on the chain is:

```text
07:17 UTC scheduled function
        ↓
POST to your Build Hook
        ↓
Netlify production build
        ↓
Scryfall cards + set metadata downloaded
        ↓
card-index.json + set-index.json regenerated
        ↓
newly released eligible cards and set icons appear
```

You can test the hook immediately by opening the Build Hook section and using its URL with a POST request, or simply wait for the next scheduled run and check the Netlify deploy list. Build Hooks only work while builds are active for the site.

If `NETLIFY_BUILD_HOOK_URL` is omitted, ManaMatch still works; it simply refreshes Scryfall data whenever you manually deploy or push a code change.

## Security model

The full hidden answer is never sent to the browser before the puzzle is completed.

- **Daily/archive:** the function selects the card from the date plus `DAILY_SECRET`.
- **Practice:** the server randomly chooses a card and returns an AES-GCM encrypted token containing its ID.
- **Autocomplete:** only public card names/IDs/set metadata are downloaded to the browser.
- **Guessed-card preview:** the server returns the image URL only for the card the player actually guessed; this does not expose the hidden card.
- **Guess response:** only the guessed card and comparison clues are returned until a win or guess 20.

This prevents casual source inspection from revealing the answer. As with any anonymous web puzzle, a determined person can still automate guesses against the endpoint; preventing that would require accounts, rate limiting, or a stateful service.

## Daily/archive stability

A puzzle only selects from cards whose first eligible paper printing was released on or before that puzzle date. Consequently, a newly released future set does not enter old archive pools. Keep `DAILY_SECRET` unchanged after launch.

A very rare Scryfall correction that adds a previously missing historical Oracle card could technically change an old deterministic pool. If permanent immutable archives become important, the next step would be storing finalized daily answers in a persistent service such as Netlify Blobs.

## Project structure

```text
data/cards.mjs                  Generated compact server-side database
netlify/functions/api.mjs       Game/search API
netlify/functions/refresh-data.mjs
netlify/lib/game.mjs            Selection, comparison, encryption logic
public/index.html               UI
public/assets/app.js            Frontend behavior and local stats
public/assets/styles.css        Responsive styling
public/card-index.json          Generated public autocomplete index
public/set-index.json           Generated chronological set-symbol index
scripts/card-eligibility.mjs    Promo/memorabilia/companion-set eligibility rules
scripts/update-cards.mjs        Scryfall updater
netlify.toml                    Netlify build/functions/schedule config
tests/game.test.mjs             Core automated game tests
tests/eligibility.test.mjs      Promo/memorabilia/companion-set filtering tests
```

## Data and trademark notice

Card data and card-image URLs come from [Scryfall](https://scryfall.com/). ManaMatch is inspired by [Enchant Worldle](https://enchantworldle.com/) and is not affiliated with or endorsed by Wizards of the Coast. Magic: The Gathering and related marks belong to Wizards of the Coast. The Mana icon font is provided by [Andrew Gioia](https://mana.andrewgioia.com/) under its published font/CSS licenses; the underlying Magic mana symbols are Wizards of the Coast artwork.
