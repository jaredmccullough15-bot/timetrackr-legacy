# Employee Time Clock Application

## Overview

This is a professional employee time tracking system with automated sick time accrual, payroll calculation, and comprehensive reporting for managers. The application provides distinct interfaces for employees (clock in/out, view hours) and administrators (manage employees, view reports, configure pay rates).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React with TypeScript for type-safe UI development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- React Query (TanStack Query) for server state management and API caching

**UI Component System:**
- Shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Material Design principles with Linear-inspired refinements
- Custom theme system supporting light/dark modes via CSS variables
- Inter font family for typography

**Design Philosophy:**
- Efficiency-first approach minimizing clicks for daily operations
- Clear data hierarchy with instant visibility of critical information
- Role-based UI separation between employee and admin interfaces
- Professional presentation emphasizing trust and accuracy

**State Management:**
- React Query for server state with automatic cache invalidation
- Local component state for UI interactions
- Session-based authentication state

### Backend Architecture

**Runtime & Framework:**
- Node.js with Express.js for the HTTP server
- TypeScript with ESM modules
- Development server with hot module replacement via Vite middleware

**API Structure:**
- RESTful API endpoints under `/api` prefix
- Authentication middleware protecting all routes
- Request validation using Zod schemas
- Centralized error handling

**Key API Endpoints:**
- `/api/auth/user` - Get authenticated user information
- `/api/time-entries/*` - Clock in/out and time entry management
- `/api/employees` - Employee management (admin/manager access)
- `/api/employees/:id/role` - Role management (admin-only, PATCH)
- `/api/employees/:id/pto` - PTO balance management (admin/manager, PATCH)
- `/api/pto-requests` - PTO request creation and management (GET/POST)
- `/api/pto-requests/:id` - PTO request approval/denial (admin/manager, PATCH)
- `/api/pto-requests/:id/unapprove` - Revoke approved PTO and refund hours to balance (admin/manager, POST)
- `/api/breaks/start` - Start a break (employee, requires active clock-in)
- `/api/breaks/end` - End break, flag overtime, notify admins (employee)
- `/api/breaks/active` - Get active break for timer display (employee)
- `/api/break-notifications` - Get break overtime notifications (admin/manager)
- `/api/reports` - Payroll and time reports (admin/manager access)

**Business Logic:**
- **Quarter-hour rounding on clock-in:**
  - Clock-in times automatically round to nearest 15-minute interval (:00, :15, :30, :45)
  - Accounts for seconds and milliseconds in rounding calculation
  - Midpoint behavior: 7.5 minutes rounds up (e.g., 9:07:30 → 9:15)
  - Examples: 5:53am → 6:00am, 9:08am → 9:15am, 9:22am → 9:15am
  - Implemented in roundToNearestQuarterHour() utility function
- Automatic sick time accrual (1 hour per 30 hours worked)
- **PTO request/approval workflow with balance validation:**
  - Employees can submit PTO requests
  - Managers/admins can approve or deny requests
  - Approved requests automatically deduct hours from employee's PTO balance
  - **Unapproval feature:** Managers/admins can revoke approved PTO, returning hours to employee's balance
  - **Conflict detection:** When reviewing a PTO request, the system shows other employees with approved PTO during the same dates
  - **PTO Calendar:** Visual monthly calendar showing all approved time off across the team
- Weekly hour calculations with configurable date ranges
- Pay rate and PTO balance management per employee
- Real-time clock status tracking
- Separate sick time and PTO balances
- **Break tracking with pay deduction:**
  - Employees can take breaks while clocked in
  - Breaks are paid time (hourly rate continues during break)
  - 30-minute threshold for break overtime
  - If break exceeds 30 minutes: 1 hour of pay is deducted per exceeded break
  - Multiple exceeded breaks result in multiple 1-hour deductions
  - Deductions applied at clock-out (clock-out time adjusted backwards)
  - Safeguard prevents negative hours worked (minimum 0 hours)
  - Admins and managers receive notifications when breaks exceed 30 minutes

### Database Architecture

**ORM & Query Builder:**
- Drizzle ORM for type-safe database operations
- Neon PostgreSQL serverless database
- WebSocket support for serverless connections

**Schema Design:**

1. **users table** - Employee profiles with authentication data
   - Stores email (optional), name (required), profile image, role (employee/manager/admin)
   - 4-digit PIN for authentication (unique, required, plain text)
   - Pay rate, sick time balance, and PTO balance tracking
   - Timestamps for record keeping
   - Legacy isAdmin field maintained for backward compatibility

