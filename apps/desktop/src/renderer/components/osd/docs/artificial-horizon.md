# Artificial Horizon OSD Element

A tilted horizon bar that responds to aircraft pitch and roll angles, providing visual attitude reference in the OSD.

## Display

```
         ▔▔▔▔▔▔▔▔▔      ← Horizon bar (9 characters wide)
            ─╋─          ← Crosshairs (center reference)
```

When rolled left:
```
       ▔▔▔▔▔▔▔▔▔
          ╲
           ╲
```

When pitched up, horizon moves down. When pitched down, horizon moves up.

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| Position | x=14, y=7 | Center of screen |
| Width | 9 characters | Fixed |
| Enabled | true | On by default |

## Technical Details

### Rendering

The horizon uses 9 horizontal bar characters (`SYM.AH_BAR9_0` through `SYM.AH_BAR9_8`) that provide sub-character vertical positioning (2px increments within the 18px character height).

### Roll Calculation

```typescript
const ROLL_SENSITIVITY = 3.0;  // Higher = less sensitive
const rollRadians = roll * (Math.PI / 180);
const rollPixelOffset = (-columnOffset * Math.tan(rollRadians) * CHAR_HEIGHT_PX) / ROLL_SENSITIVITY;
```

- Each column calculates its own vertical offset based on distance from center
- `tan(roll)` provides the slope
- Sensitivity factor prevents excessive tilt at small angles
- Negative sign ensures correct tilt direction (left roll = left side down)

### Pitch Calculation

```typescript
const pitchRowOffset = Math.round(pitch / 10);
```

- Every 10° of pitch moves the horizon by 1 row
- Pitch up = horizon moves down (showing sky above)
- Pitch down = horizon moves up (showing ground above)

### Sub-Character Positioning

The horizon bar has 9 variants for smooth vertical movement:

| Symbol | Offset |
|--------|--------|
| `AH_BAR9_0` | +8px (top of cell) |
| `AH_BAR9_1` | +6px |
| `AH_BAR9_2` | +4px |
| `AH_BAR9_3` | +2px |
| `AH_BAR9_4` | 0px (center) |
| `AH_BAR9_5` | -2px |
| `AH_BAR9_6` | -4px |
| `AH_BAR9_7` | -6px |
| `AH_BAR9_8` | -8px (bottom of cell) |

## Demo Mode Testing

1. Adjust **Roll** slider (-45° to +45°)
   - Negative = bank left, horizon tilts right
   - Positive = bank right, horizon tilts left

2. Adjust **Pitch** slider (-45° to +45°)
   - Negative = nose down, horizon moves up
   - Positive = nose up, horizon moves down

## Dependencies

- `SYM.AH_BAR9_0..8` from `osd-symbols.ts`
- Works with `crosshairs` element (should share same x position)

## Source

- Renderer: `osd-store.ts` → `renderArtificialHorizon()`
- Position: 14 (center column for 30-wide screen)
