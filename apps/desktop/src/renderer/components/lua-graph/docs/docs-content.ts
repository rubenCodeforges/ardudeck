/**
 * Documentation content for the Lua Graph Editor.
 * Section text lives in the lua-graph locale under docs.<section>.
 */
import {
  Rocket,
  Cpu,
  Cable,
  BookOpen,
  Code2,
  Cog,
  Lightbulb,
} from 'lucide-react';
import type { DocSection } from './docs-types';

const section = (id: string, key: string, icon: DocSection['icon']): DocSection => ({
  id,
  titleKey: `lua-graph:docs.${key}.title`,
  icon,
  contentKey: `lua-graph:docs.${key}.content`,
});

export const DOC_SECTIONS: DocSection[] = [
  section('getting-started', 'gettingStarted', Rocket),
  section('node-reference', 'nodeReference', Cpu),
  section('connections', 'connections', Cable),
  section('examples', 'examples', BookOpen),
  section('api-reference', 'apiReference', Code2),
  section('compilation', 'compilation', Cog),
  section('tips', 'tips', Lightbulb),
];
