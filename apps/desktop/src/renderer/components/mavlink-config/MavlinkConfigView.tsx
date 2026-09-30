/**
 * MavlinkConfigView
 *
 * Beginner-friendly configuration UI for ArduPilot/MAVLink flight controllers.
 * Similar to MspConfigView but for ArduPilot vehicles.
 *
 * Tabs:
 * - PID Tuning: Per-axis PID editor with presets
 * - Rates: Rate curve visualization and expo
 * - Flight Modes: Configure 6 flight mode slots
 * - Safety: Failsafes, arming, geofence
 * - Sensors: Live telemetry and sensor health
 * - Tuning: Basic performance presets
 * - Battery: Battery monitor setup
 * - All Parameters: Full parameter table (expert mode)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Gauge,
  Activity,
  Satellite,
  Lightbulb,
  Settings,
  Shield,
  ShieldCheck,
  Cpu,
  Sliders,
  Wrench,
  Battery,
  Table,
  Save,
  CheckCircle,
  XCircle,
  Loader2,
  Navigation,
  Car,
  Radio,
  Cable,
  RotateCw,
  History,
  AlertTriangle,
  Fan,
  Move,
  ChevronDown,
  HardDrive,
  FolderOpen,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { formatParamValue } from '../../../shared/parameter-types';
import { firmwareLabel } from '../../../shared/firmware-types';
import PidTuningTab from './PidTuningTab';
import RatesTab from './RatesTab';
import FlightModesTab from './FlightModesTab';
import SafetyTab from './SafetyTab';
import SensorsTab from './SensorsTab';
import TuningTab from './TuningTab';
import AutotuneTab from './AutotuneTab';
import BatteryTab from './BatteryTab';
import ParameterTable from './ParameterTable';
import LoggingTab from './LoggingTab';
import NotifyTab from './NotifyTab';
import SensorConfigTab from './SensorConfigTab';
import ArmingTab from './ArmingTab';
import RoverTuningTab from './RoverTuningTab';
import ReceiverTab from './ReceiverTab';
import SerialPortsTab from './SerialPortsTab';
import TelemetryRatesTab from './TelemetryRatesTab';
import ParamHistoryModal from './ParamHistoryModal';
import { MotorTestTab } from './motor-test/MotorTestTab';
import ServoOutputTab from './servo-output/ServoOutputTab';
import { FilesTab } from './FilesTab';
import { VaultSyncBadge } from '../vault/VaultSyncBadge';
import { VaultAutoSyncToggle } from '../vault/VaultAutoSyncToggle';
import { useFleetRepoStore } from '../../stores/fleet-repo-store';
import { emitParamsFlashed } from '../../modules/module-host-renderer';
import { isCargoEnabled, VAULT_CARGO_SLUG } from '../../modules/capabilities';
import PlaneTuningTab from './PlaneTuningTab';

// Toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

type TabId = 'pid' | 'rates' | 'modes' | 'receiver' | 'serial-ports' | 'telemetry-rates' | 'safety' | 'sensors' | 'sensor-config' | 'notify' | 'tuning' | 'autotune' | 'battery' | 'parameters' | 'files' | 'logging' | 'arming' | 'rover-tuning' | 'rover-nav' | 'motor-test' | 'servo-output';

interface Tab {
  id: TabId;
  /** Keys under `mavlink.tabs.*` / `mavlink.tabDescriptions.*`. */
  nameKey: string;
  descKey: string;
  Icon: React.FC<{ className?: string }>;
  color: string;
  badge?: string;
}

interface TabGroup {
  kind: 'group';
  id: string;
  /** Key under `mavlink.tabs.*`; there is no group description, the group
   *  header only shows a name. */
  nameKey: string;
  Icon: React.FC<{ className?: string }>;
  color: string;
  children: Tab[];
}

type TabNode = ({ kind: 'item' } & Tab) | TabGroup;

type VehicleCategory = 'copter' | 'plane' | 'rover';

