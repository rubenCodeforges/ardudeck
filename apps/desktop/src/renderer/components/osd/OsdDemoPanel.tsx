/**
 * OSD Demo Panel
 *
 * Right-panel content for demo mode.
 * Shows grouped telemetry value sliders organized by category.
 */

import { useTranslation } from 'react-i18next';
import { useOsdStore } from '../../stores/osd-store';
import { DraggableSlider } from '../ui/DraggableSlider';

export function OsdDemoPanel() {
  const { t } = useTranslation();
  const demoValues = useOsdStore((s) => s.demoValues);
  const updateDemoValue = useOsdStore((s) => s.updateDemoValue);
  const resetDemoValues = useOsdStore((s) => s.resetDemoValues);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <h3 className="text-xs font-medium text-content">{t('osd:osdDemoPanel.demoValues')}</h3>
        <button
          onClick={resetDemoValues}
          className="text-[10px] text-blue-400 hover:text-blue-300"
        >
          {t('osd:osdDemoPanel.resetAll')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Attitude */}
        <SliderGroup title={t('common:attitude')}>
          <Slider label={t('common:pitch')} value={demoValues.pitch} field="pitch" min={-45} max={45} unit="deg" />
          <Slider label={t('common:roll')} value={demoValues.roll} field="roll" min={-45} max={45} unit="deg" />
          <Slider label={t('common:heading')} value={demoValues.heading} field="heading" min={0} max={359} unit="deg" />
        </SliderGroup>

        {/* Altitude & Speed */}
        <SliderGroup title={t('osd:osdDemoPanel.altitudeSpeed')}>
          <Slider label={t('common:altitude')} value={demoValues.altitude} field="altitude" min={0} max={1000} unit="m" />
          <Slider label={t('osd:osdDemoPanel.mslAlt')} value={demoValues.mslAltitude} field="mslAltitude" min={0} max={5000} unit="m" />
          <Slider label={t('common:vario')} value={demoValues.vario} field="vario" min={-10} max={10} step={0.1} unit="m/s" />
          <Slider label={t('common:speed')} value={demoValues.speed} field="speed" min={0} max={50} step={0.1} unit="m/s" />
          <Slider label={t('common:airspeed')} value={demoValues.airspeed} field="airspeed" min={0} max={50} step={0.1} unit="m/s" />
          <Slider label={t('common:distance')} value={demoValues.distance} field="distance" min={0} max={5000} unit="m" />
        </SliderGroup>

        {/* Battery */}
        <SliderGroup title={t('common:battery')}>
          <Slider label={t('common:voltage')} value={demoValues.batteryVoltage} field="batteryVoltage" min={9} max={16.8} step={0.1} unit="V" />
          <Slider label={t('osd:osdDemoPanel.cellV')} value={demoValues.cellVoltage} field="cellVoltage" min={3.0} max={4.35} step={0.01} unit="V" />
          <Slider label={t('osd:osdDemoPanel.percent')} value={demoValues.batteryPercent} field="batteryPercent" min={0} max={100} unit="%" />
          <Slider label={t('common:current')} value={demoValues.batteryCurrent} field="batteryCurrent" min={0} max={50} step={0.1} unit="A" />
          <Slider label="mAh" value={demoValues.mahDrawn} field="mahDrawn" min={0} max={5000} unit="mAh" />
          <Slider label={t('common:power')} value={demoValues.powerWatts} field="powerWatts" min={0} max={500} unit="W" />
        </SliderGroup>

        {/* GPS */}
        <SliderGroup title={t('osd:osdDemoPanel.gpsRadio')}>
          <Slider label={t('osd:osdDemoPanel.sats')} value={demoValues.gpsSats} field="gpsSats" min={0} max={20} />
          <Slider label="HDOP" value={demoValues.gpsHdop} field="gpsHdop" min={0} max={5} step={0.1} />
          <Slider label="RSSI" value={demoValues.rssi} field="rssi" min={0} max={100} unit="%" />
          <Slider label={t('osd:osdDemoPanel.rssiDbm')} value={demoValues.rssiDbm} field="rssiDbm" min={-130} max={0} unit="dBm" />
          <Slider label={t('common:throttle')} value={demoValues.throttle} field="throttle" min={0} max={100} unit="%" />
        </SliderGroup>

        {/* Timers */}
        <SliderGroup title={t('osd:osdDemoPanel.timers')}>
          <Slider label={t('common:flight')} value={demoValues.flightTime} field="flightTime" min={0} max={3600} unit="s" />
          <Slider label={t('osd:osdDemoPanel.onTime')} value={demoValues.onTime} field="onTime" min={0} max={7200} unit="s" />
        </SliderGroup>

        {/* Sensors */}
        <SliderGroup title={t('common:sensors')}>
          <Slider label={t('osd:osdDemoPanel.baroTmp')} value={demoValues.baroTemp} field="baroTemp" min={-10} max={80} unit="C" />
          <Slider label={t('osd:osdDemoPanel.imuTmp')} value={demoValues.imuTemp} field="imuTemp" min={-10} max={80} unit="C" />
          <Slider label={t('osd:osdDemoPanel.escTmp')} value={demoValues.escTemp} field="escTemp" min={0} max={120} unit="C" />
          <Slider label={t('osd:osdDemoPanel.gForce')} value={demoValues.gForce} field="gForce" min={0} max={10} step={0.1} unit="G" />
          <Slider label={t('osd:osdDemoPanel.escRpm')} value={demoValues.escRpm} field="escRpm" min={0} max={50000} step={100} />
        </SliderGroup>

        {/* Wind */}
        <SliderGroup title={t('common:wind')}>
          <Slider label={t('common:speed')} value={demoValues.windSpeed} field="windSpeed" min={0} max={30} unit="m/s" />
          <Slider label={t('osd:osdDemoPanel.vertical')} value={demoValues.windVertical} field="windVertical" min={-10} max={10} step={0.1} unit="m/s" />
        </SliderGroup>
      </div>
    </div>
  );
}

function SliderGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  field,
  min,
  max,
  step = 1,
  unit = '',
}: {
  label: string;
  value: number;
  field: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const updateDemoValue = useOsdStore((s) => s.updateDemoValue);

  return (
    <DraggableSlider
      label={`${label}${unit ? ` (${unit})` : ''}`}
      value={value}
      onChange={(v) => updateDemoValue(field as any, v)}
      min={min}
      max={max}
      step={step}
      showControls
      height={8}
    />
  );
}
