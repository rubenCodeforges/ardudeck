import { useTranslation } from 'react-i18next';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { speedValueFromMetersPerSecond, UNIT_LABELS } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function SpeedPanel() {
  const { t } = useTranslation();
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const speedLabel = UNIT_LABELS.speed[speedUnit];

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label={t('panels:speedPanel.ground')} value={formatNumber(speedValueFromMetersPerSecond(vfrHud.groundspeed, speedUnit), 1)} unit={speedLabel} highlight />
        <StatRow label={t('panels:speedPanel.air')} value={formatNumber(speedValueFromMetersPerSecond(vfrHud.airspeed, speedUnit), 1)} unit={speedLabel} />
        <StatRow label={t('common:heading')} value={formatNumber(vfrHud.heading, 0)} unit="°" />
        <StatRow label={t('common:throttle')} value={vfrHud.throttle} unit="%" />
      </div>
    </PanelContainer>
  );
}
