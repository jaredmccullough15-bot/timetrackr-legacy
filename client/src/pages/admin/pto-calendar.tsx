import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Calendar, Users } from "lucide-react";
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isSameMonth, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO
} from "date-fns";
import type { PtoRequest, User } from "@shared/schema";

type PtoRequestWithUser = PtoRequest & {
  user?: User;
};

export default function PtoCalendar() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: ptoRequests, isLoading } = useQuery<PtoRequestWithUser[]>({
    queryKey: ["/api/pto-requests"],
    enabled: !!user,
  });

  const { data: employeesData } = useQuery<Array<{ user: User; entries: any[]; weeklyHours: number; isClockedIn: boolean }>>({
    queryKey: ["/api/employees"],
    enabled: !!user,
  });

  // Create user map for enriching PTO requests
  const userMap = new Map(employeesData?.map(e => [e.user.id, e.user]) || []);

  // Filter only approved PTO requests and enrich with user data
  const approvedRequests: PtoRequestWithUser[] = ptoRequests
    ?.filter(r => r.status === "approved")
    .map(r => ({
      ...r,
      user: userMap.get(r.userId),
    })) || [];

  // Get calendar days for the current month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group days into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  // Function to get PTO requests for a specific day
  const getPtoForDay = (day: Date): PtoRequestWithUser[] => {
    return approvedRequests.filter(request => {
      const startDate = new Date(request.startDate);
      const endDate = new Date(request.endDate);
      // Set times to start/end of day to ensure proper interval check
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      const dayStart = new Date(day);
      dayStart.setHours(12, 0, 0, 0); // Use noon to avoid timezone issues
      
      return isWithinInterval(dayStart, { start: startDate, end: endDate });
    });
  };

  // Generate background colors for employees (consistent per employee)
  const getEmployeeColor = (userId: string): string => {
    const colors = [
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    ];
    
    // Hash the userId to get a consistent color
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Calendar className="w-8 h-8" />
          PTO Calendar
        </h1>
        <p className="text-muted-foreground mt-1">
          View approved time off across your team
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl" data-testid="calendar-month-title">
              {format(currentMonth, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date())}
                data-testid="button-today"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Week day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              const ptoForDay = getPtoForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

              return (
                <div
                  key={index}
                  className={`min-h-24 p-1 border rounded-md ${
                    isCurrentMonth ? 'bg-card' : 'bg-muted/30'
                  } ${isToday ? 'ring-2 ring-primary' : ''}`}
                  data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                >
                  <div className={`text-sm mb-1 ${
                    isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                  } ${isToday ? 'font-bold text-primary' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {ptoForDay.slice(0, 3).map((pto, ptoIndex) => (
                      <div
                        key={`${pto.id}-${ptoIndex}`}
                        className={`text-xs px-1 py-0.5 rounded truncate ${getEmployeeColor(pto.userId)}`}
                        title={`${pto.user?.firstName} ${pto.user?.lastName}`}
                        data-testid={`pto-badge-${pto.id}`}
                      >
                        {pto.user?.firstName} {pto.user?.lastName?.[0]}.
                      </div>
                    ))}
                    {ptoForDay.length > 3 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{ptoForDay.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend showing who has approved PTO this month */}
      {approvedRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Approved PTO This Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(approvedRequests
                .filter(r => {
                  const start = new Date(r.startDate);
                  const end = new Date(r.endDate);
                  return (start <= monthEnd && end >= monthStart);
                })
                .map(r => r.userId)))
                .map(userId => {
                  const employee = userMap.get(userId);
                  if (!employee) return null;
                  return (
                    <Badge
                      key={userId}
                      variant="secondary"
                      className={getEmployeeColor(userId)}
                      data-testid={`legend-employee-${userId}`}
                    >
                      {employee.firstName} {employee.lastName}
                    </Badge>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
