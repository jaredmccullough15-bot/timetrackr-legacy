import { startOfWeek, endOfWeek, format } from 'date-fns';
import { storage } from './storage';
import { sendWeeklyTimesheetReport, EmployeeHoursData } from './email';

const TIMESHEET_RECIPIENTS = [
  'Mat@mihealthquotes.com',
  'jared@mihealthquotes.com'
];

const FRIDAY_HOURS_ADDITION = 8;

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
    
    employeeHours.push({
      name: `${user.firstName} ${user.lastName}`,
      hours: totalHours
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

export { sendWeeklyTimesheet };
