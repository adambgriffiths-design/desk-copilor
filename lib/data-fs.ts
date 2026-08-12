/** Vercel/serverless has a read-only filesystem — data/ writes must not fail API routes. */

export function isReadOnlyFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EROFS" || code === "EPERM";
}

/**
 * Run a data-directory write. On read-only FS (hosted Vercel), skip and return false.
 * Local dev writes behave normally.
 */
export async function tryDataWrite(
  label: string,
  fn: () => Promise<void>
): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    if (isReadOnlyFsError(err)) {
      console.warn(`[desk-copilot] skipped ${label} — read-only filesystem (hosted deploy)`);
      return false;
    }
    throw err;
  }
}
