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
- `/api/reports` - Payroll and time reports (admin/manager access)

**Business Logic:**
- Automatic sick time accrual (1 hour per 30 hours worked)
- Weekly hour calculations with configurable date ranges
- Pay rate management per employee
- Real-time clock status tracking

### Database Architecture

**ORM & Query Builder:**
- Drizzle ORM for type-safe database operations
- Neon PostgreSQL serverless database
- WebSocket support for serverless connections

**Schema Design:**

1. **users table** - Employee profiles with authentication data
   - Stores email, name, profile image, role (employee/manager/admin)
   - Pay rate and sick time balance tracking
   - Timestamps for record keeping
   - Legacy isAdmin field maintained for backward compatibility

2. **timeEntries table** - Clock in/out records
   - Foreign key relationship to users (cascade delete)
   - Nullable clockOut for active entries
   - Indexed by userId and timestamps for query performance

3. **sessions table** - Session management for authentication
   - Stores serialized session data
   - TTL-based expiration with index on expire column

**Data Relationships:**
- One-to-many: User → TimeEntries
- Automatic cleanup of time entries when user is deleted

### Authentication & Authorization

**Authentication Provider:**
- Replit Auth using OpenID Connect (OIDC)
- Passport.js strategy for session management
- PostgreSQL-backed session store via connect-pg-simple

**Session Management:**
- 7-day session lifetime
- HTTP-only, secure cookies
- Session data persisted in database

**Authorization Levels:**
- **Employee:** Access to own time entries and dashboard only
- **Manager:** Access to all employee data and reports, but cannot view or modify any financial information (pay rates, weekly pay, overtime pay, payroll)
- **Admin:** Full access to all employees, reports, financial data, and configuration including pay rate management and role assignments
- Role-based route protection on both frontend and backend
- Financial data filtering implemented server-side for managers

**Role Management:**
- Admins can promote/demote users between Employee, Manager, and Admin roles
- Role change UI available on both Employees page and Employee Detail page
- Users cannot change their own role (security measure)
- Role badges display on employee cards for admin and manager roles
- Shield icon buttons provide quick access to role management

### External Dependencies

**Third-Party Services:**
- Replit Auth (OIDC provider) for user authentication
- Neon Database for PostgreSQL hosting
- Google Fonts CDN for Inter font family

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