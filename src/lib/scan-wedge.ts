export const WEDGE_MAX_INTER_KEY_MS = 80;
export const WEDGE_STALE_MS = 300;
export const WEDGE_MIN_CHARS = 4;

export type WedgeBuffer = { value: string; lastAt: number | null; fast: boolean };
export const EMPTY_WEDGE_BUFFER: WedgeBuffer = { value: "", lastAt: null, fast: true };

export function advanceWedgeBuffer(state: WedgeBuffer, key: string, at: number):
  { buffer: WedgeBuffer; scan: string | null } {
  if (key === "Enter") {
    return {
      buffer: EMPTY_WEDGE_BUFFER,
      scan: state.value.length >= WEDGE_MIN_CHARS && state.fast && state.lastAt !== null &&
        at - state.lastAt <= WEDGE_MAX_INTER_KEY_MS ? state.value : null,
    };
  }
  if (key.length !== 1) return { buffer: state, scan: null };
  const gap = state.lastAt === null ? null : at - state.lastAt;
  const stale = gap === null || gap < 0 || gap > WEDGE_STALE_MS;
  return {
    buffer: {
      value: (stale ? "" : state.value) + key,
      lastAt: at,
      fast: stale ? true : state.fast && gap <= WEDGE_MAX_INTER_KEY_MS,
    },
    scan: null,
  };
}
