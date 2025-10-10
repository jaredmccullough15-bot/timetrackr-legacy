import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/StatCard";
import { ClockStatusBadge } from "@/components/ClockStatusBadge";
import { Clock, DollarSign, Heart, TrendingUp, LogOut, Calendar } from "lucide-react";
import { formatCurrency, formatDateTime, formatDuration, getWeekBounds } from "@/lib/timeUtils";
import type { TimeEntry, PtoRequest } from "@shared/schema";

export default function EmployeeDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!authLoading && !user) {
      // Redirect to PIN login instead of OAuth login
      window.location.href = "/pin-login";
      return;
    }
  }, [user, authLoading]);

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

  const { data: ptoRequests, isLoading: ptoRequestsLoading } = useQuery<PtoRequest[]>({
    queryKey: ["/api/pto-requests"],
    enabled: !!user,
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/time-entries/clock-in", {
        clockIn: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({
        title: "Clocked In",
        description: "Your time has been recorded successfully.",
      });
      
      // Auto-logout after clock in - wait for toast to be visible
      setTimeout(async () => {
        try {
          // Wait for logout to complete before redirecting
          await fetch("/api/auth/session-logout", {
            method: "POST",
            credentials: "include",
          });
          // Only redirect after successful logout
          window.location.href = "/pin-login";
        } catch (error) {
          console.error("Logout error:", error);
          // Still redirect even if logout fails
          window.location.href = "/pin-login";
        }
      }, 1500);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        // Redirect to PIN login instead of OAuth
        window.location.href = "/pin-login";
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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Clocked Out",
        description: "Your time has been recorded successfully.",
      });
      
      // Auto-logout after clock out - wait for toast to be visible
      setTimeout(async () => {
        try {
          // Wait for logout to complete before redirecting
          await fetch("/api/auth/session-logout", {
            method: "POST",
            credentials: "include",
          });
          // Only redirect after successful logout
          window.location.href = "/pin-login";
        } catch (error) {
          console.error("Logout error:", error);
          // Still redirect even if logout fails
          window.location.href = "/pin-login";
        }
      }, 1500);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        // Redirect to PIN login instead of OAuth
        window.location.href = "/pin-login";
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // PTO request state and mutation
  const [isPtoDialogOpen, setIsPtoDialogOpen] = useState(false);
  const [ptoStartDate, setPtoStartDate] = useState("");
  const [ptoEndDate, setPtoEndDate] = useState("");
  const [ptoHours, setPtoHours] = useState("");

  const ptoRequestMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/pto-requests", {
        startDate: new Date(ptoStartDate).toISOString(),
        endDate: new Date(ptoEndDate).toISOString(),
        hours: ptoHours,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pto-requests"] });
      toast({
        title: "PTO Request Submitted",
        description: "Your request has been submitted for review.",
      });
      setIsPtoDialogOpen(false);
      setPtoStartDate("");
      setPtoEndDate("");
      setPtoHours("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePtoRequest = () => {
    if (!ptoStartDate || !ptoEndDate || !ptoHours) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }
    const hours = parseFloat(ptoHours);
    if (isNaN(hours) || hours <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid number of hours",
        variant: "destructive",
      });
      return;
    }
    ptoRequestMutation.mutate();
  };

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
  const ptoBalance = parseFloat(user.ptoBalance || '0');
  const hasOvertime = weeklyHours > 40;

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  const handleManualLogout = async () => {
    try {
      // Wait for logout to complete before redirecting
      await fetch("/api/auth/session-logout", {
        method: "POST",
        credentials: "include",
      });
      // Only redirect after successful logout
      window.location.href = "/pin-login";
    } catch (error) {
      console.error("Logout error:", error);
      // Still redirect even if logout fails
      window.location.href = "/pin-login";
    }
  };

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
              onClick={handleManualLogout}
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

            <div className="space-y-3">
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
              
              <Dialog open={isPtoDialogOpen} onOpenChange={setIsPtoDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" variant="outline" size="lg" data-testid="button-request-pto">
                    <Calendar className="w-5 h-5 mr-2" />
                    Request Time Off
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-pto-request">
                  <DialogHeader>
                    <DialogTitle>Request Paid Time Off</DialogTitle>
                    <DialogDescription>
                      Submit a PTO request for approval. You have {formatDuration(ptoBalance)} available.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="start-date">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={ptoStartDate}
                        onChange={(e) => setPtoStartDate(e.target.value)}
                        data-testid="input-pto-start-date"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="end-date">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={ptoEndDate}
                        onChange={(e) => setPtoEndDate(e.target.value)}
                        data-testid="input-pto-end-date"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="hours">Hours Requested</Label>
                      <Input
                        id="hours"
                        type="number"
                        step="0.5"
                        min="0"
                        max={ptoBalance}
                        placeholder="e.g., 8 or 16"
                        value={ptoHours}
                        onChange={(e) => setPtoHours(e.target.value)}
                        data-testid="input-pto-hours"
                      />
                      <p className="text-xs text-muted-foreground">
                        Cannot exceed your available balance ({formatDuration(ptoBalance)})
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsPtoDialogOpen(false)}
                      data-testid="button-cancel-pto"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePtoRequest}
                      disabled={ptoRequestMutation.isPending}
                      data-testid="button-submit-pto"
                    >
                      {ptoRequestMutation.isPending ? "Submitting..." : "Submit Request"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <StatCard
            title="PTO"
            value={formatDuration(ptoBalance)}
            icon={Calendar}
            description="Available balance"
            iconColor="text-chart-1"
            testId="stat-pto"
          />
        </div>

        {ptoRequestsLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : ptoRequests && ptoRequests.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>PTO Requests</CardTitle>
              <CardDescription>Your time off requests and approval status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ptoRequests.slice().reverse().map((request) => {
                  const startDate = new Date(request.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                  const endDate = new Date(request.endDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                  
                  const statusColor = 
                    request.status === 'approved' ? 'text-green-600 dark:text-green-400' :
                    request.status === 'denied' ? 'text-red-600 dark:text-red-400' :
                    'text-yellow-600 dark:text-yellow-400';
                  
                  const statusText = request.status.charAt(0).toUpperCase() + request.status.slice(1);
                  
                  return (
                    <div
                      key={request.id}
                      className="flex justify-between items-center p-4 rounded-md border"
                      data-testid={`pto-request-${request.id}`}
                    >
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground mb-1">Date Requested</div>
                        <div className="font-medium" data-testid={`pto-dates-${request.id}`}>
                          {startDate} - {endDate}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground mb-1">Status</div>
                        <div className={`font-semibold ${statusColor}`} data-testid={`pto-status-${request.id}`}>
                          {statusText}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

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
