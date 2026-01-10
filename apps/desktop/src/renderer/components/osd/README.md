# OSD Simulator Component

A real-time On-Screen Display (OSD) simulator that renders flight telemetry using MAX7456/AT7456E compatible MCM fonts, exactly as it would appear in FPV goggles.

## Features

- **MCM Font Support** - Full MAX7456/AT7456E font parsing (256 characters, 12x18 pixels each)
- **8 Bundled Fonts** - Default, Bold, Clarity, Clarity Medium, Impact, Impact Mini, Large, Vision
- **PAL/NTSC Support** - 30x16 (PAL) or 30x13 (NTSC) character grids
- **Demo Mode** - Adjust telemetry values with sliders for font development and testing
- **Live Mode** - Real-time display from connected flight controller (MAVLink or MSP)
- **16 OSD Elements** - All individually toggleable and positionable

## Architecture

```
OsdView.tsx              - Main tab component with controls and demo sliders
OsdCanvas.tsx            - Canvas-based renderer that draws the screen buffer
├── stores/
│   osd-store.ts         - State management, element renderers, screen buffer
│   payload-store.ts     - Payload configuration for CCRP
├── utils/osd/
│   font-renderer.ts     - MCM font parser, CachedFont, OsdScreenBuffer
│   osd-symbols.ts       - 150+ symbol constants (SYM.ALT_M, SYM.BATT, etc.)
├── utils/
│   ccrp-calculator.ts   - CCRP physics and lineup guidance calculations
└── assets/osd-fonts/    - Bundled .mcm font files
```

## OSD Elements

### Standard Elements

| Element | Description | Size |
|---------|-------------|------|
| `altitude` | Altitude in meters with icon | 6 chars |
| `speed` | Ground speed in km/h | 4 chars |
| `heading` | Compass heading 0-359 | 5 chars |
| `battery_voltage` | Battery voltage with icon | 6 chars |
| `battery_percent` | Battery percentage | 5 chars |
| `gps_sats` | GPS satellite count | 4 chars |
| `rssi` | Signal strength percentage | 4 chars |
| `throttle` | Throttle percentage | 5 chars |
| `flight_time` | Flight time MM:SS | 6 chars |
| `distance` | Distance from home | 6 chars |
| `coordinates` | Lat/Lon (2 rows) | 11 chars |
| `pitch` | Pitch angle with icon | 5 chars |
| `roll` | Roll angle with dynamic icon | 5 chars |
| `crosshairs` | Center crosshairs | 3 chars |

### Custom Elements

These are non-standard elements with separate documentation:

| Element | Description | Docs |
|---------|-------------|------|
| `artificial_horizon` | Tilted horizon responding to pitch/roll | [artificial-horizon.md](docs/artificial-horizon.md) |
| `ccrp_indicator` | Payload release guidance with steering | [ccrp-indicator.md](docs/ccrp-indicator.md) |

## Adding New Elements

1. Add element ID to `OsdElementId` type in `osd-store.ts`
2. Add default position to `DEFAULT_ELEMENT_POSITIONS`
3. Create render function: `renderMyElement(buffer, x, y, ...values)`
4. Add case to `updateScreenBuffer()` switch statement
5. (Optional) Add demo value if element needs special data
6. **Create documentation** in `docs/my-element.md`

Example renderer:

```typescript
function renderMyElement(
  buffer: OsdScreenBuffer,
  x: number,
  y: number,
  value: number
): void {
  buffer.setChar(x, y, SYM.MY_ICON);
  buffer.drawString(x + 1, y, value.toString());
}
```

## OSD Symbols

Common symbols from `osd-symbols.ts`:

```typescript
SYM.ALT_M              // Altitude icon
SYM.BATT               // Battery icon
SYM.GPS_SAT1/2         // GPS satellite icons
SYM.HOME               // Home icon
SYM.HEADING            // Compass icon
SYM.RSSI               // Signal strength icon
SYM.THR                // Throttle icon
SYM.M / SYM.KMH        // Unit icons
SYM.DEGREES            // Degree symbol
SYM.AH_BAR9_0..8       // Artificial horizon bar variants
SYM.ROLL_LEFT/RIGHT/LEVEL  // Roll direction icons
```

## OSD Configurator (Edit Layout Mode)

The OSD Configurator provides drag-and-drop element positioning:

1. Switch to **Edit Layout** mode in the Mode dropdown
2. Click any element on the canvas to select it
3. Drag elements to reposition them
4. Use the sidebar to:
   - Toggle elements on/off
   - View/edit exact X/Y coordinates
   - Reset individual or all positions

### Key Files

| File | Purpose |
|------|---------|
| `OsdConfigurator.tsx` | Main configurator view |
| `OsdElementOverlay.tsx` | Draggable element boxes |
| `OsdElementList.tsx` | Element checkbox list |
| `OsdPositionEditor.tsx` | X/Y coordinate editor |
| `hooks/useOsdDrag.ts` | Drag-and-drop hook |
| `utils/osd/element-sizes.ts` | Element width/height definitions |

## Future Enhancements

- [ ] Layout presets (Racing, Freestyle, Cinematic)
- [ ] Export/import positions as JSON
- [ ] Custom font upload
- [ ] Alarm thresholds (flash elements)
