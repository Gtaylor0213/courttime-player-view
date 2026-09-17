/** Resolves after `ms` milliseconds. Used for retry back-off and rate-limited email sends. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
