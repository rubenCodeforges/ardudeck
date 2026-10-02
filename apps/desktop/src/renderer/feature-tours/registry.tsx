import { Trans, useTranslation } from 'react-i18next';
import type { FeatureTour, FeatureTourStep } from './types';
import { useConfigTabMenuStore } from '../stores/config-tab-menu-store';
import { useWorkspaceDialogStore } from '../stores/workspace-dialog-store';
import { useSurveyMenuStore } from '../stores/survey-menu-store';
import { useParameterStore } from '../stores/parameter-store';
import { hasDualVtolControllers } from '../components/mavlink-config/mavlink-pid-schemes';

// Feature tours are the per-release "what's new" walkthroughs. They are NOT
// version-gated at runtime (TourManager shows any registry tour the user hasn't
// seen for the current view), so stale tours keep prompting until removed here.
//
// One tour per SCREEN so a walkthrough never jumps the user between views. Each
// step's `predicate` skips it when its anchor isn't in the DOM (e.g. no groups
// yet), so a tour degrades gracefully instead of pointing at nothing.
const present = (selector: string) => () => !!document.querySelector(selector);

const TOUR_TEXT_COMPONENTS = {
  b: <strong />,
  code: <code className="font-mono text-[11px]" />,
};

/** Step text from `feature-tours:registry.<k>.title` and `.body` (plus `.body2` ... when `paragraphs` > 1). */
function TourText({ k, paragraphs = 1 }: { k: string; paragraphs?: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{t(`feature-tours:registry.${k}.title`)}</div>
      {Array.from({ length: paragraphs }, (_, i) => {
        const bodyKey = `feature-tours:registry.${k}.body${i === 0 ? '' : i + 1}`;
        return (
          <p key={bodyKey} className="text-xs leading-relaxed opacity-90">
            <Trans i18nKey={bodyKey} components={TOUR_TEXT_COMPONENTS} />
          </p>
        );
      })}
    </div>
  );
}

/** A configuration tab group, with its dropdown opened so the sub-tabs are in the highlight. */
function groupStep(groupId: string, textKey: string): FeatureTourStep {
  const anchor = `[data-tour="mavlink-tab-group-${groupId}"]`;
  return {
    selector: anchor,
    predicate: present(anchor),
    setup: () => useConfigTabMenuStore.getState().setOpenGroupId(groupId),
    // reactour only refreshes when an added node matches, so observe this group's menu itself.
    highlightedSelectors: [`[data-tour="mavlink-tab-menu-${groupId}"]`],
    mutationObservables: [`[data-tour^="mavlink-tab-menu-"]`],
    content: <TourText k={textKey} />,
  };
}

/** A configuration tab that is not in a group on this vehicle. */
function itemStep(tabId: string, textKey: string): FeatureTourStep {
  const anchor = `[data-tour="mavlink-tab-${tabId}"]`;
  return {
    selector: anchor,
    predicate: present(anchor),
    setup: () => useConfigTabMenuStore.getState().setOpenGroupId(null),
    mutationObservables: [`[data-tour^="mavlink-tab-menu-"]`],
    content: <TourText k={textKey} />,
  };
}