// Determine vehicle category from MAV_TYPE
function getVehicleCategory(mavType: number | undefined): VehicleCategory {
  if (mavType === undefined) return 'copter';
  // MAV_TYPE_GROUND_ROVER = 10, MAV_TYPE_SURFACE_BOAT = 11
  if (mavType === 10 || mavType === 11) return 'rover';
  // MAV_TYPE_FIXED_WING = 1, MAV_TYPE_VTOL types = 19-25
  if (mavType === 1 || (mavType >= 19 && mavType <= 25)) return 'plane';
  return 'copter';
}

// Check if MAV_TYPE is a ground vehicle (Rover)
function isRoverType(mavType: number | undefined): boolean {
  return getVehicleCategory(mavType) === 'rover';
}

// "Tuning" group: PID + Rates + Presets share a parent tab with sub-tabs
const TUNING_GROUP: TabGroup = {
  kind: 'group',
  id: 'tuning-group',
  nameKey: 'tuning-group',
  Icon: Sliders,
  color: 'text-emerald-400',
  children: [
    { id: 'pid', nameKey: 'pid', Icon: Gauge, color: 'text-blue-400', descKey: 'pid' },
    { id: 'rates', nameKey: 'rates', Icon: Activity, color: 'text-purple-400', descKey: 'rates' },
    { id: 'tuning', nameKey: 'tuning', Icon: Sliders, color: 'text-emerald-400', descKey: 'tuning' },
    { id: 'autotune', nameKey: 'autotune', Icon: Wrench, color: 'text-orange-400', descKey: 'autotune' },
  ],
};

// "RC" group: Receiver protocol + Flight Mode switch mapping. Both are about
// pilot input — natural setup-flow pairing ("configure receiver, then assign
// mode switches"). Reused across all vehicle classes.
const RC_GROUP: TabGroup = {
  kind: 'group',
  id: 'rc-group',
  nameKey: 'rc-group',
  Icon: Radio,
  color: 'text-teal-400',
  children: [
    { id: 'receiver', nameKey: 'receiver',     Icon: Radio,    color: 'text-teal-400',  descKey: 'receiver' },
    { id: 'modes',    nameKey: 'modes', Icon: Settings, color: 'text-green-400', descKey: 'modes' },
  ],
};

// Rover variant — same structure but the modes tab is labelled "Drive Modes".
// We can't share children across groups because the label differs; this keeps
// the per-vehicle vocabulary correct without hacks.
const ROVER_RC_GROUP: TabGroup = {
  kind: 'group',
  id: 'rc-group',
  nameKey: 'rc-group',
  Icon: Radio,
  color: 'text-teal-400',
  children: [
    { id: 'receiver', nameKey: 'receiver',    Icon: Radio,    color: 'text-teal-400',  descKey: 'receiver' },
    { id: 'modes',    nameKey: 'modes-drive', Icon: Settings, color: 'text-green-400', descKey: 'modes-drive' },
  ],
};

// "Outputs" group (Copter only — Plane/Rover have no Motor Test): Motor Test
// + Servo Output. Both are about FC→actuator wiring/verification, used
// during initial setup, rare in normal operation.
const OUTPUTS_GROUP: TabGroup = {
  kind: 'group',
  id: 'outputs-group',
  nameKey: 'outputs-group',
  Icon: Fan,
  color: 'text-yellow-400',
  children: [
    { id: 'motor-test',   nameKey: 'motor-test',   Icon: Fan,  color: 'text-yellow-400', descKey: 'motor-test' },
    { id: 'servo-output', nameKey: 'servo-output', Icon: Move, color: 'text-pink-400',   descKey: 'servo-output' },
  ],
};

