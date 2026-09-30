import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TourProvider, useTour } from '@reactour/tour';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { LocalizedFeatureTour } from '../../feature-tours';
import { FEATURE_TOURS } from '../../feature-tours';
import { useToursStore, isTourEligible } from '../../stores/tours-store';

interface ActiveTourProps {
  tour: LocalizedFeatureTour;
  onFinish: () => void;
  onAdvanceToTour: (nextTourId: string) => void;
}

function CloseWatcher({ onFinish }: { onFinish: () => void }) {
  const { isOpen } = useTour();
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      onFinish();
    }
  }, [isOpen, onFinish]);

  return null;
}

export function ActiveTour({ tour, onFinish, onAdvanceToTour }: ActiveTourProps) {
  const { t, i18n } = useTranslation('views');
  const isEnglish = i18n.language.startsWith('en');

  const nextEligibleTour = (() => {
    const state = useToursStore.getState();
    return FEATURE_TOURS.find(
      (t) => t.id !== tour.id && isTourEligible(t.id, state),
    );
  })();

  const activeSteps = tour.steps
    .filter((s) => !s.predicate || s.predicate())
    .map((step) => {
      // English keeps the original JSX so its inline <strong> emphasis survives;
      // every other language renders the translated plain text instead.
      if (isEnglish || !step.titleKey || !step.bodyKey) return step;
      return {
        ...step,
        content: (
          <div className="space-y-2">
            <div className="text-sm font-semibold">{t(step.titleKey)}</div>
            <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line">
              {t(step.bodyKey)}
            </p>
          </div>
        ),
      };
    });

  return (
    <TourProvider
      steps={activeSteps}
      defaultOpen
      startAt={0}
      showBadge
      showCloseButton
      showNavigation
      scrollSmooth
      padding={{ mask: 6, popover: [12, 16] }}
      onClickMask={({ setIsOpen }) => setIsOpen(false)}
      prevButton={({ currentStep, setCurrentStep }) =>
        currentStep === 0 ? null : (
          <button
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            {t('tours.ui.back')}
          </button>
        )
      }
      nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = currentStep === stepsLength - 1;
        if (!isLast) {
          return (
            <button
              onClick={() => setCurrentStep((s) => Math.min(stepsLength - 1, s + 1))}
              className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap"
              style={{ background: 'rgb(37 99 235)', color: '#fff' }}
            >
              {t('tours.ui.next')}
              <ArrowRight className="w-3 h-3" />
            </button>
          );
        }
        if (nextEligibleTour) {
          return (
            <button
              onClick={() => {
                setIsOpen(false);
                onAdvanceToTour(nextEligibleTour.id);
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap"
              style={{ background: 'rgb(37 99 235)', color: '#fff' }}
              title={t('tours.ui.next-tour-tooltip', { title: t(nextEligibleTour.titleKey ?? '', { defaultValue: nextEligibleTour.title }) })}
            >
              <Sparkles className="w-3 h-3" />
              {t('tours.ui.next-feature')}
              <ArrowRight className="w-3 h-3" />
            </button>
          );
        }
        return (
          <button
            onClick={() => setIsOpen(false)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap"
            style={{ background: 'rgb(37 99 235)', color: '#fff' }}
          >
            <Check className="w-3 h-3" />
            {t('tours.ui.done')}
          </button>
        );
      }}
      styles={{
        popover: (base) => ({
          ...base,
          background: 'var(--bg-tooltip)',
          color: 'var(--text-primary)',
          borderRadius: 12,
          border: '1px solid var(--border-default)',
          boxShadow: '0 20px 40px -12px var(--shadow-color)',
          maxWidth: 360,
          padding: '16px 18px',
        }),
        maskArea: (base) => ({ ...base, rx: 8 }),
        maskWrapper: (base) => ({ ...base, color: 'rgba(0,0,0,0.55)' }),
        badge: (base) => ({
          ...base,
          background: 'rgb(37 99 235)',
          color: 'white',
          fontWeight: 600,
        }),
        controls: (base) => ({
          ...base,
          marginTop: 12,
          flexWrap: 'wrap',
          gap: 8,
          rowGap: 8,
          alignItems: 'center',
        }),
        close: (base) => ({ ...base, color: 'var(--text-tertiary)', right: 10, top: 10 }),
        dot: (base, opts) => ({
          ...base,
          background: opts?.current ? 'rgb(37 99 235)' : 'var(--border-default)',
        }),
        button: (base, opts) => ({
          ...base,
          color: opts?.disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
        }),
        arrow: (base, opts) => ({
          ...base,
          color: opts?.disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
        }),
      }}
    >
      <CloseWatcher onFinish={onFinish} />
    </TourProvider>
  );
}
