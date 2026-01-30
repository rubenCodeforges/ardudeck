/**
 * InfoCard Component
 *
 * Reusable information card with icon and description.
 * Used for "What is X?" explanations and tips.
 */

import React from 'react';
import { Info, Lightbulb, AlertTriangle, HelpCircle, type LucideIcon } from 'lucide-react';

export type InfoCardVariant = 'info' | 'tip' | 'warning' | 'help';

const VARIANTS: Record<InfoCardVariant, { icon: LucideIcon; colors: string }> = {
  info: {
    icon: Info,
    colors: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  },
  tip: {
    icon: Lightbulb,
    colors: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  },
  warning: {
    icon: AlertTriangle,
    colors: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  },
  help: {
    icon: HelpCircle,
    colors: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  },
};

export interface InfoCardProps {
  /** Card title */
  title: string;
  /** Card description/content */
  children: React.ReactNode;
  /** Card variant (affects color and icon) */
  variant?: InfoCardVariant;
  /** Custom icon (overrides variant icon) */
  icon?: LucideIcon;
  /** Optional class name */
  className?: string;
}

export function InfoCard({
  title,
  children,
  variant = 'info',
  icon,
  className = '',
}: InfoCardProps) {
  const config = VARIANTS[variant];
  const IconComponent = icon || config.icon;
  const [bgColor, borderColor, textColor] = config.colors.split(' ');

  return (
    <div className={`${bgColor} rounded-xl border ${borderColor} p-4 flex items-start gap-4 ${className}`}>
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
        <IconComponent className={`w-5 h-5 ${textColor}`} />
      </div>
      <div>
        <p className={`${textColor} font-medium`}>{title}</p>
        <div className="text-sm text-gray-400 mt-1">{children}</div>
      </div>
    </div>
  );
}

/**
 * Explanation card for "What is X?" sections
 */
export interface ExplanationCardProps {
  /** Main question/title */
  title: string;
  /** Array of explanations with label and description */
  explanations: Array<{
    label: string;
    color: string; // Tailwind text color class
    description: string;
  }>;
  /** Optional class name */
  className?: string;
}

export function ExplanationCard({ title, explanations, className = '' }: ExplanationCardProps) {
  return (
    <div className={`bg-gray-800/30 rounded-xl border border-gray-700/30 p-5 ${className}`}>
      <h4 className="font-medium text-gray-300 mb-3 flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-yellow-400" /> {title}
      </h4>
      <div className={`grid grid-cols-${Math.min(explanations.length, 4)} gap-6 text-sm`}>
        {explanations.map((item) => (
          <div key={item.label}>
            <span className={`${item.color} font-medium`}>{item.label}</span>
            <p className="text-gray-500 mt-1">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact tip card for inline hints
 */
export interface TipProps {
  children: React.ReactNode;
  className?: string;
}

export function Tip({ children, className = '' }: TipProps) {
  return (
    <div className={`bg-zinc-800/50 rounded-lg p-3 ${className}`}>
      <p className="text-xs text-zinc-500">
        <span className="text-blue-400">Tip:</span> {children}
      </p>
    </div>
  );
}

/**
 * Warning card for important notices
 */
export function Warning({ children, className = '' }: TipProps) {
  return (
    <div className={`bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 ${className}`}>
      <p className="text-xs text-amber-400">{children}</p>
    </div>
  );
}

export default InfoCard;
