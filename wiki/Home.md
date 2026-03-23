# ArduDeck

ArduDeck is a cross-platform ground control station for ArduPilot, Betaflight, and iNav flight controllers. It replaces the legacy Mission Planner (C#/.NET WinForms) with a modern Electron + React desktop app. Connect via USB serial, TCP, or UDP, configure your vehicle, plan missions, flash firmware, and monitor telemetry in real time.

## Supported Firmware

| Firmware | Protocol | Support Level |
|----------|----------|---------------|
| ArduPilot (Copter, Plane, VTOL, Rover, Boat, Sub) | MAVLink v1/v2 | Full configuration, mission planning, telemetry |
| iNav | MSP v1/v2 | PID/Rates/Modes, servo mixer, OSD, firmware flash |
| Betaflight | MSP v1/v2 | PID/Rates/Modes, firmware flash |
| Legacy boards (iNav < 2.1, Betaflight < 4.0, Cleanflight) | CLI over MSP | CLI-powered GUI |

## Quick Links

| Topic | Description |
|-------|-------------|
| [[Getting Started]] | Download, install, connect your flight controller |
| [[Configuration]] | Overview of all configuration tabs and how routing works |
| [[PID Tuning]] | Tune P/I/D/FF gains per axis |
| [[Rates]] | Configure rate curves and expo |
| [[Flight Modes]] | Assign flight modes to switch positions |
| [[Receiver]] | Select RC protocol, view live channels |
| [[Serial Ports]] | Assign protocols to serial ports |
| [[Safety and Failsafe]] | Failsafe actions, arming checks, geofence |
| [[Battery]] | Battery monitor setup, voltage thresholds, calibration |
| [[Tuning Presets]] | One-click skill level and mission type presets |
| [[All Parameters]] | Expert parameter table with search, compare, file ops |
| [[Firmware Flash]] | Flash ArduPilot, Betaflight, iNav, or custom firmware |
| [[Map Overlays]] | Weather radar, airspace zones, aviation charts, terrain elevation |
| [[Companion Board]] | ESP32 flashing, DroneBridge, companion computer management |
| [[Lua Graph Editor]] | Visual scripting for ArduPilot Lua scripts |
| [[Lua Node Reference]] | Complete node catalog and API reference |
| [[Lua Examples]] | Worked examples with generated Lua code |
