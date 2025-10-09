import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TimeEntryModal } from "@/components/TimeEntryModal";
import { ArrowLeft, Plus, Edit, Trash2, DollarSign, Heart, Clock } from "lucide-react";
import { formatDuration, formatDateTime, formatCurrency } from "@/lib/timeUtils";
import type { TimeEntry } from "@shared/schema";

interface EmployeeWithEntries {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
    payRate: string;
    sickTimeBalance: string;
  };
  entries: TimeEntry[];
  weeklyHours: number;
}

export default function EmployeeDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { canViewFinancialData } = useRole();
  const { toast } = useToast();
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);

  const employeeId = params.id;

  useEffect(() => {
    if (!authLoading && (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager'))) {
      toast({
        title: "Unauthorized",
        description: "Manager or Admin access required",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [currentUser, authLoading, navigate, toast]);

  const { data: employees } = useQuery<EmployeeWithEntries[]>({
    queryKey: ["/api/employees"],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager'),
  });

  const employee = employees?.find((e) => e.user.id === employeeId);

  const deleteMutation = useMutation({
    mutationFn: async (entryId: number) => {
      await apiRequest("DELETE", `/api/admin/time-entries/${entryId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: "Success",
        description: "Time entry deleted successfully",
      });
      setDeletingEntry(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete time entry",
        variant: "destructive",
      });
    },
  });

  if (!employee) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => navigate("/admin/employees")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Employees
        </Button>
        <p className="mt-4 text-muted-foreground">Employee not found</p>
      </div>
    );
  }

  const initials = `${employee.user.firstName?.[0] || ''}${employee.user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/employees")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Details</h1>
          <p className="text-muted-foreground">Manage time entries and information</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar className="w-16 h-16">
                <AvatarImage src={employee.user.profileImageUrl || undefined} className="object-cover" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{employee.user.firstName} {employee.user.lastName}</CardTitle>
                <CardDescription>{employee.user.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {canViewFinancialData && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4" />
                  <span>Pay Rate</span>
                </div>
                <div className="font-semibold">{formatCurrency(parseFloat(employee.user.payRate || '0'))}/hr</div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Weekly Hours</span>
              </div>
              <div className="font-semibold">{formatDuration(employee.weeklyHours)}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="w-4 h-4" />
                <span>Sick Time</span>
              </div>
              <div className="font-semibold">{formatDuration(parseFloat(employee.user.sickTimeBalance || '0'))}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Time Entries</CardTitle>
              <Button onClick={() => { setEditingEntry(null); setShowEntryModal(true); }} data-testid="button-add-entry">
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            </div>
            <CardDescription>All clock in/out records</CardDescription>
          </CardHeader>
          <CardContent>
            {!employee.entries || employee.entries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No time entries found
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employee.entries.map((entry) => {
                      const hours = entry.clockOut
                        ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
                        : 0;
                      
                      return (
                        <TableRow key={entry.id} data-testid={`entry-row-${entry.id}`}>
                          <TableCell>{formatDateTime(entry.clockIn)}</TableCell>
                          <TableCell>{entry.clockOut ? formatDateTime(entry.clockOut) : "Active"}</TableCell>
                          <TableCell className="text-right">{formatDuration(hours)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setEditingEntry(entry); setShowEntryModal(true); }}
                                data-testid={`button-edit-entry-${entry.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingEntry(entry)}
                                data-testid={`button-delete-entry-${entry.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
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

      <TimeEntryModal
        open={showEntryModal}
        onOpenChange={setShowEntryModal}
        entry={editingEntry}
        userId={employee.user.id}
      />

      <AlertDialog open={!!deletingEntry} onOpenChange={(open) => !open && setDeletingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this time entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEntry && deleteMutation.mutate(deletingEntry.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
