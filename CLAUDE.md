This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ArduDeck - Mission Planner Modernization Project
# ALWAYS PRIOTERIZE UI/UX !!! NEVER BUILD PROTOTYPES , HACKS , ETC. USER FLOW IS PRIO NUMBER ONE AT ALL TIME !!!!
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

**Reference:** [BlueRobotics Cockpit](https://github.com/bluerobotics/cockpit) - MAVLink TypeScript patterns.

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

### 🔜 Planned (Priority Order)

| Priority | Epic | Description |
|----------|------|-------------|
| P0 | OSD Editor | OSD element position editor and font designer |
| P1 | Calibration | Compass, accelerometer, radio, ESC wizards |
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