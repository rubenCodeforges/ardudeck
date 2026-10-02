/**
 * Documentation dialog - full-screen overlay with sidebar navigation
 * and rendered markdown content for each documentation section.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DOC_SECTIONS } from './docs-content';
import { renderMarkdown } from './markdown-renderer';

interface DocsDialogProps {
  onClose: () => void;
}

export function DocsDialog({ onClose }: DocsDialogProps) {
  const { t, i18n } = useTranslation();
  const [activeSection, setActiveSection] = useState(DOC_SECTIONS[0]!.id);
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Scroll to top on section change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [activeSection]);

  const handleSectionClick = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
  }, []);

  // Memoize rendered content per section
  const renderedContent = useMemo(() => {
    const section = DOC_SECTIONS.find((s) => s.id === activeSection);
    if (!section) return null;
    return renderMarkdown(t(section.contentKey));
  }, [activeSection, t, i18n.language]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-solid rounded-2xl border border-subtle w-full max-w-4xl mx-4 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-content">{t('lua-graph:docsDialog.title')}</h2>
              <p className="text-[10px] text-content-secondary mt-0.5">
                {t('lua-graph:docsDialog.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body - sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border-r border-subtle py-3 px-2 overflow-y-auto">
            {DOC_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section.id)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12px] transition-colors mb-0.5
                    ${isActive
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'text-content-secondary hover:bg-surface hover:text-content'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t(section.titleKey)}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
            {renderedContent}
          </div>
        </div>
      </div>
    </div>
  );
}
