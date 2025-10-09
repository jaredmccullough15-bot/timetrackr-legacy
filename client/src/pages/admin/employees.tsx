import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClockStatusBadge } from "@/components/ClockStatusBadge";
import { Users, DollarSign, Heart, Clock, Edit, Shield, Plus, Calendar } from "lucide-react";
import { formatCurrency, formatDuration } from "@/lib/timeUtils";
import type { User, TimeEntry } from "@shared/schema";

interface EmployeeWithEntries {
  user: User;
  entries: TimeEntry[];
  weeklyHours: number;
  isClockedIn: boolean;
}

export default function AdminEmployees() {
  const [, navigate] = useLocation();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { canViewFinancialData } = useRole();
  const { toast } = useToast();
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [payRate, setPayRate] = useState("");
  const [editingPtoEmployee, setEditingPtoEmployee] = useState<User | null>(null);
  const [ptoBalance, setPtoBalance] = useState("");
  const [changingRoleEmployee, setChangingRoleEmployee] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<'employee' | 'manager' | 'admin'>('employee');
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    pin: '',
    payRate: '',
    email: '',
  });

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

  const updatePayRateMutation = useMutation({
    mutationFn: async ({ employeeId, payRate }: { employeeId: string; payRate: string }) => {
      await apiRequest("PATCH", `/api/employees/${employeeId}/pay-rate`, { payRate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditingEmployee(null);
      setPayRate("");
      toast({
        title: "Success",
        description: "Pay rate updated successfully.",
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

  const updatePtoBalanceMutation = useMutation({
    mutationFn: async ({ employeeId, ptoBalance }: { employeeId: string; ptoBalance: string }) => {
      await apiRequest("PATCH", `/api/employees/${employeeId}/pto`, { ptoBalance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setEditingPtoEmployee(null);
      setPtoBalance("");
      toast({
        title: "Success",
        description: "PTO balance updated successfully.",
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

  const updateRoleMutation = useMutation({
    mutationFn: async ({ employeeId, role }: { employeeId: string; role: 'employee' | 'manager' | 'admin' }) => {
      await apiRequest("PATCH", `/api/employees/${employeeId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setChangingRoleEmployee(null);
      toast({
        title: "Success",
        description: "Employee role updated successfully.",
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
        description: error.message || "Failed to update employee role.",
        variant: "destructive",
      });
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (employeeData: typeof newEmployee) => {
      await apiRequest("POST", "/api/employees", employeeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setIsAddEmployeeOpen(false);
      setNewEmployee({ firstName: '', lastName: '', pin: '', payRate: '', email: '' });
      toast({
        title: "Success",
        description: "Employee created successfully.",
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
        description: error.message || "Failed to create employee.",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (employee: User) => {
    setEditingEmployee(employee);
    setPayRate(employee.payRate || '0');
  };

  const handleRoleClick = (employee: User) => {
    setChangingRoleEmployee(employee);
    setSelectedRole(employee.role);
  };

  const handleSavePayRate = () => {
    if (editingEmployee && payRate) {
      updatePayRateMutation.mutate({
        employeeId: editingEmployee.id,
        payRate,
      });
    }
  };

  const handleSaveRole = () => {
    if (changingRoleEmployee && selectedRole) {
      updateRoleMutation.mutate({
        employeeId: changingRoleEmployee.id,
        role: selectedRole,
      });
    }
  };

  const handleEditPtoClick = (employee: User) => {
    setEditingPtoEmployee(employee);
    setPtoBalance(employee.ptoBalance || '0');
  };

  const handleSavePtoBalance = () => {
    if (editingPtoEmployee && ptoBalance) {
      updatePtoBalanceMutation.mutate({
        employeeId: editingPtoEmployee.id,
        ptoBalance,
      });
    }
  };

  const handleCreateEmployee = () => {
    if (!newEmployee.firstName || !newEmployee.lastName || !newEmployee.pin) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    if (!/^\d{4}$/.test(newEmployee.pin)) {
      toast({
        title: "Error",
        description: "PIN must be exactly 4 digits.",
        variant: "destructive",
      });
      return;
    }
    
    createEmployeeMutation.mutate(newEmployee);
  };

  if (authLoading || !currentUser || employeesLoading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1">
            Manage employee information and pay rates
          </p>
        </div>
        {currentUser.role === 'admin' && (
          <Button onClick={() => setIsAddEmployeeOpen(true)} data-testid="button-add-employee">
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        )}
      </div>

      {!employees || employees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No employees found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {employees.map((employee) => {
            const initials = `${employee.user.firstName?.[0] || ''}${employee.user.lastName?.[0] || ''}`.toUpperCase() || 'U';
            const weeklyPay = employee.weeklyHours * parseFloat(employee.user.payRate || '0');
            const sickTime = parseFloat(employee.user.sickTimeBalance || '0');
            
            return (
              <Card 
                key={employee.user.id} 
                data-testid={`employee-detail-${employee.user.id}`}
                className="hover-elevate cursor-pointer"
                onClick={() => navigate(`/admin/employees/${employee.user.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={employee.user.profileImageUrl || undefined} className="object-cover" />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="truncate">
                          {employee.user.firstName} {employee.user.lastName}
                        </CardTitle>
                        <CardDescription className="truncate">{employee.user.email}</CardDescription>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <ClockStatusBadge isClockedIn={employee.isClockedIn} />
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
                    <div className="flex gap-1">
                      {canViewFinancialData && employee.user.id !== currentUser.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRoleClick(employee.user);
                          }}
                          data-testid={`button-change-role-${employee.user.id}`}
                        >
                          <Shield className="w-4 h-4" />
                        </Button>
                      )}
                      {canViewFinancialData && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(employee.user);
                          }}
                          data-testid={`button-edit-${employee.user.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {canViewFinancialData && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <DollarSign className="w-4 h-4" />
                          <span>Pay Rate</span>
                        </div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(parseFloat(employee.user.payRate || '0'))}/hr
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>Weekly Hours</span>
                      </div>
                      <div className="text-lg font-semibold">
                        {formatDuration(employee.weeklyHours)}
                      </div>
                    </div>
                    {canViewFinancialData && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <DollarSign className="w-4 h-4" />
                          <span>Weekly Pay</span>
                        </div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(weeklyPay)}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Heart className="w-4 h-4" />
                        <span>Sick Time</span>
                      </div>
                      <div className="text-lg font-semibold">
                        {formatDuration(sickTime)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>PTO</span>
                        </div>
                        {canViewFinancialData && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPtoClick(employee.user);
                            }}
                            className="h-6 px-2 text-xs"
                            data-testid={`button-edit-pto-${employee.user.id}`}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                      <div className="text-lg font-semibold">
                        {formatDuration(parseFloat(employee.user.ptoBalance || '0'))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
        <DialogContent data-testid="dialog-edit-employee">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update pay rate for {editingEmployee?.firstName} {editingEmployee?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payRate">Pay Rate (per hour)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="payRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payRate}
                  onChange={(e) => setPayRate(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                  data-testid="input-pay-rate"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEmployee(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePayRate}
              disabled={updatePayRateMutation.isPending || !payRate}
              data-testid="button-save-pay-rate"
            >
              {updatePayRateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPtoEmployee} onOpenChange={(open) => !open && setEditingPtoEmployee(null)}>
        <DialogContent data-testid="dialog-edit-pto">
          <DialogHeader>
            <DialogTitle>Edit PTO Balance</DialogTitle>
            <DialogDescription>
              Update PTO balance for {editingPtoEmployee?.firstName} {editingPtoEmployee?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ptoBalance">PTO Balance (hours)</Label>
              <Input
                id="ptoBalance"
                type="number"
                step="0.5"
                min="0"
                value={ptoBalance}
                onChange={(e) => setPtoBalance(e.target.value)}
                placeholder="0"
                data-testid="input-pto-balance"
              />
              <p className="text-xs text-muted-foreground">
                Enter the total PTO hours available for this employee
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPtoEmployee(null)}
              data-testid="button-cancel-pto-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePtoBalance}
              disabled={updatePtoBalanceMutation.isPending || !ptoBalance}
              data-testid="button-save-pto-balance"
            >
              {updatePtoBalanceMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!changingRoleEmployee} onOpenChange={(open) => !open && setChangingRoleEmployee(null)}>
        <DialogContent data-testid="dialog-change-role">
          <DialogHeader>
            <DialogTitle>Change Employee Role</DialogTitle>
            <DialogDescription>
              Update role for {changingRoleEmployee?.firstName} {changingRoleEmployee?.lastName}
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
              onClick={() => setChangingRoleEmployee(null)}
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

      <Dialog open={isAddEmployeeOpen} onOpenChange={setIsAddEmployeeOpen}>
        <DialogContent data-testid="dialog-add-employee">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              Create a new employee account with an assigned PIN
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={newEmployee.firstName}
                  onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })}
                  placeholder="John"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={newEmployee.lastName}
                  onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })}
                  placeholder="Doe"
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">4-Digit PIN *</Label>
              <Input
                id="pin"
                type="text"
                maxLength={4}
                value={newEmployee.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setNewEmployee({ ...newEmployee, pin: value });
                }}
                placeholder="1234"
                data-testid="input-pin"
              />
              <p className="text-sm text-muted-foreground">
                This PIN will be used by the employee to clock in and out
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPayRate">Pay Rate (per hour)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="newPayRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newEmployee.payRate}
                  onChange={(e) => setNewEmployee({ ...newEmployee, payRate: e.target.value })}
                  className="pl-7"
                  placeholder="0.00"
                  data-testid="input-new-pay-rate"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                placeholder="john.doe@example.com"
                data-testid="input-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddEmployeeOpen(false);
                setNewEmployee({ firstName: '', lastName: '', pin: '', payRate: '', email: '' });
              }}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEmployee}
              disabled={createEmployeeMutation.isPending}
              data-testid="button-create-employee"
            >
              {createEmployeeMutation.isPending ? "Creating..." : "Create Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
