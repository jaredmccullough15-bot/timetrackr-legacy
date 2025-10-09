import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User role enum
export const userRoleEnum = pgEnum('user_role', ['employee', 'manager', 'admin']);

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Extended for Replit Auth and employee management
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").default('employee').notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(), // Deprecated - kept for backwards compatibility during migration
  pinHash: varchar("pin_hash"), // Hashed 4-digit PIN for authentication
  payRate: numeric("pay_rate", { precision: 10, scale: 2 }).default('0').notNull(),
  sickTimeBalance: numeric("sick_time_balance", { precision: 10, scale: 2 }).default('0').notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  timeEntries: many(timeEntries),
}));

// Time entries table for clock in/out records
export const timeEntries = pgTable(
  "time_entries",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    clockIn: timestamp("clock_in").notNull(),
    clockOut: timestamp("clock_out"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_time_entries_user_id").on(table.userId),
    index("IDX_time_entries_clock_in").on(table.clockIn),
  ]
);

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
}));

// Zod schemas for validation
export const upsertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
});

export const updateEmployeeSchema = z.object({
  payRate: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid pay rate format"),
  isAdmin: z.boolean().optional(), // Deprecated
  role: z.enum(['employee', 'manager', 'admin']).optional(),
});

export const clockInSchema = z.object({
  clockIn: z.string().datetime(),
});

export const clockOutSchema = z.object({
  clockOut: z.string().datetime(),
});

export const reportQuerySchema = z.object({
  employeeId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const createTimeEntrySchema = z.object({
  userId: z.string(),
  clockIn: z.string().datetime(),
  clockOut: z.string().datetime().optional(),
});

export const updateTimeEntrySchema = z.object({
  clockIn: z.string().datetime().optional(),
  clockOut: z.string().datetime().optional().nullable(),
});

export const setupPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export const pinLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

// TypeScript types
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = typeof timeEntries.$inferInsert;
export type UpdateEmployee = z.infer<typeof updateEmployeeSchema>;
export type CreateTimeEntry = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntry = z.infer<typeof updateTimeEntrySchema>;
