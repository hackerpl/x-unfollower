// Sequential user processing utility with error tolerance
// Extracted from DashboardAPIClient for testability

/**
 * Process a list of items sequentially, calling fetchFn for each item.
 * If fetchFn returns null (indicating failure), the item is skipped.
 * Only successful (non-null) results are included in the output.
 *
 * Optionally calls onProgress for each item processed (whether success or failure).
 *
 * @param items - The list of items to process
 * @param fetchFn - Async function that processes a single item, returns null on failure
 * @param onProgress - Optional progress callback called after each item
 * @returns Array of successful (non-null) results, preserving original order
 */
export async function processUsersSequentially<TInput, TOutput>(
  items: TInput[],
  fetchFn: (item: TInput) => Promise<TOutput | null>,
  onProgress?: (current: number, total: number) => void,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const result = await fetchFn(items[i]);

    if (result !== null) {
      results.push(result);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}
