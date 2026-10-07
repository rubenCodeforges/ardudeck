# @ardudeck/module-sdk

SDK for building ArduDeck modules.

## Install

From an external repo:

```json
{
  "devDependencies": {
    "@ardudeck/module-sdk": "github:codeforges/ardudeck#master&path:packages/module-sdk"
  }
}
```

Or bootstrap a new module with the generator:

```bash
node packages/create-ardudeck-module/bin/create.mjs my-module
```

## Manifest (`module.json`)

```json
{
  "manifestVersion": 1,
  "slug": "your.vendor.module-name",
  "name": "Your Module",
  "version": "0.1.0",
  "entry": { "main": "main.js", "renderer": "renderer.js" },
  "mountPoints": ["floatingOverlay"],
  "permissions": ["pty"]
}
```

Slug must match `^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$`. Version must be semver.

`requires` (optional) lists other cargo slugs this one builds on, e.g. `["com.ardudeck.vault"]`. When the cargo is activated the host installs any missing free dependency alongside it.

`entry` may be empty (`{}`) for a pure activator cargo: a module that ships no code and only unlocks built-in features through the host's capability map (see "Gating built-in features" below). `com.ardudeck.mission-library` is the reference: manifest-only, gates the Mission Library view and the planner's Save to Library option.

## Renderer entry

```tsx
import type { RendererHostApi } from '@ardudeck/module-sdk';

export async function activate(host: RendererHostApi) {
  host.log('info', 'activated');
  host.registerMountPoint('floatingOverlay', () => <MyFloatingComponent host={host} />);
}
```

## Main entry

```ts
import type { MainHostApi } from '@ardudeck/module-sdk';

export async function activate(host: MainHostApi) {
  host.onRendererMessage('doThing', async () => ({ result: 'ok' }));
}
```

## Build with esbuild

```js
import { build } from 'esbuild';
import { ardudeckModulePlugin } from '@ardudeck/module-sdk/esbuild';

await build({
  entryPoints: ['src/renderer/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  plugins: [ardudeckModulePlugin()],
  outfile: 'dist/renderer.js',
});
```

The plugin rewrites `react`, `react-dom`, and `react-dom/client` imports to the host's `window.__ardudeckHost.*` globals so your module shares the host's React instance (required for hooks to work).

## Host API

See `src/host-types.ts` for full typings. The renderer host exposes telemetry, connection state, current view, parameters, PTY sessions (if permitted), and a mount-point registration hook. Highlights:

- `host.panels` - contribute a panel to the host-owned module dock
- `host.hud` / `host.osd` - contribute HUD instruments and text-OSD elements
- `host.survey` - contribute a survey coverage engine
- `host.mission` / `host.commandTarget` - read-only mission + guided target
- `host.vault` - Fleet Vault access (requires the `vault` permission): `status()`, `listUnits()`, `history(limit?)`, `readFile(path, oid?)`, `snapshotParams(note?)`, `sync()`. Snapshots follow the host's vehicle-identity rules (user override, SITL separation). Credential management and restore are host-owned and NOT exposed.
- `host.vehicleIdentity` - which vehicle the app currently attributes work to: `get()` and `subscribe(listener)`. Null while disconnected or unidentified.
- `host.events` - host lifecycle events. Currently `onParamsFlashed(listener)`, fired after parameters were successfully written to flash. Returns an unsubscribe function.
- `host.params.propose(changes, reason)` - show parameter writes in the host's review dialog; the pilot applies or declines and the host writes. Resolves with what was applied, failed and rejected (unknown, read-only or protected parameters). `params.set(name, value)` goes through the same dialog for a single change and rejects if the pilot declines. A module never writes parameters silently.
- `host.i18n` - `addResources({ en: {...}, de: {...} })` registers your module's strings, `t(key, vars)` translates them in the app's current language (with `{{placeholders}}` and `_one`/`_other` plurals), `language()` returns the active code. Every user-visible string in a module goes through it.
- `host.config.registerCard({ id, slot, order?, component })` - add a card to an existing configuration screen. Slots: `notify` (Sensors, Status LED), `gps` (Sensors, below the GPS wiring card), `hardware` (Sensors, Hardware tab).
- `host.hardware` - `registerProducts(products)` adds your product catalog (vendor, official name, kit, category, image, docs link, and a `match` on DroneCAN node name with optional trailing `*`, or APJ board id). Matches show in the Hardware tab and on DroneCAN node cards. `match.usb` ({ vendorId, productId, manufacturer }) recognises USB serial devices in the connection panel's port list; give `manufacturer` for shared bridge chips such as CP210x. `registerBoardPorts(apjBoardId, [{ serial, label, note? }])` names an autopilot's connectors in the Serial Ports tab. `getDetected()` / `subscribe()` return what the host detects, with matches from every loaded module.
- `host.dronecan` - DroneCAN nodes through the flight controller (ArduPilot only). `acquire()` keeps the bus monitored until you call the returned release function. `getNodes()`, `subscribe()`, `listParams(nodeId)` read. `getBusStats()` returns the bus health from the FC's CAN statistics (`healthy`, `no-ack`, `bus-off`, `rx-errors`, `idle`, plus bitrate and counter changes). `proposeParams(nodeId, changes, { reason, saveByDefault })` shows the writes in the host's DroneCAN review dialog; the pilot applies (optionally saving on the node) or cancels, and the host writes. `proposeParams` and `restartNode` need the `dronecan` permission.
- `host.dronecan.registerNodeProfile({ id, match, panel?, params? })` - teach the DroneCAN tab about your nodes. `match` is the GetNodeInfo name (trailing `*` matches a prefix). `panel` renders above the node's parameter table and gets `{ nodeId }`. `params()` returns docs per parameter (`displayName`, `description`, `values`, `units`, `min`, `max`, `rebootRequired`, `danger`) that override the host's AP_Periph docs; it runs on render, so use `host.i18n.t` inside it.
- `host.firmware` - `registerSource({ id, name, component })` adds a source button on the Firmware screen; your component fetches a file (usually via your main process) and hands it over with `useFile(path)`. The pilot still selects the port and presses Flash. `getDetectedBoard()` returns the board the Firmware screen detected.
- `host.vehicleTemplates.register({ slug, name, description, vehicleType, category, defaults?, params(profile), simParams? })` - add a template (for example a kit) to the vehicle profile template picker. Prefix the slug with your module slug; built-in slugs cannot be replaced.

