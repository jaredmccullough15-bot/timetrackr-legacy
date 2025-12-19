import { startOfWeek, endOfWeek, format, startOfYear, subDays } from 'date-fns';
import { storage } from './storage';
import { sendWeeklyTimesheetReport, EmployeeHoursData, sendPunchApprovalNotification, PendingPunchData } from './email';

const TIMESHEET_RECIPIENTS = [
  'Mat@mihealthquotes.com',
  'jared@mihealthquotes.com'
];

const FRIDAY_HOURS_ADDITION = 8;
const YEARLY_SICK_TIME_RESET = '72';
const YEARLY_PTO_RESET = '64';

async function calculateWeeklyHoursForAllEmployees(): Promise<EmployeeHoursData[]> {
  const allUsers = await storage.getAllUsers();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
  
  const employeeHours: EmployeeHoursData[] = [];
  
  for (const user of allUsers) {
    const entries = await storage.getUserTimeEntries(user.id);
    
    const weeklyEntries = entries.filter(entry => {
      const entryDate = new Date(entry.clockIn);
      return entryDate >= weekStart && entryDate <= weekEnd && entry.clockOut;
    });
    
    let totalHours = weeklyEntries.reduce((total, entry) => {
      if (entry.clockOut) {
        const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
        return total + hours;
      }
      return total;
    }, 0);
    
    totalHours += FRIDAY_HOURS_ADDITION;
    
    // Round to nearest half hour
    const roundedHours = Math.round(totalHours * 2) / 2;
    
    employeeHours.push({
      name: `${user.firstName} ${user.lastName}`,
      hours: roundedHours
    });
  }
  
  employeeHours.sort((a, b) => a.name.localeCompare(b.name));
  
  return employeeHours;
}

async function sendWeeklyTimesheet(): Promise<void> {
  try {
    console.log('Starting weekly timesheet email job...');
    
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
    
    const weekStartStr = format(weekStart, 'M/d/yyyy');
    const weekEndStr = format(weekEnd, 'M/d/yyyy');
    
    const employeeHours = await calculateWeeklyHoursForAllEmployees();
    
    await sendWeeklyTimesheetReport(
      TIMESHEET_RECIPIENTS,
      weekStartStr,
      weekEndStr,
      employeeHours
    );
    
    console.log(`Weekly timesheet email sent successfully for week ${weekStartStr} - ${weekEndStr}`);
  } catch (error) {
    console.error('Failed to send weekly timesheet email:', error);
  }
}

function isFriday8amEST(): boolean {
  const now = new Date();
  const estOffset = -5 * 60;
  const isDST = isDaylightSavingTime(now);
  const offset = isDST ? -4 * 60 : estOffset;
  
  const estTime = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  
  const isFriday = estTime.getDay() === 5;
  const isHour8 = estTime.getHours() === 8;
  const isFirstMinutes = estTime.getMinutes() < 5;
  
  return isFriday && isHour8 && isFirstMinutes;
}

function isDaylightSavingTime(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  return date.getTimezoneOffset() < stdOffset;
}

let lastRunDate: string | null = null;

export function startWeeklyTimesheetScheduler(): void {
  console.log('Weekly timesheet scheduler started - runs every Friday at 8:00 AM EST');
  
  setInterval(() => {
    const today = new Date().toDateString();
    
    if (isFriday8amEST() && lastRunDate !== today) {
      lastRunDate = today;
      sendWeeklyTimesheet();
    }
  }, 60000);
}

// Yearly Balance Reset Logic
interface YearlyResetResult {
  year: number;
  sickTimeReset: { userId: string; name: string }[];
  ptoReset: { userId: string; name: string }[];
  ptoSkipped: { userId: string; name: string; reason: string }[];
}

async function runYearlyBalanceReset(targetYear: number, dryRun: boolean = false): Promise<YearlyResetResult> {
  console.log(`Starting yearly balance reset for ${targetYear}${dryRun ? ' (DRY RUN)' : ''}...`);
  
  const allUsers = await storage.getAllUsers();
  const allPtoRequests = await storage.getAllPtoRequests();
  
  // Find users with approved PTO for the target year
  const targetYearStart = new Date(targetYear, 0, 1);
  const targetYearEnd = new Date(targetYear, 11, 31, 23, 59, 59);
  
  const usersWithApprovedPtoForYear = new Set<string>();
  
  for (const request of allPtoRequests) {
    if (request.status === 'approved') {
      const startDate = new Date(request.startDate);
      const endDate = new Date(request.endDate);
      
      // Check if any part of the PTO falls within the target year
      if ((startDate >= targetYearStart && startDate <= targetYearEnd) ||
          (endDate >= targetYearStart && endDate <= targetYearEnd) ||
          (startDate <= targetYearStart && endDate >= targetYearEnd)) {
        usersWithApprovedPtoForYear.add(request.userId);
      }
    }
  }
  
  const result: YearlyResetResult = {
    year: targetYear,
    sickTimeReset: [],
    ptoReset: [],
    ptoSkipped: [],
  };
  
  for (const user of allUsers) {
    const userName = `${user.firstName} ${user.lastName}`;
    
    // Always reset sick time
    if (!dryRun) {
      await storage.updateUserSickTime(user.id, YEARLY_SICK_TIME_RESET);
    }
    result.sickTimeReset.push({ userId: user.id, name: userName });
    
    // Check if user has approved PTO for the target year
    if (usersWithApprovedPtoForYear.has(user.id)) {
      result.ptoSkipped.push({ 
        userId: user.id, 
        name: userName, 
        reason: `Has approved PTO for ${targetYear}` 
      });
    } else {
      // Reset PTO for users without approved PTO for the target year
      if (!dryRun) {
        await storage.updateEmployee(user.id, { ptoBalance: YEARLY_PTO_RESET });
      }
      result.ptoReset.push({ userId: user.id, name: userName });
    }
  }
  
  console.log(`Yearly balance reset ${dryRun ? '(DRY RUN) ' : ''}completed for ${targetYear}:`);
  console.log(`  - Sick time reset to ${YEARLY_SICK_TIME_RESET} hours: ${result.sickTimeReset.length} employees`);
  console.log(`  - PTO reset to ${YEARLY_PTO_RESET} hours: ${result.ptoReset.length} employees`);
  console.log(`  - PTO skipped (has approved ${targetYear} PTO): ${result.ptoSkipped.length} employees`);
  
  return result;
}

