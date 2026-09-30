import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureTour, FeatureTourStep } from './types';
import { useParameterStore } from '../stores/parameter-store';
import { hasDualVtolControllers } from '../components/mavlink-config/mavlink-pid-schemes';

/**
 * The registry data model lives in `./types` and is owned by the parent
 * migration, so the optional `*Key` members are declared here as a structural
 * extension: every entry still satisfies `FeatureTour`, and consumers that want
 * the keys can take `LocalizedFeatureTour` (or just read `tour.titleKey`).
 */
export type LocalizedFeatureTourStep = FeatureTourStep & {
  /** Key under `tours.*` for the step heading; the English literal is the JSX `content`. */
  titleKey?: string;
  /** Key under `tours.*` for the step body. Multi-paragraph bodies join paragraphs with a blank line (`\n\n`). */
  bodyKey?: string;
};

export type LocalizedFeatureTour = Omit<FeatureTour, 'steps'> & {
  /** Key under `tours.*` for the prompt title. */
  titleKey?: string;
  /** Key under `tours.*` for the prompt blurb. */
  blurbKey?: string;
  steps: LocalizedFeatureTourStep[];
};

/** Prefer the i18n key; falls back to the literal. */
export function trText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

/**
 * Bound resolver for consumers (TourPrompt renders `tour.title` / `tour.blurb`,
 * ActiveTour renders each step's `content`). Use it from a component and pass the
 * registry's `*Key` together with its literal fallback:
 *
 *   const tr = useTourText();
 *   <h2>{tr(tour.titleKey, tour.title)}</h2>
 *
 * Step bodies are plain text in the catalog (inline `<strong>` emphasis is not
 * carried), so render them as translated text rather than the original JSX.
 */
export function useTourText(): (key: string | undefined, fallback: string) => string {
  const { t } = useTranslation('views');
  return useCallback((key: string | undefined, fallback: string) => trText(t, key, fallback), [t]);
}

// Feature tours are the per-release "what's new" walkthroughs. They are NOT
// version-gated at runtime (TourManager shows any registry tour the user hasn't
// seen for the current view), so stale tours keep prompting until removed here.
//
// One tour per SCREEN so a walkthrough never jumps the user between views. Each
// step's `predicate` skips it when its anchor isn't in the DOM (e.g. no groups
// yet), so a tour degrades gracefully instead of pointing at nothing.
const present = (selector: string) => () => !!document.querySelector(selector);

