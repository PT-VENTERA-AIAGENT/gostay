

# BookMe.id — Full Frontend Enhancement Plan

## Overview
Add Framer Motion animations, full mobile responsiveness, and an enhanced Analytics v2 with exportable reports across all 20+ pages in a single implementation pass.

## Technical Approach

### Dependencies to Add
- `framer-motion` for animations and page transitions

### 1. Animation System (Framer Motion)

**App.tsx — Page Transitions**
- Wrap `<Routes>` with `<AnimatePresence>` and apply `motion.div` fade+slide transitions on route changes using a shared `PageTransition` wrapper component.

**Shared `PageTransition.tsx` component**
- Reusable wrapper: fade-in-up on mount, fade-out on exit (0.3s ease-out).
- Used by every page component.

**Staggered List Animations (all list/table pages)**
- Bookings table rows, Room cards, Call Logs rows, User Management rows, Chat thread list, Portal room cards, MyAccount booking cards — each item staggers in with `variants` (0.05s delay per item).
- Dashboard stat cards, chart cards — stagger children on mount.

**Hover/Micro-interactions**
- Room status cards: `whileHover={{ scale: 1.02, y: -2 }}` + shadow lift.
- Sidebar nav items: subtle `whileHover` + `whileTap={{ scale: 0.98 }}`.
- Buttons globally: `whileTap={{ scale: 0.97 }}`.
- Portal room cards: hover lift with shadow transition.
- Chat messages: slide-in from left/right on mount.
- Booking calendar bars: fade+scale on mount.
- Tab switches: `layoutId` underline animation for active tab indicators (Bookings, CallLogs, UserManagement).

**Portal-specific**
- Hero section: staggered text + search bar entrance.
- "Why Book Direct" cards: stagger with scroll-triggered `whileInView`.
- Reviews carousel: fade transitions.
- Booking flow steps (Details > Review > Confirmation): slide-left/right page transitions.
- Confirmation page: success icon scale-bounce animation.

### 2. Mobile Responsive Polish

**StaffLayout.tsx — Collapsible Sidebar + Mobile Bottom Nav**
- Sidebar hidden on mobile (`hidden md:flex`), replaced by a bottom navigation bar with 5 key icons (Dashboard, Bookings, Rooms, Chat, More).
- "More" opens a sheet/drawer with remaining nav items.
- Hamburger menu in TopBar for tablet to toggle sidebar overlay.

**TopBar.tsx**
- Responsive: hide search on small screens, show icon-only mode.
- Stack user info on mobile.

**PortalLayout.tsx — Mobile Header + Bottom Nav**
- Header nav collapses to hamburger on mobile.
- Bottom nav bar for portal on mobile with Home, Bookings, Chat, Account icons.
- Footer collapses from 4-col to 2-col to 1-col.

**All Staff Pages (responsive grid adjustments)**
- **Dashboard (Index.tsx)**: Right sidebar moves below main content on < lg. StatCards: 2-col on mobile. Charts: full-width stack.
- **Rooms**: Status cards 2-col on mobile, room grid 2-col. Filters scroll horizontally.
- **Bookings**: Table becomes card-based on mobile. Calendar view horizontal scroll. Search bar full-width.
- **BookingDetail**: 3-col to 1-col stack. Actions collapse into dropdown menu.
- **NewBooking**: 3-col to 1-col. Price summary moves below form.
- **Chat**: Thread list as full screen on mobile, chat area as separate view. Toggle between list/chat.
- **CallLogs**: Table becomes card list on mobile. Horizontally scrollable on tablet.
- **Analytics**: KPIs 2-col on mobile. Charts full-width stack. Tables scroll horizontal.
- **UserManagement**: Table becomes card list on mobile. Stats 2-col.

**Portal Pages**
- **PortalHome**: Hero text smaller, search form stacks vertically. Room cards 1-col. "Why Book Direct" 2-col then 1-col. Reviews 1-col.
- **PortalRoomDetail**: Gallery 1-col stack. Booking card moves below content. 
- **BookingDetails/Review**: Form fields stack. Summary sidebar below on mobile.
- **MyAccount**: Profile card stacks vertically. Booking cards full-width.
- **PortalChat**: Full-width chat on mobile. Input bar sticky bottom.

**Auth Pages**
- Already centered/max-width — just ensure padding and input sizing for small screens.

### 3. Analytics Dashboard v2

**Enhanced `Analytics.tsx`**
- Add date range picker (custom component with preset options: Today, 7d, 30d, Quarter, Year, Custom).
- Add "Export PDF" button alongside existing CSV — triggers client-side PDF generation using the browser print API (`window.print()` with a print-optimized CSS class).
- Export CSV button made functional: generates CSV from mock data and triggers download via `Blob` + `URL.createObjectURL`.

**New Charts/Widgets**
- **Guest Demographics**: Horizontal bar chart showing nationality distribution.
- **Average Daily Rate (ADR) Trend**: Line chart showing ADR over time.
- **RevPAR widget**: KPI card with sparkline.
- **Guest Satisfaction Score**: Gauge-style visual or large number with trend.
- **Channel Performance Comparison**: Grouped bar chart comparing revenue by booking source.

**Exportable Report Layout**
- A `@media print` CSS section that formats Analytics page cleanly for PDF: hide sidebar, navigation, and interactive elements; format charts at fixed widths; add page breaks between sections; add header with hotel name and date range.

### Files to Create
- `src/components/shared/PageTransition.tsx` — reusable motion wrapper
- `src/components/shared/MobileBottomNav.tsx` — staff mobile nav
- `src/components/shared/PortalBottomNav.tsx` — portal mobile nav
- `src/components/analytics/ExportUtils.ts` — CSV/PDF export helpers
- `src/components/analytics/DateRangePicker.tsx` — date range selector
- `src/components/analytics/GuestDemographics.tsx` — nationality chart
- `src/components/analytics/ADRTrend.tsx` — ADR line chart
- `src/components/analytics/ChannelPerformance.tsx` — source comparison

### Files to Modify (all pages)
- `package.json` — add framer-motion
- `tailwind.config.ts` — add animation keyframes
- `src/index.css` — add print styles
- `src/App.tsx` — AnimatePresence wrapper
- `src/components/layout/StaffLayout.tsx` — responsive sidebar + bottom nav
- `src/components/layout/AppSidebar.tsx` — collapsible + animations
- `src/components/layout/TopBar.tsx` — responsive
- `src/components/layout/PortalLayout.tsx` — responsive header/footer + bottom nav
- All 17 page files — wrap in PageTransition, add stagger animations, responsive classes
- All dashboard widget components — mount animations

### Scope
- ~25 files modified, ~8 new files
- Zero backend dependencies — all client-side with mock data
- CSV export via Blob, PDF via print CSS

