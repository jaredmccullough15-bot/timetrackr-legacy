import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Calendar } from "lucide-react";
import { formatCurrency, formatDuration, formatDateTime, formatDate } from "@/lib/timeUtils";
import type { User, TimeEntry } from "@shared/schema";

interface ReportEntry {
  entry: TimeEntry;
  user: User;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  pay: number;
  weekHours: number;
}

export default function AdminReports() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { canViewFinancialData } = useRole();
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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

  const { data: employees } = useQuery<User[]>({
    queryKey: ["/api/employees/list"],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager'),
  });

  const queryParams = new URLSearchParams();
  if (selectedEmployee && selectedEmployee !== "all") {
    queryParams.append("employeeId", selectedEmployee);
  }
  if (startDate) {
    queryParams.append("startDate", new Date(startDate).toISOString());
  }
  if (endDate) {
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);
    queryParams.append("endDate", endDateTime.toISOString());
  }

  const queryString = queryParams.toString();
  const reportUrl = queryString ? `/api/reports?${queryString}` : "/api/reports";

  const { data: reportData, isLoading: reportLoading } = useQuery<ReportEntry[]>({
    queryKey: [reportUrl],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager'),
  });

  if (authLoading || !currentUser) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalHours = reportData?.reduce((sum, item) => sum + item.hours, 0) || 0;
  const totalRegularHours = reportData?.reduce((sum, item) => sum + item.regularHours, 0) || 0;
  const totalOvertimeHours = reportData?.reduce((sum, item) => sum + item.overtimeHours, 0) || 0;
  const totalPay = reportData?.reduce((sum, item) => sum + item.pay, 0) || 0;
  const totalOvertimePay = reportData?.reduce((sum, item) => sum + item.overtimePay, 0) || 0;
  const totalEntries = reportData?.length || 0;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">
          View and filter time entry reports for all employees
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Reports</CardTitle>
          <CardDescription>Select employee and date range to generate reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee">Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger id="employee" data-testid="select-employee">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees?.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>
          {(selectedEmployee !== "all" || startDate || endDate) && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedEmployee("all");
                  setStartDate("");
                  setEndDate("");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 md:grid-cols-2 ${canViewFinancialData ? 'lg:grid-cols-5' : 'lg:grid-cols-3'} gap-6`}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-entries">{totalEntries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Regular Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-regular-hours">
              {formatDuration(totalRegularHours)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Overtime Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-overtime-hours">
              {formatDuration(totalOvertimeHours)}
            </div>
          </CardContent>
        </Card>
        {canViewFinancialData && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Overtime Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-overtime-pay">
                  {formatCurrency(totalOvertimePay)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-report-total-pay">
                  {formatCurrency(totalPay)}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Time Entries</CardTitle>
          <CardDescription>
            Detailed time entry records {selectedEmployee !== "all" ? "for selected employee" : "for all employees"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !reportData || reportData.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No time entries found for the selected filters</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead className="text-right">Total Hours</TableHead>
                    <TableHead className="text-right">Regular Hrs</TableHead>
                    <TableHead className="text-right">OT Hrs</TableHead>
                    {canViewFinancialData && (
                      <>
                        <TableHead className="text-right">Regular Pay</TableHead>
                        <TableHead className="text-right">OT Pay</TableHead>
                        <TableHead className="text-right">Total Pay</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item, index) => {
                    const initials = `${item.user.firstName?.[0] || ''}${item.user.lastName?.[0] || ''}`.toUpperCase() || 'U';
                    const hasOvertime = item.overtimeHours > 0.01; // Use small threshold to avoid floating point issues
                    return (
                      <TableRow key={item.entry.id} data-testid={`report-row-${index}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={item.user.profileImageUrl || undefined} className="object-cover" />
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {item.user.firstName} {item.user.lastName}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(item.entry.clockIn)}</TableCell>
                        <TableCell>{formatDateTime(item.entry.clockIn)}</TableCell>
                        <TableCell>
                          {item.entry.clockOut ? formatDateTime(item.entry.clockOut) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatDuration(item.hours)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatDuration(item.regularHours)}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`overtime-hours-${index}`}>
                          {hasOvertime ? (
                            <span style={{ color: 'var(--orange-600, #ea580c)' }} className="font-medium">
                              {formatDuration(item.overtimeHours)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        {canViewFinancialData && (
                          <>
                            <TableCell className="text-right">
                              {formatCurrency(item.regularPay)}
                            </TableCell>
                            <TableCell className="text-right" data-testid={`overtime-pay-${index}`}>
                              {hasOvertime ? (
                                <span style={{ color: 'var(--orange-600, #ea580c)' }} className="font-medium">
                                  {formatCurrency(item.overtimePay)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.pay)}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
