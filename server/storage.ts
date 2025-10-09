import {
  users,
  timeEntries,
  type User,
  type UpsertUser,
  type TimeEntry,
  type InsertTimeEntry,
  type UpdateEmployee,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, isNull, desc } from "drizzle-orm";

export interface IStorage {
  // User operations (Required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Employee operations
  getAllUsers(): Promise<User[]>;
  updateEmployeePayRate(id: string, payRate: string): Promise<User>;
  updateUserSickTime(id: string, sickTimeBalance: string): Promise<User>;
  
  // Time entry operations
  getUserTimeEntries(userId: string): Promise<TimeEntry[]>;
  getTimeEntriesInRange(userId: string | null, startDate: Date | null, endDate: Date | null): Promise<TimeEntry[]>;
  getActiveTimeEntry(userId: string): Promise<TimeEntry | undefined>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: number, updates: Partial<TimeEntry>): Promise<TimeEntry>;
}

export class DatabaseStorage implements IStorage {
  // User operations - Required for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
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
    conditions.push(isNull(timeEntries.clockOut).$not());

    if (conditions.length === 0) {
      return await db
        .select()
        .from(timeEntries)
        .where(isNull(timeEntries.clockOut).$not())
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
}

export const storage = new DatabaseStorage();
