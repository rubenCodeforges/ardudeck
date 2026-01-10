# CCRP Indicator OSD Element

Continuously Computed Release Point (CCRP) indicator for precision payload drops. Used in reforestation, firefighting, agriculture, and supply delivery applications.

## Display Layout

```
 >>R       ← Row 0: Steering cue
 |.|       ← Row 1-5: Vertical gauge
 |.|
 |#|
 |#|
 [X]       ← Row 6: Target marker
 245m      ← Row 7: Distance to release
  R45      ← Row 8: Heading error
```

Total size: 4 characters wide × 9 rows tall

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| Position | x=26, y=3 | Right side of screen |
| Enabled | false | Off by default (enable in Elements panel) |

## Steering Cue (Row 0)

| Display | Condition | Action |
|---------|-----------|--------|
| `>>R` | Heading error > +20° | Turn RIGHT hard |
| ` >R` | Heading error +5° to +20° | Turn RIGHT soft |
| `L<<` | Heading error < -20° | Turn LEFT hard |
| `L< ` | Heading error -5° to -20° | Turn LEFT soft |
| ` OK ` | Heading error within ±5° | Lined up, continue approach |
| `DROP!` | Lined up AND at release point | Release payload NOW |
| `PASS` | Past release point | Missed - go around |

## Gauge Fill Characters

| Character | Meaning |
|-----------|---------|
| `#` | Filled - aircraft is lined up with target |
| `=` | Filled - approaching but NOT lined up (steering needed) |
| `.` | Empty - still far from release |

The gauge fills from top to bottom as you approach the release point.

## Heading Error Display (Row 8)

Shows numeric heading error for precise corrections:

| Display | Meaning |
|---------|---------|
| `  R45` | Turn right 45° |
| `  L12` | Turn left 12° |
| `   0 ` | Perfectly aligned |

## Physics

### Core Formula

```
fallTime = aircraftAltitude / payloadDescentRate
forwardTravel = groundSpeed × fallTime
distanceToRelease = distanceToTarget - forwardTravel
```

### Example Calculation

```
Altitude: 100m
Speed: 15 m/s
Descent Rate: 5 m/s (seed balls)

fallTime = 100 / 5 = 20 seconds
forwardTravel = 15 × 20 = 300m

If target is 500m away:
  distanceToRelease = 500 - 300 = 200m (keep approaching)

If target is 300m away:
  distanceToRelease = 300 - 300 = 0m (DROP NOW!)
```

### Lineup Requirement

The `DROP!` indicator only appears when BOTH conditions are met:
1. **Lined up**: Heading error within ±5° of target bearing
2. **In range**: Distance to release within ±15m of release point

This prevents premature drops when flying crosswind toward the target.

## Payload Configuration

Managed by `payload-store.ts`. Presets available:

| Preset | Weight | Descent Rate | Use Case |
|--------|--------|--------------|----------|
| `seed_balls` | 0.05 kg | 8 m/s | Reforestation |
| `water_container` | 5 kg | 12 m/s | Firefighting |
| `supply_package` | 2 kg | 3 m/s | Parachute delivery |
| `custom` | 1 kg | 5 m/s | User configurable |

## Data Sources

### Demo Mode

Uses demo values from `osd-store.ts`:
- Aircraft position: `latitude`, `longitude`
- Aircraft state: `altitude`, `speed`, `heading`
- Target position: `targetLat`, `targetLon` (500m west of aircraft by default)

### Live Mode

- Aircraft telemetry from `telemetry-store.ts`
- Target from mission waypoint (TODO: integrate with `mission-store.ts`)

## Demo Mode Testing

1. **Enable element**: Toggle `ccrp_indicator` in Elements panel

2. **Test steering cue**:
   - Default heading (270°) is aligned with west target
   - Adjust **Heading** slider away from 270° to see steering cues
   - `>>R` appears when heading < 250° (need to turn right)
   - `L<<` appears when heading > 290° (need to turn left)

3. **Test approach**:
   - Adjust **Longitude** slider toward -122.4254 (target position)
   - Gauge fills as you get closer
   - At release point, `DROP!` appears (if lined up)

4. **Test lineup requirement**:
   - Set heading to 290° (off by 20°)
   - Approach target with longitude slider
   - Gauge fills with `=` instead of `#`
   - `DROP!` never appears until you correct heading

## Dependencies

- `ccrp-calculator.ts` - Physics calculations
- `payload-store.ts` - Descent rate configuration
- `osd-symbols.ts` - Character codes

## Source Files

| File | Purpose |
|------|---------|
| `utils/ccrp-calculator.ts` | `calculateCcrp()` function, bearing/distance math |
| `stores/payload-store.ts` | Payload presets and configuration |
| `stores/osd-store.ts` | `renderCcrpIndicator()` function |

## Future Enhancements

- [ ] Map overlay showing computed release point
- [ ] Audio tone at release
- [ ] Wind compensation input
- [ ] Multiple payload sequencing
- [ ] Drag coefficient for ballistic accuracy
- [ ] Integration with mission store for automatic target selection
