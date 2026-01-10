import { useState, useRef, useEffect, useMemo } from 'react';
import type { BoardInfo } from '../../stores/firmware-store';

interface BoardPickerProps {
  boards: BoardInfo[];
  selectedBoard: BoardInfo | null;
  onSelectBoard: (board: BoardInfo) => void;
  isLoading?: boolean;
  error?: string | null;
  placeholder?: string;
  initialSearchQuery?: string;
}

export function BoardPicker({
  boards,
  selectedBoard,
  onSelectBoard,
  isLoading = false,
  error = null,
  placeholder = 'Select board manually...',
  initialSearchQuery = '',
}: BoardPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  // Auto-expand when there's an initial search query
  const [showAllBoards, setShowAllBoards] = useState(!!initialSearchQuery);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update search query when initialSearchQuery prop changes
  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      setShowAllBoards(true);
    }
  }, [initialSearchQuery]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setShowAllBoards(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter boards based on search
  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return boards;
    const query = searchQuery.toLowerCase();
    return boards.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.id.toLowerCase().includes(query) ||
        b.category.toLowerCase().includes(query)
    );
  }, [boards, searchQuery]);

  // Separate popular boards
  const popularBoards = useMemo(() => {
    return filteredBoards.filter((b) => b.isPopular);
  }, [filteredBoards]);

  // Group boards by category (for "Show all" view)
  const boardsByCategory = useMemo(() => {
    const nonPopular = showAllBoards ? filteredBoards : [];
    const grouped: Record<string, BoardInfo[]> = {};

    // Define category order
    const categoryOrder = [
      'Legacy (AVR)',
      'Cube',
      'Pixhawk',
      'Holybro',
      'SpeedyBee',
      'Matek',
      'mRo',
      'CUAV',
      'Other',
    ];

    for (const board of nonPopular) {
      const category = board.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(board);
    }

    // Sort by category order
    const sorted: [string, BoardInfo[]][] = [];
    for (const cat of categoryOrder) {
      if (grouped[cat]) {
        sorted.push([cat, grouped[cat]]);
        delete grouped[cat];
      }
    }
    // Add any remaining categories
    for (const [cat, boards] of Object.entries(grouped)) {
      sorted.push([cat, boards]);
    }

    return sorted;
  }, [filteredBoards, showAllBoards]);

  // All visible boards for keyboard navigation
  const visibleBoards = useMemo(() => {
    const result: BoardInfo[] = [];
    if (!showAllBoards && !searchQuery) {
      result.push(...popularBoards);
    } else {
      for (const [, categoryBoards] of boardsByCategory) {
        result.push(...categoryBoards);
      }
    }
    return result;
  }, [popularBoards, boardsByCategory, showAllBoards, searchQuery]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        setShowAllBoards(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < visibleBoards.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : visibleBoards.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visibleBoards.length) {
          handleSelectBoard(visibleBoards[highlightedIndex]);
        }
        break;
    }
  };

  const handleSelectBoard = (board: BoardInfo) => {
    onSelectBoard(board);
    setIsOpen(false);
    setSearchQuery('');
    setShowAllBoards(false);
    setHighlightedIndex(-1);
  };

  const handleToggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setSearchQuery('');
      setShowAllBoards(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleToggleOpen}
        onKeyDown={handleKeyDown}
        className={`
          w-full px-3 py-2 text-left rounded-md border
          bg-zinc-800 border-zinc-700 text-zinc-200
          hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500
          flex items-center justify-between
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
          ${error ? 'border-red-500' : ''}
        `}
        disabled={isLoading}
      >
        <span className={selectedBoard ? 'text-zinc-100' : 'text-zinc-500'}>
          {isLoading
            ? 'Loading boards...'
            : selectedBoard
              ? selectedBoard.name
              : placeholder}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-[400px] overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-zinc-700">
            <div className="relative">
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(-1);
                  // Auto-show all when searching
                  if (e.target.value.trim()) {
                    setShowAllBoards(true);
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search boards..."
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Board list */}
          <div className="overflow-y-auto flex-1">
            {boards.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">
                No boards available
              </div>
            ) : filteredBoards.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">
                No boards match "{searchQuery}"
              </div>
            ) : (
              <>
                {/* Popular boards section (only when not searching) */}
                {!searchQuery && !showAllBoards && popularBoards.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase bg-zinc-900/50">
                      Popular
                    </div>
                    {popularBoards.map((board, index) => (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() => handleSelectBoard(board)}
                        className={`
                          w-full px-3 py-2 text-left text-sm
                          hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none
                          ${highlightedIndex === index ? 'bg-zinc-700' : ''}
                          ${selectedBoard?.id === board.id ? 'text-blue-400' : 'text-zinc-200'}
                        `}
                      >
                        <span className="font-medium">{board.name}</span>
                        <span className="ml-2 text-xs text-zinc-500">
                          {board.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Show all boards toggle (only when not searching) */}
                {!searchQuery && !showAllBoards && (
                  <button
                    type="button"
                    onClick={() => setShowAllBoards(true)}
                    className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-zinc-700 border-t border-zinc-700 flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                    Show all boards ({boards.length})
                  </button>
                )}

                {/* Full categorized list (when expanded or searching) */}
                {(showAllBoards || searchQuery) && boardsByCategory.map(([category, categoryBoards]) => (
                  <div key={category}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase bg-zinc-900/50 sticky top-0">
                      {category}
                    </div>
                    {categoryBoards.map((board) => {
                      const globalIndex = visibleBoards.indexOf(board);
                      return (
                        <button
                          key={board.id}
                          type="button"
                          onClick={() => handleSelectBoard(board)}
                          className={`
                            w-full px-3 py-2 text-left text-sm
                            hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none
                            ${highlightedIndex === globalIndex ? 'bg-zinc-700' : ''}
                            ${selectedBoard?.id === board.id ? 'text-blue-400' : 'text-zinc-200'}
                          `}
                        >
                          {board.name}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
