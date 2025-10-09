import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Check, X, Inbox } from "lucide-react";
import { formatDuration } from "@/lib/timeUtils";
import type { PtoRequest, User } from "@shared/schema";

type PtoRequestWithUser = PtoRequest & {
  user?: User;
  reviewer?: User;
};

export default function AdminMessages() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: ptoRequests, isLoading } = useQuery<PtoRequestWithUser[]>({
    queryKey: ["/api/pto-requests"],
    enabled: !!user,
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/employees"],
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
  const userMap = new Map(allUsers?.map(u => [u.id, u]) || []);

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
                    <CardContent>
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
