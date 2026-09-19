/** Shared with inbound persistence so analysis snapshots serialize with LINE writes per LineUser. */
export const LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE = 726_001;

export async function lockLineUserInquiryTransaction(
  tx: { $executeRaw: any },
  lineUserId: number,
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE}::int,
      ${lineUserId}::int
    )
  `;
}
