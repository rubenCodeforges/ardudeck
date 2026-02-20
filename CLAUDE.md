This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ArduDeck - Mission Planner Modernization Project
# ALWAYS PRIOTERIZE UI/UX !!! NEVER BUILD PROTOTYPES , HACKS , ETC. USER FLOW IS PRIO NUMBER ONE AT ALL TIME !!!!

## TypeScript & ESLint Rules - MUST FOLLOW

All code MUST pass `npx tsc --noEmit` and `npx eslint` without errors.

**tsconfig.base.json strict settings:**
- `strict: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`, `noImplicitAny: true`
- `noUncheckedIndexedAccess` means ALL array/object index access returns `T | undefined` — you MUST handle this with `!` (when guaranteed safe) or guard checks
- Example: `arr[0]` is `T | undefined`, use `arr[0]!` if you checked length, or `if (arr[0]) { ... }`
- After `.find()`, `.at()`, bracket access — always handle the `undefined` case

**ESLint rules (eslint.config.js):**
- `@typescript-eslint/no-unused-vars: 'off'` — unused vars are allowed
- `@typescript-eslint/no-explicit-any: 'off'` — `any` is allowed when needed
- `@typescript-eslint/no-require-imports: 'off'`

**When writing new code:**
- Never ignore possible `undefined` from indexed access — TypeScript will catch it
- Use non-null assertion `!` only when you are certain the value exists
- Prefer type narrowing (`if` checks, `?? defaultValue`) over blind `!`
- For event handler callbacks typed as `(...args: unknown[]) => void`, cast appropriately

## UI Style Rules
- **NO EMOJIS** - NEVER use emoji characters (Unicode emoji) anywhere in UI code, data objects, or string constants. Always use Lucide React icons (`lucide-react`) instead. For `<option>` elements or plain text where components can't be used, use text labels only.
- Keep interfaces clean and professional

Modernizing ArduPilot's Mission Planner ground control station from legacy C#/.NET WinForms to a cross-platform solution using Electron (desktop) and Flutter (mobile).

## Project Structure

| Component | Location | Stack |
|-----------|----------|-------|
| Desktop App | `/apps/desktop/` | Electron + React 18 + TypeScript + Vite |
| MAVLink Library | `/packages/mavlink-ts/` | TypeScript |
| MSP Library | `/packages/msp-ts/` | TypeScript (Betaflight/iNav) |
| Comms Library | `/packages/comms/` | TypeScript (Serial/TCP/UDP) |
| STM32 DFU Library | `/packages/stm32-dfu/` | TypeScript (USB DFU) |
| Legacy Reference | `/MissionPlanner/` | C# .NET WinForms (read-only) |
| **iNav Configurator** | `/inav-configurator/` | **REFERENCE IMPLEMENTATION for all MSP operations** |

