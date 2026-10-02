import { useEffect, useRef } from 'react';
import { TourProvider, useTour } from '@reactour/tour';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureTour } from '../../feature-tours';
import { FEATURE_TOURS } from '../../feature-tours';
import { useToursStore, isTourEligible } from '../../stores/tours-store';

interface ActiveTourProps {
  tour: FeatureTour;
  onFinish: () => void;
  onAdvanceToTour: (nextTourId: string) => void;
}

function CloseWatcher({ onFinish, cleanup }: { onFinish: () => void; cleanup?: () => void }) {
  const { isOpen } = useTour();
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      cleanup?.();
      onFinish();
    }
  }, [isOpen, onFinish, cleanup]);

  return null;
}

/** Runs a step's setup when it becomes current, so its anchor exists before reactour looks for it. */
function StepSetupWatcher({ steps }: { steps: FeatureTour['steps'] }) {
  const { currentStep } = useTour();
  useEffect(() => {
    steps[currentStep]?.setup?.();
  }, [currentStep, steps]);
  return null;
}

export function ActiveTour({ tour, onFinish, onAdvanceToTour }: ActiveTourProps) {
  const { t } = useTranslation();
  // Chain only within this view and only to tours that apply here, never across the app.
  const nextEligibleTour = (() => {
    const state = useToursStore.getState();
    return FEATURE_TOURS.find(
      (ft) => ft.id !== tour.id && ft.view === tour.view && isTourEligible(ft.id, state) && (!ft.predicate || ft.predicate()),
    );
  })();

  const activeSteps = tour.steps.filter((s) => !s.predicate || s.predicate());

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
            {t('common:back')}
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
              {t('common:next')}
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
              title={t('tours:activeTour.nextTitle', { title: t(nextEligibleTour.titleKey) })}
            >
              <Sparkles className="w-3 h-3" />
              {t('tours:activeTour.nextFeature')}
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
            {t('common:done')}
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
      <StepSetupWatcher steps={activeSteps} />
      <CloseWatcher onFinish={onFinish} cleanup={tour.cleanup} />
    </TourProvider>
  );
}