function isJanuary1stMidnightEST(): boolean {
  const now = new Date();
  const estOffset = -5 * 60;
  const isDST = isDaylightSavingTime(now);
  const offset = isDST ? -4 * 60 : estOffset;
  
  const estTime = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  
  const isJanuary = estTime.getMonth() === 0;
  const isFirstDay = estTime.getDate() === 1;
  const isEarlyMorning = estTime.getHours() === 0 && estTime.getMinutes() < 15;
  
  return isJanuary && isFirstDay && isEarlyMorning;
}

let lastResetYear: number | null = null;

export function startYearlyBalanceScheduler(): void {
  console.log('Yearly balance reset scheduler started - runs on January 1st at midnight EST');
  
  setInterval(() => {
    const currentYear = new Date().getFullYear();
    
    if (isJanuary1stMidnightEST() && lastResetYear !== currentYear) {
      lastResetYear = currentYear;
      // Reset balances for the new year
      runYearlyBalanceReset(currentYear, false);
    }
  }, 60000);
}

// Daily Punch Approval Email Logic
async function sendDailyPunchApprovalEmails(): Promise<void> {
  try {
    console.log('Starting daily punch approval email job...');
    
    // Get previous business day
    const today = new Date();
    let previousDay = subDays(today, 1);
    
    // Skip weekends (go back to Friday if today is Monday)
    while (previousDay.getDay() === 0 || previousDay.getDay() === 6) {
      previousDay = subDays(previousDay, 1);
    }
    
    const dateStr = format(previousDay, 'M/d/yyyy');
    
    // Get all managers/admins
    const allUsers = await storage.getAllUsers();
    const managers = allUsers.filter(u => u.role === 'manager' || u.role === 'admin');
    
    for (const manager of managers) {
      // Get pending approvals for this manager's employees
      const pendingApprovals = await storage.getPendingApprovalsForManager(manager.id);
      
      // Filter to only previous day's entries
      const previousDayApprovals = pendingApprovals.filter(item => {
        const entryDate = new Date(item.entry.clockIn);
        return entryDate.toDateString() === previousDay.toDateString();
      });
      
      if (previousDayApprovals.length === 0) {
        continue; // No pending approvals for this manager
      }
      
      // Format punch data for email
      const pendingPunches: PendingPunchData[] = previousDayApprovals.map(item => {
        const clockInTime = format(new Date(item.entry.clockIn), 'h:mm a');
        const clockOutTime = item.entry.clockOut 
          ? format(new Date(item.entry.clockOut), 'h:mm a')
          : 'Still clocked in';
        
        let hours = '0';
        if (item.entry.clockOut) {
          const hoursWorked = (new Date(item.entry.clockOut).getTime() - new Date(item.entry.clockIn).getTime()) / (1000 * 60 * 60);
          hours = hoursWorked.toFixed(2);
        }
        
        return {
          employeeName: `${item.user.firstName} ${item.user.lastName}`,
          clockIn: clockInTime,
          clockOut: clockOutTime,
          hours
        };
      });
      
      const managerName = `${manager.firstName} ${manager.lastName}`;
      
      if (manager.email) {
        await sendPunchApprovalNotification(manager.email, managerName, dateStr, pendingPunches);
        console.log(`Punch approval email sent to ${managerName} (${manager.email}) with ${pendingPunches.length} pending punches`);
      }
    }
    
    console.log('Daily punch approval emails completed');
  } catch (error) {
    console.error('Failed to send daily punch approval emails:', error);
  }
}

function isWeekday8amEST(): boolean {
  const now = new Date();
  const estOffset = -5 * 60;
  const isDST = isDaylightSavingTime(now);
  const offset = isDST ? -4 * 60 : estOffset;
  
  const estTime = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  
  const dayOfWeek = estTime.getDay();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
  const isHour8 = estTime.getHours() === 8;
  const isFirstMinutes = estTime.getMinutes() < 5;
  
  return isWeekday && isHour8 && isFirstMinutes;
}

let lastPunchApprovalDate: string | null = null;

export function startDailyPunchApprovalScheduler(): void {
  console.log('Daily punch approval scheduler started - runs every weekday at 8:00 AM EST');
  
  setInterval(() => {
    const today = new Date().toDateString();
    
    if (isWeekday8amEST() && lastPunchApprovalDate !== today) {
      lastPunchApprovalDate = today;
      sendDailyPunchApprovalEmails();
    }
  }, 60000);
}

export { sendWeeklyTimesheet, runYearlyBalanceReset, sendDailyPunchApprovalEmails };
