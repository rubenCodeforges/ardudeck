import type { TitleBarItemRegistration } from '@ardudeck/module-sdk';
import { createSlugRegistry } from './slug-registry';

export const titleBarRegistry = createSlugRegistry<TitleBarItemRegistration>();
