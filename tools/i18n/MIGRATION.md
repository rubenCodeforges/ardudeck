# i18n migration rules (desktop app)

Stack: i18next + react-i18next. Instance: `apps/desktop/src/shared/i18n/index.ts`. English source: `apps/desktop/src/shared/i18n/locales/en/<ns>.json`.

## Keys
- Always fully qualified: `t('mission:waypointTable.holdTime')`. Never `useTranslation('ns')` + bare keys.
- Namespace = the area you own (see your assignment). Generic words already live in `common` (open `locales/en/common.json` and reuse: `t('common:cancel')`, `t('common:save')` ...).
- Key = `<componentOrFileCamel>.<shortCamel>`, e.g. `safetyTab.fenceActionHint`. Stable and descriptive, not a slug of the whole sentence.
- Add English text ONLY via the locked helper (other agents write concurrently):
  `node tools/i18n/add-keys.mjs <ns> '{"safetyTab.title":"Safety","safetyTab.hint":"..."}'` (or a JSON file path). Batch many keys per call. On a conflict, reuse the existing key or pick another name.
- Copy the English text EXACTLY as it is today (same punctuation, same casing). Do not reword, do not add em dashes.

## How to call t
- React components: `const { t } = useTranslation();` from `react-i18next`, then `t('ns:key')`.
- Non-React code (stores, utils, shared, main process): `import { t } from '<relative>/shared/i18n/index.js'` and call it where the string is produced at runtime.
- NEVER call t() at module top level (constants, arrays of options, registries evaluated at import). Store the key instead (`labelKey: 'ns:x.y'`) and translate where rendered (`t(item.labelKey)`), or turn the constant into a function that is called at render time. Keep the old English `label` field only if other code depends on it as an identifier.
- Interpolation: `t('ns:key', { count, name })` with `{{name}}` in the JSON. Plurals: `key_one` / `key_other` and pass `count`.
- Mixed JSX (text split by elements or `{expr}`): one key with `<Trans i18nKey="ns:key" values={{ n }} components={{ b: <strong className="..." /> }} />` and JSON like `"Press <b>Arm</b> to start {{n}}"`. Prefer one full sentence over fragments.
- `title=`, `placeholder=`, `aria-label=`, `data-tip=`, toasts, confirm dialogs, error strings shown to the user: all translated.

## Do NOT translate (leave literal, add `// i18n-exempt` on that line or the line above if the scanner flags it)
- Firmware-sourced text: parameter names and descriptions, PX4/iNav/ArduPilot metadata, STATUSTEXT, MAVLink enum/command names.
- Flight mode names (Loiter, RTL, Stabilize ...). Our own descriptions of what a mode does ARE translated.
- Brand, board, product, protocol names (Matek F405, ExpressLRS, MAVLink, CRSF ...), units symbols (m/s, V, mAh).
- Anything sent to the vehicle or written to files: generated Lua code, `gcs:send_text` messages, param files, KML/mission/CSV exports, persisted graph or mission data, IPC channel names, ids, CSS classes.
- Strings used as identifiers or compared in code (`if (label === 'Custom')`): check usages before replacing.
- Dev-only text: console.*, debug logs, internal errors that never reach the UI (`ConnectionRegistry.setActive: ...`).

## Verify before reporting done
0. `node tools/i18n/babel-check.cjs apps/desktop/src` must print 0 errors. Vite parses with Babel, which is stricter than tsc: never put `{/* i18n-exempt */}` as its own child inside `cond && (` ... `)` or `? (` (that breaks the dev server). Put the marker at the end of the element's line instead, e.g. `<span>{n} Mbps{/* i18n-exempt */}</span>`, or as a `//` comment in plain TS.
1. `node tools/i18n/scan.cjs file <your files...>` lists what is left in your files. Remaining lines must be exempt-worthy (then mark `// i18n-exempt`) or genuinely not UI.
2. `node tools/i18n/scan.cjs check` must report 0 missing keys for your namespaces (other agents' in-flight keys may show; ignore those).
3. Typecheck: `cd apps/desktop && npx tsc --noEmit -p . 2>&1 | grep -E '<your dirs>'` must be empty. Other agents edit concurrently, ignore errors outside your files.
4. Run tests touching your area: `cd apps/desktop && npx vitest run <your dirs>`. Tests asserting English text should still pass because English is the default language. Fix any you break.

## German
Every new English key also needs its German text in `locales/de/<ns>.json` (same key path), following `tools/i18n/glossary-de.md`. `node tools/i18n/verify-locale.mjs de` must pass; it runs in `pnpm i18n:check` and on pre-push.

## House rules
- No builds (`pnpm build`/`package`), no commits, no git stash/reset/checkout. Only edit files in your assignment plus `locales/en/*.json` via the helper.
- No em dashes anywhere. No new comments explaining the migration.
- Keep diffs minimal: do not refactor, rename, or reformat unrelated code.
