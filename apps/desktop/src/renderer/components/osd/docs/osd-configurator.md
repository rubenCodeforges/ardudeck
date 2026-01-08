# OSD Configurator

A visual drag-and-drop editor for positioning OSD elements on the screen.

## Accessing the Configurator

1. Navigate to the **OSD** tab
2. Select **Edit Layout** from the Mode dropdown
3. The configurator view will appear

## Interface

```
┌─────────────────────────────────────────┬───────────────────────┐
│                                         │  Elements             │
│   ┌─────────────────────────────────┐   │  ☑ Altitude   [1, 2] │
│   │  OSD Preview Canvas             │   │  ☑ Speed      [1, 3] │
│   │                                 │   │  ☑ Heading    [14,0] │
│   │   [ALT]←drag handle             │   │  ...                 │
│   │                                 │   ├─────────────────────┤
│   │       ─╋─  ←selected element    │   │  Selected: Altitude │
│   │                                 │   │  X: [1]  Y: [2]     │
│   │                    [BATT]       │   │  Size: 6×1 chars    │
│   └─────────────────────────────────┘   │  [Reset]            │
│   ☑ Show Grid   ☑ Show Labels           ├─────────────────────┤
│                                         │  [Reset All]         │
└─────────────────────────────────────────┴───────────────────────┘
```

## Interactions

### Selecting Elements

- **Click** on any element on the canvas to select it
- **Click** on an element in the sidebar list to select it
- Selected elements show a blue highlight border
- Click empty area to deselect

### Moving Elements

**Drag and Drop:**
1. Click and hold on an element
2. Drag to new position
3. Release to place

Elements snap to the character grid (12×18 pixel increments).

**Number Inputs:**
1. Select an element
2. Edit the X or Y value in the Position Editor
3. Element moves immediately

### Toggling Elements

- Use the checkboxes in the sidebar to show/hide elements
- Disabled elements cannot be selected or dragged on the canvas

### Resetting Positions

- **Reset** button in Position Editor: Reset selected element to default position
- **Reset All Positions** button: Reset all elements to defaults

## Grid System

| Video Type | Columns | Rows |
|------------|---------|------|
| PAL | 30 | 16 |
| NTSC | 30 | 13 |

Character size: 12×18 pixels (before scaling)

Position (0, 0) is top-left corner.

## Element Bounds

Each element has a defined width and height:

| Element | Size | Notes |
|---------|------|-------|
| Most telemetry | 4-6 × 1 | Single row |
| Coordinates | 11 × 2 | Two rows (lat + lon) |
| Artificial Horizon | 9 × 1 | Wide horizon bar |
| CCRP Indicator | 5 × 9 | Tall vertical gauge |

The configurator prevents elements from being placed off-screen by clamping to bounds based on element size.

## Display Options

- **Show Grid**: Toggles character grid overlay
- **Show Labels**: Shows element names above each element
- **Background**: Color picker for canvas background

## Technical Details

### Architecture

```
OsdConfigurator
├── OsdCanvas (existing)
├── OsdElementOverlay[] (draggable boxes)
├── OsdElementList (sidebar list)
└── OsdPositionEditor (position controls)
```

### State Management

Element positions are stored in `osd-store.ts`:

```typescript
elementPositions: {
  altitude: { x: 1, y: 2, enabled: true },
  speed: { x: 1, y: 3, enabled: true },
  // ...
}
```

Changes are immediately reflected in the OSD preview.

### Drag Implementation

Uses pointer events (not a drag-and-drop library):

1. `pointerdown`: Capture pointer, record start position
2. `pointermove`: Calculate grid delta, update store
3. `pointerup`: Release pointer

Grid snapping is handled by rounding pixel deltas to character units.

## Keyboard Shortcuts (Planned)

- Arrow keys: Move selected element by 1 character
- Delete: Disable selected element
- Escape: Deselect

## Source Files

| File | Purpose |
|------|---------|
| `OsdConfigurator.tsx` | Main component |
| `OsdElementOverlay.tsx` | Draggable element boxes |
| `OsdElementList.tsx` | Sidebar element list |
| `OsdPositionEditor.tsx` | X/Y input controls |
| `hooks/useOsdDrag.ts` | Drag hook |
| `utils/osd/element-sizes.ts` | Element dimensions |
