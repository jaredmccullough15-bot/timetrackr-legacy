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

// PTO request status enum
export const ptoRequestStatusEnum = pgEnum('pto_request_status', ['pending', 'approved', 'denied']);

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

// User storage table - Extended for employee management with PIN authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(), // Optional - only used for admin notifications
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").default('employee').notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(), // Deprecated - kept for backwards compatibility during migration
  pin: varchar("pin", { length: 4 }).unique().notNull(), // 4-digit PIN for clock in/out (unique identifier)
  payRate: numeric("pay_rate", { precision: 10, scale: 2 }).default('0').notNull(),
  sickTimeBalance: numeric("sick_time_balance", { precision: 10, scale: 2 }).default('0').notNull(),
  ptoBalance: numeric("pto_balance", { precision: 10, scale: 2 }).default('0').notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  timeEntries: many(timeEntries),
  ptoRequests: many(ptoRequests),
}));

// Time entries table for clock in/out records
export const timeEntries = pgTable(
  "time_entries",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    clockIn: timestamp("clock_in").notNull(),
    clockOut: timestamp("clock_out"),
    isSickTime: boolean("is_sick_time").default(false).notNull(),
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

// PTO requests table for tracking employee PTO requests
export const ptoRequests = pgTable(
  "pto_requests",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    hours: numeric("hours", { precision: 10, scale: 2 }).notNull(),
    status: ptoRequestStatusEnum("status").default('pending').notNull(),
    reviewedBy: varchar("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_pto_requests_user_id").on(table.userId),
    index("IDX_pto_requests_status").on(table.status),
  ]
);

export const ptoRequestsRelations = relations(ptoRequests, ({ one }) => ({
  user: one(users, {
    fields: [ptoRequests.userId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [ptoRequests.reviewedBy],
    references: [users.id],
  }),
}));

// Breaks table for tracking lunch/break times
export const breaks = pgTable(
  "breaks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time"),
    duration: integer("duration"), // Duration in minutes
    exceededLimit: boolean("exceeded_limit").default(false).notNull(), // True if break exceeded 30 minutes
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_breaks_user_id").on(table.userId),
    index("IDX_breaks_start_time").on(table.startTime),
  ]
);

export const breaksRelations = relations(breaks, ({ one }) => ({
  user: one(users, {
    fields: [breaks.userId],
    references: [users.id],
  }),
}));

// Break notifications table for alerting admins/managers about exceeded breaks
export const breakNotifications = pgTable(
  "break_notifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    breakId: integer("break_id").notNull().references(() => breaks.id, { onDelete: 'cascade' }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    message: varchar("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_break_notifications_user_id").on(table.userId),
    index("IDX_break_notifications_is_read").on(table.isRead),
  ]
);

export const breakNotificationsRelations = relations(breakNotifications, ({ one }) => ({
  break: one(breaks, {
    fields: [breakNotifications.breakId],
    references: [breaks.id],
  }),
  user: one(users, {
    fields: [breakNotifications.userId],
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
  isSickTime: z.boolean().optional().default(false),
});

export const updateTimeEntrySchema = z.object({
  clockIn: z.string().datetime().optional(),
  clockOut: z.string().datetime().optional().nullable(),
});

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  payRate: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid pay rate format").default('0'),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
});

export const pinLoginSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export const createPtoRequestSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  hours: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid hours format"),
});

export const reviewPtoRequestSchema = z.object({
  status: z.enum(['approved', 'denied']),
});

export const updatePtoBalanceSchema = z.object({
  ptoBalance: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid PTO balance format"),
});

export const startBreakSchema = z.object({
  startTime: z.string().datetime(),
});

export const endBreakSchema = z.object({
  endTime: z.string().datetime(),
});

// TypeScript types
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = typeof timeEntries.$inferInsert;
export type UpdateEmployee = z.infer<typeof updateEmployeeSchema>;
export type CreateTimeEntry = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntry = z.infer<typeof updateTimeEntrySchema>;
export type PtoRequest = typeof ptoRequests.$inferSelect;
export type CreatePtoRequest = z.infer<typeof createPtoRequestSchema>;
export type ReviewPtoRequest = z.infer<typeof reviewPtoRequestSchema>;
export type UpdatePtoBalance = z.infer<typeof updatePtoBalanceSchema>;
export type Break = typeof breaks.$inferSelect;
export type InsertBreak = typeof breaks.$inferInsert;
export type StartBreak = z.infer<typeof startBreakSchema>;
export type EndBreak = z.infer<typeof endBreakSchema>;
export type BreakNotification = typeof breakNotifications.$inferSelect;
export type InsertBreakNotification = typeof breakNotifications.$inferInsert;
