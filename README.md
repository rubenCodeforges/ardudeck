<p align="center">
  <img src="apps/desktop/resources/banner.png" alt="ArduDeck" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/GPL-3.0"><img src="https://img.shields.io/badge/License-GPL%203.0-blue.svg" alt="License: GPL-3.0" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" /></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-28-47848F?logo=electron" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" /></a>
  <a href="https://mavlink.io/"><img src="https://img.shields.io/badge/MAVLink-v1%2Fv2-green" alt="MAVLink" /></a>
  <a href="https://github.com/iNavFlight/inav/wiki/MSP-V2"><img src="https://img.shields.io/badge/MSP-v1%2Fv2-orange" alt="MSP" /></a>
  <a href="https://codecov.io/gh/rubenCodeforges/ardudeck"><img src="https://codecov.io/gh/rubenCodeforges/ardudeck/branch/master/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://discord.gg/JX2JdVXPPC"><img src="https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://forum.ardudeck.com"><img src="https://img.shields.io/badge/Forum-forum.ardudeck.com-f59e0b" alt="Forum" /></a>
  <a href="https://ardudeck.com"><img src="https://img.shields.io/badge/Website-ardudeck.com-22d3ee" alt="Website" /></a>
</p>

<p align="center">
  <a href="https://ardudeck.com">Website</a> &nbsp;·&nbsp;
  <a href="https://ardudeck.com/docs/">Documentation</a> &nbsp;·&nbsp;
  <a href="https://ardudeck.com/blog/">Guides &amp; Screenshots</a> &nbsp;·&nbsp;
  <a href="https://forum.ardudeck.com">Community Forum</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/JX2JdVXPPC">Discord</a>
</p>

<p align="center">
  <strong>A modern, cross-platform ground control station for ArduPilot, Betaflight, and iNav.</strong>
</p>

<p align="center">
  <sub>Supported by</sub><br />
  <a href="https://adlerblix.de" target="_blank" rel="noopener noreferrer"><img src="docs/sponsors/adlerblix.svg" alt="Adlerblix - optical aerial surveying" height="40" /></a>
</p>

ArduDeck is an open-source ground control station built with Electron, React, and TypeScript. One app covers the whole workflow: connect, configure, calibrate, plan, fly, and analyze, for vehicles running ArduPilot (MAVLink) or Betaflight/iNav (MSP), from a single quad on USB to a fleet of vehicles on radio, IP, or cellular links.

