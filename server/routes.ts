import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { recalculateSickTime } from "./sickTimeCalculator";
import { isAdmin, isAdminOrManager, canViewFinancialData } from "./roleUtils";
import { sendPtoRequestNotification, sendPtoDecisionNotification } from "./email";
import { sendWeeklyTimesheet, runYearlyBalanceReset } from "./scheduler";
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
  updatePtoBalanceSchema,
  assignCategorySchema,
  reviewTimeEntrySchema,
  type CategoryType
} from "@shared/schema";
import { startOfWeek, endOfWeek } from "date-fns";
import bcrypt from "bcryptjs";

function roundToNearestQuarterHour(date: Date): Date {
  const rounded = new Date(date);
  
  // Convert to total minutes as decimal (including seconds and milliseconds)
  const totalMinutes = rounded.getMinutes() + 
                       rounded.getSeconds() / 60 + 
                       rounded.getMilliseconds() / 60000;
  
  // Round to nearest 15-minute interval
  // Midpoint is at 7.5, 22.5, 37.5, 52.5
  const roundedMinutes = Math.round(totalMinutes / 15) * 15;
  
  if (roundedMinutes === 60) {
    rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(0);
  } else {
    rounded.setMinutes(roundedMinutes);
  }
  
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  
  return rounded;
}

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

      // Check if employee has unapproved previous day entry (blocks clock-in)
      const hasUnapproved = await storage.hasUnapprovedPreviousDayEntry(userId);
      if (hasUnapproved) {
        return res.status(403).json({ 
          message: "Your previous day's time punch has not been approved. Please see your manager for manual entry.",
          blocked: true
        });
      }

      // Round clock-in time to nearest quarter hour
      const roundedClockIn = roundToNearestQuarterHour(new Date(validatedData.clockIn));

      const newEntry = await storage.createTimeEntry({
        userId,
        clockIn: roundedClockIn,
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

      let clockOutTime = new Date(validatedData.clockOut);
      
      // Check if there are any breaks during this session that exceeded 30 minutes
      const userBreaks = await storage.getUserBreaks(userId);
      const exceededBreaks = userBreaks.filter(b => 
        new Date(b.startTime) >= new Date(activeEntry.clockIn) &&
        b.exceededLimit === true
      );
      
      // Deduct 1 hour for EACH break that exceeded the limit
      if (exceededBreaks.length > 0) {
        const oneHourInMs = 60 * 60 * 1000;
        const totalDeduction = oneHourInMs * exceededBreaks.length;
        clockOutTime = new Date(clockOutTime.getTime() - totalDeduction);
        
        // Ensure clock-out time doesn't go before clock-in time
        const clockInTime = new Date(activeEntry.clockIn);
        if (clockOutTime < clockInTime) {
          clockOutTime = clockInTime; // Set to clock-in time (0 hours worked)
        }
      }
      
      // Update the entry with clock out time (possibly adjusted for break overtime)
      const updatedEntry = await storage.updateTimeEntry(activeEntry.id, {
        clockOut: clockOutTime,
      });

      // Create a pending approval record for this time entry
      await storage.createTimeEntryApproval(updatedEntry.id);

      // Sick time accrual is DISABLED - managed manually and reset yearly

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

  // Update employee sick time balance - admin only
  app.patch('/api/employees/:id/sick-time', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!isAdmin(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const employeeId = req.params.id;
      const { sickTimeBalance } = req.body;

      if (typeof sickTimeBalance !== 'string' || !/^\d+(\.\d{1,2})?$/.test(sickTimeBalance)) {
        return res.status(400).json({ message: "Invalid sick time balance format" });
      }

      const updatedUser = await storage.updateUserSickTime(employeeId, sickTimeBalance);
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating sick time:", error);
      res.status(400).json({ message: error.message || "Failed to update sick time balance" });
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
      const isSickTime = validatedData.isSickTime || false;

      // If using sick time, check if employee has sufficient balance
      if (isSickTime) {
        const employee = await storage.getUser(validatedData.userId);
        if (!employee) {
          return res.status(404).json({ message: "Employee not found" });
        }

        // Calculate hours for this entry
        const clockIn = new Date(validatedData.clockIn);
        const clockOut = validatedData.clockOut ? new Date(validatedData.clockOut) : null;
        
        if (!clockOut) {
          return res.status(400).json({ message: "Clock out time is required for sick time entries" });
        }

        const hoursUsed = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
        const currentSickBalance = parseFloat(employee.sickTimeBalance || '0');

        if (hoursUsed > currentSickBalance) {
          return res.status(400).json({ 
            message: `Insufficient sick time balance. Employee has ${currentSickBalance.toFixed(2)} hours available, but ${hoursUsed.toFixed(2)} hours requested.` 
          });
        }

        // Deduct sick time from employee's balance
        const newBalance = (currentSickBalance - hoursUsed).toFixed(2);
        await storage.updateUserSickTime(validatedData.userId, newBalance);
      }

      const newEntry = await storage.createTimeEntry({
        userId: validatedData.userId,
        clockIn: new Date(validatedData.clockIn),
        clockOut: validatedData.clockOut ? new Date(validatedData.clockOut) : null,
        isSickTime: isSickTime,
      });

      // Only recalculate sick time accrual for straight time entries
      if (!isSickTime) {
        await recalculateSickTime(validatedData.userId);
      }

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
      
      // Send email notifications to managers in the same category (or all admins as fallback)
      try {
        // Get employee's categories
        const employeeCategories = await storage.getUserCategories(userId);
        let managerEmails: string[] = [];
        
        if (employeeCategories.length > 0) {
          // Get managers in the same categories as the employee
          for (const cat of employeeCategories) {
            const categoryManagers = await storage.getManagersByCategory(cat.category);
            for (const manager of categoryManagers) {
              if (manager.email && !managerEmails.includes(manager.email)) {
                managerEmails.push(manager.email);
              }
            }
          }
        }
        
        // If no category-based managers found, fall back to all admins and managers
        if (managerEmails.length === 0) {
          const allUsers = await storage.getAllUsers();
          managerEmails = allUsers
            .filter(u => u.role === 'admin' || u.role === 'manager')
            .map(u => u.email)
            .filter((email): email is string => !!email);
        }
        
        const employeeName = `${user.firstName} ${user.lastName}`;
        const startDate = new Date(validatedData.startDate).toLocaleDateString('en-US', { timeZone: 'UTC' });
        const endDate = new Date(validatedData.endDate).toLocaleDateString('en-US', { timeZone: 'UTC' });
        
        await sendPtoRequestNotification(managerEmails, employeeName, startDate, endDate, validatedData.hours);
      } catch (emailError) {
        console.error("Failed to send PTO request notification emails:", emailError);
        // Don't fail the request if email fails
      }
      
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
      
      // Get employee info for email and balance update
      const employee = await storage.getUser(ptoRequest.userId);
      
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      // If approved, deduct PTO from user's balance
      if (validatedData.status === 'approved') {
        const currentBalance = parseFloat(employee.ptoBalance || '0');
        const requestHours = parseFloat(ptoRequest.hours);
        const newBalance = (currentBalance - requestHours).toFixed(2);
        
        await storage.updateEmployee(ptoRequest.userId, {
          ptoBalance: newBalance,
        });
      }
      
      // Send email notification to the employee
      try {
        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const reviewerName = `${currentUser?.firstName || 'A manager'} ${currentUser?.lastName || ''}`.trim();
        const startDate = new Date(ptoRequest.startDate).toLocaleDateString('en-US', { timeZone: 'UTC' });
        const endDate = new Date(ptoRequest.endDate).toLocaleDateString('en-US', { timeZone: 'UTC' });
        
        await sendPtoDecisionNotification(
          employee.email || '',
          employeeName,
          validatedData.status as 'approved' | 'denied',
          startDate,
          endDate,
          ptoRequest.hours,
          reviewerName
        );
      } catch (emailError) {
        console.error("Failed to send PTO decision notification email:", emailError);
        // Don't fail the request if email fails
      }
      
      res.json(updatedRequest);
    } catch (error: any) {
      console.error("Error reviewing PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to review PTO request" });
    }
  });

  // Unapprove PTO request (revoke approval and refund hours) - admin/manager only
  app.post('/api/pto-requests/:id/unapprove', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const requestId = parseInt(req.params.id);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }
      
      const ptoRequest = await storage.getPtoRequest(requestId);
      
      if (!ptoRequest) {
        return res.status(404).json({ message: "PTO request not found" });
      }
      
      if (ptoRequest.status !== 'approved') {
        return res.status(400).json({ message: "Only approved PTO requests can be unapproved" });
      }
      
      // Refund the PTO hours to the employee
      const employee = await storage.getUser(ptoRequest.userId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      
      const currentBalance = parseFloat(employee.ptoBalance || '0');
      const requestHours = parseFloat(ptoRequest.hours);
      const newBalance = (currentBalance + requestHours).toFixed(2);
      
      await storage.updateEmployee(ptoRequest.userId, {
        ptoBalance: newBalance,
      });
      
      // Update request status back to pending
      const updatedRequest = await storage.updatePtoRequest(requestId, {
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
      });
      
      res.json(updatedRequest);
    } catch (error: any) {
      console.error("Error unapproving PTO request:", error);
      res.status(400).json({ message: error.message || "Failed to unapprove PTO request" });
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

  // Start a break
  app.post('/api/breaks/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if there's already an active break
      const activeBreak = await storage.getActiveBreak(userId);
      if (activeBreak) {
        return res.status(400).json({ message: "You already have an active break" });
      }
      
      // Check if user is clocked in
      const activeTimeEntry = await storage.getActiveTimeEntry(userId);
      if (!activeTimeEntry) {
        return res.status(400).json({ message: "You must be clocked in to start a break" });
      }
      
      const newBreak = await storage.createBreak({
        userId,
        startTime: new Date(),
      });
      
      res.json(newBreak);
    } catch (error: any) {
      console.error("Error starting break:", error);
      res.status(400).json({ message: error.message || "Failed to start break" });
    }
  });

  // End a break
  app.post('/api/breaks/end', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get active break
      const activeBreak = await storage.getActiveBreak(userId);
      if (!activeBreak) {
        return res.status(400).json({ message: "No active break found" });
      }
      
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - new Date(activeBreak.startTime).getTime()) / (1000 * 60)); // Duration in minutes
      const exceededLimit = duration > 30;
      
      // Update break with end time and duration
      const updatedBreak = await storage.updateBreak(activeBreak.id, {
        endTime,
        duration,
        exceededLimit,
      });
      
      // If break exceeded 30 minutes, create notifications (pay deduction happens at clock-out)
      if (exceededLimit) {
        const user = await storage.getUser(userId);
        const allUsers = await storage.getAllUsers();
        const adminsAndManagers = allUsers.filter(u => u.role === 'admin' || u.role === 'manager');
        
        const message = `${user?.firstName} ${user?.lastName} exceeded their break time by ${duration - 30} minutes (total: ${duration} minutes) - 1 hour will be deducted at clock-out`;
        
        // Create notification for each admin/manager
        for (const adminOrManager of adminsAndManagers) {
          await storage.createBreakNotification({
            breakId: activeBreak.id,
            userId: adminOrManager.id,
            message,
          });
        }
      }
      
      res.json(updatedBreak);
    } catch (error: any) {
      console.error("Error ending break:", error);
      res.status(400).json({ message: error.message || "Failed to end break" });
    }
  });

  // Get user's active break
  app.get('/api/breaks/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const activeBreak = await storage.getActiveBreak(userId);
      
      res.json(activeBreak || null);
    } catch (error: any) {
      console.error("Error fetching active break:", error);
      res.status(500).json({ message: "Failed to fetch active break" });
    }
  });

  // Get break notifications (admin/manager only)
  app.get('/api/break-notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }
      
      const notifications = await storage.getAllBreakNotifications();
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching break notifications:", error);
      res.status(500).json({ message: "Failed to fetch break notifications" });
    }
  });

  // Get employee break history (admin/manager only)
  app.get('/api/employees/:id/breaks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const employeeId = req.params.id;
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Admin or Manager access required" });
      }
      
      const breaks = await storage.getUserBreaks(employeeId);
      res.json(breaks);
    } catch (error: any) {
      console.error("Error fetching employee breaks:", error);
      res.status(500).json({ message: "Failed to fetch employee breaks" });
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

  // Manually trigger weekly timesheet email - admin only
  app.post('/api/admin/send-weekly-timesheet', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      await sendWeeklyTimesheet();
      
      res.json({ success: true, message: "Weekly timesheet email sent successfully" });
    } catch (error: any) {
      console.error("Error sending weekly timesheet:", error);
      res.status(500).json({ message: error.message || "Failed to send weekly timesheet email" });
    }
  });

  // Manually trigger yearly balance reset - admin only
  app.post('/api/admin/run-yearly-reset', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const dryRun = req.query.dryRun === 'true';
      
      const result = await runYearlyBalanceReset(year, dryRun);
      
      res.json({ 
        success: true, 
        dryRun,
        message: dryRun 
          ? `Dry run completed for ${year}. No changes were made.`
          : `Yearly balance reset completed for ${year}.`,
        result 
      });
    } catch (error: any) {
      console.error("Error running yearly balance reset:", error);
      res.status(500).json({ message: error.message || "Failed to run yearly balance reset" });
    }
  });

  // ==================== CATEGORY MANAGEMENT ENDPOINTS ====================

  // Get all available categories
  app.get('/api/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Manager or Admin access required" });
      }
      
      // Return the available categories
      res.json([
        { id: 1, name: 'pete' },
        { id: 2, name: 'quincy' }
      ]);
    } catch (error: any) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Get user's categories
  app.get('/api/users/:id/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const targetUserId = req.params.id;
      const currentUser = await storage.getUser(userId);
      
      // Users can view their own categories, admins can view any
      if (targetUserId !== userId && !isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const categories = await storage.getUserCategories(targetUserId);
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching user categories:", error);
      res.status(500).json({ message: "Failed to fetch user categories" });
    }
  });

  // Add category to user - admin only
  app.post('/api/users/:id/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const targetUserId = req.params.id;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const validatedData = assignCategorySchema.parse(req.body);
      const category = await storage.addUserCategory(targetUserId, validatedData.category as CategoryType);
      
      res.json(category);
    } catch (error: any) {
      console.error("Error adding user category:", error);
      res.status(400).json({ message: error.message || "Failed to add category" });
    }
  });

  // Update user's categories (bulk replace) - admin only
  app.put('/api/users/:id/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const targetUserId = req.params.id;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const { categories } = req.body;
      if (!Array.isArray(categories)) {
        return res.status(400).json({ message: "Categories must be an array" });
      }
      
      // Validate categories
      const validCategories = ['pete', 'quincy'];
      for (const cat of categories) {
        if (!validCategories.includes(cat)) {
          return res.status(400).json({ message: `Invalid category: ${cat}` });
        }
      }
      
      // Get current categories
      const currentCategories = await storage.getUserCategories(targetUserId);
      const currentCategoryNames = currentCategories.map(c => c.category);
      
      // Remove categories that are no longer selected
      for (const cat of currentCategoryNames) {
        if (!categories.includes(cat)) {
          await storage.removeUserCategory(targetUserId, cat as CategoryType);
        }
      }
      
      // Add new categories
      for (const cat of categories) {
        if (!currentCategoryNames.includes(cat)) {
          await storage.addUserCategory(targetUserId, cat as CategoryType);
        }
      }
      
      const updatedCategories = await storage.getUserCategories(targetUserId);
      res.json(updatedCategories);
    } catch (error: any) {
      console.error("Error updating user categories:", error);
      res.status(400).json({ message: error.message || "Failed to update categories" });
    }
  });

  // Remove category from user - admin only
  app.delete('/api/users/:id/categories/:category', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const targetUserId = req.params.id;
      const category = req.params.category as CategoryType;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      if (category !== 'pete' && category !== 'quincy') {
        return res.status(400).json({ message: "Invalid category" });
      }
      
      await storage.removeUserCategory(targetUserId, category);
      
      res.json({ success: true, message: "Category removed" });
    } catch (error: any) {
      console.error("Error removing user category:", error);
      res.status(400).json({ message: error.message || "Failed to remove category" });
    }
  });

  // Get employees for current manager (filtered by shared categories)
  app.get('/api/manager/employees', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Manager or Admin access required" });
      }
      
      const employees = await storage.getEmployeesForManager(userId);
      res.json(employees);
    } catch (error: any) {
      console.error("Error fetching manager's employees:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  // ==================== TIME PUNCH APPROVAL ENDPOINTS ====================

  // Get pending approvals for manager
  app.get('/api/time-entry-approvals/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Manager or Admin access required" });
      }
      
      const pendingApprovals = await storage.getPendingApprovalsForManager(userId);
      res.json(pendingApprovals);
    } catch (error: any) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({ message: "Failed to fetch pending approvals" });
    }
  });

  // Get approval status for a time entry
  app.get('/api/time-entries/:id/approval', isAuthenticated, async (req: any, res) => {
    try {
      const timeEntryId = parseInt(req.params.id);
      const approval = await storage.getTimeEntryApproval(timeEntryId);
      res.json(approval || null);
    } catch (error: any) {
      console.error("Error fetching time entry approval:", error);
      res.status(500).json({ message: "Failed to fetch approval status" });
    }
  });

  // Approve or reject a time entry - manager/admin only
  app.post('/api/time-entry-approvals/:id/review', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const approvalId = parseInt(req.params.id);
      const currentUser = await storage.getUser(userId);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Manager or Admin access required" });
      }
      
      const validatedData = reviewTimeEntrySchema.parse(req.body);
      
      const approval = await storage.updateTimeEntryApproval(approvalId, {
        status: validatedData.status,
        reviewedBy: userId,
        notes: validatedData.notes,
      });
      
      res.json(approval);
    } catch (error: any) {
      console.error("Error reviewing time entry:", error);
      res.status(400).json({ message: error.message || "Failed to review time entry" });
    }
  });

  // Check if employee can clock in (no unapproved previous day entries)
  app.get('/api/time-entries/can-clock-in', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const hasUnapproved = await storage.hasUnapprovedPreviousDayEntry(userId);
      
      res.json({ 
        canClockIn: !hasUnapproved,
        blockedReason: hasUnapproved 
          ? "Your previous day's time punch has not been approved. Please see your manager for manual entry."
          : null
      });
    } catch (error: any) {
      console.error("Error checking clock-in eligibility:", error);
      res.status(500).json({ message: "Failed to check clock-in eligibility" });
    }
  });

  // Check if current user has unapproved entries (for employee dashboard)
  app.get('/api/time-entry-approvals/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const hasUnapproved = await storage.hasUnapprovedPreviousDayEntry(userId);
      res.json({ hasUnapprovedEntries: hasUnapproved });
    } catch (error: any) {
      console.error("Error checking approval status:", error);
      res.status(500).json({ message: "Failed to check approval status" });
    }
  });

  // PATCH endpoint for updating time entry approval status
  app.patch('/api/time-entry-approvals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const approvalId = parseInt(req.params.id);
      const currentUser = await storage.getUser(userId);
      
      if (!isAdminOrManager(currentUser)) {
        return res.status(403).json({ message: "Forbidden: Manager or Admin access required" });
      }
      
      const { status, notes } = req.body;
      
      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'approved' or 'rejected'" });
      }
      
      const approval = await storage.updateTimeEntryApproval(approvalId, {
        status,
        reviewedBy: userId,
        notes,
      });
      
      res.json(approval);
    } catch (error: any) {
      console.error("Error updating time entry approval:", error);
      res.status(400).json({ message: error.message || "Failed to update approval" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
