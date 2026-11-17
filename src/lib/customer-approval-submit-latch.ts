export function createApprovalSubmitLatch() {
  let locked = false;
  return {
    tryStart() {
      if (locked) return false;
      locked = true;
      return true;
    },
    finish() { locked = false; },
  };
}
