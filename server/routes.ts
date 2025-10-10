import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { recalculateSickTime } from "./sickTimeCalculator";
import { isAdmin, isAdminOrManager, canViewFinancialData } from "./roleUtils";
import { 
  clockInSchema, 
  clockOutSchema, 
  updateEmployeeSchema,
  reportQuerySchema,
  createTimeEntrySchema,
  updateTimeEntrySchema,
  createEmployeeSchema,
  pinLoginSchema,
  createPtoRequestSchema,
  reviewPtoRequestSchema,
  updatePtoBalanceSchema
} from "@shared/schema";
import { startOfWeek, endOfWeek } from "date-fns";
import bcrypt from "bcryptjs";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Login with PIN only (no email required)
  app.post('/api/auth/pin-login', async (req: any, res) => {
    try {
      const validatedData = pinLoginSchema.parse(req.body);
      
      // Find user by PIN
      const user = await storage.getUserByPin(validatedData.pin);
      if (!user) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      // Create session for the user
      req.login({ claims: { sub: user.id } }, (err: any) => {
        if (err) {
          console.error("Error creating session:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({ message: "Login successful", user });
      });
    } catch (error: any) {
      console.error("Error during PIN login:", error);
      res.status(400).json({ message: error.message || "Failed to login" });
    }
  });

  // Session logout (for PIN users) - destroys session without redirect
  app.post('/api/auth/session-logout', (req: any, res) => {
    req.logout((err: any) => {
      if (err) {
        console.error("Error logging out:", err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      
      // Destroy the session completely
      req.session.destroy((destroyErr: any) => {
        if (destroyErr) {
          console.error("Error destroying session:", destroyErr);
        }
        // Clear the session cookie
        res.clearCookie('connect.sid');
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  // Time entry routes
  app.post('/api/time-entries/clock-in', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = clockInSchema.parse(req.body);

      // Check if user is already clocked in
      const activeEntry = await storage.getActiveTimeEntry(userId);
      if (activeEntry) {
        return res.status(400).json({ message: "Already clocked in" });
      }

      const newEntry = await storage.createTimeEntry({
        userId,
        clockIn: new Date(validatedData.clockIn),
        clockOut: null,
      });

      res.json(newEntry);
    } catch (error: any) {
      console.error("Error clocking in:", error);
      res.status(400).json({ message: error.message || "Failed to clock in" });
    }
  });

  app.post('/api/time-entries/clock-out', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = clockOutSchema.parse(req.body);

      // Find active time entry
      const activeEntry = await storage.getActiveTimeEntry(userId);
      if (!activeEntry) {
        return res.status(400).json({ message: "Not currently clocked in" });
      }

      // Update the entry with clock out time
      const updatedEntry = await storage.updateTimeEntry(activeEntry.id, {
        clockOut: new Date(validatedData.clockOut),
      });

      // Calculate hours worked
      const hoursWorked = (updatedEntry.clockOut!.getTime() - updatedEntry.clockIn.getTime()) / (1000 * 60 * 60);
      
      // Calculate sick time accrual (1 hour per 30 hours worked)
      const sickTimeEarned = hoursWorked / 30;
      
      // Update user's sick time balance
      const user = await storage.getUser(userId);
      if (user) {
        const currentSickTime = parseFloat(user.sickTimeBalance || '0');
        const newSickTime = currentSickTime + sickTimeEarned;
        await storage.updateUserSickTime(userId, newSickTime.toFixed(2));
      }

      res.json(updatedEntry);
    } catch (error: any) {
      console.error("Error clocking out:", error);
      res.status(400).json({ message: error.message || "Failed to clock out" });
    }
  });

  app.get('/api/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const entries = await storage.getUserTimeEntries(userId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  // Admin employee routes
  app.get('/api/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }

      const allUsers = await storage.getAllUsers();
      
      // Get time entries and calculate weekly hours for each employee
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 }); // Sunday
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 }); // Saturday

      const employeesWithData = await Promise.all(
        allUsers.map(async (user) => {
          const entries = await storage.getUserTimeEntries(user.id);
          
          // Calculate weekly hours
          const weeklyEntries = entries.filter(entry => {
            const entryDate = new Date(entry.clockIn);
            return entryDate >= weekStart && entryDate <= weekEnd && entry.clockOut;
          });

          const weeklyHours = weeklyEntries.reduce((total, entry) => {
            if (entry.clockOut) {
              const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
              return total + hours;
            }
            return total;
          }, 0);

          // Check if currently clocked in
          const isClockedIn = entries.some(entry => !entry.clockOut);

          // Filter financial data for managers
          const userData = canViewFinancialData(currentUser) 
            ? user 
            : { ...user, payRate: '0' };

          return {
            user: userData,
            entries,
            weeklyHours,
            isClockedIn,
          };
        })
      );

      res.json(employeesWithData);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get('/api/employees/list', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }

      const allUsers = await storage.getAllUsers();
      
      // Filter financial data for managers
      const filteredUsers = canViewFinancialData(currentUser)
        ? allUsers
        : allUsers.map(u => ({ ...u, payRate: '0' }));
      
      res.json(filteredUsers);
    } catch (error) {
      console.error("Error fetching employee list:", error);
      res.status(500).json({ message: "Failed to fetch employee list" });
    }
  });

  // Create new employee (admin only)
  app.post('/api/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdmin(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const validatedData = createEmployeeSchema.parse(req.body);
      
      // Check if PIN is already in use
      const existingUser = await storage.getUserByPin(validatedData.pin);
      if (existingUser) {
        return res.status(400).json({ message: "PIN already in use. Please choose a different PIN." });
      }

      // Create the employee
      const newEmployee = await storage.createEmployee({
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        pin: validatedData.pin,
        payRate: validatedData.payRate || '0',
        email: validatedData.email || null,
      });

      res.json(newEmployee);
    } catch (error: any) {
      console.error("Error creating employee:", error);
      res.status(400).json({ message: error.message || "Failed to create employee" });
    }
  });

  // Update employee role (admin only)
  app.patch('/api/employees/:id/role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdmin(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const employeeId = req.params.id;
      const { role } = req.body;

      // Validate role
      if (!role || !['employee', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'employee', 'manager', or 'admin'" });
      }

      // Prevent admin from changing their own role
      if (employeeId === userId) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }

      const updatedUser = await storage.updateUserRole(employeeId, role);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating employee role:", error);
      res.status(500).json({ message: error.message || "Failed to update employee role" });
    }
  });

  app.patch('/api/employees/:id/pay-rate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdmin(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const employeeId = req.params.id;
      const validatedData = updateEmployeeSchema.parse(req.body);

      const updatedUser = await storage.updateEmployeePayRate(employeeId, validatedData.payRate);
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating pay rate:", error);
      res.status(400).json({ message: error.message || "Failed to update pay rate" });
    }
  });

  // Admin time entry management routes
  app.post('/api/admin/time-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }

      const validatedData = createTimeEntrySchema.parse(req.body);

      const newEntry = await storage.createTimeEntry({
        userId: validatedData.userId,
        clockIn: new Date(validatedData.clockIn),
        clockOut: validatedData.clockOut ? new Date(validatedData.clockOut) : null,
      });

      // Recalculate sick time for the employee
      await recalculateSickTime(validatedData.userId);

      res.json(newEntry);
    } catch (error: any) {
      console.error("Error creating time entry:", error);
      res.status(400).json({ message: error.message || "Failed to create time entry" });
    }
  });

  app.patch('/api/admin/time-entries/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }

      const entryId = parseInt(req.params.id);
      const validatedData = updateTimeEntrySchema.parse(req.body);

      // Get the entry to find the user ID
      const existingEntry = await storage.getTimeEntry(entryId);
      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      const updates: any = {};
      if (validatedData.clockIn) {
        updates.clockIn = new Date(validatedData.clockIn);
      }
      if (validatedData.clockOut !== undefined) {
        updates.clockOut = validatedData.clockOut ? new Date(validatedData.clockOut) : null;
      }

      const updatedEntry = await storage.updateTimeEntry(entryId, updates);
      
      // Recalculate sick time for the employee
      await recalculateSickTime(existingEntry.userId);

      res.json(updatedEntry);
    } catch (error: any) {
      console.error("Error updating time entry:", error);
      res.status(400).json({ message: error.message || "Failed to update time entry" });
    }
  });

  app.delete('/api/admin/time-entries/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }

      const entryId = parseInt(req.params.id);
      
      // Get the entry to find the user ID before deleting
      const existingEntry = await storage.getTimeEntry(entryId);
      if (!existingEntry) {
        return res.status(404).json({ message: "Time entry not found" });
      }

      await storage.deleteTimeEntry(entryId);
      
      // Recalculate sick time for the employee after deletion
      await recalculateSickTime(existingEntry.userId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting time entry:", error);
      res.status(400).json({ message: error.message || "Failed to delete time entry" });
    }
  });

  // Reports route
  app.get('/api/reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }

      const employeeId = req.query.employeeId as string | undefined;
      const startDateStr = req.query.startDate as string | undefined;
      const endDateStr = req.query.endDate as string | undefined;

      const startDate = startDateStr ? new Date(startDateStr) : null;
      const endDate = endDateStr ? new Date(endDateStr) : null;

      const entries = await storage.getTimeEntriesInRange(
        employeeId || null,
        startDate,
        endDate
      );

      // Get all users for mapping
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      // Helper function to get the Sunday of the week for a given date
      const getWeekStart = (date: Date): string => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day; // Subtract day of week to get to Sunday
        const sunday = new Date(d.setDate(diff));
        sunday.setHours(0, 0, 0, 0);
        return sunday.toISOString();
      };

      // Group entries by user and week to calculate overtime
      const userWeekHours = new Map<string, Map<string, number>>();
      
      entries.forEach(entry => {
        if (entry.clockOut) {
          const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
          const weekStart = getWeekStart(new Date(entry.clockIn));
          const key = `${entry.userId}-${weekStart}`;
          
          if (!userWeekHours.has(entry.userId)) {
            userWeekHours.set(entry.userId, new Map());
          }
          const userWeeks = userWeekHours.get(entry.userId)!;
          userWeeks.set(weekStart, (userWeeks.get(weekStart) || 0) + hours);
        }
      });

      // Format entries with user data and overtime calculations
      const reportData = entries.map(entry => {
        const user = userMap.get(entry.userId);
        const hours = entry.clockOut
          ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
          : 0;
        
        const payRate = parseFloat(user?.payRate || '0');
        const weekStart = getWeekStart(new Date(entry.clockIn));
        const weekHours = userWeekHours.get(entry.userId)?.get(weekStart) || 0;
        
        // Calculate regular and overtime hours for this entry
        // Distribute overtime proportionally across all entries in the week
        let regularHours = hours;
        let overtimeHours = 0;
        
        if (weekHours > 40) {
          // Calculate the proportion of this entry's hours
          const overtimeTotal = weekHours - 40;
          overtimeHours = (hours / weekHours) * overtimeTotal;
          regularHours = hours - overtimeHours;
        }
        
        const regularPay = regularHours * payRate;
        const overtimePay = overtimeHours * payRate * 1.5;
        const totalPay = regularPay + overtimePay;

        // Filter financial data for managers
        if (canViewFinancialData(currentUser)) {
          return {
            entry,
            user,
            hours,
            regularHours,
            overtimeHours,
            regularPay,
            overtimePay,
            pay: totalPay,
            weekHours,
          };
        } else {
          // Managers don't see financial data
          return {
            entry,
            user: { ...user, payRate: '0' },
            hours,
            regularHours,
            overtimeHours,
            regularPay: 0,
            overtimePay: 0,
            pay: 0,
            weekHours,
          };
        }
      });

      res.json(reportData);
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // PTO Request routes
  // Create PTO request (employees only)
  app.post('/api/pto-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const validatedData = createPtoRequestSchema.parse(req.body);
      const requestedHours = parseFloat(validatedData.hours);
      const ptoBalance = parseFloat(user.ptoBalance || '0');
      
      // Check if user has enough PTO balance
      if (requestedHours > ptoBalance) {
        return res.status(400).json({ 
          message: `Insufficient PTO balance. You have ${ptoBalance} hours available.` 
        });
      }
      
      const newRequest = await storage.createPtoRequest({
        userId,
        startDate: new Date(validatedData.startDate),
        endDate: new Date(validatedData.endDate),
        hours: validatedData.hours,
        status: 'pending',
      });
      
      res.json(newRequest);
    } catch (error: any) {
      console.error("Error creating PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to create PTO request" });
    }
  });

  // Get PTO requests (employees see their own, admins/managers see all)
  app.get('/api/pto-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      let requests;
      if (isAdminOrManager(currentUser)) {
        // Admins and managers see all requests
        requests = await storage.getAllPtoRequests();
      } else {
        // Employees see only their own requests
        requests = await storage.getUserPtoRequests(userId);
      }
      
      res.json(requests);
    } catch (error) {
      console.error("Error fetching PTO requests:", error);
      res.status(500).json({ message: "Failed to fetch PTO requests" });
    }
  });

  // Review PTO request (approve/deny) - admin/manager only
  app.patch('/api/pto-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const requestId = parseInt(req.params.id);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }
      
      const validatedData = reviewPtoRequestSchema.parse(req.body);
      const ptoRequest = await storage.getPtoRequest(requestId);
      
      if (!ptoRequest) {
        return res.status(404).json({ message: "PTO request not found" });
      }
      
      if (ptoRequest.status !== 'pending') {
        return res.status(400).json({ message: "PTO request has already been reviewed" });
      }
      
      // Update request status
      const updatedRequest = await storage.updatePtoRequest(requestId, {
        status: validatedData.status,
        reviewedBy: userId,
        reviewedAt: new Date(),
      });
      
      // If approved, deduct PTO from user's balance
      if (validatedData.status === 'approved') {
        const employee = await storage.getUser(ptoRequest.userId);
        
        if (!employee) {
          return res.status(404).json({ message: "Employee not found" });
        }
        
        const currentBalance = parseFloat(employee.ptoBalance || '0');
        const requestHours = parseFloat(ptoRequest.hours);
        const newBalance = (currentBalance - requestHours).toFixed(2);
        
        await storage.updateEmployee(ptoRequest.userId, {
          ptoBalance: newBalance,
        });
      }
      
      res.json(updatedRequest);
    } catch (error: any) {
      console.error("Error reviewing PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to review PTO request" });
    }
  });

  // Update employee PTO balance - admin/manager only
  app.patch('/api/employees/:id/pto', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const employeeId = req.params.id;
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }
      
      const validatedData = updatePtoBalanceSchema.parse(req.body);
      
      const updatedEmployee = await storage.updateEmployee(employeeId, {
        ptoBalance: validatedData.ptoBalance,
      });
      
      res.json(updatedEmployee);
    } catch (error: any) {
      console.error("Error updating PTO balance:", error);
      res.status(400).json({ message: error.message || "Failed to update PTO balance" });
    }
  });

  // Delete employee - admin only
  app.delete('/api/employees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const employeeId = req.params.id;
      
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      // Prevent self-deletion
      if (employeeId === userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const employee = await storage.getUser(employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      await storage.deleteEmployee(employeeId);
      
      res.json({ success: true, message: "Employee deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting employee:", error);
      res.status(400).json({ message: error.message || "Failed to delete employee" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