Everything registered through these is removed when the module unloads or reloads.

- `host.views` - `register({ viewId, component })` fills a nav view. Either a built-in view your cargo unlocks (see "Gating built-in features"), or a cargo-owned view such as `production`: the host shows its rail entry only while a cargo holding the matching permission has registered it, so these load from a dev folder like any cargo.
- `host.production` - production line station (requires the `production` permission; records go to the Fleet Vault, so pair it with `vault` and `requires: ["com.ardudeck.vault"]`). Every USB autopilot becomes a **bay** with its own MAVLink link, so boards are worked in parallel: `startBays()`/`stopBays()`/`isStationRunning()`, `getBays()`/`subscribeBays()`, `addSimulatorBay(endpoint)`, `removeBay(id, ignore?)`, `setBayModel()`/`setModelForAllBays()`; models via `listModels()`, `captureGolden({ bayId } | 'connected', name)`, `updateRules()`, `attachFirmware()`; per bay `prepare()` (flash if the firmware differs, wipe to defaults, write the golden through reboots until it matches), `flash()`, `resetToDefaults()`, `reboot()`, `startCalibration()`/`confirmCalibrationPosition()`/`cancelCalibration()`, `runQa()`, `submit()`; `armModel()` approves a golden for the session (required for `autoPrepare`); `listRuns()`, `onRecordsChanged()`, `openHostView()`. The host writes a golden only behind its own consent dialog (never calibration, sensor ids or runtime counters), judges QA itself and writes the birth certificate on a pass, so a module drives the flow but cannot forge a result. QA checks carry stable `code` values (`calNeedsReboot`, `configDiffers`, ...) for the module to translate.

### Example: a vendor hardware cargo

```ts
export function activate(host: RendererHostApi) {
  host.hardware.registerProducts([
    { id: 'led', vendor: 'Example', name: 'Status Light', category: 'lighting', kit: 'Nav Kit',
      docsUrl: 'https://example.com/led', match: { dronecanNodeName: 'com.example.led*' } },
  ]);
  host.config.registerCard({ id: 'led', slot: 'notify', component: LedCard });
}

function LedCard() {
  // Inside the card: const release = host.dronecan.acquire(); then listParams and proposeParams
  // on the node whose name matches (the pilot reviews every write), and release() on unmount.
  return null;
}
```

## Permissions

Declare what your module needs in `module.json`:

- `pty` - Spawn PTY sessions (e.g., for CLI tools like `claude`)
- `filesystem` - Reserved for future use (currently all modules get a scoped data dir)
- `network` - Reserved for future use
- `vault` - Fleet Vault access via `host.vault` (read history, take snapshots, trigger sync)
- `production` - production line station via `host.production` (see Host API)
- `dronecan` - propose DroneCAN node parameter writes (always reviewed by the pilot) and restart nodes via `host.dronecan` (reading needs no permission)

Permissions are enforced by the host at runtime.

## Gating built-in features (activatable pattern)

A cargo can unlock features whose code ships inside the app instead of (or in addition to) bundling its own UI. The host keeps a capability map (`CAPABILITIES` in the app's `modules/capabilities.ts`) from cargo slug to what it gates:

- a whole nav-rail view (`viewId`)
- built-in fighter-HUD widget ids (`hudWidgets`)
- built-in text-OSD element ids (`osdElements`)
- arbitrary embedded surfaces - components consult `useCargoEnabled(slug)` themselves (the Fleet Vault's sync badges and auto-backup chips are the reference)

While the gating cargo is installed and enabled, everything it gates appears; uninstalling or toggling the cargo off hides it all. The gate reacts to the Cargo Bay enable/disable switch live, no restart. The reference cargo is `com.ardudeck.vault`: installing it adds the Fleet Vault view, the backup badges on the parameter/mission/area screens, and its own dock panel.
