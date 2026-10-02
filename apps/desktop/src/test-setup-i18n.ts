import { setI18n } from 'react-i18next';
import { i18n } from './shared/i18n/index.js';

// Global registration covers React roots created outside the provider (map popups, portals in new roots).
setI18n(i18n);
