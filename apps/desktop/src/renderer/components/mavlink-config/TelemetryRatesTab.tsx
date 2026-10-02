/**
 * Telemetry rates without the parameter archaeology.
 *
 * Two things make ArduPilot's stream rates hostile to newcomers: the number
 * in SR0_/MAV0_ is the MAVLink CHANNEL, not the serial port (SERIAL7 alone
 * is channel 0), and the groups are named EXTRA1/EXTRA2/RAW_SENS rather than
 * after anything a pilot can see. So this tab computes the mapping from the
 * vehicle's own parameters, names every slider after what it changes on
 * screen, and shows the measured rate next to the requested one.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Gauge, HelpCircle, Cable, Zap, RotateCcw, MapPin } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useInspectorStore, startInspector, getInspectorSnapshot } from '../../stores/inspector-store';
import {
  mavlinkLinks, paramLookup, RATE_GROUPS, rateParamName, rateScheme, readRates, rateGroupLabel,
  bandwidthCost, serialCapacity,
} from '../../../shared/mavlink-channels';
import Px4TelemetryRates from './Px4TelemetryRates';

const PROTOCOL_LABEL: Record<number, string> = { 1: 'MAVLink1', 2: 'MAVLink2' };

/** Which row the pilot said is their own link, per vehicle. */
function myLinkKey(sysId: number | undefined): string {
  return `telemetry-rates.mylink.${sysId ?? 0}`;
}

export default function TelemetryRatesTab() {
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  if (firmware === 'px4') return <Px4TelemetryRates />;
  return <ArduPilotTelemetryRates />;
}

