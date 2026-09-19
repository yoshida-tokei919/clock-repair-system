import "server-only";

export type LineProfileDisplayNameResolver = (lineUserId: string) => Promise<string | null>;

const LINE_PROFILE_TIMEOUT_MS = 3_000;

export const resolveLineProfileDisplayName: LineProfileDisplayNameResolver = async (lineUserId) => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(LINE_PROFILE_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;

    const profile: unknown = await response.json();
    if (
      typeof profile === "object" &&
      profile !== null &&
      "displayName" in profile &&
      typeof profile.displayName === "string" &&
      profile.displayName.trim()
    ) {
      return profile.displayName.trim();
    }
  } catch {
    // Profile lookup is best-effort. Never expose the access token in logs.
  }
  return null;
};
