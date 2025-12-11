import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, Check, X, Inbox, Users, Coffee, AlertTriangle, Undo2 } from "lucide-react";
import { formatDuration } from "@/lib/timeUtils";
import type { PtoRequest, User, BreakNotification } from "@shared/schema";

type PtoRequestWithUser = PtoRequest & {
  user?: User;
  reviewer?: User;
};

// Helper function to check if two date ranges overlap
function datesOverlap(start1: string | Date, end1: string | Date, start2: string | Date, end2: string | Date): boolean {
  const s1 = new Date(start1);
  const e1 = new Date(end1);
  const s2 = new Date(start2);
  const e2 = new Date(end2);
  
  return s1 <= e2 && s2 <= e1;
}

export default function AdminMessages() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: ptoRequests, isLoading } = useQuery<PtoRequestWithUser[]>({
    queryKey: ["/api/pto-requests"],
    enabled: !!user,
  });

  const { data: employeesData } = useQuery<Array<{ user: User; entries: any[]; weeklyHours: number; isClockedIn: boolean }>>({
    queryKey: ["/api/employees"],
    enabled: !!user,
  });

  const { data: breakNotifications, isLoading: breakNotificationsLoading } = useQuery<BreakNotification[]>({
    queryKey: ["/api/break-notifications"],
    enabled: !!user,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "denied" }) => {
      await apiRequest("PATCH", `/api/pto-requests/${id}`, { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pto-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: variables.status === "approved" ? "Request Approved" : "Request Denied",
        description: `PTO request has been ${variables.status}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unapproveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/pto-requests/${id}/unapprove`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pto-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: "PTO Unapproved",
        description: "The PTO request has been revoked and hours returned to employee.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Create a map of users for quick lookup
  const userMap = new Map(employeesData?.map(e => [e.user.id, e.user]) || []);

  // Enrich PTO requests with user data
  const enrichedRequests: PtoRequestWithUser[] = ptoRequests?.map(req => ({
    ...req,
    user: userMap.get(req.userId),
    reviewer: req.reviewedBy ? userMap.get(req.reviewedBy) : undefined,
  })) || [];

  const pendingRequests = enrichedRequests.filter(r => r.status === "pending");
  const reviewedRequests = enrichedRequests.filter(r => r.status !== "pending");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Message Center</h1>
        <p className="text-muted-foreground mt-1">
          Review and manage PTO requests from your team
        </p>
      </div>

      {pendingRequests.length === 0 && reviewedRequests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No PTO Requests</p>
            <p className="text-sm text-muted-foreground">
              There are currently no PTO requests to review
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Pending Requests</h2>
              <div className="grid gap-4">
                {pendingRequests.map((request) => (
                  <Card key={request.id} data-testid={`pto-request-${request.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            {request.user?.firstName} {request.user?.lastName}
                          </CardTitle>
                          <CardDescription>
                            {new Date(request.startDate).toLocaleDateString()} -{" "}
                            {new Date(request.endDate).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">Pending</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Hours Requested</p>
                          <p className="font-medium">{formatDuration(parseFloat(request.hours))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Current PTO Balance</p>
                          <p className="font-medium">
                            {formatDuration(parseFloat(request.user?.ptoBalance || '0'))}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Submitted</p>
                          <p className="font-medium">
                            {new Date(request.createdAt!).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      {(() => {
                        // Find conflicting approved PTO requests
                        const allConflicts = enrichedRequests.filter(r => 
                          r.status === "approved" && 
                          r.userId !== request.userId &&
                          datesOverlap(request.startDate, request.endDate, r.startDate, r.endDate)
                        );
                        
                        // Deduplicate by composite key (userId + dates) to ensure each unique conflict is shown only once
                        const uniqueConflicts = Array.from(
                          new Map(allConflicts.map(c => {
                            const key = `${c.userId}-${c.startDate}-${c.endDate}`;
                            return [key, c];
                          })).values()
                        );
                        
                        if (uniqueConflicts.length > 0) {
                          return (
                            <Alert data-testid={`pto-conflicts-${request.id}`}>
                              <Users className="h-4 w-4" />
                              <AlertDescription>
                                <p className="font-medium mb-1">Other employees with approved PTO during this time:</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {uniqueConflicts.map(conflict => (
                                    <li key={conflict.id}>
                                      {conflict.user?.firstName} {conflict.user?.lastName} 
                                      {' '}({new Date(conflict.startDate).toLocaleDateString()} - {new Date(conflict.endDate).toLocaleDateString()})
                                    </li>
                                  ))}
                                </ul>
                              </AlertDescription>
                            </Alert>
                          );
                        }
                        return null;
                      })()}
                      
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => reviewMutation.mutate({ id: request.id, status: "approved" })}
                          disabled={reviewMutation.isPending}
                          data-testid={`button-approve-${request.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reviewMutation.mutate({ id: request.id, status: "denied" })}
                          disabled={reviewMutation.isPending}
                          data-testid={`button-deny-${request.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Deny
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {reviewedRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Reviewed Requests</h2>
              <div className="grid gap-4">
                {reviewedRequests.map((request) => (
                  <Card key={request.id} data-testid={`pto-request-${request.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            {request.user?.firstName} {request.user?.lastName}
                          </CardTitle>
                          <CardDescription>
                            {new Date(request.startDate).toLocaleDateString()} -{" "}
                            {new Date(request.endDate).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={request.status === "approved" ? "default" : "destructive"}
                        >
                          {request.status === "approved" ? "Approved" : "Denied"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Hours Requested</p>
                          <p className="font-medium">{formatDuration(parseFloat(request.hours))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reviewed By</p>
                          <p className="font-medium">
                            {request.reviewer?.firstName} {request.reviewer?.lastName}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reviewed On</p>
                          <p className="font-medium">
                            {request.reviewedAt ? new Date(request.reviewedAt).toLocaleDateString() : '-'}
                          </p>
                        </div>
                      </div>
                      {request.status === "approved" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => unapproveMutation.mutate(request.id)}
                          disabled={unapproveMutation.isPending}
                          data-testid={`button-unapprove-${request.id}`}
                        >
                          <Undo2 className="w-4 h-4 mr-1" />
                          Unapprove & Refund PTO
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Break Notifications Section */}
      {breakNotifications && breakNotifications.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Break Time Alerts
          </h2>
          <div className="grid gap-3">
            {breakNotifications.map((notification) => (
              <Alert key={notification.id} className="border-orange-500/50" data-testid={`break-notification-${notification.id}`}>
                <Coffee className="w-4 h-4 text-orange-500" />
                <AlertDescription className="ml-2">
                  {notification.message}
                  <span className="block text-xs text-muted-foreground mt-1">
                    {new Date(notification.createdAt!).toLocaleString()}
                  </span>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
