// Sick time accrual has been DISABLED
// Sick time is now managed manually by admins and reset yearly to 72 hours on January 1st
// This function is kept as a no-op to avoid breaking existing code references

export async function recalculateSickTime(userId: string): Promise<void> {
  // Automatic sick time accrual is disabled
  // Sick time balance is now managed through:
  // 1. Manual adjustments by admins
  // 2. Yearly reset to 72 hours on January 1st
  // 3. Deductions when employees use sick time entries
  return;
}
