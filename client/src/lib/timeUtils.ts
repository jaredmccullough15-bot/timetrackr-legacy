import { startOfWeek, endOfWeek, parseISO, differenceInHours, format } from 'date-fns';

export function getWeekBounds(date: Date = new Date()) {
  return {
    start: startOfWeek(date, { weekStartsOn: 0 }), // Sunday
    end: endOfWeek(date, { weekStartsOn: 0 }), // Saturday
  };
}

export function calculateHoursWorked(clockIn: string | Date, clockOut: string | Date): number {
  const start = typeof clockIn === 'string' ? parseISO(clockIn) : clockIn;
  const end = typeof clockOut === 'string' ? parseISO(clockOut) : clockOut;
  return Math.max(0, differenceInHours(end, start, { roundingMethod: 'floor' }));
}

export function formatDuration(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  
  if (minutes === 0) {
    return `${wholeHours}h`;
  }
  return `${wholeHours}h ${minutes}m`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'h:mm a');
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}
