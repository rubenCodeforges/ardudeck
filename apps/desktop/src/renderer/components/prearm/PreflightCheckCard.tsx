import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessagesStore } from '../../stores/messages-store';
import { useConnectionStore } from '../../stores/connection-store';
import {
  PREARM_CATEGORIES,
  PREARM_STALE_MS,
  preArmCategoryLabel,
  isPreArmMessage,
  matchPreArmError,
  type PreArmCategory,
} from '../../../shared/prearm-checks';
import { PreArmParamFix } from './PreArmParamFix';
import { SafetyConfigCard } from './SafetyConfigCard';
import { PanelContainer } from '../panels/panel-utils';

export function PreflightCheckCard() {
  const { t } = useTranslation();
  const messages = useMessagesStore((s) => s.messages);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [lastCheckTs, setLastCheckTs] = useState(() => Date.now() - 30_000);
  const [isChecking, setIsChecking] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<PreArmCategory>>(new Set());

  // The FC re-broadcasts failing checks every ~30 s (bumping the message's
  // timestamp in the store), so errors age out on their own once resolved.
  // Tick to re-evaluate freshness even when no new messages arrive.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // Filter for fresh pre-arm messages and match them
  const activeErrors = useMemo(() => {
    const freshAfter = Math.max(lastCheckTs, now - PREARM_STALE_MS);
    return messages
      .filter((m) => m.timestamp >= freshAfter && isPreArmMessage(m.text, firmware))
      .map((m) => {
        const result = matchPreArmError(m.text, firmware);
        return result ? { message: m, ...result } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [messages, lastCheckTs, now, firmware]);

  // Group errors by category, deduplicate by reason
  const errorsByCategory = useMemo(() => {
    const map = new Map<PreArmCategory, typeof activeErrors>();
    for (const err of activeErrors) {
      const cat = err.pattern.category;
      const existing = map.get(cat) ?? [];
      if (!existing.some((e) => e.reason === err.reason)) {
        existing.push(err);
      }
      map.set(cat, existing);
    }
    return map;
  }, [activeErrors]);

  const issueCount = errorsByCategory.size;
  const allClear = issueCount === 0 && !isChecking;

  const handleRecheck = () => {
    setLastCheckTs(Date.now());
    setIsChecking(true);
    setExpandedCategories(new Set());
    setTimeout(() => setIsChecking(false), 3000);
  };

  const toggleCategory = (cat: PreArmCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content">{t('prearm:preflightCheckCard.title')}</span>
          {isChecking ? (
            <span className="text-[10px] text-blue-400 animate-pulse">{t('common:checking')}</span>
          ) : issueCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
              {t('prearm:preflightCheckCard.issues', { count: issueCount })}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
              {t('common:ready')}
            </span>
          )}
        </div>
        <button
          onClick={handleRecheck}
          disabled={isChecking}
          className="text-[10px] text-content-secondary hover:text-content transition-colors px-1.5 py-0.5 rounded hover:bg-surface-overlay-subtle disabled:opacity-50"
        >
          {t('prearm:preflightCheckCard.recheck')}
        </button>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-auto">
        {/* Settings that will never appear as a pre-arm failure because the FC
            is happy with them, and that decide whether a bad flight ends in a
            landing. Renders nothing when the aircraft is set up sensibly. */}
        <div className="px-3 pt-2 empty:hidden">
          <SafetyConfigCard />
        </div>
        <div className="divide-y divide-subtle/50">
          {PREARM_CATEGORIES.map(({ id }) => {
            const errors = errorsByCategory.get(id);
            const hasFailed = errors && errors.length > 0;
            const isExpanded = expandedCategories.has(id);

            return (
              <div key={id}>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                    hasFailed ? 'cursor-pointer hover:bg-surface-overlay-subtle' : ''
                  } transition-colors`}
                  onClick={hasFailed ? () => toggleCategory(id) : undefined}
                >
                  {isChecking ? (
                    <span className="w-3.5 text-center text-content-secondary">-</span>
                  ) : hasFailed ? (
                    <span className="w-3.5 text-center text-red-400 font-bold text-[11px]">✗</span>
                  ) : (
                    <span className="w-3.5 text-center text-emerald-400 text-[11px]">✓</span>
                  )}

                  <span className={`flex-1 ${hasFailed ? 'text-content' : 'text-content-secondary'}`}>
                    {preArmCategoryLabel(id)}
                  </span>

                  {hasFailed && (
                    <span className="text-[10px] text-content-secondary">
                      {isExpanded ? '▾' : '›'}
                    </span>
                  )}
                </div>

                {hasFailed && isExpanded && errors.map((err, i) => (
                  <div key={`${err.reason}-${i}`} className="border-t border/20">
                    <div className="px-3 py-1 pl-8 text-[11px] text-content-secondary font-mono">
                      {err.reason}
                    </div>
                    <div className="pl-5">
                      <PreArmParamFix fix={err.pattern.fix} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {allClear && (
          <div className="px-3 py-2 border-t border-subtle">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <span>✓</span>
              <span>{t('prearm:preflightCheckCard.readyToArm')}</span>
            </div>
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
