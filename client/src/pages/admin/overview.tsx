import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/StatCard";
import { ClockStatusBadge } from "@/components/ClockStatusBadge";
import { Users, DollarSign, Clock, TrendingUp } from "lucide-react";
import { formatCurrency, formatDuration, getWeekBounds } from "@/lib/timeUtils";
import type { User, TimeEntry } from "@shared/schema";

interface EmployeeWithEntries {
  user: User;
  entries: TimeEntry[];
  weeklyHours: number;
  isClockedIn: boolean;
}

export default function AdminOverview() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { canViewFinancialData } = useRole();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager'))) {
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
  }, [currentUser, authLoading, toast]);

  const { data: employees, isLoading: employeesLoading } = useQuery<EmployeeWithEntries[]>({
    queryKey: ["/api/employees"],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager'),
  });

  if (authLoading || !currentUser || employeesLoading) {
    return (
      <div className="p-8 space-y-8">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  const weekBounds = getWeekBounds();
  const totalEmployees = employees?.length || 0;
  const activeEmployees = employees?.filter(e => e.isClockedIn).length || 0;
  const totalWeeklyHours = employees?.reduce((sum, e) => sum + e.weeklyHours, 0) || 0;
  const totalWeeklyPay = employees?.reduce((sum, e) => sum + (e.weeklyHours * parseFloat(e.user.payRate || '0')), 0) || 0;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Weekly summary for {weekBounds.start.toLocaleDateString()} - {weekBounds.end.toLocaleDateString()}
        </p>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 ${canViewFinancialData ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
        <StatCard
          title="Total Employees"
          value={totalEmployees}
          icon={Users}
          description={`${activeEmployees} currently clocked in`}
          testId="stat-total-employees"
        />
        <StatCard
          title="Active Now"
          value={activeEmployees}
          icon={Clock}
          description="Employees clocked in"
          iconColor="text-chart-2"
          testId="stat-active-employees"
        />
        <StatCard
          title="Weekly Hours"
          value={formatDuration(totalWeeklyHours)}
          icon={TrendingUp}
          description="Total hours this week"
          iconColor="text-chart-3"
          testId="stat-total-weekly-hours"
        />
        {canViewFinancialData && (
          <StatCard
            title="Weekly Payroll"
            value={formatCurrency(totalWeeklyPay)}
            icon={DollarSign}
            description="Estimated for this week"
            iconColor="text-chart-4"
            testId="stat-total-weekly-payroll"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee Status</CardTitle>
          <CardDescription>Current clock status and weekly hours for all employees</CardDescription>
        </CardHeader>
        <CardContent>
          {!employees || employees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No employees found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map((employee) => {
                const initials = `${employee.user.firstName?.[0] || ''}${employee.user.lastName?.[0] || ''}`.toUpperCase() || 'U';
                const weeklyPay = employee.weeklyHours * parseFloat(employee.user.payRate || '0');
                
                return (
                  <Card key={employee.user.id} className="hover-elevate" data-testid={`employee-card-${employee.user.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={employee.user.profileImageUrl || undefined} className="object-cover" />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {employee.user.firstName} {employee.user.lastName}
                          </CardTitle>
                          <CardDescription className="truncate">{employee.user.email}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ClockStatusBadge isClockedIn={employee.isClockedIn} />
                      <div className={`grid ${canViewFinancialData ? 'grid-cols-2' : 'grid-cols-1'} gap-4 text-sm`}>
                        <div>
                          <div className="text-muted-foreground">Hours</div>
                          <div className="font-semibold">{formatDuration(employee.weeklyHours)}</div>
                        </div>
                        {canViewFinancialData && (
                          <div>
                            <div className="text-muted-foreground">Pay</div>
                            <div className="font-semibold">{formatCurrency(weeklyPay)}</div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
