import { GroupingDemo } from './GroupingDemo';
import { LayoutsDemo } from './LayoutsDemo';
import { SplitDemo } from './SplitDemo';

export interface AppGuide {
  /** Versioned id; bump the suffix to show a changed guide again. Shared with the mobile app where both have it. */
  id: string;
  titleKey: string;
  blurbKey: string;
  Demo: () => JSX.Element;
}

/** Newest first. The launch run shows unseen guides oldest first, the order they build on each other. */
export const APP_GUIDES: AppGuide[] = [
  {
    id: 'map-split-v1',
    titleKey: 'guides:registry.mapSplit.title',
    blurbKey: 'guides:registry.mapSplit.blurb',
    Demo: SplitDemo,
  },
  {
    id: 'workspace-layouts-v1',
    titleKey: 'guides:registry.workspaceLayouts.title',
    blurbKey: 'guides:registry.workspaceLayouts.blurb',
    Demo: LayoutsDemo,
  },
  {
    id: 'grouping-v1',
    titleKey: 'guides:registry.grouping.title',
    blurbKey: 'guides:registry.grouping.blurb',
    Demo: GroupingDemo,
  },
];

export function getGuide(id: string): AppGuide | undefined {
  return APP_GUIDES.find((g) => g.id === id);
}