// "Storage" group: All Parameters (EEPROM) + Files (SD card via MAVLink-FTP).
// Both are FC-side persistent state and both are escape-hatch / power-user
// surfaces, so grouping them keeps the top-level tab strip from sprawling.
const STORAGE_GROUP: TabGroup = {
  kind: 'group',
  id: 'storage-group',
  nameKey: 'storage-group',
  Icon: HardDrive,
  color: 'text-content-secondary',
  children: [
    { id: 'parameters', nameKey: 'parameters', Icon: Table,      color: 'text-content-secondary', descKey: 'parameters' },
    { id: 'files',      nameKey: 'files',      Icon: FolderOpen, color: 'text-content-secondary', descKey: 'files' },
    { id: 'logging',    nameKey: 'logging',    Icon: HardDrive,  color: 'text-sky-400', descKey: 'logging' },
  ],
};

// "Links" group: the serial ports data leaves the vehicle on, and how much
// data each one carries. Two halves of the same question (a rate change is
// usually the answer to a saturated port), and flat they cost two top-level
// slots each vehicle type over.
const LINKS_GROUP: TabGroup = {
  kind: 'group',
  id: 'links-group',
  nameKey: 'links-group',
  Icon: Radio,
  color: 'text-sky-400',
  children: [
    { id: 'serial-ports', nameKey: 'serial-ports', Icon: Cable, color: 'text-sky-400', descKey: 'serial-ports' },
    { id: 'telemetry-rates', nameKey: 'telemetry-rates', Icon: Gauge, color: 'text-teal-400', descKey: 'telemetry-rates' },
  ],
};

// "Safety" group: the checks that stop the motors starting, and what happens
// when something goes wrong in flight. Two sides of the same subject, and flat
// they cost two top-level slots on every vehicle.
const SAFETY_GROUP: TabGroup = {
  kind: 'group',
  id: 'safety-group',
  nameKey: 'safety-group',
  Icon: Shield,
  color: 'text-amber-400',
  children: [
    { id: 'arming', nameKey: 'arming', Icon: ShieldCheck, color: 'text-emerald-400', descKey: 'arming' },
    { id: 'safety', nameKey: 'safety', Icon: Shield, color: 'text-amber-400', descKey: 'safety' },
  ],
};

// Tabs ordered by usage frequency (hottest first). "All Parameters" always last
// even though it's hot, because it's the expert escape hatch.

// Hardware fitted to the vehicle. Sensors was one long page: live health,
// board orientation, compasses, GPS wiring and the notify hardware all in a
// column. Split so each answers one question.
const HARDWARE_GROUP: TabGroup = {
  kind: 'group',
  id: 'hardware-group',
  nameKey: 'hardware-group',
  Icon: Cpu,
  color: 'text-cyan-400',
  children: [
    { id: 'sensors', nameKey: 'sensors', Icon: Cpu, color: 'text-cyan-400', descKey: 'sensors' },
    { id: 'sensor-config', nameKey: 'sensor-config', Icon: Satellite, color: 'text-emerald-400', descKey: 'sensor-config' },
    { id: 'notify', nameKey: 'notify', Icon: Lightbulb, color: 'text-amber-400', descKey: 'notify' },
  ],
};

// Copter/multirotor tabs — groups: Tuning · RC · Outputs · Storage
const COPTER_TABS: TabNode[] = [
  TUNING_GROUP,
  RC_GROUP,
  OUTPUTS_GROUP,
  SAFETY_GROUP,
  { kind: 'item', id: 'battery', nameKey: 'battery', Icon: Battery, color: 'text-orange-400', descKey: 'battery' },
  HARDWARE_GROUP,
  LINKS_GROUP,
  STORAGE_GROUP,
];

// Fixed-wing / VTOL tabs — no Motor Test, so Servo Output stays flat (single-
// item "Outputs" group would be visual noise) and is bumped to position #2
// since control surfaces are fundamental to plane setup.
const PLANE_TABS: TabNode[] = [
  TUNING_GROUP,
  { kind: 'item', id: 'servo-output', nameKey: 'servo-output', Icon: Move, color: 'text-pink-400', descKey: 'servo-output' },
  RC_GROUP,
  SAFETY_GROUP,
  { kind: 'item', id: 'battery', nameKey: 'battery', Icon: Battery, color: 'text-orange-400', descKey: 'battery' },
  HARDWARE_GROUP,
  LINKS_GROUP,
  STORAGE_GROUP,
];

