// The two reads use the same ordered Prisma query. Include IDs and all related
// fields so a changed line, option, customer mode, or document composition
// invalidates a PDF rendered before the change.
export function estimatePdfSourceFingerprint(source: unknown): string {
  return JSON.stringify(source);
}
