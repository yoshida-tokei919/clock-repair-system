import { PrismaClient } from "@prisma/client";

/**
 * Calculates a Priority Score for a repair ticket.
 * Higher score = Higher priority.
 * 
 * Logic:
 * 1. Deadline urgency: The closer the deadline, the higher the score.
 * 2. Customer Rank: Multiplier for VIPs.
 * 3. Work Load: Slight boost for quick jobs (fillers), or handling heavy jobs early.
 */
export function calculatePriorityScore(
    deliveryDate: Date | null,
    customerRank: number,
    estimatedMinutes: number
): number {
    let score = 0;

    // 1. Customer Rank Impact (Base: 100 pts per rank)
    // Rank 1 (General) = 100, Rank 5 (VIP) = 500
    score += customerRank * 100;

    // 2. Deadline Impact
    // If due within 3 days: +1000
    // If due within 7 days: +500
    // If due within 30 days: +100
    if (deliveryDate) {
        const today = new Date();
        const diffTime = deliveryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 3) score += 1000;
        else if (diffDays <= 7) score += 500;
        else if (diffDays <= 30) score += 100;

        // Linearly inverse to availability
        // Add (365 - days) to give slight edge to earlier dates
        score += Math.max(0, 365 - diffDays);
    }

    // 3. Work Load Strategy
    // For now, let's prioritize quick wins to clear the queue?
    // Or maybe just neutral. Let's add slight weight to shorter jobs.
    if (estimatedMinutes > 0 && estimatedMinutes < 60) {
        score += 50; // Quick job bonus
    }

    return score;
}

/**
 * Estimates work time based on Caliber and Movement Type.
 */
export function estimateWorkMinutes(
    caliberName: string,
    movementType: string | null,
    baseStandard: number
): number {
    // Logic could be enhanced to look up historical averages.
    // For now, use the Master value, but add buffer if it's "Vintage" or undefined.

    let minutes = baseStandard;

    // Heuristic adjustments
    if (movementType === 'mechanical_chrono') {
        // Chronographs often take 1.5x expected if complex
        // This is just a place for the logic hook.
    }

    return minutes;
}