**References:**
- [BlueRobotics Cockpit](https://github.com/bluerobotics/cockpit) - MAVLink TypeScript patterns
- **iNav Configurator (LOCAL)** - MSP protocol reference (see below)

---

## ⚠️ CRITICAL: iNav Configurator Reference

**ALWAYS check `/inav-configurator/` FIRST before implementing ANY MSP functionality!**

iNav Configurator is the working reference implementation. We are making it more user-friendly, NOT reinventing the wheel.

### Key Files to Reference

| What | iNav Configurator File |
|------|------------------------|
| MSP command codes | `js/msp/MSPCodes.js` |
| MSP serialization/deserialization | `js/msp/MSPHelper.js` (largest file - all MSP logic) |
| Motor mixer | `js/motorMixRule.js`, `js/motorMixerRuleCollection.js` |
| Servo mixer | `js/servoMixRule.js`, `js/servoMixerRuleCollection.js` |
| FC state model | `js/fc.js` |
| Mixer tab logic | `tabs/mixer.js` |

### MSP Encoding Patterns (from iNav Configurator)

**Motor Mixer values:** `mspValue = (value + 2) * 1000` (NOT `value * 1000`)
- throttle=1.0 → MSP=3000
- roll=-1.0 → MSP=1000

**Always verify byte order and encoding against iNav Configurator before implementing!**

### Other Reference Implementations (ALL LOCAL)

| Protocol | Reference | Location |
|----------|-----------|----------|
| iNav MSP | iNav Configurator | **LOCAL: `/inav-configurator/`** |
| Betaflight MSP | Betaflight Configurator | **LOCAL: `/betaflight-configurator/`** |
| ArduPilot MAVLink | Mission Planner | **LOCAL: `/MissionPlanner-ref/`** |

**All reference implementations are available locally. Check them BEFORE implementing protocol features.**

### Debugging MSP Issues - DO NOT ADD FALLBACKS BLINDLY

When MSP operations fail, **STOP and investigate** before adding CLI fallbacks:

1. **Check iNav Configurator first** - How do they do it? What function? What encoding?
2. **Compare byte-by-byte** - Is our payload structure identical?
3. **Verify function signatures** - Are we using the right function? (e.g., `sendMspV2RequestWithPayload` vs `sendMspV2Request`)
4. **Check error messages** - "not supported" often means wrong payload, not missing feature
5. **Log the actual bytes** - Compare with what iNav Configurator sends

**CLI fallbacks are a LAST RESORT, not a first response to errors.**

Common mistakes to avoid:
- Using `sendMspV2Request` (no payload) instead of `sendMspV2RequestWithPayload`
- Wrong encoding: `value * 1000` vs `(value + 2) * 1000`
- Wrong byte order: U16 vs S16, little-endian vs big-endian
- Missing fields in payload structure

## Build Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Run dev mode
```

---

## Implementation Status

### ✅ Completed

| Epic | Key Features |
|------|--------------|
| Foundation | Monorepo, MAVLink parser, comms layer, Electron shell |
| Telemetry | Real-time telemetry, attitude indicator, GPS, battery, dockable panels |
| Parameters | Full parameter management with metadata, validation, file ops |
| Mission | Waypoint CRUD, spline curves, terrain-aware altitude, geofence, rally points |
| Firmware Flash | Multi-protocol detection, STM32/DFU flashing, post-flash auto-config |
| CLI Terminal | xterm.js terminal, autocomplete, save/reboot handling |
| MSP Config | PID/Rates/Modes tuning, presets, servo mixer, navigation settings |
| Legacy Boards | Full GUI for F3-era boards (iNav < 2.1, Betaflight < 4.0) via CLI |
| OSD Simulator | MCM font parser, demo/live modes, 8 bundled fonts, PAL/NTSC support |
| Calibration | Accelerometer (level), compass calibration with status detection from arming flags |

### 🚧 Disabled (Work In Progress)

| Epic | Status | Notes |
|------|--------|-------|
| SITL Simulator | Disabled | iNav SITL + FlightGear integration temporarily disabled. Complex protocol bridging issues need resolution. UI shows "Coming Soon". |

### 🔜 Planned (Priority Order)

| Priority | Epic | Description |
|----------|------|-------------|
| P0 | OSD Editor | OSD element position editor and font designer |
| P1 | VTX Configuration | Video transmitter band/channel/power |
| P1 | MSP Failsafe | Extend SafetyTab for MSP failsafe config |
| P1 | GPS Rescue | Betaflight 4.6 GPS rescue/position hold |
| P2 | LED Strip | LED function/color configuration |
| P2 | Blackbox | Log download and basic viewer |
| P2 | Setup Wizards | Vehicle setup, frame config, motor test |
| P3 | PIFF Tuning | iNav position controller |
| P3 | Programming | iNav logic conditions framework |
| P4 | Mobile App | Flutter mobile GCS |

---

## Critical Technical Notes

### MAVLink v2 Payload Byte Order

MAVLink v2 orders payload fields by SIZE (largest first), NOT declaration order!

```
HEARTBEAT wire order: custom_mode(4), type(1), autopilot(1), base_mode(1), ...
VFR_HUD wire order: airspeed(4), groundspeed(4), alt(4), climb(4), heading(2), throttle(2)
```

**ArduPilot quirk:** Uses v2 byte order even with v1 packet framing for MISSION_COUNT, MISSION_REQUEST, etc.

### MSP Protocol - iNav vs Betaflight Rates

**CRITICAL:** iNav and Betaflight use DIFFERENT MSP commands and byte formats!

| Protocol | Read Command | Write Command | Bytes |
|----------|--------------|---------------|-------|
| iNav | `INAV_RATE_PROFILE` (0x2007) | `INAV_SET_RATE_PROFILE` (0x2008) | 15 |
| Betaflight | `MSP_RC_TUNING` (111) | `MSP_SET_RC_TUNING` (204) | 17+ |

**iNav differences:**
- Rates stored as value÷10 (multiply by 10 when reading)
- `rcExpo` is SHARED for Roll AND Pitch
- `rcRate` is FIXED at 100

**DO NOT MIX:** Using MSP1 write with MSP2 read corrupts values!

### Legacy Board Detection

```typescript
function isLegacyMspBoard(fcVariant: string, fcVersion: string): boolean {
  const [major, minor] = fcVersion.split('.').map(Number);
  if (fcVariant === 'INAV') return major < 2 || (major === 2 && minor < 1);
  if (fcVariant === 'BTFL') return major < 4;
  if (fcVariant === 'CLFL') return true;
  return false;
}
```

Legacy boards → `LegacyConfigView` (CLI-powered GUI)
Modern boards → `MspConfigView` (MSP-based)

### CLI PID Parameter Names (iNav Platform-Specific)

| Platform | P | I | D/FF |
|----------|---|---|------|
| Multirotor | `mc_p_roll` | `mc_i_roll` | `mc_d_roll` |
| Airplane | `fw_p_roll` | `fw_i_roll` | `fw_ff_roll` |

**Line endings:** Use `\n` only (NOT `\r\n` - causes parse errors!)

### iNav Platform Type Change

Use `MSP2_INAV_SET_MIXER` (0x2011) with `platformType` field:
```
MULTIROTOR=0, AIRPLANE=1, HELICOPTER=2, TRICOPTER=3, ROVER=4, BOAT=5
```

CLI fallback for old iNav: `set platform_type = AIRPLANE` or `mixer AIRPLANE`

---

## Key File Reference

### Core Architecture

| File | Purpose |
|------|---------|
| `main/ipc-handlers.ts` | All IPC handlers, connection management |
| `main/preload.ts` | Renderer API |
| `main/msp/msp-handlers.ts` | MSP IPC handlers (PID, rates, modes, servos) |
| `main/cli/cli-handlers.ts` | CLI IPC handlers for raw serial |
| `packages/mavlink-ts/src/core/mavlink-parser.ts` | MAVLink packet parser |
| `packages/comms/src/interfaces/transport.ts` | Transport interface |

### Stores (Zustand)

| File | Purpose |
|------|---------|
| `stores/telemetry-store.ts` | Vehicle telemetry state |
| `stores/parameter-store.ts` | FC parameters |
| `stores/mission-store.ts` | Mission waypoints |
| `stores/fence-store.ts` | Geofence polygons/circles |
| `stores/rally-store.ts` | Rally points |
| `stores/settings-store.ts` | App settings, vehicle profiles |
| `stores/firmware-store.ts` | Firmware flash state |
| `stores/legacy-config-store.ts` | Legacy board CLI config |
| `stores/cli-store.ts` | CLI terminal state |
| `stores/servo-wizard-store.ts` | Servo wizard state |
| `stores/osd-store.ts` | OSD simulator state, demo values, element positions |
| `stores/calibration-store.ts` | Calibration wizard state, sensor config |

### Key Components

| File | Purpose |
|------|---------|
| `components/parameters/ParametersView.tsx` | Routes legacy vs modern boards |
| `components/parameters/MspConfigView.tsx` | Betaflight/iNav PID/Rates/Modes |
| `components/legacy-config/LegacyConfigView.tsx` | Legacy F3 board GUI |
| `components/cli/CliTerminal.tsx` | xterm.js CLI terminal |
| `components/firmware/FirmwareFlashView.tsx` | Firmware flash UI |
| `components/panels/AttitudePanel.tsx` | Attitude indicator |
| `components/mission/MissionMapPanel.tsx` | Mission planning map |
| `components/osd/OsdView.tsx` | OSD simulator main tab |
| `components/osd/OsdCanvas.tsx` | Canvas-based OSD renderer |
| `components/calibration/CalibrationView.tsx` | Calibration wizard main view |
| `components/ui/DraggableSlider.tsx` | Reusable slider (use for ALL sliders) |

### OSD System

| File | Purpose |
|------|---------|
| `packages/msp-ts/src/osd/mcm-parser.ts` | MCM font file parser for MAX7456 |
| `renderer/utils/osd/font-renderer.ts` | Font rendering and screen buffer |
| `renderer/utils/osd/osd-symbols.ts` | 150+ OSD symbol constants |
| `renderer/assets/osd-fonts/*.mcm` | 8 bundled iNav fonts |

### Shared Types

| File | Purpose |
|------|---------|
| `shared/ipc-channels.ts` | IPC channel constants, ConnectionState |
| `shared/firmware-types.ts` | DetectedBoard, FirmwareVersion, FlashState |
| `shared/board-ids.ts` | 150+ ArduPilot board ID mappings |
| `shared/board-mappings.ts` | F3 board support detection |

---

## UI Components

### Sliders - ALWAYS Use DraggableSlider

**DO NOT** create inline slider components with `onClick` on the track - they won't support dragging!

```tsx
import { DraggableSlider, CompactSlider } from '../ui/DraggableSlider';

<DraggableSlider
  label="P - Proportional"
  value={pid.roll.p}
  onChange={(v) => handleChange('p', v)}
  min={0} max={200}
/>

<CompactSlider  // For space-constrained UIs
  label="Minimum"
  value={servo.min}
  onChange={(v) => handleChange({ ...servo, min: v })}
  min={750} max={2250}
/>
```

---

## BSOD Prevention Architecture

All USB-serial operations use defense-in-depth to prevent Windows BSOD:

- **Flash lock**: Prevents concurrent USB operations
- **Request deduplication**: MSP/MAVLink telemetry skips if previous running
- **Driver settling time**: 100ms-1000ms delays between critical operations
- **Proper cleanup**: Event listeners removed, intervals cleared, ports drained
- **Buffer optimization**: Pre-allocated buffers, no allocations in hot paths

Key delays: Reconnection 500ms, post-flash 4000ms, EEPROM save 1000ms.

---

## Legacy Board Known Issues

| Issue | Workaround |
|-------|------------|
| Modes don't fetch | Use CLI terminal: `aux <idx> <mode> <ch> <start> <end> <logic>` |
| Can't add modes/mixers | Use CLI: `aux`, `mmix`, `smix` commands |

---

## iNav SITL + FlightGear Configuration

Complete setup guide for iNav Software-In-The-Loop simulation with FlightGear.

### Architecture Overview

```
┌─────────────┐     TCP:5760      ┌─────────────┐
│  ArduDeck   │◄──────────────────►│  iNav SITL  │
│   (GCS)     │   MSP Protocol    │             │
└─────────────┘                   └──────┬──────┘
       │                                 │
       │ UDP:5506                        │ UDP:49000
       │ (Controls)                      │ (X-Plane RREF/DREF)
       │                                 │
       ▼                                 ▼
┌─────────────────────────────────────────────────┐
│              Protocol Bridge                     │
│  - Receives sensor data from FlightGear (5505)  │
│  - Converts to X-Plane RREF format for SITL     │
│  - Receives DREF servo outputs from SITL        │
│  - Forwards controls to FlightGear (5506)       │
└─────────────────────────────────────────────────┘
       │                                 ▲
       │ UDP:5506                        │ UDP:5505
       │ (Controls)                      │ (Sensors)
       ▼                                 │
┌─────────────────────────────────────────────────┐
│                  FlightGear                      │
│  - Provides flight dynamics simulation          │
│  - Sends sensor data (GPS, attitude, airspeed)  │
│  - Receives control inputs (throttle, surfaces) │
└─────────────────────────────────────────────────┘
```

### Step 1: Platform Type (CLI or UI)

**Via MspConfigView UI:** Click platform dropdown in header → Select "Airplane"

**Via CLI:**
```bash
# Check current platform
get platform_type

# Set platform (0=Multi, 1=Airplane, 2=Heli, 3=Tricopter, 4=Rover, 5=Boat)
set platform_type = AIRPLANE
save
```

### Step 2: Receiver Configuration

**CRITICAL:** iNav SITL must receive RC via MSP, not real receiver.

```bash
# Set receiver to MSP (receives RC from ArduDeck via MSP_SET_RAW_RC)
set receiver_type = MSP

# RC channel range (default is fine)
set rx_min_usec = 885
set rx_max_usec = 2115

save
```

### Step 3: Servo Mixer Configuration

**IMPORTANT:** Without servo mixer rules, FC outputs 0 for all controls!

**Check current config:**
```bash
smix
```

**Servo Mixer Command Format:**
```
smix <rule_index> <servo_index> <input_source> <rate> <speed> <condition>
```

**Input Sources:**
| ID | Source | Description |
|----|--------|-------------|
| 0 | Stabilized Roll | Roll after PID processing |
| 1 | Stabilized Pitch | Pitch after PID processing |
| 2 | Stabilized Yaw | Yaw after PID processing |
| 3 | Stabilized Throttle | Throttle after processing |
| 8 | RC Roll | Raw RC roll input |
| 9 | RC Pitch | Raw RC pitch input |
| 10 | RC Yaw | Raw RC yaw input |
| 11 | RC Throttle | Raw RC throttle input |

#### Flying Wing (Elevons)
```bash
smix reset

# Left elevon (Servo 3): Roll + Pitch
smix 0 3 0 100 0 0    # Roll at 100%
smix 1 3 1 100 0 0    # Pitch at 100%

# Right elevon (Servo 4): Roll (reversed) + Pitch
smix 2 4 0 -100 0 0   # Roll at -100% (reversed)
smix 3 4 1 100 0 0    # Pitch at 100%

save
```

#### Conventional Airplane (Aileron/Elevator/Rudder)
```bash
smix reset

# Ailerons (Servo 3): Roll
smix 0 3 0 100 0 0    # Roll at 100%

# Elevator (Servo 4): Pitch
smix 1 4 1 100 0 0    # Pitch at 100%

# Rudder (Servo 5): Yaw
smix 2 5 2 100 0 0    # Yaw at 100%

save
```

#### V-Tail
```bash
smix reset

# Left V-tail (Servo 4): Pitch + Yaw
smix 0 4 1 100 0 0    # Pitch at 100%
smix 1 4 2 -100 0 0   # Yaw at -100%

# Right V-tail (Servo 5): Pitch + Yaw (reversed)
smix 2 5 1 100 0 0    # Pitch at 100%
smix 3 5 2 100 0 0    # Yaw at 100%

# Ailerons (Servo 3): Roll
smix 4 3 0 100 0 0    # Roll at 100%

save
```

### Step 4: Motor Mixer Configuration

**Check current config:**
```bash
mmix
```

**For single motor airplane:**
```bash
mmix reset
mmix 0 1.0 0.0 0.0 0.0   # Motor 0: full throttle, no roll/pitch/yaw mixing
save
```

**Motor Mixer Format:**
```
mmix <index> <throttle> <roll> <pitch> <yaw>
```
Values: -1.0 to 1.0 (0.0 = no mix, 1.0 = full positive, -1.0 = full negative)

### Step 5: Servo Configuration

**Check servo endpoints:**
```bash
servo
```

**Set servo parameters:**
```bash
# Format: servo <index> <min> <max> <middle> <rate>
servo 3 1000 2000 1500 100   # Servo 3: full range, centered, 100% rate
servo 4 1000 2000 1500 100   # Servo 4
servo 5 1000 2000 1500 100   # Servo 5

save
```

### Step 6: Flight Mode Configuration

**Configure AUX channel modes:**
```bash
# Format: aux <slot> <box_id> <aux_channel> <range_start> <range_end> <logic>

# ARM on AUX1 (channel 4), high position (1700-2100)
aux 0 0 0 1700 2100 0

# ANGLE mode on AUX2, mid position (1300-1700)
aux 1 1 1 1300 1700 0

# NAV WP on AUX2, high position (1700-2100)
aux 2 28 1 1700 2100 0

# NAV RTH on AUX3, high position
aux 3 10 2 1700 2100 0

# NAV POSHOLD on AUX4, high position
aux 4 11 3 1700 2100 0

save
```

**Common Box IDs (iNav):**
| ID | Mode |
|----|------|
| 0 | ARM |
| 1 | ANGLE |
| 2 | HORIZON |
| 10 | NAV RTH |
| 11 | NAV POSHOLD |
| 28 | NAV WP |
| 45 | NAV CRUISE |

### Step 7: Failsafe Configuration (SITL-friendly)

```bash
# Lenient failsafe for SITL testing
set failsafe_procedure = DROP
set failsafe_delay = 10
set failsafe_off_delay = 5
set failsafe_throttle = 1000

# Disable first waypoint distance check (HOME set by FC, not GCS)
set nav_wp_max_safe_distance = 0

save
```

### Step 8: GPS Configuration (for navigation)

```bash
# GPS is injected via MSP from FlightGear sensor data
set gps_provider = UBLOX
set gps_sbas_mode = AUTO

save
```

### Complete SITL Setup Script

Copy-paste this entire block into CLI for a Flying Wing:
```bash
# Platform
set platform_type = AIRPLANE

# Receiver (MSP from ArduDeck)
set receiver_type = MSP
set rx_min_usec = 885
set rx_max_usec = 2115

# Servo mixer (Flying Wing)
smix reset
smix 0 3 0 100 0 0
smix 1 3 1 100 0 0
smix 2 4 0 -100 0 0
smix 3 4 1 100 0 0

# Motor mixer (single motor)
mmix reset
mmix 0 1.0 0.0 0.0 0.0

# Servo config
servo 3 1000 2000 1500 100
servo 4 1000 2000 1500 100

# Flight modes
aux 0 0 0 1700 2100 0
aux 1 1 1 1300 1700 0
aux 2 28 1 1700 2100 0
aux 3 10 2 1700 2100 0
aux 4 11 3 1700 2100 0

# Failsafe (lenient for SITL)
set failsafe_procedure = DROP
set failsafe_delay = 10
set nav_wp_max_safe_distance = 0

save
```

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| RC Link arming block | receiver_type not MSP | `set receiver_type = MSP` then `save` |
| Arm Switch block | Arm switch already ON at startup | Toggle OFF then ON (2-step arm) |
| Throttle/servos = 0 | No servo mixer rules | Configure `smix` rules |
| No motor output | No motor mixer rules | Configure `mmix` rules |
| Failsafe triggered | RC frames stopped | Check MSP_SET_RAW_RC is sending continuously |
| GPS not working | GPS not injected | ArduDeck injects via MSP2_SENSOR_GPS |

### Key Files

| File | Purpose |
|------|---------|
| `main/simulators/protocol-bridge.ts` | X-Plane ↔ FlightGear protocol translation |
| `main/simulators/flightgear-launcher.ts` | FlightGear process management |
| `main/simulators/sitl-launcher.ts` | iNav SITL process management |
| `resources/flightgear/Protocol/ardudeck-in.xml` | FlightGear control input protocol |
| `resources/flightgear/Protocol/ardudeck-out.xml` | FlightGear sensor output protocol |
| `stores/flight-control-store.ts` | RC override, arm/disarm, mode switching |

---

## External APIs (No Keys Required)

### Map Layers
- Street: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Satellite: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- Terrain: `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`

### Parameter Metadata
- `https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml`
- `https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml`

### Terrain API
Open-Meteo Elevation API (free): `renderer/utils/elevation-api.ts`

---

## Development Guidelines

1. **Analyze Legacy**: Study `/MissionPlanner/[relevant-file].cs`
2. **Design Modern**: TypeScript with strong typing
3. **Implement**: React + Zustand in `/apps/desktop/`
4. **Test**: With real hardware when possible

**Code Quality:** TypeScript strict mode, ESLint conventions, JSDoc for public APIs.

---

## Hardware Context

- **Target**: Pixhawk-compatible boards (SpeedyBee F405-Wing)
- **Firmware**: ArduPlane with QuadPlane support
- **Use Case**: VTOL delta wing for wildfire surveillance
- **Desktop Comms**: USB serial (COM port)
- **Mobile Comms**: Bluetooth/WiFi telemetry

---

## Resources

- ArduPilot: https://ardupilot.org/
- MAVLink: https://mavlink.io/
- Cockpit GCS: https://github.com/bluerobotics/cockpit
- Mission Planner: https://github.com/ArduPilot/MissionPlanner