function ArduPilotTelemetryRates() {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();
  const connectionState = useConnectionStore((s) => s.connectionState);
  // measured rates come from the inspector's per-message counters
  const tick = useInspectorStore((s) => s.tick);
  useEffect(() => { startInspector(); }, []);

  const get = useMemo(() => paramLookup(parameters), [parameters]);
  const links = useMemo(() => mavlinkLinks(get), [get]);

  const [channel, setChannel] = useState<number | null>(null);
  const [myLink, setMyLink] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // A single MAVLink port is unambiguous; otherwise the pilot says which is
  // theirs once and we remember it rather than guessing and being wrong.
  useEffect(() => {
    if (links.length === 0) return;
    const saved = Number(localStorage.getItem(myLinkKey(connectionState.systemId)) ?? NaN);
    const mine = links.length === 1 ? links[0]!.channel : (Number.isFinite(saved) ? saved : null);
    setMyLink(mine);
    setChannel((prev) => (prev !== null && links.some((l) => l.channel === prev) ? prev : mine ?? links[0]!.channel));
  }, [links, connectionState.systemId]);

  const current = useMemo(
    () => (channel === null ? {} : readRates(get, channel)),
    [get, channel],
  );
  // Sliders the pilot has moved but not yet written. Without this the draft
  // was rebuilt from `current` on every parameter-store update, which arrives
  // whenever any PARAM_VALUE lands, and an edit in progress was wiped.
  const dirtyRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<number | null>(null);

  useEffect(() => {
    if (channelRef.current !== channel) {
      channelRef.current = channel;
      dirtyRef.current.clear();
      setDraft(current);
      return;
    }
    setDraft((prev) => {
      const next: Record<string, number> = { ...current };
      for (const key of dirtyRef.current) {
        const held = prev[key];
        if (held !== undefined) next[key] = held;
      }
      const keys = Object.keys(next);
      const same = keys.length === Object.keys(prev).length
        && keys.every((k) => next[k] === prev[k]);
      return same ? prev : next;
    });
  }, [current, channel]);

  const measured = useMemo(() => {
    const out: Record<string, number> = {};
    for (const stat of getInspectorSnapshot().flat) {
      out[stat.name] = (out[stat.name] ?? 0) + stat.hz;
    }
    return out;
    // tick is the store's heartbeat: the snapshot is rebuilt on every one
  }, [tick]);

  const link = links.find((l) => l.channel === channel) ?? null;
  const isMyLink = myLink !== null && channel === myLink;
  const scheme = channel === null ? null : rateScheme(get, channel);
  const cost = bandwidthCost(draft);
  const capacity = serialCapacity(link?.baud ?? null);
  const used = capacity ? Math.min(100, Math.round((cost / capacity) * 100)) : null;
  const dirty = RATE_GROUPS.some((g) => draft[g.id] !== undefined && draft[g.id] !== current[g.id]);
  const isMine = channel !== null && channel === myLink;

  const claimLink = () => {
    if (channel === null) return;
    localStorage.setItem(myLinkKey(connectionState.systemId), String(channel));
    setMyLink(channel);
  };

  // Released the slider = the change is made. Everywhere else in ArduDeck a
  // parameter edit goes through setParameter and the app's own modified/save
  // handling; this screen does the same rather than owning a second one.
  const commitGroup = async (id: string) => {
    if (channel === null) return;
    const group = RATE_GROUPS.find((g) => g.id === id);
    if (!group) return;
    const hz = draft[id];
    if (hz === undefined || hz === current[id]) {
      dirtyRef.current.delete(id);
      return;
    }
    const name = rateParamName(get, channel, group.suffix);
    if (name === null) return;
    setBusy(id);
    const ok = await setParameter(name, hz);
    setBusy(null);
    if (ok) dirtyRef.current.delete(id);
    setNote(ok ? t('mavlink-config:telemetryRatesTab.paramSet', { name, hz }) : t('mavlink-config:telemetryRatesTab.couldNotWrite', { name }));
  };

  const tryNow = async () => {
    setBusy('try');
    setNote(null);
    const rates: Array<{ msgId: number; hz: number }> = [];
    for (const group of RATE_GROUPS) {
      const hz = draft[group.id] ?? 0;
      for (const msgId of group.msgIds) rates.push({ msgId, hz });
    }
    const result = await window.electronAPI.telemetrySetMessageRates?.(rates);
    setBusy(null);
    setNote(result?.success
      ? t('mavlink-config:telemetryRatesTab.sessionRunning')
      : t('mavlink-config:telemetryRatesTab.sessionRejected'));
  };

  if (links.length === 0) {
    return (
      <div className="p-6 text-sm text-content-secondary">
        {t('mavlink-config:telemetryRatesTab.noPorts')}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-surface-raised border border-subtle rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-teal-500/10">
            <Gauge className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:telemetryRatesTab.title')}</h3>
            <p className="text-xs text-content-secondary">
              {t('mavlink-config:telemetryRatesTab.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-teal-500/5 border border-teal-500/20 mb-4">
          <HelpCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <p className="text-xs text-content leading-relaxed">
            <Trans i18nKey="mavlink-config:telemetryRatesTab.trap" components={{ b: <span className="font-semibold text-teal-300" /> }} />
          </p>
        </div>

        <div className="rounded-lg border border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-content-secondary text-xs">
                <th className="px-3 py-2.5 text-left font-medium">{t('common:port')}</th>
                <th className="px-3 py-2.5 text-left font-medium w-28">{t('common:protocol')}</th>
                <th className="px-3 py-2.5 text-left font-medium w-28">{t('common:baud')}</th>
                <th className="px-3 py-2.5 text-left font-medium w-40">{t('mavlink-config:telemetryRatesTab.rateParams')}</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const active = l.channel === channel;
                const prefix = rateScheme(get, l.channel) ?? 'SR';
                return (
                  <tr
                    key={l.serial}
                    onClick={() => setChannel(l.channel)}
                    className={`border-b border-subtle cursor-pointer ${active ? 'bg-teal-500/10' : 'hover:bg-surface-overlay-subtle'}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Cable className={`w-3.5 h-3.5 ${active ? 'text-teal-400' : 'text-content-secondary'}`} />
                        <div>
                          <span className="text-sm text-content">{l.label}</span>
                          <p className="text-[10px] text-content-secondary leading-tight">SERIAL{l.serial}</p>
                        </div>
                        {l.channel === myLink && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {t('mavlink-config:telemetryRatesTab.youAreHere')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-content-secondary text-xs">
                      {PROTOCOL_LABEL[l.protocol] ?? l.protocol}
                    </td>
                    <td className="px-3 py-2.5 text-content-secondary text-xs">
                      {l.baud === null ? '-' : l.baud.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono text-content">{prefix}{l.channel}_*</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {myLink === null && (
          <button
            onClick={claimLink}
            data-tip={t('mavlink-config:telemetryRatesTab.claimTip')}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-input hover:bg-surface-raised border border-subtle rounded text-content-secondary hover:text-content transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            {t('mavlink-config:telemetryRatesTab.claimLink')}
          </button>
        )}
      </div>

      {channel !== null && scheme !== null && (
        <div className="bg-surface-raised border border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-content">
              {t('mavlink-config:telemetryRatesTab.linkRates', { label: link?.label })}
              <span className="ml-2 text-xs font-mono text-content-secondary">{scheme}{channel}_*</span>
            </h4>
            <span className="text-xs text-content-secondary">
              {isMyLink ? t('mavlink-config:telemetryRatesTab.requestedMeasured') : t('mavlink-config:telemetryRatesTab.requestedOnly')}
            </span>
          </div>

          {isMyLink && (
            <p className="mb-3 text-[11px] text-content-tertiary">
              {t('mavlink-config:telemetryRatesTab.bootDefaults')}
            </p>
          )}

          <div className="space-y-3">
            {RATE_GROUPS.map((group) => {
              const name = rateParamName(get, channel, group.suffix);
              if (name === null) return null;
              const hz = draft[group.id] ?? 0;
              // Counting happens on the link we are connected through, so it
              // says nothing about any other port's parameters.
              const live = isMyLink
                ? group.messages.reduce((sum, m) => sum + (measured[m] ?? 0), 0)
                : 0;
              const starved = hz > 0 && live > 0 && live < hz * 0.7;
              return (
                <div key={group.id} className="flex items-center gap-3">
                  <div className="w-52 shrink-0">
                    <span
                      className="text-sm text-content"
                      data-tip={t('mavlink-config:telemetryRatesTab.groupTip', { name, messages: group.messages.join(', ') })}
                    >
                      {rateGroupLabel(group)}
                    </span>
                    <p className="text-[10px] text-content-secondary leading-tight font-mono">{name}</p>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={group.maxHz}
                    step={1}
                    value={hz}
                    onChange={(e) => {
                      dirtyRef.current.add(group.id);
                      setDraft({ ...draft, [group.id]: Number(e.target.value) });
                    }}
                    onPointerUp={() => commitGroup(group.id)}
                    onKeyUp={() => commitGroup(group.id)}
                    className="flex-1 accent-teal-400"
                  />
                  <span className="w-16 text-right text-sm text-content tabular-nums">
                    {hz === 0 ? t('mavlink-config:telemetryRatesTab.off') : t('mavlink-config:telemetryRatesTab.hz', { hz })}
                  </span>
                  <span
                    className={`w-20 text-right text-xs tabular-nums ${starved ? 'text-amber-400' : 'text-content-secondary'}`}
                    data-tip={!isMyLink
                      ? t('mavlink-config:telemetryRatesTab.notMeasurable')
                      : starved
                        ? t('mavlink-config:telemetryRatesTab.starved')
                        : t('mavlink-config:telemetryRatesTab.measuredTip')}
                  >
                    {live > 0 ? t('mavlink-config:telemetryRatesTab.hz', { hz: live.toFixed(1) }) : '-'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-subtle">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-content-secondary">
                {t('mavlink-config:telemetryRatesTab.linkBudget')}
                {capacity !== null && <span className="ml-1">{t('mavlink-config:telemetryRatesTab.capacity', { capacity: capacity.toLocaleString(), baud: link?.baud?.toLocaleString() })}</span>}
              </span>
              <span className={`tabular-nums ${used !== null && used > 90 ? 'text-red-400' : used !== null && used > 70 ? 'text-amber-400' : 'text-content-secondary'}`}>
                {cost.toLocaleString()} B/s{used !== null ? ` · ${used}%` : ''}
              </span>
            </div>
            <div className="h-2 bg-surface-input rounded overflow-hidden">
              <div
                className={`h-full transition-all ${used !== null && used > 90 ? 'bg-red-500' : used !== null && used > 70 ? 'bg-amber-500' : 'bg-teal-500'}`}
                style={{ width: `${used ?? Math.min(100, cost / 20)}%` }}
              />
            </div>
            {capacity === null && (
              <p className="mt-1.5 text-[10px] text-content-secondary">
                {t('mavlink-config:telemetryRatesTab.noBaud')}
              </p>
            )}
          </div>

          {note && <p className="mt-3 text-xs text-teal-300">{note}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => { dirtyRef.current.clear(); setDraft(current); }}
              disabled={!dirty || busy !== null}
              data-tip={t('mavlink-config:telemetryRatesTab.revertTip')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-input hover:bg-surface-raised border border-subtle rounded text-content-secondary hover:text-content disabled:opacity-40 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('mavlink-config:telemetryRatesTab.revert')}
            </button>
            <button
              onClick={tryNow}
              disabled={!isMine || busy !== null}
              data-tip={isMine
                ? t('mavlink-config:telemetryRatesTab.tryTip')
                : t('mavlink-config:telemetryRatesTab.tryUnavailable')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-input hover:bg-surface-raised border border-subtle rounded text-content disabled:opacity-40 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {busy === 'try' ? t('mavlink-config:telemetryRatesTab.sending') : t('mavlink-config:telemetryRatesTab.tryNow')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
