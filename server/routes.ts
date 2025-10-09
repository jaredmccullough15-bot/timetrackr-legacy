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
  setupPinSchema,
  pinLoginSchema
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

  // Setup PIN for authenticated user
  app.post('/api/auth/setup-pin', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = setupPinSchema.parse(req.body);
      
      // Hash the PIN
      const pinHash = await bcrypt.hash(validatedData.pin, 10);
      
      // Update user with PIN hash
      const updatedUser = await storage.updateUserPin(userId, pinHash);
      
      res.json({ message: "PIN setup successful", user: updatedUser });
    } catch (error: any) {
      console.error("Error setting up PIN:", error);
      res.status(400).json({ message: error.message || "Failed to setup PIN" });
    }
  });

  // Login with PIN
  app.post('/api/auth/pin-login', async (req: any, res) => {
    try {
      const validatedData = pinLoginSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or PIN" });
      }
      
      // Check if user has set up a PIN
      if (!user.pinHash) {
        return res.status(400).json({ message: "PIN not set up. Please log in with Replit Auth first." });
      }
      
      // Verify PIN
      const isPinValid = await bcrypt.compare(validatedData.pin, user.pinHash);
      if (!isPinValid) {
        return res.status(401).json({ message: "Invalid email or PIN" });
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

  const httpServer = createServer(app);
  return httpServer;
}
