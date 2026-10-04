import type { ConfigCardSlot } from '@ardudeck/module-sdk';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { cardsForSlot, configCardRegistry } from './module-extension-registries';

/** Cards that loaded modules contributed to a configuration screen slot. */
export function ModuleConfigCards({ slot }: { slot: ConfigCardSlot }) {
  const cards = cardsForSlot(configCardRegistry.useEntries(), slot);
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map(({ slug, id, value: { component: Card } }) => (
        <ErrorBoundary key={`${slug}:${id}`} label={`${slug} ${id}`}>
          <Card />
        </ErrorBoundary>
      ))}
    </>
  );
}
