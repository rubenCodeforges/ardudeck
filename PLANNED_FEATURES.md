# Planned Features

Future features and enhancements for ArduDeck.

---

## Rate Profile Switching (In-Flight)

**Priority:** P1
**Complexity:** Medium
**Target:** Modes Wizard + Rates Tab

### The Problem

Pilots often want different stick sensitivity for different situations:
- **Learning:** Slow, forgiving response
- **Freestyle:** Balanced, controlled but responsive
- **Racing:** Fast, snappy response
- **Cinematic:** Ultra-smooth for filming

Currently, rates are a single profile. Changing them requires landing and connecting to configurator.

### Proposed Solution

Allow users to configure 2-3 rate profiles and switch between them **in-flight** using an AUX switch.

### User Experience (Beginner-Focused)

**Step 1: Choose Your Profiles**
```
Which flying styles do you use?

[Smooth]          [Normal]           [Fast]
Turtle icon       Gauge icon         Rocket icon
"Slow & steady"   "Balanced feel"    "Snappy response"
Perfect for       Good for most      For experienced
filming           flying             pilots
```

**Step 2: Assign a Switch**
```
Which switch should change your rates?

[Switch A]  [Switch B]  [Switch C]  [Switch D]
   AUX1        AUX2        AUX3        AUX4

Tip: Use a 3-position switch for 3 profiles,
     or a 2-position switch for 2 profiles.
```

**Step 3: Test It**
```
Flip your switch to see which profile activates:

[====|====|====]  <- Switch position indicator
 LOW   MID  HIGH

Current: [SMOOTH] - Slow, cinematic movements
         Rate curve visualization showing gentle curve
```

### Technical Implementation

#### MSP Commands

**iNav:**
- `rateprofile <0-2>` via CLI to select active profile
- MSP2 0x2007/0x2008 for read/write rates
- Adjustment function for in-flight switching (needs research)

**Betaflight:**
- `MSP_SET_ADJUSTMENT_RANGE` for AUX-based profile switching
- Adjustment ID for rate profile selection
- Multiple rate profiles supported natively

#### Store Structure

```typescript
interface RateProfileState {
  // Profile data
  profiles: RateProfile[];        // 2-3 profiles
  activeProfileIndex: number;     // Currently selected

  // Switch assignment
  auxChannel: number;             // Which AUX controls switching
  switchPositions: number[];      // PWM ranges for each profile

  // Live preview
  rcChannels: number[];           // For showing active profile

  // Presets
  presets: RatePreset[];          // Smooth, Normal, Fast, etc.
}

interface RateProfile {
  id: string;
  name: string;                   // "Smooth", "Normal", "Fast"
  icon: LucideIcon;
  description: string;
  rates: RatesConfig;
}
```

#### UI Components

1. **RateProfileWizard** - Step-by-step setup (in Modes Wizard or standalone)
2. **RateProfileSelector** - Quick switcher in Rates Tab header
3. **RateProfileCard** - Visual card showing profile with rate curve
4. **RateCurvePreview** - Live visualization of rate response

### Beginner-Friendly Presets

| Preset | Roll/Pitch Rate | Expo | Feel |
|--------|-----------------|------|------|
| Smooth | 200 | 40 | Slow, cinematic, very forgiving |
| Normal | 400 | 25 | Balanced, good for most flying |
| Freestyle | 600 | 15 | Responsive, good for tricks |
| Racing | 800 | 5 | Fast, linear, snappy |

### Copy/Text Guidelines

- "Smooth" not "Low rates with high expo"
- "How fast your drone spins" not "Angular velocity"
- "Flip your switch" not "Change AUX channel PWM value"
- Show the feel, not the numbers

### Files to Modify

| File | Changes |
|------|---------|
| `stores/rate-profile-store.ts` | New store for profile state |
| `MspConfigView.tsx` | Add profile selector to RatesTab |
| `msp-handlers.ts` | Add profile switching MSP calls |
| `modes-wizard-store.ts` | Optional: integrate with modes wizard |
| `rate-presets.ts` | New file for beginner presets |

### Open Questions

1. Does iNav support adjustment functions for rate profile switching?
2. Should this be part of Modes Wizard or a separate Rates Wizard?
3. How many profiles to support? (2 vs 3)
4. Should we show rate curves or simplified "feel" indicators?

---

## More Planned Features

*(Add future features here)*

---

*Last updated: 2025-01-19*
