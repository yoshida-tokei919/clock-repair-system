
import { calculatePriorityScore, estimateWorkMinutes } from "./scheduling";

// Mock Data matching Seed
const VIP_RANK = 5;
const NORMAL_RANK = 1;
const DAYTONA_TIME = 120; // from seed

function runTests() {
    console.log("--- Starting Logic Verification ---");

    // Test 1: Time Estimation
    const time = estimateWorkMinutes('4130', 'mechanical_chrono', DAYTONA_TIME);
    console.log(`[Test 1] Time Est. for Daytona (4130): Expected 120, Got ${time}`);
    if (time !== 120) console.error("FAIL: Time estimation incorrect");
    else console.log("PASS");

    // Test 2: Priority Score (VIP, No Deadline)
    // Score = Rank(5)*100 = 500.
    const p1 = calculatePriorityScore(null, VIP_RANK, time);
    console.log(`[Test 2] Priority VIP (No Deadline): Expected ~500, Got ${p1}`);
    if (p1 < 500) console.error("FAIL: VIP score too low");
    else console.log("PASS");

    // Test 3: Priority Score (Normal, tight deadline)
    // Score = Rank(1)*100(100) + Deadline(<3days)(1000) = 1100.
    const urgentDate = new Date();
    urgentDate.setDate(urgentDate.getDate() + 2); // 2 days from now
    const p2 = calculatePriorityScore(urgentDate, NORMAL_RANK, 60);
    console.log(`[Test 3] Priority Normal (Urgent <3days): Expected >1100, Got ${p2}`);
    if (p2 < 1100) console.error("FAIL: Deadline boost not working");
    else console.log("PASS");

    console.log("--- Verification Complete ---");
}

runTests();
