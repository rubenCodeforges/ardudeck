/**
 * Paste-in dialog for surveyed RTK points: a surveyor walks the site with an
 * RTK pole and hands over a coordinate list; this turns it into map markers
 * or a connected polygon guide (which can then seed a survey / mission plan).
 * Parsing is live so mistakes are visible before anything lands on the map.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { MapPin, X, Check } from 'lucide-react';
import { parseSurveyedPoints } from './rtk-points';
import { useGuideStore } from '../../stores/guide-store';

const PLACEHOLDER = `One point per line - labels optional, decimal commas OK:

53.397635, 8.136100
P2; 53,397841; 8,136433
corner_ne  53.398012  8.137020`;

export function SurveyedPointsDialog({
  onClose,
  showToast,
}: {
  onClose: () => void;
  showToast?: (msg: string, kind: 'success' | 'error') => void;
}): JSX.Element {
  const { t } = useTranslation('mission');
  const addSurveyedPoints = useGuideStore((s) => s.addSurveyedPoints);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [connect, setConnect] = useState(false);

  const parsed = useMemo(() => parseSurveyedPoints(text), [text]);

  const add = () => {
    const res = addSurveyedPoints(parsed.points, { connect, name });
    if (!res.ok) {
      showToast?.(res.error ?? 'Could not add points', 'error');
      return;
    }
    showToast?.(
      connect
        ? `Added polygon from ${parsed.points.length} surveyed points`
        : `Added ${parsed.points.length} surveyed point${parsed.points.length === 1 ? '' : 's'}`,
      'success',
    );
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(92vw,560px)] flex flex-col rounded-2xl border border-default bg-surface-solid shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-content">{t('surveyedPoints.heading')}</h3>
            <p className="text-[11px] text-content-tertiary">
              Paste RTK measurements - one point per line, latitude first.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
            data-tip="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            autoFocus
            spellCheck={false}
            rows={9}
            className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-xs font-mono text-content leading-relaxed resize-y focus:outline-none focus:border-teal-500 placeholder:text-content-tertiary/60"
          />

          <div className="flex items-center justify-between text-[11px]">
            <span className={parsed.points.length > 0 ? 'text-teal-400 font-medium' : 'text-content-tertiary'}>
              {parsed.points.length} point{parsed.points.length === 1 ? '' : 's'} recognized
            </span>
            {parsed.skipped.length > 0 && (
              <span className="text-amber-500" data-tip="Lines with content that produced no coordinate (headers, notes, malformed rows)">
                {parsed.skipped.length} line{parsed.skipped.length === 1 ? '' : 's'} skipped
                {parsed.skipped.length <= 6 ? `: ${parsed.skipped.join(', ')}` : ''}
              </span>
            )}
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('surveyedPoints.namePlaceholder')}
            className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-xs text-content focus:outline-none focus:border-teal-500"
          />

          <div className="flex gap-2">
            <button
              onClick={() => setConnect(false)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs transition-colors ${
                !connect
                  ? 'border-teal-500/60 bg-teal-500/10 text-teal-400 font-medium'
                  : 'border-subtle bg-surface text-content-secondary hover:text-content'
              }`}
            >
              Markers
              <span className="block text-[10px] opacity-70 font-normal">{t('surveyedPoints.numberedPins')}</span>
            </button>
            <button
              onClick={() => setConnect(true)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs transition-colors ${
                connect
                  ? 'border-teal-500/60 bg-teal-500/10 text-teal-400 font-medium'
                  : 'border-subtle bg-surface text-content-secondary hover:text-content'
              }`}
            >
              Connected polygon
              <span className="block text-[10px] opacity-70 font-normal">{t('surveyedPoints.outlineInOrder')}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={add}
            disabled={parsed.points.length === 0 || (connect && parsed.points.length < 3)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {connect ? 'Add polygon' : 'Add markers'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
