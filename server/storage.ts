import {
  users,
  timeEntries,
  ptoRequests,
  breaks,
  breakNotifications,
  userCategories,
  timeEntryApprovals,
  type User,
  type UpsertUser,
  type TimeEntry,
  type InsertTimeEntry,
  type UpdateEmployee,
  type CreateTimeEntry,
  type UpdateTimeEntry,
  type PtoRequest,
  type CreatePtoRequest,
  type Break,
  type InsertBreak,
  type BreakNotification,
  type InsertBreakNotification,
  type UserCategory,
  type CategoryType,
  type TimeEntryApproval,
  type TimeEntryApprovalStatus,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, isNull, not, desc, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPin(pin: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createEmployee(employee: { firstName: string; lastName: string; pin: string; payRate: string; email?: string | null }): Promise<User>;
  
  // Employee operations
  getAllUsers(): Promise<User[]>;
  updateEmployeePayRate(id: string, payRate: string): Promise<User>;
  updateUserSickTime(id: string, sickTimeBalance: string): Promise<User>;
  updateUserRole(id: string, role: 'employee' | 'manager' | 'admin'): Promise<User>;
  updateEmployee(id: string, updates: { payRate?: string; ptoBalance?: string }): Promise<User>;
  deleteEmployee(id: string): Promise<void>;
  
  // Time entry operations
  getUserTimeEntries(userId: string): Promise<TimeEntry[]>;
  getTimeEntriesInRange(userId: string | null, startDate: Date | null, endDate: Date | null): Promise<TimeEntry[]>;
  getActiveTimeEntry(userId: string): Promise<TimeEntry | undefined>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: number, updates: Partial<TimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: number): Promise<void>;
  getTimeEntry(id: number): Promise<TimeEntry | undefined>;
  
  // PTO request operations
  createPtoRequest(request: { userId: string; startDate: Date; endDate: Date; hours: string; status: 'pending' | 'approved' | 'denied' }): Promise<PtoRequest>;
  getAllPtoRequests(): Promise<PtoRequest[]>;
  getUserPtoRequests(userId: string): Promise<PtoRequest[]>;
  getPtoRequest(id: number): Promise<PtoRequest | undefined>;
  updatePtoRequest(id: number, updates: { status?: 'pending' | 'approved' | 'denied'; reviewedBy?: string; reviewedAt?: Date }): Promise<PtoRequest>;
  
  // Break operations
  createBreak(breakData: { userId: string; startTime: Date }): Promise<Break>;
  getActiveBreak(userId: string): Promise<Break | undefined>;
  updateBreak(id: number, updates: { endTime?: Date; duration?: number; exceededLimit?: boolean }): Promise<Break>;
  getUserBreaks(userId: string): Promise<Break[]>;
  getBreak(id: number): Promise<Break | undefined>;
  
  // Break notification operations
  createBreakNotification(notification: { breakId: number; userId: string; message: string }): Promise<BreakNotification>;
  getAllBreakNotifications(): Promise<BreakNotification[]>;
  getUnreadBreakNotifications(): Promise<BreakNotification[]>;
  markBreakNotificationAsRead(id: number): Promise<BreakNotification>;
  
  // Category operations
  getUserCategories(userId: string): Promise<UserCategory[]>;
  addUserCategory(userId: string, category: CategoryType): Promise<UserCategory>;
  removeUserCategory(userId: string, category: CategoryType): Promise<void>;
  getUsersByCategory(category: CategoryType): Promise<User[]>;
  getManagersByCategory(category: CategoryType): Promise<User[]>;
  getEmployeesForManager(managerId: string): Promise<User[]>;
  
  // Time entry approval operations
  createTimeEntryApproval(timeEntryId: number): Promise<TimeEntryApproval>;
  getTimeEntryApproval(timeEntryId: number): Promise<TimeEntryApproval | undefined>;
  updateTimeEntryApproval(id: number, updates: { status: TimeEntryApprovalStatus; reviewedBy: string; notes?: string }): Promise<TimeEntryApproval>;
  getPendingApprovalsForManager(managerId: string): Promise<{ approval: TimeEntryApproval; entry: TimeEntry; user: User }[]>;
  getPendingApprovalsForDate(date: Date): Promise<{ approval: TimeEntryApproval; entry: TimeEntry; user: User }[]>;
  hasUnapprovedPreviousDayEntry(userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations - Required for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPin(pin: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.pin, pin));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user exists
    const existingUser = await this.getUser(userData.id!);
    
    if (existingUser) {
      // Update existing user (keep their PIN)
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName!,
          lastName: userData.lastName!,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id!))
        .returning();
      return user;
    }
    
    // Generate a unique 4-digit PIN for new admin users (via Replit Auth)
    let pin = '';
    let isUnique = false;
    while (!isUnique) {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
      const existingPinUser = await this.getUserByPin(pin);
      if (!existingPinUser) {
        isUnique = true;
      }
    }
    
    // Create new user with auto-generated PIN (for Replit Auth admins)
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        firstName: userData.firstName!,
        lastName: userData.lastName!,
        pin,
        role: 'admin', // Replit Auth users are admins
        payRate: '0',
        sickTimeBalance: '0',
      })
      .returning();
    return user;
  }

  async createEmployee(employee: { firstName: string; lastName: string; pin: string; payRate: string; email?: string | null }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        firstName: employee.firstName,
        lastName: employee.lastName,
        pin: employee.pin,
        payRate: employee.payRate,
        email: employee.email || null,
        role: 'employee',
        sickTimeBalance: '0',
      })
      .returning();
    
    if (!user) {
      throw new Error("Failed to create employee");
    }
    
    return user;
  }

  // Employee operations
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.firstName, users.lastName);
  }

  async updateEmployeePayRate(id: string, payRate: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ payRate, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    return user;
  }

  async updateUserSickTime(id: string, sickTimeBalance: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ sickTimeBalance, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    return user;
  }

  async updateUserRole(id: string, role: 'employee' | 'manager' | 'admin'): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    return user;
  }

  // Time entry operations
  async getUserTimeEntries(userId: string): Promise<TimeEntry[]> {
    return await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.userId, userId))
      .orderBy(desc(timeEntries.clockIn));
  }

  async getTimeEntriesInRange(
    userId: string | null,
    startDate: Date | null,
    endDate: Date | null
  ): Promise<TimeEntry[]> {
    const conditions = [];
    
    if (userId) {
      conditions.push(eq(timeEntries.userId, userId));
    }
    
    if (startDate) {
      conditions.push(gte(timeEntries.clockIn, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(timeEntries.clockIn, endDate));
    }

    // Only include completed entries (with clockOut)
    conditions.push(not(isNull(timeEntries.clockOut)));

    if (conditions.length === 0) {
      return await db
        .select()
        .from(timeEntries)
        .where(not(isNull(timeEntries.clockOut)))
        .orderBy(desc(timeEntries.clockIn));
    }

    return await db
      .select()
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.clockIn));
  }

  async getActiveTimeEntry(userId: string): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.userId, userId),
        isNull(timeEntries.clockOut)
      ))
      .orderBy(desc(timeEntries.clockIn))
      .limit(1);
    
    return entry;
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const [newEntry] = await db
      .insert(timeEntries)
      .values(entry)
      .returning();
    
    return newEntry;
  }

  async updateTimeEntry(id: number, updates: Partial<TimeEntry>): Promise<TimeEntry> {
    const [entry] = await db
      .update(timeEntries)
      .set(updates)
      .where(eq(timeEntries.id, id))
      .returning();
    
    if (!entry) {
      throw new Error("Time entry not found");
    }
    
    return entry;
  }

  async deleteTimeEntry(id: number): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async getTimeEntry(id: number): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.id, id));
    return entry;
  }

  // General employee update method
  async updateEmployee(id: string, updates: { payRate?: string; ptoBalance?: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    return user;
  }

  async deleteEmployee(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // PTO request operations
  async createPtoRequest(request: { userId: string; startDate: Date; endDate: Date; hours: string; status: 'pending' | 'approved' | 'denied' }): Promise<PtoRequest> {
    const [newRequest] = await db
      .insert(ptoRequests)
      .values(request)
      .returning();
    
    return newRequest;
  }

  async getAllPtoRequests(): Promise<PtoRequest[]> {
    return await db
      .select()
      .from(ptoRequests)
      .orderBy(desc(ptoRequests.createdAt));
  }

  async getUserPtoRequests(userId: string): Promise<PtoRequest[]> {
    return await db
      .select()
      .from(ptoRequests)
      .where(eq(ptoRequests.userId, userId))
      .orderBy(desc(ptoRequests.createdAt));
  }

  async getPtoRequest(id: number): Promise<PtoRequest | undefined> {
    const [request] = await db
      .select()
      .from(ptoRequests)
      .where(eq(ptoRequests.id, id));
    return request;
  }

  async updatePtoRequest(id: number, updates: { status?: 'pending' | 'approved' | 'denied'; reviewedBy?: string | null; reviewedAt?: Date | null }): Promise<PtoRequest> {
    const [request] = await db
      .update(ptoRequests)
      .set(updates)
      .where(eq(ptoRequests.id, id))
      .returning();
    
    if (!request) {
      throw new Error("PTO request not found");
    }
    
    return request;
  }

  // Break operations
  async createBreak(breakData: { userId: string; startTime: Date }): Promise<Break> {
    const [newBreak] = await db
      .insert(breaks)
      .values(breakData)
      .returning();
    
    return newBreak;
  }

  async getActiveBreak(userId: string): Promise<Break | undefined> {
    const [activeBreak] = await db
      .select()
      .from(breaks)
      .where(and(
        eq(breaks.userId, userId),
        isNull(breaks.endTime)
      ))
      .orderBy(desc(breaks.startTime))
      .limit(1);
    
    return activeBreak;
  }

  async updateBreak(id: number, updates: { endTime?: Date; duration?: number; exceededLimit?: boolean }): Promise<Break> {
    const [updatedBreak] = await db
      .update(breaks)
      .set(updates)
      .where(eq(breaks.id, id))
      .returning();
    
    if (!updatedBreak) {
      throw new Error("Break not found");
    }
    
    return updatedBreak;
  }

  async getUserBreaks(userId: string): Promise<Break[]> {
    return await db
      .select()
      .from(breaks)
      .where(eq(breaks.userId, userId))
      .orderBy(desc(breaks.startTime));
  }

  async getBreak(id: number): Promise<Break | undefined> {
    const [breakRecord] = await db
      .select()
      .from(breaks)
      .where(eq(breaks.id, id));
    
    return breakRecord;
  }

  // Break notification operations
  async createBreakNotification(notification: { breakId: number; userId: string; message: string }): Promise<BreakNotification> {
    const [newNotification] = await db
      .insert(breakNotifications)
      .values(notification)
      .returning();
    
    return newNotification;
  }

  async getAllBreakNotifications(): Promise<BreakNotification[]> {
    return await db
      .select()
      .from(breakNotifications)
      .orderBy(desc(breakNotifications.createdAt));
  }

  async getUnreadBreakNotifications(): Promise<BreakNotification[]> {
    return await db
      .select()
      .from(breakNotifications)
      .where(eq(breakNotifications.isRead, false))
      .orderBy(desc(breakNotifications.createdAt));
  }

  async markBreakNotificationAsRead(id: number): Promise<BreakNotification> {
    const [notification] = await db
      .update(breakNotifications)
      .set({ isRead: true })
      .where(eq(breakNotifications.id, id))
      .returning();
    
    if (!notification) {
      throw new Error("Break notification not found");
    }
    
    return notification;
  }

  // Category operations
  async getUserCategories(userId: string): Promise<UserCategory[]> {
    return await db
      .select()
      .from(userCategories)
      .where(eq(userCategories.userId, userId));
  }

  async addUserCategory(userId: string, category: CategoryType): Promise<UserCategory> {
    // Check if already exists
    const existing = await db
      .select()
      .from(userCategories)
      .where(and(
        eq(userCategories.userId, userId),
        eq(userCategories.category, category)
      ));
    
    if (existing.length > 0) {
      return existing[0];
    }

    const [newCategory] = await db
      .insert(userCategories)
      .values({ userId, category })
      .returning();
    
    return newCategory;
  }

  async removeUserCategory(userId: string, category: CategoryType): Promise<void> {
    await db
      .delete(userCategories)
      .where(and(
        eq(userCategories.userId, userId),
        eq(userCategories.category, category)
      ));
  }

  async getUsersByCategory(category: CategoryType): Promise<User[]> {
    const categoryUsers = await db
      .select()
      .from(userCategories)
      .where(eq(userCategories.category, category));
    
    if (categoryUsers.length === 0) return [];
    
    const userIds = categoryUsers.map(uc => uc.userId);
    return await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds))
      .orderBy(users.firstName, users.lastName);
  }

  async getManagersByCategory(category: CategoryType): Promise<User[]> {
    const categoryUsers = await db
      .select()
      .from(userCategories)
      .where(eq(userCategories.category, category));
    
    if (categoryUsers.length === 0) return [];
    
    const userIds = categoryUsers.map(uc => uc.userId);
    return await db
      .select()
      .from(users)
      .where(and(
        inArray(users.id, userIds),
        inArray(users.role, ['manager', 'admin'])
      ))
      .orderBy(users.firstName, users.lastName);
  }

  async getEmployeesForManager(managerId: string): Promise<User[]> {
    // Get manager's categories
    const managerCategories = await this.getUserCategories(managerId);
    if (managerCategories.length === 0) return [];
    
    const categories = managerCategories.map(mc => mc.category);
    
    // Get all users in those categories
    const categoryUsers = await db
      .select()
      .from(userCategories)
      .where(inArray(userCategories.category, categories));
    
    if (categoryUsers.length === 0) return [];
    
    const userIds = Array.from(new Set(categoryUsers.map(uc => uc.userId)));
    
    // Return employees (not including the manager themselves)
    return await db
      .select()
      .from(users)
      .where(and(
        inArray(users.id, userIds),
        not(eq(users.id, managerId)),
        eq(users.role, 'employee')
      ))
      .orderBy(users.firstName, users.lastName);
  }

  // Time entry approval operations
  async createTimeEntryApproval(timeEntryId: number): Promise<TimeEntryApproval> {
    const [approval] = await db
      .insert(timeEntryApprovals)
      .values({ timeEntryId })
      .returning();
    
    return approval;
  }

  async getTimeEntryApproval(timeEntryId: number): Promise<TimeEntryApproval | undefined> {
    const [approval] = await db
      .select()
      .from(timeEntryApprovals)
      .where(eq(timeEntryApprovals.timeEntryId, timeEntryId));
    
    return approval;
  }

  async updateTimeEntryApproval(id: number, updates: { status: TimeEntryApprovalStatus; reviewedBy: string; notes?: string }): Promise<TimeEntryApproval> {
    const [approval] = await db
      .update(timeEntryApprovals)
      .set({
        status: updates.status,
        reviewedBy: updates.reviewedBy,
        reviewedAt: new Date(),
        notes: updates.notes || null,
      })
      .where(eq(timeEntryApprovals.id, id))
      .returning();
    
    if (!approval) {
      throw new Error("Time entry approval not found");
    }
    
    return approval;
  }

  async getPendingApprovalsForManager(managerId: string): Promise<{ approval: TimeEntryApproval; entry: TimeEntry; user: User }[]> {
    // Get employees this manager oversees
    const employees = await this.getEmployeesForManager(managerId);
    if (employees.length === 0) return [];
    
    const employeeIds = employees.map(e => e.id);
    
    // Get pending approvals for those employees
    const pendingApprovals = await db
      .select()
      .from(timeEntryApprovals)
      .where(eq(timeEntryApprovals.status, 'pending'));
    
    const results: { approval: TimeEntryApproval; entry: TimeEntry; user: User }[] = [];
    
    for (const approval of pendingApprovals) {
      const entry = await this.getTimeEntry(approval.timeEntryId);
      if (entry && employeeIds.includes(entry.userId)) {
        const user = employees.find(e => e.id === entry.userId);
        if (user) {
          results.push({ approval, entry, user });
        }
      }
    }
    
    return results;
  }

  async getPendingApprovalsForDate(date: Date): Promise<{ approval: TimeEntryApproval; entry: TimeEntry; user: User }[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Get time entries for that date
    const entries = await db
      .select()
      .from(timeEntries)
      .where(and(
        gte(timeEntries.clockIn, startOfDay),
        lte(timeEntries.clockIn, endOfDay)
      ));
    
    const results: { approval: TimeEntryApproval; entry: TimeEntry; user: User }[] = [];
    
    for (const entry of entries) {
      const approval = await this.getTimeEntryApproval(entry.id);
      if (approval && approval.status === 'pending') {
        const user = await this.getUser(entry.userId);
        if (user) {
          results.push({ approval, entry, user });
        }
      }
    }
    
    return results;
  }

  async hasUnapprovedPreviousDayEntry(userId: string): Promise<boolean> {
    // Get yesterday's date (skip weekends)
    const today = new Date();
    const previousBusinessDay = new Date(today);
    
    // Go back to previous business day
    do {
      previousBusinessDay.setDate(previousBusinessDay.getDate() - 1);
    } while (previousBusinessDay.getDay() === 0 || previousBusinessDay.getDay() === 6);
    
    const startOfPrevDay = new Date(previousBusinessDay);
    startOfPrevDay.setHours(0, 0, 0, 0);
    const endOfPrevDay = new Date(previousBusinessDay);
    endOfPrevDay.setHours(23, 59, 59, 999);
    
    // Get time entries for previous business day
    const entries = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.clockIn, startOfPrevDay),
        lte(timeEntries.clockIn, endOfPrevDay),
        not(isNull(timeEntries.clockOut))
      ));
    
    // Check if any have unapproved status
    for (const entry of entries) {
      const approval = await this.getTimeEntryApproval(entry.id);
      if (approval && approval.status === 'pending') {
        return true;
      }
    }
    
    return false;
  }
}

export const storage = new DatabaseStorage();