2. **timeEntries table** - Clock in/out records
   - Foreign key relationship to users (cascade delete)
   - Nullable clockOut for active entries
   - Indexed by userId and timestamps for query performance

3. **ptoRequests table** - PTO request tracking and approval workflow
   - Foreign key relationship to users (cascade delete)
   - Start date, end date, and hours requested
   - Status: pending/approved/denied
   - Reviewer tracking (who approved/denied and when)
   - Indexed by userId and status for query performance

4. **breaks table** - Break/lunch tracking with overtime detection
   - Foreign key relationship to users (cascade delete)
   - Start time, end time (nullable for active breaks), duration in minutes
   - exceededLimit flag (true if break > 30 minutes)
   - Indexed by userId and startTime for query performance

5. **breakNotifications table** - Break overtime notifications for admins/managers
   - Foreign key relationship to breaks and users (cascade delete)
   - Message text, isRead flag, timestamps
   - Indexed by userId and isRead for query performance

6. **sessions table** - Session management for authentication
   - Stores serialized session data
   - TTL-based expiration with index on expire column

**Data Relationships:**
- One-to-many: User → TimeEntries
- One-to-many: User → Breaks
- One-to-many: Break → BreakNotifications
- Automatic cleanup of time entries, breaks, and notifications when user is deleted

### Authentication & Authorization

**Authentication Model:**
- **Employees:** PIN-only authentication (4-digit unique PIN)
- **Admins:** Replit Auth using OpenID Connect (OIDC) for initial setup
- Passport.js strategy for session management
- PostgreSQL-backed session store via connect-pg-simple

**PIN-Based Authentication Flow:**
1. **Admin Setup:** Admins log in via Replit Auth and are auto-assigned a unique 4-digit PIN
2. **Employee Creation:** Admins create employee accounts and assign 4-digit PINs
3. **Employee Login:** Employees enter only their PIN to clock in/out (no email required)
4. **PIN Storage:** PINs stored as plain text (4-digit varchar, unique constraint)

**Session Management:**
- 7-day session lifetime
- HTTP-only, secure cookies
- Session data persisted in database

**Authorization Levels:**
- **Employee:** Access to own time entries and dashboard only
- **Manager:** Access to all employee data and reports, but cannot view or modify any financial information (pay rates, weekly pay, overtime pay, payroll)
- **Admin:** Full access to all employees, reports, financial data, employee creation, and configuration including pay rate management and role assignments
- Role-based route protection on both frontend and backend
- Financial data filtering implemented server-side for managers

**Role Management:**
- Admins can promote/demote users between Employee, Manager, and Admin roles
- Admins can create new employee accounts with assigned PINs
- Role change UI available on both Employees page and Employee Detail page
- Users cannot change their own role (security measure)
- Role badges display on employee cards for admin and manager roles
- Shield icon buttons provide quick access to role management

### External Dependencies

**Third-Party Services:**
- Replit Auth (OIDC provider) for user authentication
- Neon Database for PostgreSQL hosting
- Google Fonts CDN for Inter font family
- Microsoft Outlook (via Graph API) for email notifications

**Email Notifications:**
- PTO request submission: All managers and admins receive email notification
- PTO approval/denial: Employee receives email notification with decision details
- Weekly timesheet report: Automated email every Friday at 8:00 AM EST to Mat@mihealthquotes.com and jared@mihealthquotes.com
  - Contains all employee names and their total hours for the week (Sunday-Saturday)
  - Automatically adds 8 hours to each employee's total to account for Friday
  - Can be manually triggered by admins via POST /api/admin/send-weekly-timesheet
- Emails sent via connected Outlook account using Microsoft Graph API
- Email failures are logged but don't block the main operation

**Yearly Balance Reset (January 1st):**
- Automatically runs at midnight EST on January 1st each year
- Resets sick time to 72 hours for ALL employees
- Resets PTO to 64 hours for employees WITHOUT approved PTO for the new year
- Employees with already-approved PTO for the new year keep their current PTO balance
- Can be manually triggered by admins via POST /api/admin/run-yearly-reset?year=2026&dryRun=true
  - dryRun=true shows what would change without making changes

**Key NPM Packages:**
- `@neondatabase/serverless` - Neon database client
- `drizzle-orm` - Database ORM
- `passport` & `openid-client` - Authentication
- `@tanstack/react-query` - Data fetching and caching
- `@radix-ui/*` - Unstyled accessible UI primitives
- `date-fns` - Date manipulation utilities
- `zod` - Runtime type validation

**Development Tools:**
- `tsx` - TypeScript execution for development
- `esbuild` - Production bundling
- `tailwindcss` - CSS framework
- `vite` - Development server and build tool