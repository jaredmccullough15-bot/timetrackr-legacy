import { storage } from "./storage";

export async function recalculateSickTime(userId: string): Promise<void> {
  // Get all completed time entries for the user
  const entries = await storage.getUserTimeEntries(userId);
  
  // Calculate total hours worked from all completed entries
  const totalHours = entries.reduce((sum, entry) => {
    if (entry.clockOut) {
      const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }
    return sum;
  }, 0);
  
  // Calculate sick time accrual (1 hour per 30 hours worked)
  const sickTimeBalance = totalHours / 30;
  
  // Update user's sick time balance
  await storage.updateUserSickTime(userId, sickTimeBalance.toFixed(2));
}
