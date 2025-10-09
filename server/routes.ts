import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  clockInSchema, 
  clockOutSchema, 
  updateEmployeeSchema,
  reportQuerySchema 
} from "@shared/schema";
import { startOfWeek, endOfWeek } from "date-fns";

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

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
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

          return {
            user,
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

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching employee list:", error);
      res.status(500).json({ message: "Failed to fetch employee list" });
    }
  });

  app.patch('/api/employees/:id/pay-rate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!currentUser?.isAdmin) {
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

  // Reports route
  app.get('/api/reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
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

      // Format entries with user data and calculations
      const reportData = entries.map(entry => {
        const user = userMap.get(entry.userId);
        const hours = entry.clockOut
          ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
          : 0;
        const pay = hours * parseFloat(user?.payRate || '0');

        return {
          entry,
          user,
          hours,
          pay,
        };
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