export const FEATURE_TOURS: LocalizedFeatureTour[] = [
  {
    id: 'mission-planning-alpha32',
    titleKey: 'tours.mission-planning-alpha32.title',
    blurbKey: 'tours.mission-planning-alpha32.blurb',
    view: 'mission',
    version: '0.0.32',
    title: 'Mission planning, leveled up',
    blurb:
      'Grouped missions, corridor surveys, GSD-first planning, GIS import, multi-format export, and full undo - all in the planner.',
    steps: [
      {
        selector: '[data-tour="mission-group"]',
        predicate: present('[data-tour="mission-group"]'),
        titleKey: 'tours.mission-planning-alpha32.steps.mission-group.title',
        bodyKey: 'tours.mission-planning-alpha32.steps.mission-group.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Missions are organized into groups</div>
            <p className="text-xs leading-relaxed opacity-90">
              Every waypoint now lives in a named, colored <strong>group</strong>. Click the swatch
              to recolor, the checkbox to show/hide it on the map, and the per-group button to
              upload or save just that group. Each header shows the group's
              {' '}<strong>distance, flight time and GSD</strong> at a glance.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-survey"]',
        predicate: present('[data-tour="mission-survey"]'),
        titleKey: 'tours.mission-planning-alpha32.steps.mission-survey.title',
        bodyKey: 'tours.mission-planning-alpha32.steps.mission-survey.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Corridor surveys</div>
            <p className="text-xs leading-relaxed opacity-90">
              Under the <strong>Survey</strong> button, pick <strong>Corridor</strong> for linear
              jobs - roads, rail, power lines, pipelines. Draw a centerline and ArduDeck lays
              parallel strips along it. Pick <strong>Plane</strong> (racetrack turns at sharp bends)
              or <strong>Copter</strong> (turns on the spot), and set width, strip count and overlap.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-survey"]',
        predicate: present('[data-tour="mission-survey"]'),
        titleKey: 'tours.mission-planning-alpha32.steps.mission-survey-2.title',
        bodyKey: 'tours.mission-planning-alpha32.steps.mission-survey-2.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Smarter area surveys</div>
            <p className="text-xs leading-relaxed opacity-90">
              Plan by <strong>GSD</strong> (cm/px) instead of guessing altitude, see live
              {' '}<strong>battery and data</strong> estimates, and split a big job into
              {' '}<strong>battery-sized sorties</strong> in one click. Crosshatch can even fly its
              two passes at <strong>two different heights</strong> for better 3D.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-import"]',
        predicate: present('[data-tour="mission-import"]'),
        titleKey: 'tours.mission-planning-alpha32.steps.mission-import.title',
        bodyKey: 'tours.mission-planning-alpha32.steps.mission-import.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Import an area from GIS</div>
            <p className="text-xs leading-relaxed opacity-90">
              Bring a survey boundary straight in from <strong>KML</strong>, <strong>KMZ</strong> or
              {' '}<strong>GeoJSON</strong> - one survey group per polygon, inner rings kept as
              no-fly holes. No more re-tracing a boundary by hand.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-export"]',
        predicate: present('[data-tour="mission-export"]'),
        titleKey: 'tours.mission-planning-alpha32.steps.mission-export.title',
        bodyKey: 'tours.mission-planning-alpha32.steps.mission-export.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Export in any format</div>
            <p className="text-xs leading-relaxed opacity-90">
              Save or export the whole mission from here - <strong>.waypoints</strong> (QGC WPL, for
              ArduPilot / Mission Planner) or <strong>.plan</strong> (QGroundControl). Pick the
              format up front; no guessing from the file dialog.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="mission-history"]',
        predicate: present('[data-tour="mission-history"]'),
        titleKey: 'tours.mission-planning-alpha32.steps.mission-history.title',
        bodyKey: 'tours.mission-planning-alpha32.steps.mission-history.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Undo, redo and crash recovery</div>
            <p className="text-xs leading-relaxed opacity-90">
              Full <strong>undo / redo</strong> (Cmd/Ctrl+Z) across edits, plus automatic
              {' '}<strong>autosave</strong> - if the app closes mid-plan, your mission is recovered
              on the next launch.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'vtol-dual-controller-tuning-alpha32',
    titleKey: 'tours.vtol-dual-controller-tuning-alpha32.title',
    blurbKey: 'tours.vtol-dual-controller-tuning-alpha32.blurb',
    view: 'parameters',
    version: '0.0.32',
    title: 'Tune VTOL and fixed-wing separately',
    blurb: 'QuadPlanes carry two controller sets. The PID tab now lets you switch which one you tune.',
    // Only offer this on a QuadPlane that exposes both control-law sets; on any
    // other vehicle the switch does not exist, so the tour stays hidden.
    predicate: () => hasDualVtolControllers(useParameterStore.getState().parameters),
    steps: [
      {
        selector: '[data-tour="tuning-vtol-toggle"]',
        predicate: present('[data-tour="tuning-vtol-toggle"]'),
        titleKey: 'tours.vtol-dual-controller-tuning-alpha32.steps.tuning-vtol-toggle.title',
        bodyKey: 'tours.vtol-dual-controller-tuning-alpha32.steps.tuning-vtol-toggle.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Two controllers, one autopilot</div>
            <p className="text-xs leading-relaxed opacity-90">
              A QuadPlane runs separate controllers for hover and forward flight. This switch flips
              the PID tab between the <strong>VTOL</strong> rate controller
              {' '}(<code className="font-mono text-[11px]">Q_A_RAT_</code>) and the
              {' '}<strong>fixed-wing</strong> controller
              {' '}(<code className="font-mono text-[11px]">RLL_RATE_</code> /
              {' '}<code className="font-mono text-[11px]">RLL2SRV_</code>).
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              The sliders, presets and profiles all follow your choice, so you can tune each set
              without leaving the page.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'flight-info-alpha32-5',
    titleKey: 'tours.flight-info-alpha32-5.title',
    blurbKey: 'tours.flight-info-alpha32-5.blurb',
    view: 'mission',
    version: '0.0.32.5',
    title: 'New: the Flight Info briefing',
    blurb:
      'A live pre-flight briefing for any mission or survey: endurance and batteries, distance and altitude, site wind and weather, and your daylight window.',
    steps: [
      {
        selector: '[data-tour="flight-info-panel"]',
        // No predicate: the panel's tab is activated when this tour starts (see
        // MissionPlanningView), and mutationObservables lets the highlight snap
        // to it once dockview mounts the panel content.
        mutationObservables: ['[data-tour="flight-info-panel"]'],
        titleKey: 'tours.flight-info-alpha32-5.steps.flight-info-panel.title',
        bodyKey: 'tours.flight-info-alpha32-5.steps.flight-info-panel.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Brief the flight before you fly it</div>
            <p className="text-xs leading-relaxed opacity-90">
              The new <strong>Flight Info</strong> tab turns your mission into the numbers a pilot
              decides on: <strong>flight time</strong> and how many <strong>batteries</strong> it
              needs, total <strong>distance</strong> and <strong>altitude</strong> against the
              ceiling, and live <strong>site weather</strong>.
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              Wind shows as a <strong>compass</strong>, and the <strong>daylight</strong> bar marks
              when the flight would finish against sunset - so you can see at a glance whether it
              lands before dark.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'quick-launch-033',
    titleKey: 'tours.quick-launch-033.title',
    blurbKey: 'tours.quick-launch-033.blurb',
    view: 'telemetry',
    version: '0.33',
    title: 'New: Quick Launch & the Area Editor',
    blurb:
      'Pop tools into their own windows from the header, and jump straight into the new Area Editor for drawing survey areas and corridors.',
    steps: [
      {
        selector: '[data-tour="welcome-cards"]',
        // Only shown on the disconnected welcome screen; skipped once connected.
        predicate: present('[data-tour="welcome-cards"]'),
        titleKey: 'tours.quick-launch-033.steps.welcome-cards.title',
        bodyKey: 'tours.quick-launch-033.steps.welcome-cards.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Jump straight into a tool</div>
            <p className="text-xs leading-relaxed opacity-90">
              No vehicle connected? These cards open the tools that work offline -
              {' '}<strong>Mission Planning</strong>, the new <strong>Area Editor</strong>,
              {' '}<strong>SITL</strong>, <strong>Flight Log Analysis</strong>,
              {' '}<strong>Firmware Flash</strong> and your <strong>Mission Library</strong>.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="quick-launch"]',
        predicate: present('[data-tour="quick-launch"]'),
        titleKey: 'tours.quick-launch-033.steps.quick-launch.title',
        bodyKey: 'tours.quick-launch-033.steps.quick-launch.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Quick Launch - tools in their own window</div>
            <p className="text-xs leading-relaxed opacity-90">
              Open the <strong>MAVLink Inspector</strong> or <strong>Telemetry Dashboard</strong> in a
              separate window - ideal for a <strong>second monitor</strong> while you keep planning or
              tuning in the main window. Each stays live alongside the rest of the app.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="quick-launch"]',
        predicate: present('[data-tour="quick-launch"]'),
        titleKey: 'tours.quick-launch-033.steps.quick-launch-2.title',
        bodyKey: 'tours.quick-launch-033.steps.quick-launch-2.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Meet the Area Editor</div>
            <p className="text-xs leading-relaxed opacity-90">
              The new <strong>Area Editor</strong> opens from here: a full-window map for drawing
              survey <strong>areas and corridors</strong> - multi-polygon, holes, KML import, a live
              {' '}<strong>flight briefing</strong> (toggle hectares/acres), and a
              {' '}<strong>go-to</strong> search to fly to any site. <strong>Send to mission</strong>
              {' '}drops it straight into the planner.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'rtk-ntrip-034',
    titleKey: 'tours.rtk-ntrip-034.title',
    blurbKey: 'tours.rtk-ntrip-034.blurb',
    view: 'telemetry',
    version: '0.1.0',
    title: 'New: RTK corrections over NTRIP',
    blurb:
      'Stream centimeter-grade RTK correction data from any NTRIP caster straight to your vehicle - no radio link to a base station needed.',
    steps: [
      {
        selector: '[data-tour="add-panel"]',
        predicate: present('[data-tour="add-panel"]'),
        titleKey: 'tours.rtk-ntrip-034.steps.add-panel.title',
        bodyKey: 'tours.rtk-ntrip-034.steps.add-panel.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">RTK / NTRIP panel</div>
            <p className="text-xs leading-relaxed opacity-90">
              Find the new <strong>RTK / NTRIP</strong> panel here (it is also part of the
              {' '}<strong>All Panels</strong> layout, tabbed behind GPS). Point it at an NTRIP
              caster, pick a mountpoint from the fetched list, and ArduDeck forwards the
              {' '}<strong>RTCM corrections</strong> to your vehicle over MAVLink - with an
              RTK-capable GPS the fix climbs to <strong>RTK Fixed</strong> (1-2 cm). In
              multi-vehicle engine mode the corrections go to <strong>every vehicle</strong> at once.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'multi-vehicle-beta1',
    titleKey: 'tours.multi-vehicle-beta1.title',
    blurbKey: 'tours.multi-vehicle-beta1.blurb',
    view: 'telemetry',
    version: '0.1.0',
    title: 'New: fly a whole fleet',
    blurb:
      'Multi-vehicle is here: one switch starts the engine, vehicles appear as they come online, and ArduDeck commands them individually or together.',
    steps: [
      {
        selector: '[data-tour="connection-multi-tab"]',
        predicate: present('[data-tour="connection-multi-tab"]'),
        titleKey: 'tours.multi-vehicle-beta1.steps.connection-multi-tab.title',
        bodyKey: 'tours.multi-vehicle-beta1.steps.connection-multi-tab.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Multi-vehicle mode</div>
            <p className="text-xs leading-relaxed opacity-90">
              Switch the connection sidebar to <strong>Multi-vehicle</strong> and flip it on:
              ArduDeck starts its engine in the background and vehicles appear as their
              heartbeats arrive - no ports, no URLs. <strong>Add a vehicle</strong> covers radio,
              internet, cellular and second-ground-station links. Click a vehicle in the fleet
              list and the telemetry, map and commands switch to it.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'log-explorer-beta1',
    titleKey: 'tours.log-explorer-beta1.title',
    blurbKey: 'tours.log-explorer-beta1.blurb',
    view: 'logs',
    version: '0.1.0',
    title: 'Log Explorer, rebuilt',
    blurb:
      'Multiple charts with independent y-axes, window-aware stats, events and FFT panels, and a flight path map that follows your cursor.',
    steps: [
      {
        selector: '[data-tour="log-field-picker"]',
        predicate: present('[data-tour="log-field-picker"]'),
        titleKey: 'tours.log-explorer-beta1.steps.log-field-picker.title',
        bodyKey: 'tours.log-explorer-beta1.steps.log-field-picker.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pick any recorded field</div>
            <p className="text-xs leading-relaxed opacity-90">
              Search every message the log contains and toggle fields onto the
              {' '}<strong>active chart</strong> - add more charts and the picker targets whichever
              one you focus. Multi-instance messages (two GPS units, four ESCs) expand per
              instance, and units come straight from the log.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="log-chart-actions"]',
        predicate: present('[data-tour="log-chart-actions"]'),
        titleKey: 'tours.log-explorer-beta1.steps.log-chart-actions.title',
        bodyKey: 'tours.log-explorer-beta1.steps.log-chart-actions.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Independent axes, live stats, CSV</div>
            <p className="text-xs leading-relaxed opacity-90">
              Toggle between a shared y-axis and <strong>one axis per field</strong> so RPM and
              attitude can share a chart. The legend's <strong>min / avg / max</strong> recompute
              over the visible window as you zoom and pan, and the export button saves exactly
              that window as CSV. Events, Params and <strong>FFT</strong> live in the panels menu.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'osd-tool-beta1',
    titleKey: 'tours.osd-tool-beta1.title',
    blurbKey: 'tours.osd-tool-beta1.blurb',
    view: 'osd',
    version: '0.1.0',
    title: 'OSD Tool: know where your overlay lives',
    blurb:
      'Compose a fully custom ground HUD, edit the FC Text OSD, or author a RubyFPV layout - the destination bar always shows where each one ends up.',
    steps: [
      {
        selector: '[data-tour="osd-destination-bar"]',
        predicate: present('[data-tour="osd-destination-bar"]'),
        titleKey: 'tours.osd-tool-beta1.steps.osd-destination-bar.title',
        bodyKey: 'tours.osd-tool-beta1.steps.osd-destination-bar.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Three OSDs, three destinations</div>
            <p className="text-xs leading-relaxed opacity-90">
              This bar is the ground truth: the <strong>custom HUD</strong> is drawn by ArduDeck
              over your screen and video feed and is <strong>never uploaded</strong> to the flight
              controller; the <strong>Text OSD</strong> editor reads and writes the FC's real
              OSDn_* layout; the <strong>RubyFPV</strong> designer exports a layout for RubyFPV
              ground stations. All three preview over your live video feed.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'unit-preferences-beta1',
    titleKey: 'tours.unit-preferences-beta1.title',
    blurbKey: 'tours.unit-preferences-beta1.blurb',
    view: 'settings',
    version: '0.1.0',
    title: 'Plan in your own units',
    blurb: 'Feet, mph, knots, acres - pick per-quantity display units and the whole app follows.',
    steps: [
      {
        selector: '[data-tour="unit-preferences"]',
        predicate: present('[data-tour="unit-preferences"]'),
        titleKey: 'tours.unit-preferences-beta1.steps.unit-preferences.title',
        bodyKey: 'tours.unit-preferences-beta1.steps.unit-preferences.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Display Units</div>
            <p className="text-xs leading-relaxed opacity-90">
              Set distance, altitude, speed, area, weight and more independently - mission
              planning, telemetry panels, the log explorer and survey estimates all render in
              your choice. Values sent to the vehicle stay metric under the hood, so nothing
              about the flight changes.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'altitude-planning-beta1',
    titleKey: 'tours.altitude-planning-beta1.title',
    blurbKey: 'tours.altitude-planning-beta1.blurb',
    view: 'mission',
    version: '0.1.0',
    title: 'Altitude profile that understands frames',
    blurb:
      'The profile now plots relative, terrain and ASL waypoints correctly against real terrain - with AGL labels, collision warnings you can trust, and zoom.',
    steps: [
      {
        selector: '[data-tour="mission-altitude-panel"]',
        predicate: present('[data-tour="mission-altitude-panel"]'),
        titleKey: 'tours.altitude-planning-beta1.steps.mission-altitude-panel.title',
        bodyKey: 'tours.altitude-planning-beta1.steps.mission-altitude-panel.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Altitude, in the frame you planned it</div>
            <p className="text-xs leading-relaxed opacity-90">
              Waypoints plot against terrain in their own altitude frame, so an 80m-relative
              survey at a mountain site reads <strong>80m (80m AGL)</strong>, not a false
              collision. The axis shows <strong>height above home</strong> with ASL alongside,
              terrain-following segments hug the ground, and the dashed line is your safety
              clearance. <strong>Scroll to zoom, drag to pan</strong>, drag a waypoint dot to
              change its altitude, and let <strong>Auto Adjust</strong> fix real terrain
              conflicts.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'radio-hud-beta1',
    titleKey: 'tours.radio-hud-beta1.title',
    blurbKey: 'tours.radio-hud-beta1.blurb',
    view: 'radio-hud',
    version: '0.1.0',
    title: 'Your radio becomes a mini GCS',
    blurb:
      'Design an ArduDeck telemetry screen for your EdgeTX radio - live preview, drag-and-drop layout, offline field maps, voice alerts - and push it to the SD card in one click.',
    steps: [
      {
        selector: '[data-tour="hud-model"]',
        predicate: present('[data-tour="hud-model"]'),
        titleKey: 'tours.radio-hud-beta1.steps.hud-model.title',
        bodyKey: 'tours.radio-hud-beta1.steps.hud-model.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Pick your radio</div>
            <p className="text-xs leading-relaxed opacity-90">
              Color radios (TX15, TX16S, NV14...) get the full widget - the preview is a faithful
              mirror of that screen. Monochrome radios (Boxer, Zorro, TX12, X9D) get a dense
              1-bit telemetry script with the same voice alerts. Layouts rescale when you switch.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="hud-edit"]',
        predicate: present('[data-tour="hud-edit"]'),
        titleKey: 'tours.radio-hud-beta1.steps.hud-edit.title',
        bodyKey: 'tours.radio-hud-beta1.steps.hud-edit.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Make the screen yours</div>
            <p className="text-xs leading-relaxed opacity-90">
              On color radios: drag, resize and swap <strong>17 instrument tiles</strong> across
              up to 8 swipeable pages (or start from a preset). On monochrome: every data slot,
              the big readout and the center panel (horizon or data wall) are assignable in place.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="hud-config"]',
        predicate: present('[data-tour="hud-config"]'),
        titleKey: 'tours.radio-hud-beta1.steps.hud-config.title',
        bodyKey: 'tours.radio-hud-beta1.steps.hud-config.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Zero-config by default</div>
            <p className="text-xs leading-relaxed opacity-90">
              Everything here is an <strong>override</strong>. Left on auto, the widget configures
              itself from the vehicle's own telemetry over ELRS - cell count, capacity, battery %
              - no ArduDeck connection needed in the field.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="hud-maps"]',
        predicate: present('[data-tour="hud-maps"]'),
        titleKey: 'tours.radio-hud-beta1.steps.hud-maps.title',
        bodyKey: 'tours.radio-hud-beta1.steps.hud-maps.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Offline maps on the radio</div>
            <p className="text-xs leading-relaxed opacity-90">
              Click your flying field and ArduDeck stitches <strong>satellite images at three
              zoom levels</strong> for the Map tile - vehicle, home, trail and your planned
              mission drawn on top, fully offline. Tap the tile on the radio to switch zoom.
            </p>
          </div>
        ),
      },
      {
        selector: '[data-tour="hud-apply"]',
        predicate: present('[data-tour="hud-apply"]'),
        titleKey: 'tours.radio-hud-beta1.steps.hud-apply.title',
        bodyKey: 'tours.radio-hud-beta1.steps.hud-apply.body',
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">One click to the radio</div>
            <p className="text-xs leading-relaxed opacity-90">
              Plug the radio in via USB (choose <strong>USB Storage</strong> on its screen) and
              hit <strong>Apply</strong> - widget, config, voice pack and maps land on the SD
              card together. Then on the radio: App layout, full-screen widget, ArduDeck.
            </p>
          </div>
        ),
      },
    ],
  },
];

export function getToursForView(view: string): LocalizedFeatureTour[] {
  return FEATURE_TOURS.filter((t) => t.view === view);
}

export function getTourById(id: string): LocalizedFeatureTour | undefined {
  return FEATURE_TOURS.find((t) => t.id === id);
}
