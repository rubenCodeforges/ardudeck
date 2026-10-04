import { useTranslation } from 'react-i18next';
import { BookOpen, ExternalLink, Globe, Heart, Package, ShoppingCart, type LucideIcon } from 'lucide-react';
import adlerblixLogo from '../../assets/sponsors/adlerblix.svg';
import uavDevLogo from '../../assets/sponsors/uav-dev.svg';

interface SponsorLink {
  labelKey: string;
  url: string;
  Icon: LucideIcon;
}

interface Sponsor {
  name: string;
  logo: string;
  taglineKey: string;
  bar: string;
  links: SponsorLink[];
}

const SPONSORS: Sponsor[] = [
  {
    name: 'Adlerblix',
    logo: adlerblixLogo,
    taglineKey: 'settings:settingsView.about.sponsors.adlerblix',
    bar: 'bg-emerald-500',
    links: [
      { labelKey: 'settings:settingsView.about.sponsors.website', url: 'https://adlerblix.de', Icon: Globe },
      { labelKey: 'settings:settingsView.about.sponsors.thankYou', url: 'https://ardudeck.com/blog/thank-you-adlerblix/', Icon: Heart },
    ],
  },
  {
    name: 'UAV-DEV',
    logo: uavDevLogo,
    taglineKey: 'settings:settingsView.about.sponsors.uavDev',
    bar: 'bg-sky-500',
    links: [
      { labelKey: 'settings:settingsView.about.sponsors.website', url: 'https://www.uav-dev.com', Icon: Globe },
      { labelKey: 'settings:settingsView.about.sponsors.shop', url: 'https://www.uav-dev.com/en/shop', Icon: ShoppingCart },
      { labelKey: 'settings:settingsView.about.sponsors.wiki', url: 'https://wiki.uav-dev.com/en/home', Icon: BookOpen },
      { labelKey: 'settings:settingsView.about.sponsors.cargo', url: 'https://hangar.ardudeck.com/module/com.uav-dev', Icon: Package },
    ],
  },
];

export function SupportedBy() {
  const { t } = useTranslation();
  return (
    <section className="mt-4 bg-surface rounded-xl border border-subtle p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-content">{t('settings:settingsView.about.sponsors.title')}</h3>
        <p className="text-xs text-content-secondary mt-0.5">{t('settings:settingsView.about.sponsors.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {SPONSORS.map((s) => (
          <div key={s.name} className="relative h-full flex gap-4 rounded-xl border border-subtle bg-surface-raised p-4 overflow-hidden">
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
            <div className="w-20 h-20 shrink-0 rounded-lg bg-white border border-subtle flex items-center justify-center p-2.5">
              <img src={s.logo} alt={s.name} className="max-w-full max-h-full" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="text-sm font-semibold text-content">{s.name}</div>
              <p className="text-xs text-content-secondary leading-relaxed mt-0.5">{t(s.taglineKey)}</p>
              <div className="flex flex-wrap gap-2 mt-auto pt-3">
                {s.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-subtle bg-surface text-xs font-medium text-content-secondary hover:text-content hover:border-strong transition-colors"
                  >
                    <l.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    {t(l.labelKey)}
                    <ExternalLink className="w-3 h-3 opacity-60" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
