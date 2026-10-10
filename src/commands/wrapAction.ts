/**
 * Wraps a command action with standardized error handling.
 * Sets process.exitCode = 1 on error and logs the error message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapAction<T extends (...args: any[]) => Promise<void>>(
  action: T,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (async (...args: any[]) => {
    try {
      await action(...args);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  }) as T;
}
