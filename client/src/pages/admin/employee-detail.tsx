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
import { ArrowLeft, Plus, Edit, Trash2, DollarSign, Heart, Clock, Shield, UserX, Coffee, Users, Pencil, Check, X } from "lucide-react";
import { formatDuration, formatDateTime, formatCurrency } from "@/lib/timeUtils";
import type { TimeEntry, Break, UserCategory } from "@shared/schema";

interface Category {
  id: number;
  name: string;
}
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmployeeWithEntries {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
    payRate: string;
    sickTimeBalance: string;
    role: 'employee' | 'manager' | 'admin';
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
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'employee' | 'manager' | 'admin'>('employee');
  const [showDeleteEmployeeDialog, setShowDeleteEmployeeDialog] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [editingPayRate, setEditingPayRate] = useState(false);
  const [payRateInput, setPayRateInput] = useState('');
  const [editingSickTime, setEditingSickTime] = useState(false);
  const [sickTimeInput, setSickTimeInput] = useState('');

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

  const { data: breaks = [] } = useQuery<Break[]>({
    queryKey: [`/api/employees/${employeeId}/breaks`],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager') && !!employeeId,
  });

  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager'),
  });

  const { data: userCategories = [] } = useQuery<UserCategory[]>({
    queryKey: ["/api/users", employeeId, "categories"],
    enabled: !!(currentUser?.role === 'admin' || currentUser?.role === 'manager') && !!employeeId,
  });

  useEffect(() => {
    const categoryNames = userCategories.map(c => c.category);
    setSelectedCategories(categoryNames);
  }, [userCategories]);

  const updatePayRateMutation = useMutation({
    mutationFn: async ({ employeeId, payRate }: { employeeId: string; payRate: string }) => {
      await apiRequest("PATCH", `/api/employees/${employeeId}/pay-rate`, { payRate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditingPayRate(false);
      toast({ title: "Success", description: "Pay rate updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update pay rate.", variant: "destructive" });
    },
  });

  const updateSickTimeMutation = useMutation({
    mutationFn: async ({ employeeId, sickTimeBalance }: { employeeId: string; sickTimeBalance: string }) => {
      await apiRequest("PATCH", `/api/employees/${employeeId}/sick-time`, { sickTimeBalance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditingSickTime(false);
      toast({ title: "Success", description: "Sick time balance updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update sick time balance.", variant: "destructive" });
    },
  });

  const updateCategoriesMutation = useMutation({
    mutationFn: async ({ categories }: { categories: string[] }) => {
      await apiRequest("PUT", `/api/users/${employeeId}/categories`, { categories });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", employeeId, "categories"] });
      toast({
        title: "Success",
        description: "Categories updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update categories.",
        variant: "destructive",
      });
    },
  });

  const handleCategoryToggle = (categoryName: string) => {
    const newCategories = selectedCategories.includes(categoryName)
      ? selectedCategories.filter(c => c !== categoryName)
      : [...selectedCategories, categoryName];
    
    setSelectedCategories(newCategories);
    updateCategoriesMutation.mutate({ categories: newCategories });
  };

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

  const updateRoleMutation = useMutation({
    mutationFn: async ({ employeeId, role }: { employeeId: string; role: 'employee' | 'manager' | 'admin' }) => {
      await apiRequest("PATCH", `/api/employees/${employeeId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setShowRoleDialog(false);
      toast({
        title: "Success",
        description: "Employee role updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update employee role.",
        variant: "destructive",
      });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      await apiRequest("DELETE", `/api/employees/${employeeId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: "Success",
        description: "Employee deleted successfully.",
      });
      navigate("/admin/employees");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete employee.",
        variant: "destructive",
      });
    },
  });

  const handleRoleClick = () => {
    if (employee) {
      setSelectedRole(employee.user.role);
      setShowRoleDialog(true);
    }
  };

  const handleSaveRole = () => {
    if (employee && selectedRole) {
      updateRoleMutation.mutate({
        employeeId: employee.user.id,
        role: selectedRole,
      });
    }
  };

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
              <div className="flex-1">
                <CardTitle>{employee.user.firstName} {employee.user.lastName}</CardTitle>
                <CardDescription>{employee.user.email}</CardDescription>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {employee.user.role === 'admin' && (
                    <Badge variant="outline" className="capitalize">
                      <Shield className="w-3 h-3 mr-1" />
                      Admin
                    </Badge>
                  )}
                  {employee.user.role === 'manager' && (
                    <Badge variant="outline" className="capitalize">
                      <Shield className="w-3 h-3 mr-1" />
                      Manager
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {canViewFinancialData && employee.user.id !== currentUser?.id && (
              <div className="mb-4 space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleRoleClick}
                  data-testid="button-change-role"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Change Role
                </Button>
                {currentUser?.role === 'admin' && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setShowDeleteEmployeeDialog(true)}
                    data-testid="button-delete-employee"
                  >
                    <UserX className="w-4 h-4 mr-2" />
                    Delete Employee
                  </Button>
                )}
              </div>
            )}
            {canViewFinancialData && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4" />
                  <span>Pay Rate</span>
                </div>
                {editingPayRate ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={payRateInput}
                      onChange={(e) => setPayRateInput(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="input-pay-rate"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const parsed = parseFloat(payRateInput);
                        if (isNaN(parsed) || parsed < 0) {
                          toast({ title: "Invalid value", description: "Enter a valid pay rate.", variant: "destructive" });
                          return;
                        }
                        updatePayRateMutation.mutate({ employeeId: employee.user.id, payRate: parsed.toFixed(2) });
                      }}
                      disabled={updatePayRateMutation.isPending}
                      data-testid="button-save-pay-rate"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingPayRate(false)}
                      data-testid="button-cancel-pay-rate"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{formatCurrency(parseFloat(employee.user.payRate || '0'))}/hr</span>
                    {currentUser?.role === 'admin' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setPayRateInput(parseFloat(employee.user.payRate || '0').toFixed(2));
                          setEditingPayRate(true);
                        }}
                        data-testid="button-edit-pay-rate"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Weekly Hours</span>
              </div>
              <div className="font-semibold">{formatDuration(employee.weeklyHours)}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="w-4 h-4" />
                <span>Sick Time Balance</span>
              </div>
              {editingSickTime ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    value={sickTimeInput}
                    onChange={(e) => setSickTimeInput(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-sick-time"
                    autoFocus
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">hrs</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const parsed = parseFloat(sickTimeInput);
                      if (isNaN(parsed) || parsed < 0) {
                        toast({ title: "Invalid value", description: "Enter a valid number of hours.", variant: "destructive" });
                        return;
                      }
                      updateSickTimeMutation.mutate({ employeeId: employee.user.id, sickTimeBalance: parsed.toFixed(2) });
                    }}
                    disabled={updateSickTimeMutation.isPending}
                    data-testid="button-save-sick-time"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingSickTime(false)}
                    data-testid="button-cancel-sick-time"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{formatDuration(parseFloat(employee.user.sickTimeBalance || '0'))}</span>
                  {currentUser?.role === 'admin' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setSickTimeInput(parseFloat(employee.user.sickTimeBalance || '0').toFixed(2));
                        setEditingSickTime(true);
                      }}
                      data-testid="button-edit-sick-time"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="pt-4 border-t mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Users className="w-4 h-4" />
                <span>Assigned Categories</span>
              </div>
              <div className="space-y-2">
                {allCategories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`category-${category.id}`}
                      checked={selectedCategories.includes(category.name)}
                      onCheckedChange={() => handleCategoryToggle(category.name)}
                      disabled={updateCategoriesMutation.isPending}
                      data-testid={`checkbox-category-${category.name.toLowerCase()}`}
                    />
                    <Label 
                      htmlFor={`category-${category.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {category.name}
                    </Label>
                    {selectedCategories.includes(category.name) && (
                      <Badge variant="outline" className="text-xs">Assigned</Badge>
                    )}
                  </div>
                ))}
                {allCategories.length === 0 && (
                  <p className="text-xs text-muted-foreground">No categories available</p>
                )}
              </div>
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

      {/* Break History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5" />
            Break/Lunch History
          </CardTitle>
          <CardDescription>View all break and lunch records</CardDescription>
        </CardHeader>
        <CardContent>
          {!breaks || breaks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No breaks recorded
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Start Time</TableHead>
                    <TableHead>End Time</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breaks.map((breakEntry) => (
                    <TableRow key={breakEntry.id} data-testid={`break-row-${breakEntry.id}`}>
                      <TableCell>{formatDateTime(breakEntry.startTime)}</TableCell>
                      <TableCell>{breakEntry.endTime ? formatDateTime(breakEntry.endTime) : "Active"}</TableCell>
                      <TableCell className="text-right">
                        {breakEntry.duration ? `${breakEntry.duration} min` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {breakEntry.exceededLimit ? (
                          <Badge variant="destructive" data-testid={`break-exceeded-${breakEntry.id}`}>
                            Overtime
                          </Badge>
                        ) : breakEntry.endTime ? (
                          <Badge variant="outline" data-testid={`break-normal-${breakEntry.id}`}>
                            Normal
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`break-active-${breakEntry.id}`}>
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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

      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent data-testid="dialog-change-role">
          <DialogHeader>
            <DialogTitle>Change Employee Role</DialogTitle>
            <DialogDescription>
              Update role for {employee.user.firstName} {employee.user.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={selectedRole} onValueChange={(value: 'employee' | 'manager' | 'admin') => setSelectedRole(value)}>
                <SelectTrigger id="role" data-testid="select-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {selectedRole === 'employee' && 'Employees can only view their own time entries'}
                {selectedRole === 'manager' && 'Managers can view all employees and reports, but cannot view or edit financial data'}
                {selectedRole === 'admin' && 'Admins have full access to all features including financial data'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRoleDialog(false)}
              data-testid="button-cancel-role"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={updateRoleMutation.isPending || !selectedRole}
              data-testid="button-save-role"
            >
              {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteEmployeeDialog} onOpenChange={setShowDeleteEmployeeDialog}>
        <AlertDialogContent data-testid="dialog-delete-employee-detail">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {employee.user.firstName} {employee.user.lastName}? 
              This will permanently delete their account, all time entries, and PTO requests. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-employee">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee && deleteEmployeeMutation.mutate(employee.user.id)}
              data-testid="button-confirm-delete-employee"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEmployeeMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
