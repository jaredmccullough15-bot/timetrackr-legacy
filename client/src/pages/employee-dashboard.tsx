import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/StatCard";
import { ClockStatusBadge } from "@/components/ClockStatusBadge";
import { Clock, DollarSign, Heart, TrendingUp, LogOut } from "lucide-react";
import { formatCurrency, formatDateTime, formatDuration, getWeekBounds } from "@/lib/timeUtils";
import type { TimeEntry } from "@shared/schema";

export default function EmployeeDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: timeEntries, isLoading: entriesLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
    enabled: !!user,
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/time-entries/clock-in", {
        clockIn: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({
        title: "Clocked In",
        description: "Your time has been recorded successfully.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/time-entries/clock-out", {
        clockOut: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Clocked Out",
        description: "Your time has been recorded successfully.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const activeEntry = timeEntries?.find(entry => !entry.clockOut);
  const isClockedIn = !!activeEntry;

  const weekBounds = getWeekBounds();
  const weeklyEntries = timeEntries?.filter(entry => {
    const entryDate = new Date(entry.clockIn);
    return entryDate >= weekBounds.start && entryDate <= weekBounds.end && entry.clockOut;
  }) || [];

  const weeklyHours = weeklyEntries.reduce((total, entry) => {
    if (entry.clockOut) {
      const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
      return total + hours;
    }
    return total;
  }, 0);

  // Calculate overtime
  const payRate = parseFloat(user.payRate || '0');
  const regularHours = Math.min(weeklyHours, 40);
  const overtimeHours = Math.max(weeklyHours - 40, 0);
  const regularPay = regularHours * payRate;
  const overtimePay = overtimeHours * payRate * 1.5;
  const weeklyPay = regularPay + overtimePay;
  const sickTimeBalance = parseFloat(user.sickTimeBalance || '0');
  const hasOvertime = weeklyHours > 40;

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 max-w-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={user.profileImageUrl || undefined} className="object-cover" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold" data-testid="text-user-name">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = '/api/logout'}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-8">
        <Card className="text-center">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock className="w-6 h-6 text-primary" />
              <CardTitle className="text-2xl">Time Clock</CardTitle>
            </div>
            <CardDescription>
              <div className="text-3xl font-bold text-foreground mt-2 font-mono" data-testid="text-current-time">
                {currentTime.toLocaleTimeString()}
              </div>
              <div className="text-sm mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <ClockStatusBadge isClockedIn={isClockedIn} />
            </div>
            
            {isClockedIn && activeEntry && (
              <p className="text-sm text-muted-foreground">
                Clocked in at {formatDateTime(activeEntry.clockIn)}
              </p>
            )}

            <Button
              size="lg"
              className={`w-full min-h-24 text-xl ${isClockedIn ? 'bg-destructive hover:bg-destructive' : ''}`}
              onClick={() => isClockedIn ? clockOutMutation.mutate() : clockInMutation.mutate()}
              disabled={clockInMutation.isPending || clockOutMutation.isPending}
              data-testid={isClockedIn ? "button-clock-out" : "button-clock-in"}
            >
              {clockInMutation.isPending || clockOutMutation.isPending ? (
                "Processing..."
              ) : isClockedIn ? (
                <>
                  <Clock className="w-6 h-6 mr-2" />
                  Clock Out
                </>
              ) : (
                <>
                  <Clock className="w-6 h-6 mr-2" />
                  Clock In
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Weekly Hours"
            value={formatDuration(weeklyHours)}
            icon={TrendingUp}
            description={hasOvertime ? `${formatDuration(overtimeHours)} overtime` : "Sunday - Saturday"}
            iconColor={hasOvertime ? "text-orange-600 dark:text-orange-400" : "text-chart-2"}
            testId="stat-weekly-hours"
          />
          <StatCard
            title="Weekly Pay"
            value={formatCurrency(weeklyPay)}
            icon={DollarSign}
            description={hasOvertime ? `Includes ${formatCurrency(overtimePay)} OT pay` : `${formatCurrency(parseFloat(user.payRate || '0'))}/hour`}
            iconColor="text-chart-3"
            testId="stat-weekly-pay"
          />
          <StatCard
            title="Sick Time"
            value={formatDuration(sickTimeBalance)}
            icon={Heart}
            description="Available balance"
            iconColor="text-chart-4"
            testId="stat-sick-time"
          />
        </div>

        {entriesLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : weeklyEntries.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>This Week's Activity</CardTitle>
              <CardDescription>Your clock in/out records for the current week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {weeklyEntries.slice().reverse().map((entry, index) => {
                  const hours = entry.clockOut
                    ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
                    : 0;
                  return (
                    <div
                      key={entry.id}
                      className="flex justify-between items-center p-3 rounded-md bg-muted/50"
                      data-testid={`entry-${index}`}
                    >
                      <div>
                        <div className="font-medium">{formatDateTime(entry.clockIn)}</div>
                        {entry.clockOut && (
                          <div className="text-sm text-muted-foreground">
                            Out: {formatDateTime(entry.clockOut)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatDuration(hours)}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(hours * parseFloat(user.payRate || '0'))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No time entries for this week yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Clock in to start tracking your hours.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
