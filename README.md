# ArduDeck

A modern, cross-platform ground control station (GCS) for ArduPilot vehicles. Built with Electron, React, and TypeScript.

## Overview

ArduDeck is a modernization of [ArduPilot Mission Planner](https://github.com/ArduPilot/MissionPlanner), migrating from the legacy C#/.NET Windows application to a cross-platform solution.

### Features

- **Real-time Telemetry** - Attitude indicator, altitude, speed, GPS, battery status
- **Dockable Dashboard** - IDE-style drag & drop panel layout with save/load
- **Interactive Map** - OpenStreetMap with vehicle tracking, flight trail, multiple layers
- **Multi-transport Support** - Serial (USB), TCP, and UDP connections
- **MAVLink v2** - Full protocol support with 352 message types

## Tech Stack

- **Framework**: Electron 28+
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Maps**: Leaflet + react-leaflet
- **Panels**: dockview-react
- **Monorepo**: Turborepo + pnpm

## Project Structure

```
ardudeck/
├── apps/
│   └── desktop/              # Electron desktop app
├── packages/
│   ├── mavlink-ts/           # TypeScript MAVLink protocol library
│   └── comms/                # Communication transports (Serial/TCP/UDP)
├── tools/
│   └── mavlink-generator/    # MAVLink XML → TypeScript codegen
└── MissionPlanner/           # Legacy reference (not tracked in git)
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/anthropics/ardudeck.git
cd ardudeck

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Run the desktop app in dev mode
pnpm dev

# Build for production
pnpm build
```

### Build Commands

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @ardudeck/mavlink-ts build
pnpm --filter @ardudeck/comms build
pnpm --filter @ardudeck/desktop build

# Generate MAVLink types from XML definitions
node tools/mavlink-generator/dist/index.js
```

## Packages

### @ardudeck/mavlink-ts

TypeScript MAVLink protocol library with:
- 207 enums and 352 messages (all ArduPilot dialects)
- Async stream parser
- MAVLink v2 signing support
- X25 CRC validation

### @ardudeck/comms

Communication transport abstraction:
- SerialTransport (USB/COM ports)
- TcpTransport
- UdpTransport
- Auto-detect port scanner

### @ardudeck/desktop

Electron desktop application with:
- Connection panel (Serial/TCP/UDP)
- Telemetry dashboard with dockable panels
- Interactive map with vehicle tracking
- Debug console for packet logging

## Reference Implementation

For development reference, clone the legacy Mission Planner:

```bash
git clone https://github.com/ArduPilot/MissionPlanner.git
```

Key reference files:
- `MissionPlanner/ExtLibs/Mavlink/MavlinkCRC.cs` - CRC algorithm
- `MissionPlanner/ExtLibs/Mavlink/MavlinkParse.cs` - Packet parsing
- `MissionPlanner/ExtLibs/Interfaces/ICommsSerial.cs` - Transport interface

## License

MIT

## Acknowledgments

- [ArduPilot](https://ardupilot.org/) - Flight controller firmware
- [Mission Planner](https://github.com/ArduPilot/MissionPlanner) - Reference implementation
- [MAVLink](https://mavlink.io/) - Communication protocol
