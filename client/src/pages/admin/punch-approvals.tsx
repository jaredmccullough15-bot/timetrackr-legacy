import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Clock, User } from "lucide-react";
import { formatDateTime, formatDuration } from "@/lib/timeUtils";
import type { TimeEntry, TimeEntryApproval, User as UserType } from "@shared/schema";

interface PendingApproval {
  approval: TimeEntryApproval;
  entry: TimeEntry;
  user: UserType;
}

export default function PunchApprovals() {
  const [, navigate] = useLocation();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [confirmApproval, setConfirmApproval] = useState<PendingApproval | null>(null);
  const [confirmDeny, setConfirmDeny] = useState<PendingApproval | null>(null);

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

  const { data: pendingApprovals, isLoading } = useQuery<PendingApproval[]>({
    queryKey: ["/api/time-entry-approvals/pending"],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager'),
  });

  const approveMutation = useMutation({
    mutationFn: async (approvalId: number) => {
      await apiRequest("PATCH", `/api/time-entry-approvals/${approvalId}`, { status: 'approved' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entry-approvals/pending"] });
      toast({
        title: "Approved",
        description: "Time punch has been approved.",
      });
      setConfirmApproval(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (approvalId: number) => {
      await apiRequest("PATCH", `/api/time-entry-approvals/${approvalId}`, { status: 'rejected' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entry-approvals/pending"] });
      toast({
        title: "Rejected",
        description: "Time punch has been rejected.",
      });
      setConfirmDeny(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Punch Approvals</h1>
        <p className="text-muted-foreground">Review and approve employee time punches</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Pending Approvals
          </CardTitle>
          <CardDescription>
            Time punches awaiting your approval. Employees cannot clock in until their previous day's punches are approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingApprovals || pendingApprovals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p>All time punches have been approved!</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((item) => {
                    const hours = item.entry.clockOut
                      ? (new Date(item.entry.clockOut).getTime() - new Date(item.entry.clockIn).getTime()) / (1000 * 60 * 60)
                      : 0;
                    
                    return (
                      <TableRow key={item.approval.id} data-testid={`approval-row-${item.approval.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span>{item.user.firstName} {item.user.lastName}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDateTime(item.entry.clockIn)}</TableCell>
                        <TableCell>{item.entry.clockOut ? formatDateTime(item.entry.clockOut) : "Still Active"}</TableCell>
                        <TableCell className="text-right">{formatDuration(hours)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => setConfirmApproval(item)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${item.approval.id}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setConfirmDeny(item)}
                              disabled={rejectMutation.isPending}
                              data-testid={`button-deny-${item.approval.id}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Deny
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

      <AlertDialog open={!!confirmApproval} onOpenChange={() => setConfirmApproval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Time Punch?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to approve the time punch for {confirmApproval?.user.firstName} {confirmApproval?.user.lastName}.
              This will allow them to clock in today.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmApproval && approveMutation.mutate(confirmApproval.approval.id)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeny} onOpenChange={() => setConfirmDeny(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny Time Punch?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to deny the time punch for {confirmDeny?.user.firstName} {confirmDeny?.user.lastName}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeny && rejectMutation.mutate(confirmDeny.approval.id)}
              disabled={rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