> **Beta 1 (0.1.0)** - ArduDeck is in beta. It is used in real flight operations, but expect rough edges and keep a backup configuration tool available. Ask questions and share setups on the [community forum](https://forum.ardudeck.com) or [Discord](https://discord.gg/JX2JdVXPPC), read the [documentation](https://ardudeck.com/docs/), or use the built-in [bug reporting](#bug-reporting) to help improve the project.

---

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Download & Install](#download--install)
- [Supported Vehicles & Firmware](#supported-vehicles--firmware)
- [Building from Source](#building-from-source)
- [Bug Reporting](#bug-reporting)
- [Contributing](#contributing)
- [Sponsors](#sponsors)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Screenshots

<p align="center">
  <a href="docs/screenshots/_new/mission_planning_overview.png?raw=true">
    <img src="docs/screenshots/_new/mission_planning_overview.png" alt="Mission and survey planning" width="800"/>
  </a>
  <br/>
  <em>Mission planning with grouped waypoints, a terrain-aware altitude profile, and live flight-info estimates</em>
</p>

<p align="center">
  <a href="docs/screenshots/_new/osd_simulator_demo.png?raw=true">
    <img src="docs/screenshots/_new/osd_simulator_demo.png" alt="OSD Tool" width="800"/>
  </a>
  <br/>
  <em>OSD Tool: composable ground-rendered HUD, flight controller Text OSD editor, and RubyFPV layout authoring</em>
</p>

<p align="center">
  <a href="docs/screenshots/_new/lua_loaded_template.png?raw=true">
    <img src="docs/screenshots/_new/lua_loaded_template.png" alt="Lua Graph Editor" width="800"/>
  </a>
  <br/>
  <em>Lua Graph Editor: build ArduPilot Lua scripts visually, with live code preview and export</em>
</p>

More screenshots, guides, and full documentation live on the website: [ardudeck.com/docs](https://ardudeck.com/docs/). Have a question or want to share a build? Join the [community forum](https://forum.ardudeck.com).

---

## Features

### Flight Operations
- **Dockable telemetry dashboard** - attitude, altitude, speed, GPS, battery, flight mode, and messages in IDE-style panels with saveable layouts
- **Interactive map** - live vehicle tracking, flight trail, multiple base layers, offline map downloads
- **Map overlays** - weather radar, animated wind flow, airspace zones, OpenAIP aviation charts, terrain elevation, and live air traffic (ADS-B / OGN)
- **Video and camera** - camera panel with pluggable sources (WebRTC, RTSP/ffmpeg, UVC), gimbal control, and a guided setup for wfb-ng / RunCam WiFiLink links
- **Flight commands** where they belong: arm/disarm, takeoff, mode changes, and guided "fly here" from the telemetry screen

### Multi-Vehicle
- **One-button engine** - a single click starts a local coordination engine; ArduDeck connects to it automatically
- **Simple vehicle onboarding** - "Add a vehicle" over radio, internet, cellular (4G/5G modem over IP), or a second ground station
- **Fleet operations** - per-vehicle telemetry and commanding, a fleet strip with health at a glance, colour-coded map markers, formation controls, and group actions
- **Fleet survey split** - divide a survey area across multiple vehicles
- **Fleet log retrieval** - download logs from every vehicle through the engine for side-by-side analysis

### RTK GPS Corrections (NTRIP)
- **Built-in NTRIP client** - connect to any NTRIP caster, browse the sourcetable, and stream RTCM corrections to the vehicle
- **NTRIP v1 and v2** - proper v2 (HTTP/1.1, chunked) with automatic fallback to classic v1 casters
- **GGA position reporting** back to the caster for network (VRS) mountpoints
- **Direct link or fleet-wide** - corrections flow over a single connection, or to every vehicle through the multi-vehicle engine

### Mission Planning
- **Interactive editing** - click to add waypoints, drag to reposition, undo/redo, continuous autosave with crash recovery
- **Mission groups** - waypoints organized into named, colored groups (manual or survey) with per-group stats, show/hide, and per-group upload or save
- **Altitude-frame-aware profile** - the terrain profile understands relative, AMSL, and terrain MAVLink frames per waypoint, with drag-to-edit altitudes
- **Terrain collision detection** - visual warnings where the path meets terrain, with one-click Auto Adjust
- **Spline waypoints, 3D view, mission library** - curved paths, three-dimensional visualization, and a local library plus .waypoints (QGC WPL) and .plan import/export
- **Full MAVLink mission protocol** - upload, download, geofence, and rally points

### Survey Planning
- **Patterns** - grid, crosshatch (optionally at two heights), circular, spiral, perimeter fill, and corridor surveys along a centerline with plane or copter turn strategies
- **GSD-first planning** - plan by ground sample distance with camera presets and live photo, battery, and data estimates
- **Terrain follow** - continuous DEM-based terrain following so cameras hold height above ground without an onboard terrain database
- **Multi-polygon areas** - multiple survey polygons with no-fly holes, plus a dedicated area editor window for boundary work
- **Battery sortie split** - split long surveys into battery-sized flights, each independently uploadable
- **GIS import** - KML, KMZ, GeoJSON, and Shapefile boundaries

### Flight Log Analysis
- **Log Explorer** - multi-chart plotting of ArduPilot DataFlash logs with independent y-axes, zoom/pan, windowed min/avg/max stats, and synchronized cursors across charts, map, and 3D flight path
- **FFT spectrum** - frequency analysis for vibration and filter work
- **Events and parameters** - flight events timeline and the parameter set recorded in the log
- **Health reports** - automated pass/warn/fail checks for vibration, GPS, EKF, power, failsafes, and more
- **AI-assisted analysis** - chat about a log with Claude, GPT, or Gemini; the Claude analyst can query raw telemetry and propose parameter changes you can apply

### OSD Tool
- **Text OSD editor** - read, edit, and upload the flight controller OSD: ArduPilot OSDn parameters with multi-screen support, and MSP/Betaflight OSD layouts
- **Composable custom HUD** - freely placeable telemetry readouts on a ground-rendered HUD (drawn by ArduDeck, never uploaded to the FC)
- **RubyFPV layout authoring** - configure RubyFPV ground-side OSD screens and export them for the ground station
- **Live video backdrop** - preview every OSD variant over your actual video feed, with MCM font support and bundled fonts

### Vehicle Setup & Tuning
- **Parameter management** - full parameter list with metadata, search, range/enum/increment validation, modified tracking, and .param file import/export
- **PID tuning** - ArduPilot and Betaflight/iNav tuning with presets, rate curve editors, and a VTOL / fixed-wing controller switch on QuadPlanes
- **Flight modes, safety, and failsafe** - mode channel assignment, failsafe actions, geofence behavior, and MAVLink signing
- **Calibration** - accelerometer, compass (including CompassMot motor-interference calibration and large-vehicle mag cal), with step-by-step wizards
- **Motor test, servo wizard, quick setup** - guided flows for frames, fixed wings, and first-time configuration
- **CLI terminal** - xterm-based terminal with autocomplete and history, including full GUI configuration for legacy F3-era boards driven over CLI

### Firmware & Connectivity
- **Firmware flashing** - ArduPilot, Betaflight, and iNav, with board auto-detection (MAVLink, MSP, STM32 bootloader), USB VID/PID recognition, and a boot-pad wizard
- **Connections** - serial (USB), TCP, and UDP, with port scanning and MAVLink v1/v2 auto-detection
- **Link Doctor** - connection diagnostics that identify what is actually on the link and why it is not talking
- **MAVLink inspector** - live message browser with field graphs
- **Robust telemetry links** - parameter download recovery tuned for slow SiK-style radio links

### Simulation
- **SITL built in** - download and run real ArduPilot firmware (Copter, Plane, Rover, Sub) on your computer, pick a frame and release track, and ArduDeck connects automatically
- **Virtual RC and FlightGear bridge** - fly the simulated vehicle from the app, optionally visualized in FlightGear
- **Swarm SITL** - spawn multiple SITL vehicles to exercise multi-vehicle features without hardware

### Scripting & Companion Hardware
- **Lua Graph Editor** - build ArduPilot Lua scripts by connecting nodes (sensors, logic, math, actions), with live code preview, templates, and one-click export ([docs](apps/desktop/src/renderer/components/lua-graph/docs/))
- **Companion boards** - ESP32 flashing with pre-configured templates (DroneBridge, MAVLink bridge), DroneBridge auto-discovery, and an agent dashboard for Raspberry Pi-class companions (metrics, terminal, services)

### Quality of Life
- **Unit preferences** - metric or imperial per quantity (distance, altitude, speed, wind, weight, area, capacity)
- **Feature tours** - short guided walkthroughs of new and existing screens
- **Vehicle profiles** - per-vehicle configurations with type-specific properties and live weather at the launch site
- **Built-in bug reporting** - one screen collects sanitized logs into an encrypted report you choose to share

---

## Download & Install

Most users should download a pre-built release. No need to clone or build anything.

| Platform | Format |
|----------|--------|
| **Windows** | Installer (.exe) and portable (.exe) |
| **macOS** | DMG (Apple Silicon) |
| **Linux** | AppImage and .deb |

All downloads: [Latest Release](https://github.com/rubenCodeforges/ardudeck/releases/latest)

Install, plug in your flight controller via USB (or point ArduDeck at your telemetry link), and you are ready to go.

> **Linux AppImage note:** on Ubuntu 24.04+ and other recent distros the AppImage needs `libfuse2` (`sudo apt install libfuse2`), or run it with `APPIMAGE_EXTRACT_AND_RUN=1`. The `.deb` package has no such dependency.
>
> **Code signing:** ArduDeck binaries are currently unsigned. On macOS, right-click the app and select "Open" (or run `xattr -cr /Applications/ArduDeck.app`). On Windows SmartScreen, click "More info", then "Run anyway".
>
> **Auto-updates:** Windows and Linux update in-app with one click. On macOS, ArduDeck notifies you about new versions and opens the release page for manual download until the app is code-signed.

---

## Supported Vehicles & Firmware

### ArduPilot (MAVLink)
- **Copter** - quadcopters, hexacopters, octocopters
- **Plane** - fixed-wing aircraft, flying wings
- **VTOL** - tiltrotors, tailsitters, QuadPlanes
- **Rover** - ground vehicles, boats
- **Submarine** - underwater ROVs (ArduSub)

### Betaflight & iNav (MSP)
- **Multirotors and fixed wings** on F4/F7/H7 boards via modern MSP
- **Legacy F3-era boards** (SPRacing F3, Naze32, Flip32, and friends) get the same graphical interface, driven over CLI under the hood: PID, rates, mixer, servo, and modes tabs all work, with firmware flashing for iNav 2.0.0 / Betaflight 3.5.7 era builds

---

## Building from Source

Only needed if you want to modify ArduDeck or contribute. Everyone else should [download a release](#download--install).

### Prerequisites

- **Node.js** 20 or higher
- **pnpm** 9 or higher

### Setup

```bash
# Fork the repo on GitHub first, then clone your fork
git clone https://github.com/<your-username>/ardudeck.git
cd ardudeck

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### Package for Production

```bash
pnpm package
```

The repository is a pnpm workspace: the Electron app lives in `apps/desktop`, with protocol and parser libraries in `packages/` (MAVLink, MSP, DataFlash log parsing, STM32 flashing, and more).

---

## Bug Reporting

ArduDeck includes a built-in bug reporting tool (bug icon in the sidebar). It collects recent app logs (paths sanitized), system info, and optionally a board configuration dump, shows you exactly what will be included, and produces an encrypted `.deckreport` file that only the ArduDeck team can read. Attach it to a [GitHub issue](https://github.com/rubenCodeforges/ardudeck/issues) or share it on [Discord](https://discord.gg/JX2JdVXPPC). Nothing is uploaded automatically; you decide when and how to share.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first (it covers the CLA and workflow), then:

1. Fork the repository and clone your fork
2. Create a feature branch from `master`
3. Make your changes and add tests where it makes sense
4. Open a Pull Request

---

## Sponsors

ArduDeck is supported by companies that contribute hardware, time, or resources to the project.

- [Adlerblix](https://adlerblix.de) - optical aerial surveying: photogrammetry, RTK precision, large-area mapping (Germany)

---

## License

This project is licensed under **GPL-3.0**, see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [ArduPilot](https://ardupilot.org/) - open-source autopilot firmware
- [Betaflight](https://betaflight.com/) - flight controller firmware for multirotors
- [iNav](https://github.com/iNavFlight/inav) - navigation-focused flight controller firmware
- [Mission Planner](https://github.com/ArduPilot/MissionPlanner) and [QGroundControl](http://qgroundcontrol.com/) - the ground control stations that paved the way
- [MAVLink](https://mavlink.io/) - Micro Air Vehicle communication protocol
- [Leaflet](https://leafletjs.com/) - interactive maps library

---

<p align="center">
  Made by <a href="https://github.com/rubenCodeforges">Codeforges</a>
</p>