// Rover/Boat tabs — same Servo-Output-flat treatment as plane (no Motor Test
// for ground vehicles either). Uses the rover-specific RC group whose modes
// tab is labelled "Drive Modes".
// Rovers get the same Tuning group as the other vehicles: the PID tab speaks
// ATC_STR_RAT_* and ATC_SPEED_* now, so there is no reason it was flat here.
const ROVER_TUNING_GROUP: TabGroup = {
  kind: 'group',
  id: 'rover-tuning-group',
  nameKey: 'rover-tuning-group',
  Icon: Gauge,
  color: 'text-blue-400',
  children: [
    { id: 'pid', nameKey: 'pid-rover', Icon: Activity, color: 'text-blue-400', descKey: 'pid-rover' },
    { id: 'rover-tuning', nameKey: 'rover-tuning', Icon: Car, color: 'text-blue-400', descKey: 'rover-tuning' },
    { id: 'rover-nav', nameKey: 'rover-nav', Icon: Navigation, color: 'text-purple-400', descKey: 'rover-nav' },
  ],
};

const ROVER_TABS: TabNode[] = [
  ROVER_TUNING_GROUP,
  ROVER_RC_GROUP,
  { kind: 'item', id: 'servo-output', nameKey: 'servo-output', Icon: Move, color: 'text-pink-400', descKey: 'servo-output' },
  SAFETY_GROUP,
  { kind: 'item', id: 'battery', nameKey: 'battery', Icon: Battery, color: 'text-orange-400', descKey: 'battery' },
  HARDWARE_GROUP,
  LINKS_GROUP,
  STORAGE_GROUP,
];

// ArduPilot-parameter presets with no PX4 counterpart. Hidden rather than
// shown hunting for parameters that do not exist; the parameter table still
// exposes everything with PX4's own metadata.
const PX4_UNSUPPORTED_TABS: ReadonlySet<TabId> = new Set([
  'rates', 'tuning', 'autotune', 'rover-tuning', 'rover-nav',
]);

function filterTabsForFirmware(nodes: TabNode[], isPx4: boolean): TabNode[] {
  if (!isPx4) return nodes;
  const out: TabNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'item') {
      if (!PX4_UNSUPPORTED_TABS.has(node.id)) out.push(node);
    } else {
      const children = node.children.filter((c) => !PX4_UNSUPPORTED_TABS.has(c.id));
      if (children.length > 0) out.push({ ...node, children });
    }
  }
  return out;
}

function collectTabIds(nodes: TabNode[]): TabId[] {
  const ids: TabId[] = [];
  for (const node of nodes) {
    if (node.kind === 'item') ids.push(node.id);
    else for (const child of node.children) ids.push(child.id);
  }
  return ids;
}

function findGroupForTab(nodes: TabNode[], tabId: TabId): TabGroup | undefined {
  for (const node of nodes) {
    if (node.kind === 'group' && node.children.some(c => c.id === tabId)) return node;
  }
  return undefined;
}

