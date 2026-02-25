import { useState, useRef, useCallback, useEffect } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}

export function TagInput({ tags, onChange, placeholder = 'Add tags...', suggestions }: TagInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions: match input (or show all when empty), exclude already-added tags
  const filtered = suggestions
    ?.filter(s => !tags.includes(s) && (input.trim() === '' || s.toLowerCase().includes(input.toLowerCase().trim())))
    .slice(0, 8) ?? [];

  // Show suggestions when focused and there are available tags
  const showSuggestions = isFocused && filtered.length > 0;

  const addTag = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
    setHighlightIndex(-1);
  }, [tags, onChange]);

  const removeTag = useCallback((tag: string) => {
    onChange(tags.filter(t => t !== tag));
  }, [tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        const match = filtered[highlightIndex];
        if (match) addTag(match);
      } else if (input.trim()) {
        addTag(input);
      }
      return;
    }

    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      const last = tags[tags.length - 1];
      if (last) removeTag(last);
      return;
    }

    if (e.key === 'Escape') {
      setIsFocused(false);
      setHighlightIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (showSuggestions && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // If user types a comma, add the text before it as a tag
    if (val.includes(',')) {
      const parts = val.split(',');
      for (const part of parts) {
        if (part.trim()) addTag(part);
      }
      return;
    }
    setInput(val);
    setHighlightIndex(-1);
  };

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-gray-900/50 border border-gray-700 rounded-lg focus-within:border-blue-500/50 min-h-[38px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Tag pills */}
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700/50 text-gray-300 rounded group"
          >
            {tag}
            <button
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-gray-500 hover:text-gray-200 transition-colors"
              type="button"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => { /* handled by click-outside */ }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 py-0.5"
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10">
          {filtered.map((suggestion, idx) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                idx === highlightIndex
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
