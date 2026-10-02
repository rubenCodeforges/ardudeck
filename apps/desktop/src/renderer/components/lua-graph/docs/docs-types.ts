/**
 * Type definitions for Lua Graph Editor documentation sections.
 */
import type { LucideIcon } from 'lucide-react';

export interface DocSection {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  contentKey: string;
}
