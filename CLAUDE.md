  This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

  # ArduDeck - Mission Planner Modernization Project

  ## Project Overview
  Modernizing ArduPilot's Mission Planner ground control station from legacy C#/.NET WinForms to a cross-platform solution using Electron (desktop) and Flutter (mobile).

  ## Project Context

  | Component | Location | Stack |
  |-----------|----------|-------|
  | Legacy Reference | `/MissionPlanner/` | C# .NET WinForms (read-only) |
  | Desktop App | `/apps/desktop/` | Electron + React 18 + TypeScript + Vite |
  | Mobile App | `/apps/mobile/` | Flutter (Dart) - planned |
  | MAVLink Library | `/packages/mavlink-ts/` | TypeScript |
  | MSP Library | `/packages/msp-ts/` | TypeScript (Betaflight/iNav) |
  | Comms Library | `/packages/comms/` | TypeScript (Serial/TCP/UDP) |
  | STM32 DFU Library | `/packages/stm32-dfu/` | TypeScript (USB DFU) |
  | MAVLink Generator | `/tools/mavlink-generator/` | TypeScript |

  **Key Reference:** [BlueRobotics Cockpit](https://github.com/bluerobotics/cockpit) - study their MAVLink TypeScript implementation.

  ---

  ## BSOD Prevention - COMPLETE (2026-01-03)

  **Status:** ✅ COMPLETE - All driver stress mitigations implemented and verified

  ### Original Problem
  Windows BSOD (`0x0000000A` - IRQL_NOT_LESS_OR_EQUAL) during:
  1. Firmware flashing (fixed in Phase 1)
  2. Active telemetry during flight (fixed in Phase 2)
  3. Rapid reconnection cycles (fixed in Phase 2)

  ### Root Cause
  Aggressive polling, buffer allocation in hot loops, and missing request deduplication were overloading USB-serial drivers (CH340, CP210x, FTDI), causing IRQ conflicts and BSOD.

  ### Phase 1 Fixes - Firmware Flashing

  | File | Fix | Impact |
  |------|-----|--------|
  | `stm32-serial-flasher.ts` | Poll 5ms→25ms, delays 500/200ms→1000/1000ms | Reduces serial driver stress |
  | `dfu-protocol.ts` | 20ms delay after USB control transfers | Prevents USB driver overload |
  | `serial-transport.ts` | Drain before close, 100ms settling | Graceful shutdown |
  | `flash-guard.ts` | Mutex preventing concurrent operations | Prevents driver conflicts |

  ### Phase 2 Fixes - Telemetry & Reconnection

  | File | Fix | Impact |
  |------|-----|--------|
  | `ipc-handlers.ts` | Event listener cleanup on disconnect | Prevents handler accumulation |
  | `ipc-handlers.ts` | 500ms reconnection delay | Driver release time |
  | `ipc-handlers.ts` | MAVLink backpressure with setImmediate | Prevents event loop starvation |
  | `mavlink-parser.ts` | Pre-allocated 4KB buffer, copyWithin() | Eliminates GC pressure |
  | `msp-handlers.ts` | telemetryInProgress flag, 10ms inter-command delay | Prevents request stacking |
  | `modes-wizard-store.ts` | rcPollPending deduplication | Prevents frontend spam |
  | `serial-transport.ts` | removeAllListeners() on error | Cleans zombie handlers |

  ### Defense-in-Depth Architecture
  - **Lock mechanism**: Flash lock prevents concurrent USB operations
  - **Request deduplication**: MSP/MAVLink telemetry skips if previous running
  - **Driver settling time**: 100ms-1000ms delays between critical operations
  - **Proper cleanup**: Event listeners removed, intervals cleared, ports drained
  - **Buffer optimization**: No allocations in hot paths (pre-allocated buffers)

  ---

  ## NPM-Publishable Packages

  These packages are designed as standalone libraries that could be published to npm:

  | Package | npm Name | Description | Status |
  |---------|----------|-------------|--------|
  | `packages/mavlink-ts/` | `@ardudeck/mavlink-ts` | Full MAVLink v1/v2 protocol parser, 352 messages, async generator API | Ready |
  | `packages/msp-ts/` | `@ardudeck/msp-ts` | MSP v1/v2 protocol for Betaflight/iNav/Cleanflight, telemetry + config | Ready |
  | `packages/comms/` | `@ardudeck/comms` | Transport abstraction (Serial/TCP/UDP), port scanner | Ready |
  | `packages/stm32-dfu/` | `@ardudeck/stm32-dfu` | Native STM32 DFU flashing via libusb, cross-platform | Planned |

  **Publishing checklist:**
  - [ ] Add README.md with API docs
  - [ ] Add LICENSE file
  - [ ] Add repository/homepage to package.json
  - [ ] Version bump and changelog
  - [ ] `npm publish --access public`

  ## Build Commands

  ```bash
  pnpm install                    # Install dependencies
  pnpm build                      # Build all packages
  pnpm dev                        # Run dev mode

  # Specific builds
  pnpm --filter @ardudeck/mavlink-ts build
  pnpm --filter @ardudeck/mavlink-generator build
  node tools/mavlink-generator/dist/index.js  # Generate MAVLink types

  Assets

  - Icons: apps/desktop/resources/ - icon.ico, icon.icns, icon.png, logo.png
  - UI Assets: apps/desktop/src/renderer/assets/ - icon.png (32px), logo.png (192px)
  - Generate icons: npx png2icons resources/logo.png resources/icon -allwe

  ---
  Implementation Status

  Completed Epics

  | Epic                | Description                                                   | Key Packages/Files                                |
  |---------------------|---------------------------------------------------------------|---------------------------------------------------|
  | 1. Foundation       | Monorepo, MAVLink parser, comms layer, Electron shell         | packages/mavlink-ts/, packages/comms/             |
  | 2. Telemetry        | Real-time telemetry display, attitude indicator, GPS, battery | stores/telemetry-store.ts, TelemetryDashboard.tsx |
  | 2.5. Dashboard      | Dockable panels with dockview-react, layout persistence       | stores/layout-store.ts, components/panels/        |
  | 2.6. Map            | Leaflet map with vehicle tracking, layers, overlays           | MapPanel.tsx                                      |
  | 3. Parameters       | Full parameter management with metadata, validation, file ops | stores/parameter-store.ts, ParametersView.tsx     |
  | 4. Mission          | Mission planning with waypoints, splines, terrain profile     | stores/mission-store.ts, MissionMapPanel.tsx      |
  | 4.5. Settings       | Vehicle profiles, weather widget, performance estimates       | stores/settings-store.ts, SettingsView.tsx        |
  | 4.7. Geofence/Rally | Geofence polygons/circles, rally points                       | stores/fence-store.ts, stores/rally-store.ts      |
  | 8. CLI Terminal     | xterm.js terminal, autocomplete, legacy board GUI             | stores/cli-store.ts, components/cli/              |

  Key Features Implemented

  - Connection: Serial/TCP/UDP with heartbeat validation, MAVLink v1/v2 auto-detection, MSP for Betaflight/iNav
  - Telemetry: Attitude, altitude, speed, battery, GPS with dockable panel layout
  - Parameters: Auto-load from FC, ~600 fallback descriptions, range/enum validation, flash write
  - MSP Config: Betaflight/iNav PID tuning with presets, rate curves, mode visualization, custom profile saving
  - Legacy Boards: Full GUI for F3-era boards (iNav < 2.1, Betaflight < 4.0) via CLI commands with reboot overlay
  - CLI Terminal: xterm.js terminal with ANSI colors, autocomplete from `dump`, command history, save/reboot handling
  - Mission: Waypoint CRUD, spline curves, terrain-aware altitude profile, drag-to-edit (MAVLink/iNav only)
  - Geofencing: Inclusion/exclusion polygons and circles, return point
  - Rally Points: Emergency landing locations with full editing
  - Settings: Vehicle profiles with mm/inches frame size toggle, weather widget with IP geolocation fallback

  In Progress / Future

  | Epic | Description | Priority | Status |
  |------|-------------|----------|--------|
  | 5. Firmware Flash | Flash ArduPilot/PX4/Betaflight firmware | - | ✅ Complete |
  | 6. Calibration | Compass, accelerometer, radio, ESC calibration wizards | P1 | Next up |
  | 7. OSD Configuration | OSD element editor for Betaflight/iNav | P0 | Planned |
  | 8. CLI Terminal | Raw CLI access for power users | - | ✅ Complete |
  | 9. VTX Configuration | Video transmitter band/channel/power | P1 | Planned |
  | 10. MSP Failsafe | Betaflight/iNav failsafe config (extend SafetyTab) | P1 | Planned |
  | 11. GPS Rescue | Betaflight 4.6 GPS rescue/position hold config | P1 | Planned |
  | 12. LED Strip | LED function/color configuration | P2 | Planned |
  | 13. Blackbox | Log download and basic viewer | P2 | Planned |
  | 14. Setup Wizards | Vehicle setup, frame config, motor test | P2 | Planned |
  | 15. PIFF Tuning | iNav position controller (not PID) | P3 | Planned |
  | 16. Programming | iNav logic conditions framework | P3 | Planned |
  | 17. Mobile App | Flutter mobile GCS | P4 | Planned |
  | 18. Production | Auto-updater, crash reporting | P4 | Planned |

  **Priority Legend:** P0 = Must have (90%+ users expect), P1 = High, P2 = Medium, P3 = Low, P4 = Future

  ---
  Critical Technical Notes

  MAVLink v2 Payload Byte Order

  MAVLink v2 orders payload fields by SIZE (largest first), NOT declaration order!

  HEARTBEAT wire order: custom_mode(4), type(1), autopilot(1), base_mode(1), ...
  VFR_HUD wire order: airspeed(4), groundspeed(4), alt(4), climb(4), heading(2), throttle(2)

  MAVLink v1 with v2 Byte Order (ArduPilot quirk)

  ArduPilot uses v2 byte order even with v1 packet framing! Affects:
  - MISSION_COUNT (44), MISSION_REQUEST (40), MISSION_REQUEST_INT (51), MISSION_SET_CURRENT (41)

  Detection strategy:
  const looksLikeV2Order = (payload[2] === 0xFF && payload[3] === 0xBE) || countAtOffset2 > 1000;

  MAVLink Messages Reference

  | Category    | Messages                                                                                         |
  |-------------|--------------------------------------------------------------------------------------------------|
  | Telemetry   | HEARTBEAT(0), SYS_STATUS(1), GPS_RAW_INT(24), ATTITUDE(30), GLOBAL_POSITION_INT(33), VFR_HUD(74) |
  | Parameters  | PARAM_REQUEST_LIST(21), PARAM_VALUE(22), PARAM_SET(23), COMMAND_LONG(76)                         |
  | Mission     | MISSION_REQUEST_LIST(43), MISSION_COUNT(44), MISSION_ITEM_INT(73), MISSION_ACK(47)               |
  | Fence/Rally | Same as mission with mission_type=1 (fence) or 2 (rally)                                         |

  Parameter Metadata URLs

  https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml
  https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml
  https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.xml
  https://autotest.ardupilot.org/Parameters/ArduSub/apm.pdef.xml

  Map Layers (No API Keys)

  | Layer     | URL                                                                                           |
  |-----------|-----------------------------------------------------------------------------------------------|
  | Street    | https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png                                            |
  | Satellite | https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x} |
  | Terrain   | https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png                                              |
  | Dark      | https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png                                 |

  Terrain API

  Open-Meteo Elevation API (free, no key): renderer/utils/elevation-api.ts

### MSP Protocol - iNav Rate Profile

**CRITICAL:** iNav and Betaflight use DIFFERENT MSP commands and byte formats for rates!

**iNav Rate Commands (MSP2):**
- Read: `INAV_RATE_PROFILE` (0x2007) - 15 bytes
- Write: `INAV_SET_RATE_PROFILE` (0x2008) - 15 bytes

**iNav Rate Profile Format (15 bytes):**
```
Throttle (5 bytes): throttleMid, throttleExpo, dynThrPID, tpaBreakpoint(2)
Stabilized (5 bytes): rcExpo, rcYawExpo, rollRate/10, pitchRate/10, yawRate/10
Manual (5 bytes): manualRcExpo, manualRcYawExpo, manualRollRate, manualPitchRate, manualYawRate
```

**Key iNav Differences:**
- Rates stored as value÷10 (so 40°/s = 4 on wire, multiply by 10 when reading)
- `rcExpo` is SHARED for Roll AND Pitch (no separate pitch expo)
- `rcRate` is FIXED at 100 (not configurable)
- Roll and Pitch rates ARE separate (unlike old combined `rollPitchRate`)

**Betaflight Rate Commands (MSP1):**
- Read: `MSP_RC_TUNING` (111) - 17+ bytes
- Write: `MSP_SET_RC_TUNING` (204) - 17+ bytes

**DO NOT MIX:** Using MSP1 write with MSP2 read will corrupt values due to different byte layouts!

  ---
  Key File Reference

  Core

  | File                                           | Purpose               |
  |------------------------------------------------|-----------------------|
  | packages/mavlink-ts/src/core/mavlink-parser.ts | MAVLink packet parser |
  | packages/comms/src/interfaces/transport.ts     | Transport interface   |
  | apps/desktop/src/main/ipc-handlers.ts          | All IPC handlers      |
  | apps/desktop/src/main/preload.ts               | Renderer API          |

  Stores (Zustand)

  | File                          | Purpose                               |
  |-------------------------------|---------------------------------------|
  | stores/telemetry-store.ts     | Vehicle telemetry state               |
  | stores/parameter-store.ts     | FC parameters                         |
  | stores/mission-store.ts       | Mission waypoints                     |
  | stores/fence-store.ts         | Geofence polygons/circles             |
  | stores/rally-store.ts         | Rally points                          |
  | stores/settings-store.ts      | App settings, vehicle profiles        |
  | stores/layout-store.ts        | Dockview panel layouts                |
  | stores/navigation-store.ts    | View switching                        |
  | stores/edit-mode-store.ts     | Mission/geofence/rally mode           |
  | stores/firmware-store.ts      | Firmware flash state, board detection |
  | stores/msp-telemetry-store.ts | MSP telemetry state (Betaflight/iNav) |
  | stores/legacy-config-store.ts | Legacy board CLI config (F3 boards)   |
  | stores/cli-store.ts           | CLI terminal state, history           |

  Shared Types

  | File                      | Purpose                                    |
  |---------------------------|--------------------------------------------|
  | shared/telemetry-types.ts | FlightState, AttitudeData, GpsData, etc.   |
  | shared/parameter-types.ts | Parameter, fallback descriptions           |
  | shared/mission-types.ts   | MissionItem, MAV_CMD, MAV_FRAME            |
  | shared/fence-types.ts     | FenceItem, PolygonFence, CircleFence       |
  | shared/rally-types.ts     | RallyPoint, RALLY_FLAGS                    |
  | shared/ipc-channels.ts    | IPC channel constants, schemas             |
  | shared/firmware-types.ts  | DetectedBoard, FirmwareVersion, FlashState |
  | shared/board-ids.ts       | ArduPilot board ID mappings (150+ boards)  |

  Key Components

  | File                                          | Purpose                                                 |
  |-----------------------------------------------|---------------------------------------------------------|
  | components/panels/AttitudePanel.tsx           | Scalable attitude indicator (exportable)                |
  | components/panels/MapPanel.tsx                | Telemetry map with overlays                             |
  | components/mission/MissionMapPanel.tsx        | Mission planning map                                    |
  | components/mission/AltitudeProfilePanel.tsx   | Terrain-aware altitude chart                            |
  | components/parameters/ParametersView.tsx      | Parameter table UI                                      |
  | components/settings/SettingsView.tsx          | Settings with vehicle profiles                          |
  | components/firmware/FirmwareFlashView.tsx     | Firmware flash UI with vehicle/board pickers            |
  | components/firmware/BoardPicker.tsx           | Searchable board dropdown with categories               |
  | components/parameters/MspConfigView.tsx       | Betaflight/iNav PID/Rates/Modes configuration           |
  | components/telemetry/TelemetryDashboard.tsx   | Dockable telemetry panels with protocol-aware filtering |
  | components/betaflight/BetaflightDashboard.tsx | MSP telemetry dashboard for Betaflight/iNav             |
  | components/legacy-config/LegacyConfigView.tsx | Legacy F3 board configuration (CLI-powered GUI)         |
  | components/cli/CliTerminal.tsx                | xterm.js CLI terminal with autocomplete                 |
  | components/cli/CliView.tsx                    | Dedicated CLI sidebar view                              |
  | components/ui/DraggableSlider.tsx             | Reusable slider with drag support (use for ALL sliders) |
  | main/msp/msp-handlers.ts                      | MSP IPC handlers for telemetry and config               |
  | main/cli/cli-handlers.ts                      | CLI IPC handlers for raw serial communication           |

  ### UI Components - Sliders

  **IMPORTANT:** Always use `DraggableSlider` or `CompactSlider` from `components/ui/DraggableSlider.tsx` for slider controls.

  **DO NOT** create inline slider components with `onClick` on the track - they won't support dragging!

  | Component | Use Case | Features |
  |-----------|----------|----------|
  | `DraggableSlider` | PID tuning, rates, general config | Label, hint, +/- buttons, number input, drag support |
  | `CompactSlider` | Servo endpoints, space-constrained UIs | Smaller controls, drag support, visible thumb |

  **Usage:**
  ```tsx
  import { DraggableSlider, CompactSlider } from '../ui/DraggableSlider';

  // Full-featured slider
  <DraggableSlider
    label="P - Proportional"
    hint="Responsiveness to stick input"
    value={pid.roll.p}
    onChange={(v) => handleChange('p', v)}
    color="#EF4444"
    min={0}
    max={200}
  />

  // Compact slider for servo controls
  <CompactSlider
    label="Minimum"
    value={servo.min}
    onChange={(v) => handleChange({ ...servo, min: v })}
    min={750}
    max={2250}
    step={10}
    color={color}
  />
  ```

  **Key features:**
  - Pointer events for touch + mouse support
  - Real-time value updates while dragging (not just on release)
  - Visible thumb handle on all sliders
  - `setPointerCapture()` for reliable drag behavior

  ---
  MSP Protocol Support (Betaflight/iNav)

  Full MSP v1/v2 protocol support for Betaflight and iNav flight controllers.

  Features

  - Auto-detection: Protocol auto-detect (MAVLink vs MSP) on connection
  - Telemetry: Attitude, sensors, RC channels, motor outputs via MSP
  - PID Tuning: Beginner-friendly presets (Beginner/Freestyle/Racing/Cinematic)
  - Rate Curves: Visual rate curve editor with presets
  - Modes Wizard: Step-by-step mode configuration with presets, live RC feedback ✅
  - Servo Wizard: Fixed-wing servo setup with aircraft presets, platform type change (⚠️ HIDDEN - see below)
  - Platform Type Change: Convert multirotor↔airplane via MSP2 + CLI fallback ✅
  - Custom Profiles: Save/load custom PID tunes and rate profiles (localStorage)
  - Protocol-aware UI: Mission planning hidden for Betaflight (not supported)

  MSP Files

  | File                                     | Purpose                                                      |
  |------------------------------------------|--------------------------------------------------------------|
  | packages/msp-ts/                         | MSP v1/v2 parser, message definitions                        |
  | main/msp/msp-handlers.ts                 | MSP IPC handlers (mspGetPid, mspSetRcTuning, mspGetRc, etc.) |
  | components/parameters/MspConfigView.tsx  | PID/Rates/Modes UI with presets                              |
  | components/parameters/ServoMixerTab.tsx  | iNav servo mixer configuration                               |
  | components/parameters/NavigationTab.tsx  | iNav navigation/RTH settings                                 |
  | components/modes/ModesWizard.tsx         | Modes setup wizard modal                                     |
  | components/modes/ModesAdvancedEditor.tsx | Full table editor for modes                                  |
  | stores/modes-wizard-store.ts             | Modes wizard state, RC polling                               |
  | main/firmware/msp-detector.ts            | MSP board detection                                          |
  | components/servo-wizard/ServoWizard.tsx  | Servo setup wizard with platform type change                 |
  | components/servo-wizard/presets/         | Aircraft presets (Traditional, Flying Wing, V-Tail, Delta)   |
  | stores/servo-wizard-store.ts             | Servo wizard state, platform detection                       |

  ### CLI Terminal - ✅ COMPLETE (2026-01-06)

  Full-featured CLI terminal for iNav/Betaflight with autocomplete and reboot handling.

  **Features:**
  - xterm.js terminal with ANSI color support
  - Command history (up/down arrows)
  - Tab autocomplete from `dump` output parsing
  - Automatic `save` command handling with reboot overlay
  - Proper disconnect cleanup (sends `exit` before disconnect)
  - Save/Clear output buttons

  **CLI Terminal Files:**

  | File                                     | Purpose                                                      |
  |------------------------------------------|--------------------------------------------------------------|
  | main/cli/cli-handlers.ts                 | CLI IPC handlers (cliEnterMode, cliSendCommand, cliExitMode) |
  | components/cli/CliTerminal.tsx           | xterm.js terminal with ANSI support                          |
  | components/cli/CliView.tsx               | Dedicated CLI sidebar view with reboot overlay               |
  | components/cli/CliAutocomplete.tsx       | Autocomplete popup with fuzzy matching                       |
  | stores/cli-store.ts                      | CLI state, command history, suggestions, reboot state        |

  **Save Command Flow:**
  1. User types `save` in CLI terminal
  2. `sendCommand()` intercepts and calls `handleSaveCommand()`
  3. Shows "Saving Configuration" overlay
  4. Sends `save` via CLI
  5. Shows "Rebooting Board" with 4-second wait
  6. Disconnects to clean up state
  7. Shows "Save Complete" with dismiss button

  **Disconnect Flow:**
  - `COMMS_DISCONNECT` handler calls `exitCliModeIfActive()`
  - Sends `exit\n` to leave board in MSP mode
  - Cleans up CLI state via `cleanupCli()`

  ### Legacy Board Architecture - COMPLETE (2026-01-06)

  **Status:** ✅ COMPLETE - Clean separation of legacy vs modern boards

  **Philosophy:** "No board left behind" - Old F3-era boards get a **full GUI**, not just CLI access.

  #### The Rule: Legacy Board → CLI Full Mode

  ```
  On MSP Connect → Detect Board Age → Route to Appropriate View

  Legacy Board (iNav < 2.1, Betaflight < 4.0, Cleanflight)
    → LegacyConfigView (Full GUI powered by CLI commands)

  Modern Board (iNav 2.1+, Betaflight 4.0+)
    → MspConfigView (MSP-based configuration)
  ```

  **NO FALLBACK SPAGHETTI:** We do NOT try MSP first then fall back to CLI. Detection happens at connect time and routing is immediate.

  #### Detection Logic (ipc-handlers.ts)

  ```typescript
  function isLegacyMspBoard(fcVariant: string, fcVersion: string): boolean {
    const [major, minor] = fcVersion.split('.').map(Number);
    // iNav < 2.1.0 → Legacy
    if (fcVariant === 'INAV') return major < 2 || (major === 2 && minor < 1);
    // Betaflight < 4.0 → Legacy
    if (fcVariant === 'BTFL') return major < 4;
    // Cleanflight → Legacy
    if (fcVariant === 'CLFL') return true;
    return false;
  }
  ```

  #### Legacy GUI Components

  The legacy config view provides the **same GUI experience** as modern boards, but powered by CLI commands under the hood:

  | Component | CLI Commands Used |
  |-----------|-------------------|
  | LegacyPidTab | `set p_roll = X`, `set i_roll = X`, etc. |
  | LegacyRatesTab | `set rc_rate = X`, `set rc_expo = X`, etc. |
  | LegacyMixerTab | `mmix <idx> <throttle> <roll> <pitch> <yaw>`, `smix` |
  | LegacyServoTab | `servo <idx> <min> <max> <mid> <rate>` |
  | LegacyModesTab | `aux <idx> <mode> <channel> <start> <end> <logic>` |

  #### CLI Commands That Work on F3

  Tested and verified on iNav 2.0.0 (SPRacing F3):
  - `dump` - Get full config (parsed for autocomplete)
  - `set <name> = <value>` - Set any parameter
  - `mmix <idx> <t> <r> <p> <y>` - Motor mixer
  - `smix <idx> ...` - Servo mixer
  - `servo <idx> <min> <max> <mid> <rate>` - Servo endpoints
  - `aux <idx> <mode> <ch> <start> <end> <logic>` - Flight modes
  - `save` - Write to EEPROM and reboot

  **Line endings:** Use `\n` only (NOT `\r\n` - causes parse errors!)

  #### Implementation Files

  | File | Purpose |
  |------|---------|
  | `shared/ipc-channels.ts` | `isLegacyBoard` field in ConnectionState |
  | `main/ipc-handlers.ts` | `isLegacyMspBoard()` detection helper |
  | `stores/legacy-config-store.ts` | Parses CLI dump, stores config state |
  | `components/legacy-config/LegacyConfigView.tsx` | Main view with tabs |
  | `components/legacy-config/LegacyPidTab.tsx` | PID sliders/inputs |
  | `components/legacy-config/LegacyRatesTab.tsx` | Rate/expo config |
  | `components/legacy-config/LegacyMixerTab.tsx` | Motor/servo mixer editor |
  | `components/legacy-config/LegacyServoTab.tsx` | Servo endpoint tuning |
  | `components/legacy-config/LegacyModesTab.tsx` | Flight mode assignment |
  | `components/parameters/ParametersView.tsx` | Routes legacy vs modern |

  #### Supported Legacy Boards

  - SPRacing F3 / F3 EVO / F3 Mini / F3 Neo (iNav 2.0.0)
  - Naze32 Rev6
  - CC3D (with iNav)
  - Flip32 F3
  - Any F3-era board running iNav < 2.1 or Betaflight < 4.0

  #### CLI PID Parameter Names (Platform-Specific)

  **CRITICAL:** iNav uses platform-specific parameter names for PIDs!

  | Platform | P | I | D/FF | Level |
  |----------|---|---|------|-------|
  | Multirotor | `mc_p_roll` | `mc_i_roll` | `mc_d_roll` | `mc_p_level`, `mc_i_level`, `mc_d_level` |
  | Airplane | `fw_p_roll` | `fw_i_roll` | `fw_ff_roll` | `fw_p_level`, `fw_i_level`, `fw_d_level` |

  **Key differences:**
  - Multirotor uses `d` (derivative) term
  - Airplane uses `ff` (feedforward) term instead of `d`
  - Level PIDs use `d` for both platforms
  - Platform type detected from `platform_type` parameter in dump

  **Implementation:** `legacy-config-store.ts` and `LegacyPidTab.tsx` detect platform and use correct parameter names.

  #### ⚠️ Known Issues - Legacy Boards

  The following features are **NOT WORKING** for legacy boards:

  | Issue | Description | Workaround |
  |-------|-------------|------------|
  | **Modes don't fetch** | `aux` commands not parsed correctly from dump | Use CLI terminal directly |
  | **Can't add modes** | No UI to add new aux mode assignments | Use CLI: `aux <idx> <mode> <ch> <start> <end> <logic>` |
  | **Can't add mixers** | No UI to add motor/servo mixer entries | Use CLI: `mmix` or `smix` commands |

  **Root cause:** The dump parser extracts existing config but the UI doesn't support creating new entries. This requires implementing "add" buttons with empty entry creation.

  **Planned fix:** Add "+" buttons to modes/mixer tabs that create new entries with default values.

  ---

  iNav Config Tabs (MspConfigView)

  The iNav configuration view now has separated tabs for clearer concept separation:
  - **PID Tuning**: Flight response tuning with presets
  - **Rates**: Stick sensitivity and response curves
  - **Modes**: Flight mode switch assignments
  - **Servo Tuning**: Endpoint calibration with visual position bars
  - **Servo Mixer**: Control surface mixing rules (aileron, elevon, v-tail, etc.)
  - **Motor Mixer**: Custom motor layouts (placeholder - coming soon)
  - **Navigation**: RTH altitude, nav speeds, GPS config, landing settings
  - **Sensors**: Hardware status

  ### Servo Wizard Status - HIDDEN (2026-01-06)

  **Current Status:** The Servo Wizard is temporarily hidden from the UI. The separate Servo Tuning and Servo Mixer tabs replace its functionality.

  **Reason:** The wizard flow was unstable with various edge cases on different iNav versions. The separated tabs provide more reliable functionality.

  **Future Plan:** After all separated concepts are stabilized, the wizard will return as a modal dialog for guided first-time setup.

  **What still works:**
  - Servo Tuning tab auto-defaults to "traditional" preset if no aircraft type detected
  - Servo configs are read from FC and applied to tuning cards
  - Servo Mixer tab provides full mixing rule configuration
  - Platform type change still available via iNav Configurator CLI

  **Implementation Files:**
  | File | Purpose |
  |------|---------|
  | `components/parameters/ServoTuningTab.tsx` | Standalone servo tuning wrapper |
  | `components/parameters/ServoMixerTab.tsx` | Servo mixer configuration |
  | `components/parameters/MotorMixerTab.tsx` | Motor mixer placeholder |
  | `stores/servo-wizard-store.ts` | Servo state (reused by ServoTuningTab) |

  ### iNav Platform Type Change - COMPLETE (2026-01-04)

  **Problem solved:** Servo wizard can now change quad boards to airplane mode on iNav.

  **Key insight:** iNav uses `platformType` (not mixer type!) via `MSP2_INAV_SET_MIXER` (0x2011).

  #### Platform Types (from iNav Configurator)
  ```
  PLATFORM_TYPE.MULTIROTOR = 0
  PLATFORM_TYPE.AIRPLANE = 1
  PLATFORM_TYPE.HELICOPTER = 2
  PLATFORM_TYPE.TRICOPTER = 3
  PLATFORM_TYPE.ROVER = 4
  PLATFORM_TYPE.BOAT = 5
  ```

  #### MSP2_INAV_MIXER (0x2010) - Read Format
  ```
  Byte 0: yawMotorDirection (int8)
  Byte 1: yawJumpPreventionLimit (uint8)
  Byte 2: motorStopOnLow (uint8)
  Byte 3: platformType (int8)     <-- THE KEY FIELD
  Byte 4: hasFlaps (int8)
  Byte 5-6: appliedMixerPreset (int16 LE)
  Byte 7: numberOfMotors (int8)
  Byte 8: numberOfServos (int8)
  ```

  #### Implementation Files
  | File | Purpose |
  |------|---------|
  | `packages/msp-ts/src/core/constants.ts` | MSP2.INAV_MIXER, INAV_SET_MIXER, INAV_PLATFORM_TYPE |
  | `packages/msp-ts/src/messages/config.ts` | MSPInavMixerConfig interface, serializers |
  | `main/msp/msp-handlers.ts` | getInavMixerConfig(), setInavPlatformType(), setPlatformViaCli() |
  | `components/servo-wizard/ServoWizard.tsx` | "Configure as Airplane" button |
  | `components/servo-wizard/presets/servo-presets.ts` | PLATFORM_TYPE constant, preset platformType values |
  | `stores/servo-wizard-store.ts` | checkServoSupport(), selectAircraftType() |

  #### CLI Fallback for iNav 2.0.0
  Old iNav (2.0.0) may not support MSP2. CLI fallback sends:
  ```
  #                              (enter CLI mode)
  set platform_type = AIRPLANE   (for newer iNav)
  mixer AIRPLANE                 (for old iNav 2.0.0)
  save                           (reboots board)
  ```

  #### BSOD Prevention in Platform Change
  - Config lock pauses telemetry during MSP2 commands
  - CLI commands have 200-500ms delays between writes
  - Connection cleanup after board reboot
  - Transport guards prevent operations on closed connections

  ### iNav CLI Servo Config Fallback - ⚠️ DEPRECATED (2026-01-06)

  **DEPRECATED:** This approach is replaced by the **Legacy Board Architecture** above. Legacy boards now use `LegacyConfigView` exclusively - no fallback logic needed.

  <details>
  <summary>Old documentation (kept for reference)</summary>

  **Problem solved:** Servo wizard now works on old iNav 2.0.0 boards where `MSP_SET_SERVO_CONFIGURATION` (212) is not supported.

  #### Detection Flow
  1. On servo wizard open, `probeServoConfigMode()` is called
  2. Reads current servo 0 config via MSP
  3. Tries to write it back unchanged via `MSP_SET_SERVO_CONFIGURATION` (212)
  4. If fails with "not supported" or timeout → `usesCliServoFallback = true`
  5. UI adjusts servo range limits accordingly

  #### Servo Range Limits
  | Board Type | Min | Max | Reason |
  |------------|-----|-----|--------|
  | Modern iNav (2.1+) | 500 | 2500 | Defined in `servo.h` as `SERVO_OUTPUT_MIN/MAX` |
  | Old iNav (2.0.0) | 750 | 2250 | CLI `servo` command rejects values outside this range |

  #### CLI Servo Command Format (iNav 2.0.0)
  ```
  servo <index> <min> <max> <mid> <rate>
  ```
  - Only 5 parameters (NOT 6 like modern iNav)
  - No `forward_from_channel` parameter
  - Values outside 750-2250 cause "Parse error"

  #### CLI Mode Flow
  ```
  #                           → Enter CLI mode (0x23)
  servo 0 1000 2000 1500 100  → Set servo 0 endpoints
  servo 1 1000 2000 1500 100  → Set servo 1 endpoints
  ...
  save                        → Save to EEPROM and reboot
  ```

  #### Critical Implementation Details
  - **Line endings:** Use `\n` only (NOT `\r\n` - causes parse errors!)
  - **CLI mode blocking:** Set `servoCliModeActive = true` BEFORE entering CLI to block all MSP requests
  - **Response capture:** Add persistent `data` listener to accumulate CLI responses
  - **Timing:** 500ms after `#`, 300ms after each command, 500ms before `save`
  - **Cleanup:** Remove CLI listener, call `cleanupMspConnection()` after board reboots

  #### State Variables (msp-handlers.ts)
  ```typescript
  let servoCliModeActive = false;      // Blocks MSP requests during CLI mode
  let usesCliServoFallback = false;    // True if MSP 212 not supported
  let servoConfigModeProbed = false;   // Only probe once per connection
  let cliResponse = '';                // Accumulates CLI output
  let cliResponseListener = null;      // Data listener for CLI responses
  ```

  #### Implementation Files
  | File | Purpose |
  |------|---------|
  | `main/msp/msp-handlers.ts` | `probeServoConfigMode()`, `setServoConfigViaCli()`, `saveServoConfigViaCli()` |
  | `stores/servo-wizard-store.ts` | `servoRangeLimits`, `usesCliFallback` state, skips MSP2 mixer when CLI mode |
  | `components/servo-wizard/tuning/ServoTuningCard.tsx` | `rangeLimits` prop for dynamic slider limits |
  | `components/servo-wizard/tuning/ServoTuningView.tsx` | Warning banner for old iNav |
  | `shared/ipc-channels.ts` | `MSP_GET_SERVO_CONFIG_MODE` channel |
  | `main/preload.ts` | `mspGetServoConfigMode()` API |

  </details>

  ### MSP PID/Rates CLI Fallback - ⚠️ DEPRECATED (2026-01-06)

  **DEPRECATED:** This approach is replaced by the **Legacy Board Architecture** above. Legacy boards now use `LegacyConfigView` with `LegacyPidTab` and `LegacyRatesTab` - no MSP-first-then-CLI fallback needed.

  <details>
  <summary>Old documentation (kept for reference)</summary>

  **Problem solved:** PID tuning now works on old iNav 2.0.0 boards where `MSP_SET_PID` (202) and `MSP_SET_RC_TUNING` (204) are not supported.

  #### Critical Bug Fixed: Preset Payload Size

  **Symptom:** Sliders worked but presets didn't save - MSP command rejected.

  **Root cause:** PID presets only defined `roll`, `pitch`, `yaw` (9 bytes), but the board expects ALL PID controllers including `altHold`, `posHold`, `level`, `mag`, etc. (30 bytes).

  **Fix:** Presets now **merge** with current PIDs instead of replacing:
  ```typescript
  // WRONG - loses optional PIDs, sends 9 bytes
  setPid(preset.pids);

  // CORRECT - preserves optional PIDs, sends 30 bytes
  setPid({ ...pid, ...preset.pids });
  ```

  **Files fixed:**
  - `MspConfigView.tsx` - `applyPreset()`, `resetToDefaults()`, `loadProfile()` now merge

  #### CLI Tuning Fallback Pattern

  When MSP write commands fail with "not supported", CLI fallback is triggered automatically.

  **State Variables:**
  ```typescript
  let tuningCliModeActive = false;    // Blocks MSP, routes to CLI
  let tuningCliResponse = '';         // Accumulates CLI output
  let tuningCliListener = null;       // Data listener for responses
  ```

  **Flow:**
  1. `setPid()` tries MSP 202 → fails "not supported"
  2. Sets `tuningCliModeActive = true`, enters CLI with `#`
  3. Sends `set p_roll = X`, `set i_roll = X`, etc.
  4. `setRcTuning()` sees `tuningCliModeActive`, skips MSP, uses CLI
  5. `saveEeprom()` sees `tuningCliModeActive`, uses `save` command
  6. Board reboots, flags reset

  **Key difference from servo CLI:** Individual tuning commands do NOT call `save` - only `saveEeprom()` saves at the end. This prevents board rebooting between PID and Rates changes.

  **CLI Parameter Names (iNav 2.0.0):**
  - PIDs: `p_roll`, `i_roll`, `d_roll`, etc. (may not exist on very old boards!)
  - Rates: `rc_rate`, `rc_expo`, `roll_rate`, `pitch_rate`, `yaw_rate`
  - Some old iNav versions have different parameter names - check CLI response for "Invalid name"

  #### Implementation Files
  | File | Changes |
  |------|---------|
  | `main/msp/msp-handlers.ts` | `tuningCliModeActive`, `setPidViaCli()`, `setRcTuningViaCli()`, `setModeRangeViaCli()` |
  | `MspConfigView.tsx` | Preset/profile apply now merges with current PIDs |

  </details>

  ### iNav-Specific TODO (P3)

  | Feature | Description | Complexity |
  |---------|-------------|------------|
  | PIFF Tuning | iNav position controller (different from PID) | Medium |
  | Programming Tab | Logic conditions framework for automation | High |
  | AssistNow GPS | Faster cold start via satellite data | Medium |

  ---
  Epic 5: Firmware Flash

  Flash firmware directly from ArduDeck.

  5.1 Board Detection ✅ COMPLETE

  - Multi-protocol auto-detect: MAVLink → MSP → STM32 bootloader (plug-and-play)
  - USB VID/PID detection: 30+ known boards in KNOWN_BOARDS map
  - MAVLink detection: Queries AUTOPILOT_VERSION for board_version ID
  - MSP detection: Queries Betaflight/iNav/Cleanflight boards via MSP protocol
  - STM32 bootloader: Probes USART bootloader for chip ID
  - Board ID mapping: 150+ ArduPilot boards from board_types.txt
  - Auto-select: Detected board auto-selects in dropdown

  5.2 Manifest & Version Fetching ✅ COMPLETE

  - ArduPilot manifest parsing (firmware.ardupilot.org/manifest.json)
  - Betaflight/iNav curated versions with correct GitHub URLs
  - Version grouping (4.5.x, 4.4.x, etc.) with Latest badge
  - Stable/Beta/Dev filtering
  - File size display in version dropdown

  5.3 Firmware Download ✅ COMPLETE

  - Download .hex/.bin/.apj files from firmware servers
  - Progress tracking with byte counts
  - Caching downloaded firmware (temp directory)
  - Proper file extension handling for HEX parsing

  5.4 Flash Operation ✅ COMPLETE

  - STM32 Serial Bootloader: Full AN3155 protocol implementation
  - Boot Pad Wizard: Step-by-step guide for manual bootloader entry
  - DFU Flashing: Native @ardudeck/stm32-dfu package (no external tools)
  - Firmware Validation: Size check against chip flash capacity
  - Progress & Logging: Real-time progress bar and debug console
  - Polling-based serial communication (reliable ACK handling)
  - Auto-detect already-synced bootloader state

  5.5 F3 Board Support (Legacy)

  F3 boards have limited flash (256KB) and are not supported by modern firmware:
  - Betaflight: 3.5.7 (last version with F3 support)
  - iNav: Varies by board:
    - SPRacing F3/EVO/Mini/Neo: iNav 2.0.0 (dropped in 2.1.0)
    - FrSky F3, Airhero F3: iNav 2.6.1 (last F3 version)
  - Board mappings: shared/board-mappings.ts categorizes F3 boards
  - HEX size conversion: hexToBinarySize() estimates binary from HEX file size

  Firmware Files

  | File                                      | Purpose                                                         |
  |-------------------------------------------|-----------------------------------------------------------------|
  | main/firmware/stm32-serial-flasher.ts     | STM32 USART bootloader flashing (AN3155)                        |
  | main/firmware/dfu-flasher.ts              | Native DFU flashing via stm32-dfu package                       |
  | main/firmware/msp-detector.ts             | MSP protocol detection for Betaflight/iNav                      |
  | main/firmware/stm32-bootloader.ts         | STM32 USART bootloader probe                                    |
  | main/firmware/board-detector.ts           | USB VID/PID board detection                                     |
  | main/firmware/manifest-fetcher.ts         | ArduPilot/Betaflight/iNav manifest parsing, HEX size conversion |
  | main/firmware/firmware-downloader.ts      | Firmware download with caching                                  |
  | packages/stm32-dfu/                       | Native TypeScript STM32 DFU library                             |
  | shared/firmware-types.ts                  | DetectedBoard, FirmwareVersion, FlashState types                |
  | shared/board-ids.ts                       | 150+ board ID mappings from ArduPilot                           |
  | shared/board-mappings.ts                  | F3 board support detection, Betaflight→iNav board mapping       |
  | stores/firmware-store.ts                  | Firmware flash UI state                                         |
  | components/firmware/FirmwareFlashView.tsx | Firmware flash UI with Connect/Auto-detect flow                 |
  | components/firmware/BoardPicker.tsx       | Searchable board dropdown                                       |
  | components/firmware/BootPadWizard.tsx     | Boot pad flash wizard for manual bootloader entry               |

  ### 5.6 Post-Flash Auto-Configuration (iNav) ✅ COMPLETE (2026-01-04)

  When flashing iNav firmware with "Plane" vehicle type selected, ArduDeck automatically configures the board as airplane after flash.

  **Flow:**
  1. User selects Vehicle Type = "Plane" + iNav firmware
  2. Flash completes
  3. Auto-wait 4 seconds for board reboot
  4. Auto-reconnect via MSP
  5. Read platformType via MSP2_INAV_MIXER
  6. If platformType !== AIRPLANE, set via MSP2_INAV_SET_MIXER
  7. Save to EEPROM and reboot

  **BSOD Prevention (CRITICAL):**
  All post-flash operations use conservative delays to prevent driver overload:
  - 4000ms wait after flash for board reboot
  - 1000ms delay after MSP connect before commands
  - 500ms delay after platform type change
  - 1000ms delay after EEPROM save before reboot
  - 500ms delay before disconnect after reboot command

  **Implementation Files:**
  | File | Purpose |
  |------|---------|
  | `stores/firmware-store.ts` | `startPostFlashConfig()` action, postFlashState/Message/Error |
  | `components/firmware/FirmwareFlashView.tsx` | Triggers post-flash config, shows status UI |

  ---
  ## Competitive Feature Gaps

  Based on analysis of Betaflight Configurator, iNav Configurator, Mission Planner, and QGroundControl.

  ### Priority Legend
  - **P0**: Must have - 90%+ of users expect this
  - **P1**: High priority - Major competitive gap
  - **P2**: Medium priority - Nice to have
  - **P3**: Low priority - Niche/advanced features
  - **P4**: Future - Long-term roadmap

  ### Betaflight/iNav Gaps (Largest User Base)

  | Feature | Competitor | Status | Files to Create |
  |---------|------------|--------|-----------------|
  | **OSD Configuration** | Both have full OSD editors | 5% (constants only) | `OsdConfigTab.tsx`, MSP handlers |
  | **CLI Terminal** | Both have CLI access | ✅ COMPLETE | - |
  | **VTX Configuration** | Both have VTX settings | 5% (constants only) | `VtxConfigTab.tsx`, MSP handlers |
  | **GPS Rescue** | Betaflight 4.6 major feature | 0% | `GpsRescueTab.tsx`, MSP handlers |
  | **LED Strip** | Both have LED config | 5% (constants only) | `LedStripTab.tsx`, MSP handlers |
  | **Blackbox Viewer** | Separate app (blackbox.betaflight.com) | 0% | Complex - may defer |
  | **Failsafe (MSP)** | Both have full failsafe config | 60% (MAVLink only) | Extend SafetyTab for MSP |

  ### ArduPilot Gaps (Professional Users)

  | Feature | Mission Planner Has | Status | Notes |
  |---------|---------------------|--------|-------|
  | **Calibration Wizards** | Full wizard suite | Planned | Next major epic |
  | **DataFlash Logs** | Full log viewer | 0% | Very high complexity |
  | **SITL Integration** | Built-in simulator | 0% | Very high complexity |
  | **Remote-ID** | FAA compliant | 0% | Regulatory requirement |

  ### ArduDeck Competitive Advantages

  Things we do better than competitors:
  1. **Cross-platform** - Windows/Mac/Linux (Mission Planner is Windows-only)
  2. **Multi-firmware** - One app for Betaflight + iNav + ArduPilot
  3. **Modern UI** - React/Tailwind vs legacy C# WinForms
  4. **Beginner wizards** - Modes wizard, servo wizard with visual guides
  5. **Stability** - BSOD prevention, production-grade USB handling

  ---
  ## Epic 6-9: MSP Feature Parity

  Bring ArduDeck to feature parity with Betaflight/iNav Configurator for the most-used features.

  ### Epic 6: OSD Configuration (P0)

  **Why P0:** 90%+ of FPV pilots customize their OSD. This is table-stakes.

  | Task | Description | Complexity |
  |------|-------------|------------|
  | 6.1 MSP Handlers | `mspGetOsdConfig`, `mspSetOsdConfig` | Medium |
  | 6.2 Element Editor | Drag-drop OSD element positioning | High |
  | 6.3 Font Manager | Upload custom OSD fonts | Medium |
  | 6.4 Preview | Live OSD preview (optional) | High |

  **Reference:** `/inav-configurator/tabs/osd-panel.html`

  **Files to create:**
  - `components/osd/OsdConfigTab.tsx` - Main OSD editor
  - `components/osd/OsdElementPicker.tsx` - Element selector
  - `components/osd/OsdCanvas.tsx` - Visual positioning canvas
  - MSP handlers in `main/msp/msp-handlers.ts`

  ### Epic 7: CLI Terminal ✅ COMPLETE (2026-01-06)

  Full xterm.js-based CLI terminal with autocomplete for iNav/Betaflight boards.

  **Features implemented:**
  - Raw serial communication via `cli-handlers.ts`
  - xterm.js terminal with ANSI color support
  - Command history (up/down arrows)
  - Tab autocomplete from `dump` output
  - Reboot overlay when `save` command issued
  - Proper disconnect/cleanup handling

  **Files created:**
  - `components/cli/CliTerminal.tsx` - xterm.js terminal
  - `components/cli/CliView.tsx` - Dedicated sidebar view
  - `components/cli/CliAutocomplete.tsx` - Autocomplete popup
  - `stores/cli-store.ts` - CLI state, history, suggestions
  - `main/cli/cli-handlers.ts` - IPC handlers for CLI mode

  ### Epic 8: VTX Configuration (P1)

  **Why P1:** Simple feature, all FPV pilots need it.

  | Task | Description | Complexity |
  |------|-------------|------------|
  | 8.1 MSP Handlers | `mspGetVtxConfig`, `mspSetVtxConfig` | Low |
  | 8.2 Config UI | Band/channel/power selector | Low |
  | 8.3 VTX Tables | Custom VTX table support | Medium |

  **Files to create:**
  - `components/vtx/VtxConfigTab.tsx` - VTX settings UI
  - MSP handlers for VTX_CONFIG (88/89)

  ### Epic 9: MSP Failsafe (P1)

  **Why P1:** Safety-critical feature, partially implemented.

  | Task | Description | Complexity |
  |------|-------------|------------|
  | 9.1 MSP Handlers | Deserialize FAILSAFE_CONFIG (75/76) | Low |
  | 9.2 Extend SafetyTab | Add MSP failsafe to existing tab | Medium |
  | 9.3 GPS Rescue | Betaflight 4.6 GPS rescue PIDs | Medium |

  **Files to modify:**
  - `components/mavlink-config/SafetyTab.tsx` - Extend for MSP
  - `main/msp/msp-handlers.ts` - Add failsafe handlers

  ---
  Future Epic: Setup Wizards

  Beginner-friendly wizards with visual guides - ArduDeck's key differentiator.

  Planned Wizards

  | Wizard        | Description                              | Priority |
  |---------------|------------------------------------------|----------|
  | Vehicle Setup | Frame type, motor config, receiver setup | High     |
  | Calibration   | Accelerometer, compass, radio, ESC       | High     |
  | PID Tuning    | Guided PID tuning with schematics        | Medium   |
  | First Flight  | Pre-flight checklist, safety tips        | Medium   |

  Vehicle Setup Wizard Flow

  1. Vehicle Type: Copter, Plane, VTOL, Rover, Boat
  2. Frame Config: Visual frame selection (Quad X, Hex, Flying Wing, etc.)
  3. Motor Config: Motor positions, spin directions, test buttons
  4. Receiver Setup: RX type selection with wiring diagrams
  5. Calibration: ACC/Gyro calibration with visual guides
  6. Flight Modes: Simplified mode setup for beginners
  7. Complete: Pre-flight checklist

  Design Principles

  - Visual diagrams for all frame types (SVG components)
  - Plain language explanations ("tilt your quad left" not "roll -45°")
  - Smart defaults for beginners, advanced options for experts
  - Protocol-agnostic (MAVLink/MSP abstraction layer)

  Files to Create

  components/wizards/
  ├── SetupWizard.tsx           # Main wizard container
  ├── steps/                    # Individual wizard steps
  │   ├── VehicleTypeStep.tsx
  │   ├── FrameTypeStep.tsx
  │   ├── MotorConfigStep.tsx
  │   └── ...
  ├── diagrams/                 # SVG frame diagrams
  └── WizardContext.tsx         # Wizard state management

  ---
  Future Epic: Calibration

  - Compass calibration wizard
  - Accelerometer calibration
  - Radio calibration
  - ESC calibration
  - Reference: /MissionPlanner/GCSViews/ConfigurationView/

  ---
  Future: In-App Documentation

  Plan to add .md documentation files for user help and tooltips:

  docs/help/
  ├── pid-tuning.md           # What is PID? How to tune
  ├── rates-explained.md      # RC rates, expo, super rates
  ├── flight-modes.md         # Each mode explained simply
  ├── servo-mixer.md          # Fixed-wing control surfaces
  ├── navigation-rth.md       # RTH modes, GPS requirements
  ├── failsafe.md             # What happens when things go wrong
  ├── calibration.md          # Step-by-step calibration guides
  └── glossary.md             # FPV/drone terminology

  Design:
  - Markdown files rendered in-app with help modals
  - Contextual "?" buttons next to confusing settings
  - Beginner-friendly language (no assumed knowledge)
  - Diagrams and images where helpful

  ---
  Development Workflow

  1. Analyze Legacy: Study /MissionPlanner/[relevant-file].cs
  2. Design Modern: TypeScript with strong typing
  3. Implement: React + Zustand in /apps/desktop/
  4. Test: With real hardware when possible

  Code Quality:
  - TypeScript strict mode
  - ESLint conventions
  - JSDoc for public APIs

  ---
  Hardware Context

  - Target: Pixhawk-compatible boards (SpeedyBee F405-Wing)
  - Firmware: ArduPlane with QuadPlane support
  - Use Case: VTOL delta wing for wildfire surveillance
  - Desktop Comms: USB serial (COM port)
  - Mobile Comms: Bluetooth/WiFi telemetry

  ---
  Resources

  - ArduPilot: https://ardupilot.org/
  - MAVLink: https://mavlink.io/
  - Cockpit GCS: https://github.com/bluerobotics/cockpit
  - Mission Planner: https://github.com/ArduPilot/MissionPlanner
  - ArduPilot Forums: https://discuss.ardupilot.org/
