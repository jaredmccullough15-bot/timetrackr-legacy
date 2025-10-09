# Employee Time Clock Application - Design Guidelines

## Design Approach
**System Selected:** Material Design with Linear-inspired refinements
**Justification:** This is a utility-focused productivity application requiring clear data hierarchy, efficient workflows, and stability. Material Design provides robust component patterns for forms, tables, and data display, while Linear's aesthetic brings modern polish to enterprise tools.

**Key Principles:**
- Efficiency First: Minimize clicks for daily clock in/out actions
- Clear Data Hierarchy: Instant visibility of critical information (hours worked, sick time balance)
- Role-Based Clarity: Distinct visual separation between employee and admin interfaces
- Trust & Accuracy: Professional presentation reinforcing time tracking reliability

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary: 220 90% 56% (Professional blue for actions/buttons)
- Surface: 0 0% 98% (Clean background)
- Surface Elevated: 0 0% 100% (Cards, panels)
- Text Primary: 220 15% 20%
- Text Secondary: 220 10% 45%
- Success (Clocked In): 142 71% 45%
- Warning (Approaching Overtime): 38 92% 50%
- Border: 220 15% 90%

**Dark Mode:**
- Primary: 220 90% 65%
- Surface: 220 15% 12%
- Surface Elevated: 220 15% 16%
- Text Primary: 220 15% 95%
- Text Secondary: 220 10% 70%
- Success: 142 71% 55%
- Warning: 38 92% 60%
- Border: 220 15% 25%

### B. Typography
- **Primary Font:** Inter (Google Fonts) - Clean, professional, excellent for data
- **Headings:** 600-700 weight, tracking-tight
- **Body:** 400 weight for content, 500 for emphasis
- **Data Display:** Tabular numbers (font-feature-settings: 'tnum'), monospace for time stamps
- **Scale:** text-sm for labels, text-base for body, text-lg/xl for headings, text-3xl/4xl for dashboard stats

### C. Layout System
**Spacing Primitives:** Tailwind units of 4, 6, 8, 12, 16 for consistent rhythm
- Component padding: p-4 to p-6
- Section spacing: space-y-8 to space-y-12
- Card gaps: gap-6 to gap-8
- Page margins: px-4 md:px-8 lg:px-12

**Grid Structure:**
- Max-width container: max-w-7xl mx-auto for admin dashboards
- Employee interface: max-w-2xl mx-auto (focused, minimal)
- Admin tables: Full width with horizontal scroll on mobile

### D. Component Library

**Employee Interface Components:**
1. **Clock In/Out Button:** Large, prominent touch target (min-h-24), state-aware colors (green when clocked in, blue when out), displays current status and last action timestamp
2. **Status Card:** Elevated card showing current week hours, sick time balance, pay rate - uses grid-cols-2 md:grid-cols-3 for stats
3. **Weekly Summary:** Simple table or card list showing daily punch records for current week

**Admin Dashboard Components:**
1. **Employee Grid:** Cards in grid-cols-1 md:grid-cols-2 lg:grid-cols-3 showing quick stats per employee (hours worked, status, sick time)
2. **Data Table:** Comprehensive punch log with sortable columns (Employee, Date, Clock In, Clock Out, Hours, Pay), sticky header, alternating row colors
3. **Date Range Picker:** Clean dual-input with calendar popovers, preset options (This Week, Last Week, This Month)
4. **Report Summary Cards:** Key metrics displayed as stat cards (Total Hours, Total Pay, Active Employees) in 3-column grid
5. **Filter Panel:** Sidebar or top bar with employee selector, status filters, export button

**Shared Components:**
- Navigation: Top bar with logo, user info, logout (employee); sidebar navigation (admin)
- Forms: Consistent input styling with floating labels, clear validation states
- Buttons: Primary (filled), Secondary (outline), Ghost for tertiary actions
- Toast Notifications: Bottom-right for success/error feedback on actions

### E. Interaction Patterns

**Employee Flow:**
- Login → Dashboard (shows clock status immediately)
- Single-click punch in/out with confirmation toast
- Real-time hour counter when clocked in
- Weekly summary auto-updates on punch actions

**Admin Flow:**
- Dashboard overview → Detailed reports
- Quick employee search/filter
- One-click report generation with download options
- Inline editing for pay rates (if admin has permission)

**Animations:** Minimal, purposeful only
- Smooth state transitions on clock in/out (200ms)
- Table row hover lift (subtle shadow)
- Toast slide-in animations
- Loading skeletons for data tables

## Layout Specifications

**Employee Dashboard:**
- Centered column layout (max-w-2xl)
- Hero-style clock button section with current time display
- Stats cards below in responsive grid
- Recent activity timeline/list

**Admin Dashboard:**
- Sidebar navigation (240px) on desktop, hamburger on mobile  
- Main content area with header (breadcrumbs, actions)
- Dashboard: 3-column stat cards + employee grid below
- Reports page: Filters top/side + full-width data table
- Employee detail view: Split layout (profile left, time records right)

**Consistent Elements:**
- Sticky headers for tables during scroll
- Floating action buttons for primary actions (mobile)
- Breadcrumb navigation in admin
- Clear role indicator in header (Employee vs Admin view)

## Accessibility & Responsiveness
- Maintain dark mode consistency across all inputs and tables
- Touch targets minimum 44x44px for mobile clock buttons
- Keyboard navigation support for all admin tables
- ARIA labels for status indicators
- High contrast ratios for all text (WCAG AA minimum)
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)