export const MavlinkConfigView: React.FC = () => {
  const { t } = useTranslation('mavlink');
  const paramCount = useParameterStore((s) => s.paramCount);
  const isLoading = useParameterStore((s) => s.isLoading);
  const fetchParameters = useParameterStore((s) => s.fetchParameters);
  const modifiedCount = useParameterStore((s) => s.modifiedCount);
  const modifiedParameters = useParameterStore((s) => s.modifiedParameters);
  const commitStagedParams = useParameterStore((s) => s.commitStagedParams);
  const markAllAsSaved = useParameterStore((s) => s.markAllAsSaved);
  const isRebootRequired = useParameterStore((s) => s.isRebootRequired);
  const setSearchQuery = useParameterStore((s) => s.setSearchQuery);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const scrollTarget = useNavigationStore((s) => s.scrollTarget);
  const clearScrollTarget = useNavigationStore((s) => s.clearScrollTarget);

  // Determine vehicle type and appropriate tabs
  const vehicleCategory = getVehicleCategory(connectionState.mavType);
  const isRover = vehicleCategory === 'rover';
  const isPlane = vehicleCategory === 'plane';
  const isPx4Fw = connectionState.firmware === 'px4';
  const tabs = useMemo(
    () => filterTabsForFirmware(isRover ? ROVER_TABS : isPlane ? PLANE_TABS : COPTER_TABS, isPx4Fw),
    [isRover, isPlane, isPx4Fw],
  );
  const defaultTab = isRover ? 'rover-tuning' : 'pid';
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // Reset active tab when vehicle type changes
  useEffect(() => {
    const validTabIds = collectTabIds(tabs);
    if (!validTabIds.includes(activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [tabs, activeTab, defaultTab]);

  // Deep link from a pre-arm quick-fix (or anywhere calling setView('parameters',
  // paramId)): open the All Parameters tab and filter to that exact parameter,
  // then clear the target so it fires once.
  useEffect(() => {
    if (!scrollTarget) return;
    if (collectTabIds(tabs).includes('parameters')) {
      setActiveTab('parameters');
    }
    setSearchQuery(scrollTarget);
    clearScrollTarget();
  }, [scrollTarget, tabs, setSearchQuery, clearScrollTarget]);

  const activeGroup = useMemo(() => findGroupForTab(tabs, activeTab), [tabs, activeTab]);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const groupMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openGroupId) return;
    const onDocClick = (e: MouseEvent) => {
      if (!groupMenuRef.current) return;
      if (!groupMenuRef.current.contains(e.target as Node)) setOpenGroupId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openGroupId]);

  const [isWritingFlash, setIsWritingFlash] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rebootRequiredParams, setRebootRequiredParams] = useState<string[]>([]);
  // Tracks whether we initiated a reboot from the banner and should auto-refresh params
  const pendingParamRefresh = useRef(false);

  // Auto-hide toast: errors stay long enough to actually be read.
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 8000 : 3000);
  }, []);

  // Load parameters on mount unless a full set is already in hand. Keyed on
  // the download state, not the count: connect-time batch reads leave a few
  // parameters behind and a count check reads those as "already loaded".
  const needsFetch = useParameterStore((s) => s.needsParameterFetch());
  useEffect(() => {
    if (connectionState.isConnected && needsFetch) {
      fetchParameters();
    }
  }, [connectionState.isConnected, needsFetch, fetchParameters]);

  const handleWriteToFlashClick = useCallback(() => {
    setShowWriteConfirm(true);
  }, []);

  const handleWriteToFlashConfirm = useCallback(async () => {
    setShowWriteConfirm(false);
    setIsWritingFlash(true);
    try {
      // Auto-checkpoint before writing to flash
      const modified = modifiedParameters();
      if (modified.length > 0) {
        const boardUid = connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`;
        const boardName = connectionState.vehicleType || 'Unknown';
        const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
        await window.electronAPI?.saveParamCheckpoint(boardUid, boardName,
          modified.map(p => ({ paramId: p.id, oldValue: p.originalValue ?? p.value, newValue: p.value })),
          vehicleType
        );
      }

      // PX4 persists each PARAM_SET on receipt; ArduPilot needs a flash flush.
      const staged = await commitStagedParams();
      const result = staged.failed.length > 0
        ? { success: false as const, error: `Failed to write ${staged.failed.join(', ')}` }
        : connectionState.firmware === 'px4'
          ? { success: true as const }
          : await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        // Vault backup: full param snapshot after a successful flash write.
        // Auto-sync pushes it to the remote from the main side.
        if (isCargoEnabled(VAULT_CARGO_SLUG) && useFleetRepoStore.getState().status?.autoSync) {
          void useFleetRepoStore.getState().snapshotParams('after flash write');
        }
        emitParamsFlashed({ paramCount: modified.length });
        // Check if any written params require a reboot
        const rebootParams = modified.filter(p => isRebootRequired(p.id)).map(p => p.id);
        if (rebootParams.length > 0) {
          setRebootRequiredParams(rebootParams);
        }

        markAllAsSaved();
        showToast('Parameters saved to flash successfully', 'success');
      } else {
        showToast(result?.error ?? 'Failed to write to flash', 'error');
      }
    } catch {
      showToast('Failed to write to flash', 'error');
    } finally {
      setIsWritingFlash(false);
    }
  }, [markAllAsSaved, showToast, modifiedParameters, connectionState, isRebootRequired, commitStagedParams]);

  const handleReboot = useCallback(async () => {
    setRebooting(true);
    try {
      const success = await window.electronAPI?.mavlinkReboot();
      if (success) {
        // Don't clear banner yet - keep it showing reconnection progress.
        // ALWAYS arm the completion watch: without it nothing ever clears
        // `rebooting`, which is how the header-button path spun forever.
        pendingParamRefresh.current = true;
        if (rebootRequiredParams.length === 0) {
          showToast('Rebooting flight controller...', 'info');
        }
      } else {
        setRebooting(false);
        showToast('Failed to send reboot command', 'error');
      }
    } catch {
      setRebooting(false);
      showToast('Failed to reboot flight controller', 'error');
    }
  }, [showToast, rebootRequiredParams]);

  // Watch for reconnection completion after a reboot we initiated
  useEffect(() => {
    if (!pendingParamRefresh.current) return;
    if (connectionState.isConnected && !connectionState.isReconnecting) {
      pendingParamRefresh.current = false;
      setRebooting(false);
      setRebootRequiredParams([]);
      // Re-download the full list: a reboot can CREATE parameters (enabling
      // BATT2_MONITOR/COMPASS/GPS backends allocates their families on boot),
      // so the pre-reboot set is not just stale values but the wrong set.
      fetchParameters({ force: true });
      showToast('Reboot complete, refreshing parameters...', 'success');
    } else if (!connectionState.isConnected && !connectionState.isReconnecting) {
      // Auto-reconnect gave up (timed out or was cancelled): stop the spinner
      // so the operator can act; the banner reverts to its Reboot Now state.
      pendingParamRefresh.current = false;
      setRebooting(false);
      showToast('Reconnect after reboot failed. Check the link and reconnect manually.', 'error');
    }
  }, [connectionState.isConnected, connectionState.isReconnecting, showToast, fetchParameters]);

  const modified = modifiedCount();

  const renderTabContent = () => {
    switch (activeTab) {
      // Aircraft tabs
      case 'pid':
        return <PidTuningTab />;
      case 'rates':
        return <RatesTab />;
      case 'tuning':
        // The copter tab speaks ANGLE_MAX / WPNAV_* / LOIT_*, which a plane
        // does not have, so it rendered fallbacks as if they were real.
        return isPlane ? <PlaneTuningTab /> : <TuningTab />;
      case 'autotune':
        return <AutotuneTab vehicleCategory={vehicleCategory} />;
      // Rover tabs
      case 'rover-tuning':
        return <RoverTuningTab />;
      case 'rover-nav':
        return <RoverTuningTab section="navigation" />;
      // Shared tabs
      case 'modes':
        return <FlightModesTab vehicleCategory={vehicleCategory} />;
      case 'receiver':
        return <ReceiverTab />;
      case 'serial-ports':
        return <SerialPortsTab />;
      case 'telemetry-rates':
        return <TelemetryRatesTab />;
      case 'safety':
        return <SafetyTab onGoTo={(tab) => {
          if (collectTabIds(tabs).includes(tab as TabId)) setActiveTab(tab as TabId);
        }} />;
      case 'sensors':
        return <SensorsTab />;
      case 'sensor-config':
        return <SensorConfigTab />;
      case 'notify':
        return <NotifyTab />;
      case 'motor-test':
        return <MotorTestTab />;
      case 'servo-output':
        return <ServoOutputTab />;
      case 'battery':
        return <BatteryTab />;
      case 'parameters':
        return <ParameterTable />;
      case 'files':
        return <FilesTab />;
      case 'logging':
        return <LoggingTab />;
      case 'arming':
        return <ArmingTab onGoTo={(tab) => {
          if (collectTabIds(tabs).includes(tab as TabId)) setActiveTab(tab as TabId);
        }} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-subtle bg-gradient-to-r from-surface to-surface">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-content">
                {firmwareLabel(connectionState)} Configuration
              </h2>
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                {connectionState.vehicleType && (
                  <>
                    <span className="text-emerald-400">{connectionState.vehicleType}</span>
                    <span>•</span>
                  </>
                )}
                <span>{paramCount} parameters</span>
                {connectionState.systemId != null && (
                  <>
                    <span>•</span>
                    <span>SysID {connectionState.systemId}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <VaultSyncBadge variant="button" />
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border-blue-500/30 rounded-lg">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400">{t('view.loading')}</span>
              </div>
            )}

            {modified > 0 && (
              <span className="px-3 py-1 text-sm rounded-lg bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                Unsaved
              </span>
            )}

            <button
              onClick={() => fetchParameters({ force: true })}
              disabled={isLoading}
              className="px-4 py-2 text-sm rounded-lg bg-surface-raised hover:bg-surface text-content border border-subtle"
            >
              Refresh
            </button>

            <button
              onClick={() => setShowRebootConfirm(true)}
              disabled={rebooting}
              className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-surface-raised hover:bg-surface text-content border border-subtle"
              title={t('view.rebootTooltip')}
            >
              <RotateCw className={`w-4 h-4 ${rebooting ? 'animate-spin' : ''}`} />
              {rebooting ? 'Rebooting...' : 'Reboot'}
            </button>

            <button
              onClick={() => setShowHistory(true)}
              className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-surface-raised hover:bg-surface text-content border border-subtle"
              title={t('view.historyTooltip')}
            >
              <History className="w-4 h-4" />
              History
            </button>

            <button
              onClick={handleWriteToFlashClick}
              disabled={isWritingFlash || modified === 0}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                modified > 0
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white'
                  : 'bg-surface-raised text-content-tertiary cursor-not-allowed'
              }`}
              title={t('view.saveToFlashTooltip')}
            >
              <Save className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} />
              {isWritingFlash ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div ref={groupMenuRef} className="flex gap-1.5 mt-4 flex-wrap items-center">
          {tabs.map((node) => {
            if (node.kind === 'group') {
              const isActive = activeGroup?.id === node.id;
              const isOpen = openGroupId === node.id;
              // Always show the parent name; the active child is indicated inside the dropdown.
              const DisplayIcon = node.Icon;
              const displayColor = node.color;
              return (
                <div key={node.id} className="relative" data-tour={`mavlink-tab-group-${node.id}`}>
                  <button
                    onClick={() => setOpenGroupId(isOpen ? null : node.id)}
                    title={t(node.nameKey)}
                    className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                      isActive
                        ? 'bg-surface-raised text-content'
                        : 'text-content-secondary hover:text-content hover:bg-surface-raised'
                    }`}
                  >
                    <DisplayIcon className={`w-4 h-4 ${isActive ? displayColor : `${displayColor} opacity-50`}`} />
                    <span className="text-sm font-medium">{t(node.nameKey)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-content-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="absolute left-0 top-full mt-1 min-w-[200px] rounded-lg border border-subtle bg-surface-solid shadow-xl z-40 py-1">
                      {node.children.map((child) => {
                        const childActive = activeTab === child.id;
                        return (
                          <button
                            key={child.id}
                            onClick={() => { setActiveTab(child.id); setOpenGroupId(null); }}
                            className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                              childActive
                                ? 'bg-surface-raised text-content'
                                : 'text-content-secondary hover:bg-surface-raised hover:text-content'
                            }`}
                          >
                            <child.Icon className={`w-4 h-4 ${child.color} ${childActive ? '' : 'opacity-70'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{t(child.nameKey)}</div>
                              <div className="text-[11px] text-content-secondary truncate">{t(child.descKey)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const isActive = activeTab === node.id;
            return (
              <button
                key={node.id}
                onClick={() => setActiveTab(node.id)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-surface-raised text-content'
                    : 'text-content-secondary hover:text-content hover:bg-surface-raised'
                }`}
              >
                <node.Icon className={`w-4 h-4 ${isActive ? node.color : `${node.color} opacity-50`}`} />
                <span className="text-sm font-medium">{t(node.nameKey)}</span>
                {node.badge && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-surface-raised rounded text-content-secondary">
                    {node.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reboot Required Banner */}
      {rebootRequiredParams.length > 0 && (
        <div className={`shrink-0 px-6 py-3 border-b flex items-center justify-between ${
          rebooting
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {rebooting ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              {rebooting ? (
                <>
                  <span className="text-sm text-blue-300 font-medium">
                    {connectionState.isReconnecting
                      ? `Reconnecting to flight controller...`
                      : 'Rebooting flight controller...'}
                  </span>
                  {connectionState.isReconnecting && connectionState.reconnectAttempt != null && (
                    <span className="text-sm text-blue-400/70 ml-2">
                      Attempt {connectionState.reconnectAttempt}{connectionState.reconnectMaxAttempts ? ` / ${connectionState.reconnectMaxAttempts}` : ''}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-amber-300 font-medium">{t('view.rebootRequired')}</span>
                  <span className="text-sm text-amber-400/70 ml-2">
                    {rebootRequiredParams.length} parameter{rebootRequiredParams.length !== 1 ? 's' : ''} need a reboot to take effect:
                    {' '}<span className="font-mono text-xs">{rebootRequiredParams.join(', ')}</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!rebooting && (
              <>
                <button
                  onClick={() => setRebootRequiredParams([])}
                  className="px-3 py-1.5 text-xs text-content-secondary hover:text-content transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleReboot}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30 transition-colors flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Reboot Now
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {renderTabContent()}
      </div>

      {/* Reboot Confirmation Modal: one misclick next to Refresh must not
          restart a live flight controller. */}
      {showRebootConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-sm w-full mx-4">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                Reboot flight controller?
              </h3>
              <p className="text-sm text-content-secondary mt-2">
                The vehicle must be disarmed. The link will drop and reconnect automatically.
              </p>
            </div>
            <div className="px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowRebootConfirm(false)}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowRebootConfirm(false); void handleReboot(); }}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Reboot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">{t('view.writeToFlash')}</h3>
              <p className="text-sm text-content-secondary mt-1">
                The following {modifiedParameters().length} parameter(s) will be saved permanently to the flight controller.
              </p>
              {modifiedParameters().some(p => isRebootRequired(p.id)) && (
                <p className="text-sm text-amber-400 mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Some parameters require a reboot to take effect.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-content-secondary uppercase">
                    <th className="pb-2">{t('view.colParameter')}</th>
                    <th className="pb-2 text-right">{t('view.colOriginal')}</th>
                    <th className="pb-2 text-center px-2">→</th>
                    <th className="pb-2">{t('view.colNew')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-content">
                        {param.id}
                        {isRebootRequired(param.id) && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                            Reboot
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(param.originalValue ?? param.value)}</td>
                      <td className="py-2 text-center text-content-tertiary">→</td>
                      <td className="py-2 font-mono text-amber-400">{formatParamValue(param.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-subtle flex items-center gap-3">
              <VaultAutoSyncToggle />
              <div className="flex-1" />
              <button
                onClick={() => setShowWriteConfirm(false)}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWriteToFlashConfirm}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
              >
                Write to Flash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parameter History Modal */}
      {showHistory && (
        <ParamHistoryModal
          boardUid={connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`}
          boardName={connectionState.vehicleType || 'Unknown'}
          onClose={() => setShowHistory(false)}
          showToast={showToast}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
          toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
          'bg-blue-500/20 border-blue-500/30 text-blue-400'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
          {toast.type === 'error' && <XCircle className="w-5 h-5" />}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default MavlinkConfigView;
