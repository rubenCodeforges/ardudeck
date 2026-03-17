/**
 * Creates a case-insensitive RegExp from a search query string.
 * Supports regex patterns like `serial[56]_baud`.
 * Falls back to literal string matching if the query is not valid regex.
 */
export function createSearchRegex(query: string): RegExp {
  try {
    return new RegExp(query, 'i');
  } catch {
    // If the query isn't valid regex, escape it and match as literal string
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }
}

/**
 * Tests whether a parameter name matches a search query.
 * Supports case-insensitive regex patterns.
 * Returns true for empty/whitespace-only queries (matches everything).
 */
export function matchesSearchQuery(paramName: string, searchQuery: string): boolean {
  if (!searchQuery.trim()) {
    return true;
  }
  const regex = createSearchRegex(searchQuery);
  return regex.test(paramName);
}
