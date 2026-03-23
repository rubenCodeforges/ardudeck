# Map Overlays

ArduDeck's telemetry and mission planning maps support several overlay layers that can be toggled independently. All overlay data is cached to minimize API calls and support offline use.

## Weather Radar

Real-time weather radar from [RainViewer](https://www.rainviewer.com/). No API key required.

- Toggle with the **Radar** button in the map layer selector
- Automatically adapts color scheme to base map: blue tones on dark/satellite layers, NEXRAD green/yellow/red on light layers
- Updates every 5 minutes
- Tiles cached to disk through the tile-cache protocol

## Airspace Zones

Colored polygons showing restricted airspace areas. Requires an [OpenAIP](https://www.openaip.net/) API key (free).

- Toggle with the **Zones** button
- Color-coded by type:
  - **Blue** - CTR (Control Zone)
  - **Red** - Restricted / Prohibited
  - **Orange** - Danger
  - **Purple** - TMA (Terminal Maneuvering Area)
- Non-interactive (won't block waypoint clicks during mission planning)
- Legend shown in bottom-left corner when active
- Data fetched from OpenAIP GeoJSON API with 30s throttle and position-based refresh

## Aviation Charts (OpenAIP Tiles)

Pre-rendered aviation chart tiles from [OpenAIP](https://www.openaip.net/). Shows airports, navaids, reporting points, and airspace boundaries with proper aviation symbology. Requires an OpenAIP API key (free).

- Toggle with the **Aviation** button
- Zoom-adaptive detail (labels and symbols appear at appropriate zoom levels)
- Tiles cached to disk

## Terrain Elevation (Height)

Color-coded terrain elevation overlay using Mapzen Terrarium DEM tiles.

- Toggle with the **Height** button
- **Auto-range mode** - Colors automatically scale to the visible elevation range
- **Fixed range mode** - Set custom min/max elevation for consistent coloring
- **Relative mode** - Show elevation relative to the vehicle's current altitude (useful during flight)
- **AMSL / Relative toggle** - Switch between absolute and relative elevation display
- Water areas rendered as transparent

## Setting Up API Keys

Airspace Zones and Aviation Charts require a free OpenAIP API key:

1. Go to [openaip.net](https://www.openaip.net/) and create a free account
2. Navigate to your account settings to find your API key
3. In ArduDeck, go to **Settings > Map Overlays** and paste your key
4. Alternatively, the API key dialog appears automatically when you first enable an OpenAIP overlay