export const FEATURE_TOURS: FeatureTour[] = [
  {
    id: 'mission-planning-alpha32',
    view: 'mission',
    version: '0.0.32',
    titleKey: 'feature-tours:registry.missionPlanning.title',
    blurbKey: 'feature-tours:registry.missionPlanning.blurb',
    cleanup: () => useSurveyMenuStore.getState().setOpen(false),
    steps: [
      {
        selector: '[data-tour="mission-group"]',
        predicate: present('[data-tour="mission-group"]'),
        setup: () => useSurveyMenuStore.getState().setOpen(false),
        content: <TourText k="missionPlanning.groups" />,
      },
      {
        selector: '[data-tour="mission-survey"]',
        predicate: present('[data-tour="mission-survey"]'),
        setup: () => useSurveyMenuStore.getState().setOpen(true),
        highlightedSelectors: ['[data-tour="mission-survey-menu"]'],
        mutationObservables: ['[data-tour="mission-survey-menu"]'],
        content: <TourText k="missionPlanning.corridor" />,
      },
      {
        selector: '[data-tour="mission-survey"]',
        predicate: present('[data-tour="mission-survey"]'),
        setup: () => useSurveyMenuStore.getState().setOpen(true),
        highlightedSelectors: ['[data-tour="mission-survey-menu"]'],
        mutationObservables: ['[data-tour="mission-survey-menu"]'],
        content: <TourText k="missionPlanning.areaSurvey" />,
      },
      {
        selector: '[data-tour="mission-import"]',
        predicate: present('[data-tour="mission-import"]'),
        setup: () => useSurveyMenuStore.getState().setOpen(false),
        content: <TourText k="missionPlanning.gisImport" />,
      },
      {
        selector: '[data-tour="mission-export"]',
        predicate: present('[data-tour="mission-export"]'),
        content: <TourText k="missionPlanning.export" />,
      },
      {
        selector: '[data-tour="mission-history"]',
        predicate: present('[data-tour="mission-history"]'),
        content: <TourText k="missionPlanning.history" />,
      },
    ],
  },
  {
    id: 'vtol-dual-controller-tuning-alpha32',
    view: 'parameters',
    version: '0.0.32',
    titleKey: 'feature-tours:registry.vtolDualTuning.title',
    blurbKey: 'feature-tours:registry.vtolDualTuning.blurb',
    // Only offer this on a QuadPlane that exposes both control-law sets; on any
    // other vehicle the switch does not exist, so the tour stays hidden.
    predicate: () => hasDualVtolControllers(useParameterStore.getState().parameters),
    steps: [
      {
        selector: '[data-tour="tuning-vtol-toggle"]',
        predicate: present('[data-tour="tuning-vtol-toggle"]'),
        content: <TourText k="vtolDualTuning.toggle" paragraphs={2} />,
      },
    ],
  },
  {
    id: 'flight-info-alpha32-5',
    view: 'mission',
    version: '0.0.32.5',
    titleKey: 'feature-tours:registry.flightInfo.title',
    blurbKey: 'feature-tours:registry.flightInfo.blurb',
    steps: [
      {
        selector: '[data-tour="flight-info-panel"]',
        // No predicate: the panel's tab is activated when this tour starts (see
        // MissionPlanningView), and mutationObservables lets the highlight snap
        // to it once dockview mounts the panel content.
        mutationObservables: ['[data-tour="flight-info-panel"]'],
        content: <TourText k="flightInfo.panel" paragraphs={2} />,
      },
    ],
  },
  {
    id: 'quick-launch-033',
    view: 'telemetry',
    version: '0.33',
    titleKey: 'feature-tours:registry.quickLaunch.title',
    blurbKey: 'feature-tours:registry.quickLaunch.blurb',
    steps: [
      {
        selector: '[data-tour="welcome-cards"]',
        // Only shown on the disconnected welcome screen; skipped once connected.
        predicate: present('[data-tour="welcome-cards"]'),
        content: <TourText k="quickLaunch.welcomeCards" />,
      },
      {
        selector: '[data-tour="quick-launch"]',
        predicate: present('[data-tour="quick-launch"]'),
        content: <TourText k="quickLaunch.windows" />,
      },
      {
        selector: '[data-tour="quick-launch"]',
        predicate: present('[data-tour="quick-launch"]'),
        content: <TourText k="quickLaunch.areaEditor" />,
      },
    ],
  },
  {
    id: 'rtk-ntrip-034',
    view: 'telemetry',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.rtkNtrip.title',
    blurbKey: 'feature-tours:registry.rtkNtrip.blurb',
    cleanup: () => useWorkspaceDialogStore.getState().setOpen(false),
    steps: [
      {
        selector: '[data-tour="telemetry-layout-select"]',
        predicate: present('[data-tour="telemetry-layout-select"]'),
        content: <TourText k="rtkNtrip.workspace" />,
      },
      {
        selector: '[data-tour="add-panel-rtk"]',
        setup: () => useWorkspaceDialogStore.getState().setOpen(true),
        mutationObservables: ['[data-tour="workspace-dialog"]'],
        content: <TourText k="rtkNtrip.panel" />,
      },
      {
        selector: '[data-tour="map-instruments"]',
        setup: () => useWorkspaceDialogStore.getState().setOpen(false),
        mutationObservables: ['[data-tour="workspace-dialog"]'],
        predicate: present('[data-tour="map-instruments"]'),
        content: <TourText k="rtkNtrip.map" />,
      },
    ],
  },
  {
    id: 'multi-vehicle-beta1',
    view: 'telemetry',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.multiVehicle.title',
    blurbKey: 'feature-tours:registry.multiVehicle.blurb',
    steps: [
      {
        selector: '[data-tour="connection-multi-tab"]',
        predicate: present('[data-tour="connection-multi-tab"]'),
        content: <TourText k="multiVehicle.tab" />,
      },
    ],
  },
  {
    id: 'log-explorer-beta1',
    view: 'logs',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.logExplorer.title',
    blurbKey: 'feature-tours:registry.logExplorer.blurb',
    steps: [
      {
        selector: '[data-tour="log-field-picker"]',
        predicate: present('[data-tour="log-field-picker"]'),
        content: <TourText k="logExplorer.fieldPicker" />,
      },
      {
        selector: '[data-tour="log-chart-actions"]',
        predicate: present('[data-tour="log-chart-actions"]'),
        content: <TourText k="logExplorer.chartActions" />,
      },
    ],
  },
  {
    id: 'osd-tool-beta1',
    view: 'osd',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.osdTool.title',
    blurbKey: 'feature-tours:registry.osdTool.blurb',
    steps: [
      {
        selector: '[data-tour="osd-destination-bar"]',
        predicate: present('[data-tour="osd-destination-bar"]'),
        content: <TourText k="osdTool.destinationBar" />,
      },
    ],
  },
  {
    id: 'unit-preferences-beta1',
    view: 'settings',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.unitPreferences.title',
    blurbKey: 'feature-tours:registry.unitPreferences.blurb',
    steps: [
      {
        selector: '[data-tour="unit-preferences"]',
        predicate: present('[data-tour="unit-preferences"]'),
        content: <TourText k="unitPreferences.units" />,
      },
    ],
  },
  {
    id: 'altitude-planning-beta1',
    view: 'mission',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.altitudePlanning.title',
    blurbKey: 'feature-tours:registry.altitudePlanning.blurb',
    steps: [
      {
        selector: '[data-tour="mission-altitude-panel"]',
        predicate: present('[data-tour="mission-altitude-panel"]'),
        content: <TourText k="altitudePlanning.panel" />,
      },
    ],
  },
  {
    id: 'radio-hud-beta1',
    view: 'radio-hud',
    version: '0.1.0',
    titleKey: 'feature-tours:registry.radioHud.title',
    blurbKey: 'feature-tours:registry.radioHud.blurb',
    steps: [
      {
        selector: '[data-tour="hud-model"]',
        predicate: present('[data-tour="hud-model"]'),
        content: <TourText k="radioHud.model" />,
      },
      {
        selector: '[data-tour="hud-edit"]',
        predicate: present('[data-tour="hud-edit"]'),
        content: <TourText k="radioHud.edit" />,
      },
      {
        selector: '[data-tour="hud-config"]',
        predicate: present('[data-tour="hud-config"]'),
        content: <TourText k="radioHud.config" />,
      },
      {
        selector: '[data-tour="hud-maps"]',
        predicate: present('[data-tour="hud-maps"]'),
        content: <TourText k="radioHud.maps" />,
      },
      {
        selector: '[data-tour="hud-apply"]',
        predicate: present('[data-tour="hud-apply"]'),
        content: <TourText k="radioHud.apply" />,
      },
    ],
  },
  {
    id: 'map-instruments-beta1',
    view: 'telemetry',
    version: '0.1.2',
    titleKey: 'feature-tours:registry.mapInstruments.title',
    blurbKey: 'feature-tours:registry.mapInstruments.blurb',
    steps: [
      {
        selector: '[data-tour="map-instruments"]',
        predicate: present('[data-tour="map-instruments"]'),
        content: <TourText k="mapInstruments.pick" paragraphs={2} />,
      },
      {
        selector: '[data-tour="vision-stream"]',
        // Only in synthetic Vision mode, where the Stream button exists.
        predicate: present('[data-tour="vision-stream"]'),
        content: <TourText k="mapInstruments.stream" />,
      },
    ],
  },
  {
    id: 'vehicle-setup-beta1',
    view: 'parameters',
    version: '0.1.2',
    titleKey: 'feature-tours:registry.vehicleSetup.title',
    blurbKey: 'feature-tours:registry.vehicleSetup.blurb',
    cleanup: () => useConfigTabMenuStore.getState().setOpenGroupId(null),
    steps: [
      {
        selector: '[data-tour="mavlink-tabs"]',
        predicate: present('[data-tour="mavlink-tabs"]'),
        setup: () => useConfigTabMenuStore.getState().setOpenGroupId(null),
        content: <TourText k="vehicleSetup.tabs" />,
      },
      groupStep('tuning-group', 'vehicleSetup.tuning'),
      groupStep('rover-tuning-group', 'vehicleSetup.roverTuning'),
      groupStep('rc-group', 'vehicleSetup.rc'),
      groupStep('outputs-group', 'vehicleSetup.outputs'),
      itemStep('servo-output', 'vehicleSetup.servoOutput'),
      groupStep('safety-group', 'vehicleSetup.safety'),
      itemStep('battery', 'vehicleSetup.battery'),
      groupStep('hardware-group', 'vehicleSetup.sensors'),
      groupStep('links-group', 'vehicleSetup.links'),
      groupStep('storage-group', 'vehicleSetup.storage'),
    ],
  },
  {
    id: 'calibration-beta1',
    view: 'calibration',
    version: '0.1.2',
    titleKey: 'feature-tours:registry.calibration.title',
    blurbKey: 'feature-tours:registry.calibration.blurb',
    steps: [
      {
        selector: '[data-tour="calibration-types"]',
        predicate: present('[data-tour="calibration-types"]'),
        mutationObservables: ['[data-tour="calibration-types"]'],
        content: <TourText k="calibration.types" />,
      },
    ],
  },
  {
    id: 'library-projects-beta1',
    view: 'library',
    version: '0.1.2',
    titleKey: 'feature-tours:registry.libraryProjects.title',
    blurbKey: 'feature-tours:registry.libraryProjects.blurb',
    steps: [
      {
        selector: '[data-tour="library-tabs"]',
        predicate: present('[data-tour="library-tabs"]'),
        content: <TourText k="libraryProjects.tabs" />,
      },
    ],
  },
];

export function getToursForView(view: string): FeatureTour[] {
  return FEATURE_TOURS.filter((t) => t.view === view);
}

export function getTourById(id: string): FeatureTour | undefined {
  return FEATURE_TOURS.find((t) => t.id === id);
}
