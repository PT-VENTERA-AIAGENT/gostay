# Hotel Management System — Product Requirements Document

**Version:** 1.0.0
**Date:** April 1, 2026
**Status:** Draft

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [User Roles & Personas](#2-user-roles--personas)
3. [Core Features](#3-core-features)
4. [Data Models / Database Schema](#4-data-models--database-schema)
5. [System Architecture](#5-system-architecture)
6. [Page & Screen Inventory](#6-page--screen-inventory)
7. [API / Edge Function Requirements](#7-api--edge-function-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Milestones / Phased Rollout](#9-milestones--phased-rollout)

---

## 1. Overview & Vision

### 1.1 Product Summary

The **GoStay Hotel Management System (HMS)** is an all-in-one, cloud-native platform built to streamline every operational touchpoint of a hotel — from room inventory and booking lifecycle management, to real-time guest communication, phone call logging, and revenue analytics. It serves both internal hotel staff (admin, front desk) and external guests (via a customer-facing booking portal).

The system is designed to replace fragmented tools (spreadsheets, third-party PMS, disconnected chat apps, paper logs) with a single unified platform accessible from any modern browser.

### 1.2 Vision Statement

> "Give every hotel — from a boutique guesthouse to a multi-property chain — the operational intelligence and guest communication tools of a five-star resort, in a single, easy-to-use platform."

### 1.3 Business Goals

| Goal | Success Metric |
|------|---------------|
| Reduce manual booking errors | < 1% booking conflict rate within 60 days of launch |
| Increase direct bookings | 20% increase in portal-originated bookings within 90 days |
| Improve staff response time | Average guest chat response < 5 minutes during staffed hours |
| Consolidate operations | Zero reliance on external spreadsheets within 30 days |
| Revenue visibility | Dashboard provides real-time occupancy and revenue with < 1 min latency |

### 1.4 Scope

**In Scope (v1.0):**
- Room and property management
- Full booking lifecycle (create through check-out)
- Real-time customer-to-staff chat
- Inbound call logging and caller lookup
- Customer-facing booking portal
- Dashboard and analytics

**Out of Scope (v1.0):**
- Multi-property management (planned v2.0)
- Payment gateway integration (placeholder UI, Stripe integration in v1.1)
- Mobile native apps (iOS/Android)
- Channel manager integration (OTA sync — v2.0)
- Housekeeping task management module

### 1.5 Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | Next.js 14+ (App Router, React Server Components) |
| Styling | Tailwind CSS + shadcn/ui component library |
| Backend / Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (email/password + magic link) |
| Real-time | Supabase Realtime (Channels + Postgres Changes) |
| File Storage | Supabase Storage |
| Server Logic | Next.js Route Handlers + Supabase Edge Functions |
| Deployment | Vercel (frontend) + Supabase Cloud (backend) |
| Email Notifications | Resend API via Edge Functions |

---

## 2. User Roles & Personas

### 2.1 Role Definitions

The system has three primary roles with distinct permission boundaries:

| Role | Description | Access Level |
|------|-------------|-------------|
| `admin` | Hotel owner or general manager | Full system access, configuration, analytics, user management |
| `staff` | Front desk agents, reservations team | Bookings, chat, call logs, room availability; no system configuration |
| `customer` | Guests booking via the portal | Self-service portal only; own bookings and chat thread |

### 2.2 Persona Profiles

#### Persona A — Admin: "Maria, Hotel Owner"
- **Age:** 45
- **Tech Comfort:** Moderate
- **Primary Goals:** See occupancy and revenue at a glance, manage room pricing, add/remove staff accounts, resolve escalated guest issues
- **Pain Points:** Currently uses three separate tools; loses time reconciling data; no real-time revenue view
- **Key Features Used:** Dashboard analytics, room management, user management, reports

#### Persona B — Staff: "James, Front Desk Agent"
- **Age:** 28
- **Tech Comfort:** High
- **Primary Goals:** Check guests in/out quickly, respond to chat messages, log phone inquiries, create bookings on behalf of walk-in or phone customers
- **Pain Points:** Flipping between phone, chat app, and PMS during busy check-in times; no caller ID lookup
- **Key Features Used:** Booking calendar, check-in/check-out workflow, live chat inbox, call log

#### Persona C — Customer: "David, Business Traveler"
- **Age:** 34
- **Tech Comfort:** High
- **Primary Goals:** Find and book a room quickly, receive instant confirmation, communicate with the hotel about special requests
- **Pain Points:** Slow OTA booking flows, unclear room descriptions, no direct communication channel pre-arrival
- **Key Features Used:** Booking portal, room search, confirmation page, chat widget

### 2.3 Permission Matrix

| Feature | Admin | Staff | Customer |
|---------|-------|-------|----------|
| View all bookings | Yes | Yes | Own only |
| Create/modify bookings | Yes | Yes | Own only (portal) |
| Cancel bookings | Yes | Yes | Own only (within policy) |
| Check-in / Check-out | Yes | Yes | No |
| Manage rooms | Yes | No | No |
| Set room pricing | Yes | No | No |
| View all chat threads | Yes | Yes | Own only |
| Send chat messages | Yes | Yes | Yes |
| View call logs | Yes | Yes | No |
| Create call log entry | Yes | Yes | No |
| View analytics dashboard | Yes | View-only | No |
| Manage staff accounts | Yes | No | No |
| System configuration | Yes | No | No |

---

## 3. Core Features

### 3.1 Room Management

#### Overview
Admins can define the hotel's room inventory: room types, individual rooms, pricing rules, amenities, and availability blocks (for maintenance or owner holds).

#### User Stories

**US-RM-01:** As an admin, I want to create room types (e.g., Standard, Deluxe, Suite) so that I can group rooms with similar characteristics and set base pricing at the type level.

**US-RM-02:** As an admin, I want to add individual rooms to a room type (e.g., Room 101, 102 of type "Standard") so that the booking engine knows exact inventory.

**US-RM-03:** As an admin, I want to upload multiple photos per room type so that customers can see attractive visuals before booking.

**US-RM-04:** As an admin, I want to define amenities per room (e.g., WiFi, Air Conditioning, Sea View, Mini Bar) so that customers can filter by their preferences.

**US-RM-05:** As an admin, I want to set a base nightly rate per room type and optionally override pricing for specific dates or date ranges (seasonal pricing) so that revenue is optimized.

**US-RM-06:** As an admin, I want to mark a room as "Out of Service" for a date range so that it cannot be booked during maintenance.

**US-RM-07:** As an admin, I want to set a room's maximum occupancy (adults + children) so that the booking engine enforces capacity limits.

**US-RM-08:** As staff, I want to view the real-time status of every room (Available, Occupied, Checked-In, Out of Service) on a room grid so that I can answer availability questions instantly.

#### Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC-RM-01 | Creating a room type requires: name, description, base nightly rate, max occupancy. All fields validated before save. |
| AC-RM-02 | Each room belongs to exactly one room type. Room number must be unique within the property. |
| AC-RM-03 | Photos upload to Supabase Storage; max 10 images per room type; supported formats: JPG, PNG, WebP; max 5 MB each. |
| AC-RM-04 | Amenities are managed from a predefined list + ability to add custom amenity tags. |
| AC-RM-05 | Seasonal price rules have start date, end date, price per night. Overlapping rules are rejected with a validation error. |
| AC-RM-06 | Out-of-service blocks prevent booking creation for affected rooms. Existing confirmed bookings trigger a conflict warning before the block is saved. |
| AC-RM-07 | Deleting a room type is blocked if active bookings exist for rooms under that type. |
| AC-RM-08 | Room status grid refreshes via Supabase Realtime within 5 seconds of any status change. |

---

### 3.2 Booking Management

#### Overview
Full lifecycle management of reservations from initial creation through check-out, including support for staff-created bookings (on behalf of phone/walk-in guests) and modifications.

#### Booking Lifecycle States

```
[Pending] → [Confirmed] → [Checked-In] → [Checked-Out]
    ↓              ↓              
[Cancelled]   [Cancelled]
                   ↓
              [No-Show]
```

#### User Stories

**US-BK-01:** As staff, I want to create a booking by selecting a date range, room type, and guest, so that I can handle walk-in and phone reservations.

**US-BK-02:** As staff, I want to search available rooms by date range and room type from a calendar view so that I can quickly identify options for a guest.

**US-BK-03:** As staff, I want to confirm a pending booking with one click so that the guest receives an email confirmation.

**US-BK-04:** As staff, I want to modify a booking's dates or room assignment so that I can accommodate guest change requests.

**US-BK-05:** As staff, I want to check in a guest (transition booking to "Checked-In") and optionally add notes about the arrival so that the system reflects the room as occupied.

**US-BK-06:** As staff, I want to check out a guest (transition booking to "Checked-Out") and see a billing summary so that the stay is closed.

**US-BK-07:** As staff, I want to cancel a booking with a cancellation reason so that inventory is immediately freed and the guest is notified.

**US-BK-08:** As admin, I want to view all bookings in a calendar grid (month/week/day views) so that I have a visual overview of occupancy.

**US-BK-09:** As staff, I want to add special requests or internal notes to a booking so that arriving staff are aware of guest needs.

**US-BK-10:** As staff, I want to see a booking's full audit trail (who did what, when) so that I can investigate any discrepancies.

#### Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC-BK-01 | Booking creation validates: check-in date < check-out date; minimum 1 night; room available for entire date range; guest count ≤ room max occupancy. |
| AC-BK-02 | Calendar view shows rooms on Y-axis, dates on X-axis (Gantt-style). Clicking a booking opens its detail panel. |
| AC-BK-03 | Confirmation triggers email to guest via Resend; email contains: booking reference, room type, dates, total price, hotel contact. |
| AC-BK-04 | Modification checks for conflicts on the new dates before committing. If room changes, original room is freed immediately. Customers can modify bookings in status 'pending' or 'confirmed' only if check-in date is more than 48 hours away. |
| AC-BK-05 | Check-in is only available for "Confirmed" bookings on or after the check-in date. |
| AC-BK-06 | Check-out calculates total nights × applicable nightly rate (respecting seasonal pricing per night). |
| AC-BK-07 | Cancellation requires a reason code (selected from dropdown) + optional free-text. Guest notification email is sent automatically. |
| AC-BK-08 | Booking reference numbers are auto-generated in format `BK-YYYYMMDD-XXXX` (date + 4 random alphanumeric chars), guaranteed unique. |
| AC-BK-09 | Audit trail records: created_by, confirmed_by, modified_by, checked_in_by, checked_out_by, cancelled_by — with timestamps. |

#### No-Show Management (US-BK-11)

**As** front desk staff, **I want** to mark guests as no-show **so that** rooms are released and policies enforced.

**Acceptance Criteria:**

| ID | Criteria |
|----|----------|
| AC-NS-01 | Staff can manually mark a booking as `no_show` from the booking detail page |
| AC-NS-02 | System auto-flags bookings as potential no-show if not checked in by 23:59 on check-in date |
| AC-NS-03 | No-show bookings trigger cancellation_fee application based on hotel policy |
| AC-NS-04 | Room status returns to `available` after no-show confirmation |
| AC-NS-05 | Customer receives email notification of no-show status |

**API:** `PATCH /api/bookings/{id}/no-show`

---

#### Customer Profile Self-Service (US-BK-12)

**As** a customer, **I want** to edit my profile (name, email, phone) and change my password from the portal **so that** my information stays up to date without contacting hotel staff.

**Acceptance Criteria:**

| ID | Criteria |
|----|----------|
| AC-CP-01 | Customer can update full_name, email, and phone from the My Account page |
| AC-CP-02 | Email changes require re-verification via Supabase Auth (confirmation link sent to new email) |
| AC-CP-03 | Password change requires current password and a new password (minimum 8 characters) |
| AC-CP-04 | Profile changes are reflected in the linked `customers` record if one exists |

---

### 3.3 Customer Chat

#### Overview
A real-time messaging system allowing guests to communicate directly with hotel staff. Each guest has a single persistent chat thread. Staff see a unified inbox of all active conversations.

#### User Stories

**US-CH-01:** As a customer, I want to send a message to the hotel from the booking portal so that I can ask questions or make special requests without calling.

**US-CH-02:** As staff, I want to see all unread messages in a unified inbox, sorted by last message time, so that no guest message goes unanswered.

**US-CH-03:** As staff, I want to see which booking a chat is related to so that I have context when replying.

**US-CH-04:** As staff, I want to send text messages and file attachments (e.g., restaurant menus, maps) to guests so that I can provide rich responses.

**US-CH-05:** As a customer, I want to receive real-time notifications (in-browser) when staff replies so that I know to check the chat.

**US-CH-06:** As staff, I want to see chat history for a guest across all their visits so that I can provide personalized service.

**US-CH-07:** As admin, I want to see all chat threads (read-only) so that I can monitor communication quality.

**US-CH-08:** As staff, I want to mark a conversation as "Resolved" so that it moves out of the active inbox.

#### Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC-CH-01 | Messages are delivered via Supabase Realtime channels; delivery latency < 500ms on standard connections. |
| AC-CH-02 | Unread message count badge is visible on the staff navigation menu and updates in real time. |
| AC-CH-03 | File attachments upload to Supabase Storage; max size 10 MB; allowed types: PDF, JPG, PNG, DOCX. |
| AC-CH-04 | Each message stores: sender_id, sender_role, content, attachment_url (nullable), created_at. Read status is tracked per-user via the `chat_read_receipts` table (thread_id + user_id + last_read_at). |
| AC-CH-05 | Chat widget is available on all portal pages; customer can chat without being logged in (guest session identified by booking reference + email, or after login). |
| AC-CH-06 | Messages older than 24 months are archived (not deleted) and accessible via a "View older messages" pagination control. |
| AC-CH-07 | Staff can see the customer's name, booking status, and check-in date in the chat sidebar. |
| AC-CH-08 | Resolving a conversation logs the resolving staff member and timestamp. Resolved conversations can be reopened. |

---

### 3.4 Caller / Phone Integration

#### Overview
A call logging module that allows front desk staff to record inbound/outbound calls, look up callers against the customer database, and convert phone inquiries directly into bookings.

#### User Stories

**US-CL-01:** As staff, I want to log a phone call by entering the caller's phone number so that all calls are tracked.

**US-CL-02:** As staff, I want the system to automatically look up a phone number against existing customers so that I can identify returning guests instantly.

**US-CL-03:** As staff, I want to record a summary of what was discussed on the call so that colleagues can see the context later.

**US-CL-04:** As staff, I want to create a booking directly from a call log entry so that I don't need to switch screens during the call.

**US-CL-05:** As staff, I want to see a history of all calls from a specific customer so that I can reference prior conversations.

**US-CL-06:** As admin, I want to see a full call log (all agents, all calls) with filters for date range and agent so that I can audit activity.

**US-CL-07:** As staff, I want to flag a call for follow-up so that a reminder task appears in my dashboard.

#### Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC-CL-01 | Call log entry requires: phone number, call direction (inbound/outbound), date/time, duration (optional), summary (optional). |
| AC-CL-02 | Phone number lookup searches `customers.phone` with exact match and partial match (last 7 digits); returns matching customer profile if found. |
| AC-CL-03 | "Create Booking from Call" pre-fills the booking form with the linked customer's details and keeps a reference back to the call log entry. |
| AC-CL-04 | Call log entries are immutable after 24 hours (edit window); admin can always edit. |
| AC-CL-05 | Call log is filterable by: agent, date range, call direction, linked customer, follow-up flag. |
| AC-CL-06 | Follow-up flags surface in the staff dashboard as a task list with due date. |

---

### 3.5 Customer-Facing Booking Portal

#### Overview
A public-facing website (no login required to search; login/register required to complete a booking) where guests can discover room types, check availability, and make direct reservations.

#### User Stories

**US-PO-01:** As a customer, I want to search for available rooms by check-in date, check-out date, and number of guests on the home page so that I can see relevant options immediately.

**US-PO-02:** As a customer, I want to see room type cards with photos, description, amenities, and nightly rate so that I can choose the best option for my stay.

**US-PO-03:** As a customer, I want to filter search results by amenities, price range, and room type so that I can narrow my choices.

**US-PO-04:** As a customer, I want to view a detailed page for a room type with a full photo gallery and amenity list so that I can make a confident decision.

**US-PO-05:** As a customer, I want to create an account or log in so that my booking is associated with my profile.

**US-PO-06:** As a customer, I want to complete a booking with a clear summary (room, dates, total cost breakdown) before confirming so that I know exactly what I am committing to.

**US-PO-07:** As a customer, I want to receive a confirmation email with my booking reference immediately after booking so that I have a record.

**US-PO-08:** As a customer, I want to view and manage my bookings from "My Account" so that I can see upcoming stays or request a cancellation.

**US-PO-09:** As a customer, I want to access the chat widget from the portal so that I can communicate with the hotel about my booking.

**US-PO-10:** As a customer, I want to use the portal on a mobile browser with a fully responsive layout so that I can book from any device.

#### Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC-PO-01 | Search results page renders with Core Web Vitals: LCP < 2.5s, CLS < 0.1 on mobile (3G simulated). |
| AC-PO-02 | Availability check queries only show room types with at least one unblocked, non-booked room for the full requested date range. |
| AC-PO-03 | Booking step flow: Search → Room Selection → Guest Details → Review & Confirm → Confirmation. Browser back navigation is supported at each step. |
| AC-PO-04 | If all rooms of a selected type become booked between search and confirmation (race condition), the system redirects to search with a clear "Room no longer available" message. |
| AC-PO-05 | Cancellation via portal is allowed up to 24 hours before check-in date (configurable by admin). After the cutoff, cancellation shows a policy message and prompts the guest to call. |
| AC-PO-06 | Portal is fully accessible: WCAG 2.1 AA compliance, keyboard navigable, screen reader friendly. |
| AC-PO-07 | Customer registration uses Supabase Auth email + password; magic link login also supported. |

---

### 3.6 Dashboard & Analytics

#### Overview
An admin/staff dashboard providing real-time operational metrics and historical performance analytics.

#### User Stories

**US-DA-01:** As an admin, I want to see today's occupancy rate (occupied rooms / total rooms) prominently on the dashboard so that I have an instant operational overview.

**US-DA-02:** As an admin, I want to see today's expected arrivals and departures as a list so that staff can prepare accordingly.

**US-DA-03:** As an admin, I want to see revenue for the current day, current month, and current year so that I can track financial performance.

**US-DA-04:** As an admin, I want to see a 30-day occupancy trend chart so that I can identify patterns.

**US-DA-05:** As an admin, I want to see revenue breakdown by room type so that I can see which products perform best.

**US-DA-06:** As staff, I want to see a condensed dashboard (arrivals, departures, unread chats, flagged calls) so that I can start my shift knowing priorities.

**US-DA-07:** As an admin, I want to export booking data as CSV for a selected date range so that I can perform offline analysis.

#### Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC-DA-01 | Dashboard KPI cards (occupancy, revenue, arrivals, departures) refresh every 60 seconds or on manual refresh. |
| AC-DA-02 | Occupancy rate = (rooms with status "Checked-In" + "Confirmed" for today) / total active rooms × 100. |
| AC-DA-03 | Revenue figures pull from confirmed + checked-in + checked-out bookings; cancelled bookings excluded unless they have a cancellation fee. |
| AC-DA-04 | Charts rendered client-side using a lightweight charting library (e.g., Recharts); data fetched from a Supabase Edge Function that aggregates via SQL. |
| AC-DA-05 | CSV export is triggered via a signed Supabase Storage URL generated by an Edge Function; download starts within 5 seconds for up to 10,000 records. |
| AC-DA-06 | Staff dashboard view shows only operational widgets (no financial revenue figures unless role = admin). |

---

## 4. Data Models / Database Schema

### 4.1 Schema Overview

All tables reside in Supabase PostgreSQL. Row Level Security (RLS) policies enforce access control at the database layer.

### 4.2 Table Definitions

---

#### `profiles`
Extends Supabase Auth `auth.users`. One row per user account.

```
profiles
├── id              UUID (PK, FK → auth.users.id)
├── full_name       TEXT NOT NULL
├── email           TEXT NOT NULL UNIQUE
├── phone           TEXT
├── role            TEXT NOT NULL  -- 'admin' | 'staff' | 'customer'
├── avatar_url      TEXT
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `room_types`
Defines categories of rooms with shared characteristics.

```
room_types
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── name            TEXT NOT NULL UNIQUE          -- e.g., "Deluxe Double"
├── description     TEXT
├── base_price      NUMERIC(10,2) NOT NULL        -- per night
├── max_adults      INT NOT NULL DEFAULT 2
├── max_children    INT NOT NULL DEFAULT 1
├── max_occupancy   INT GENERATED ALWAYS AS (max_adults + max_children) STORED
├── size_sqm        NUMERIC(6,1)
├── bed_type        TEXT                          -- e.g., "King", "Twin"
├── is_active       BOOLEAN DEFAULT true
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `room_type_amenities`
Junction table linking amenities to room types.

```
room_type_amenities
├── room_type_id    UUID (FK → room_types.id, ON DELETE CASCADE)
├── amenity_id      UUID (FK → amenities.id, ON DELETE CASCADE)
└── PRIMARY KEY (room_type_id, amenity_id)
```

---

#### `amenities`
Master list of amenity tags.

```
amenities
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── name            TEXT NOT NULL UNIQUE          -- e.g., "Free WiFi"
├── icon_name       TEXT                          -- lucide-react icon name
└── category        TEXT                          -- e.g., "Connectivity", "Comfort"
```

---

#### `room_type_photos`
Photos associated with a room type, ordered.

```
room_type_photos
├── id              UUID (PK)
├── room_type_id    UUID (FK → room_types.id, ON DELETE CASCADE)
├── storage_path    TEXT NOT NULL                 -- Supabase Storage path
├── alt_text        TEXT
├── sort_order      INT NOT NULL DEFAULT 0
└── uploaded_at     TIMESTAMPTZ DEFAULT now()
```

---

#### `rooms`
Individual physical rooms.

```
rooms
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── room_type_id    UUID (FK → room_types.id)
├── room_number     TEXT NOT NULL UNIQUE          -- e.g., "101", "PH-A"
├── floor           INT
├── notes           TEXT                          -- internal notes
├── status          TEXT NOT NULL DEFAULT 'available'
│                   -- 'available' | 'occupied' | 'out_of_service'
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `room_price_overrides`
Seasonal or special pricing rules that override the room type base price.

```
room_price_overrides
├── id              UUID (PK)
├── room_type_id    UUID (FK → room_types.id, ON DELETE CASCADE)
├── start_date      DATE NOT NULL
├── end_date        DATE NOT NULL
├── price_per_night NUMERIC(10,2) NOT NULL
├── label           TEXT                          -- e.g., "Peak Season 2026"
├── created_by      UUID (FK → profiles.id)
├── created_at      TIMESTAMPTZ DEFAULT now()
├── updated_at      TIMESTAMPTZ DEFAULT now()
└── CONSTRAINT no_overlap CHECK (start_date < end_date)
```

```sql
-- Prevent overlapping date ranges for the same room type
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE room_price_overrides ADD CONSTRAINT no_date_overlap
  EXCLUDE USING gist (room_type_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
```

---

#### `room_blocks`
Admin-set unavailability windows (maintenance, owner hold, etc.).

```
room_blocks
├── id              UUID (PK)
├── room_id         UUID (FK → rooms.id, ON DELETE CASCADE)
├── start_date      DATE NOT NULL
├── end_date        DATE NOT NULL
├── reason          TEXT
├── created_by      UUID (FK → profiles.id)
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

```sql
ALTER TABLE room_blocks ADD CONSTRAINT no_block_overlap
  EXCLUDE USING gist (room_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
```

---

#### `customers`
Guest profile data. A customer may or may not have a `profiles` account (walk-in / phone guests may be created without a login).

```
customers
├── id              UUID (PK)
├── profile_id      UUID (FK → profiles.id, NULLABLE)  -- null if no portal login
├── full_name       TEXT NOT NULL
├── email           TEXT
├── phone           TEXT
├── nationality     TEXT
├── id_type         TEXT                          -- 'passport' | 'national_id' | 'drivers_license'
├── id_number       TEXT
├── date_of_birth   DATE
├── notes           TEXT                          -- VIP notes, preferences
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `bookings`
Central reservation record.

```
bookings
├── id                  UUID (PK)
├── reference           TEXT NOT NULL UNIQUE      -- BK-YYYYMMDD-XXXX
├── customer_id         UUID (FK → customers.id)
├── room_id             UUID (FK → rooms.id)
├── room_type_id        UUID (FK → room_types.id)
├── check_in_date       DATE NOT NULL
├── check_out_date      DATE NOT NULL
├── num_adults          INT NOT NULL DEFAULT 1
├── num_children        INT NOT NULL DEFAULT 0
├── status              TEXT NOT NULL DEFAULT 'pending'
│                       -- 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
├── total_amount        NUMERIC(10,2) NOT NULL
├── payment_status      TEXT NOT NULL DEFAULT 'unpaid'
│                       -- 'unpaid' | 'deposit_paid' | 'paid' | 'refunded'
├── amount_paid         NUMERIC(12,2) NOT NULL DEFAULT 0
├── cancellation_fee    NUMERIC(12,2) DEFAULT 0
├── nightly_breakdown   JSONB                     -- [{date, price}, ...] per-night rates
├── special_requests    TEXT
├── internal_notes      TEXT
├── source              TEXT DEFAULT 'portal'     -- 'portal' | 'phone' | 'walk_in' | 'staff'
├── confirmed_at        TIMESTAMPTZ
├── checked_in_at       TIMESTAMPTZ
├── checked_out_at      TIMESTAMPTZ
├── cancelled_at        TIMESTAMPTZ
├── cancellation_reason TEXT
├── created_by          UUID (FK → profiles.id)
├── last_modified_by    UUID (FK → profiles.id)
├── created_at          TIMESTAMPTZ DEFAULT now()
└── updated_at          TIMESTAMPTZ DEFAULT now()
```

---

#### `booking_audit_log`
Immutable event log for every booking state transition.

```
booking_audit_log
├── id              UUID (PK)
├── booking_id      UUID (FK → bookings.id, ON DELETE CASCADE)
├── action          TEXT NOT NULL   -- 'created' | 'confirmed' | 'modified' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
├── performed_by    UUID (FK → profiles.id)
├── changes         JSONB           -- {field: {old, new}} snapshot of what changed
└── created_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `chat_threads`
One thread per customer. All staff messages go into the same thread.

```
chat_threads
├── id              UUID (PK)
├── customer_id     UUID (FK → customers.id)
├── status          TEXT NOT NULL DEFAULT 'open'  -- 'open' | 'resolved'
├── resolved_by     UUID (FK → profiles.id, NULLABLE)
├── resolved_at     TIMESTAMPTZ
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `chat_messages`
Individual messages within a thread.

```
chat_messages
├── id              UUID (PK)
├── thread_id       UUID (FK → chat_threads.id, ON DELETE CASCADE)
├── sender_id       UUID (FK → profiles.id)
├── sender_role     TEXT NOT NULL               -- 'admin' | 'staff' | 'customer'
├── content         TEXT                        -- nullable if attachment only
├── attachment_url  TEXT                        -- Supabase Storage signed URL
├── attachment_name TEXT
├── attachment_type TEXT                        -- MIME type
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `call_logs`
Phone call records.

```
call_logs
├── id              UUID (PK)
├── logged_by       UUID (FK → profiles.id)
├── customer_id     UUID (FK → customers.id, NULLABLE)    -- null if unrecognised caller
├── caller_phone    TEXT NOT NULL
├── direction       TEXT NOT NULL               -- 'inbound' | 'outbound'
├── call_datetime   TIMESTAMPTZ NOT NULL
├── duration_secs   INT
├── summary         TEXT
├── follow_up_flag  BOOLEAN DEFAULT false
├── follow_up_due   DATE
├── booking_id      UUID (FK → bookings.id, NULLABLE)     -- if booking was created from call
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `hotel_settings`
Single-row configuration table for hotel-level settings.

```
hotel_settings
├── id                      UUID (PK)
├── hotel_name              TEXT NOT NULL
├── hotel_address           TEXT
├── hotel_phone             TEXT
├── hotel_email             TEXT
├── logo_url                TEXT
├── cancellation_cutoff_hrs INT DEFAULT 24       -- hours before check-in
├── manual_confirm_mode     BOOLEAN NOT NULL DEFAULT false
├── timezone                TEXT DEFAULT 'Asia/Jakarta'
├── currency_code           TEXT DEFAULT 'IDR'
├── created_at              TIMESTAMPTZ DEFAULT now()
└── updated_at              TIMESTAMPTZ DEFAULT now()
```

#### `chat_read_receipts`
Tracks per-user read position in chat threads (replaces per-message `read_at`).

```
chat_read_receipts
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── thread_id       UUID (FK → chat_threads.id, ON DELETE CASCADE)
├── user_id         UUID (FK → profiles.id, ON DELETE CASCADE)
├── last_read_at    TIMESTAMPTZ NOT NULL DEFAULT now()
└── UNIQUE(thread_id, user_id)
```

---

#### `payments`
Individual payment records against a booking.

```
payments
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── booking_id      UUID (FK → bookings.id, ON DELETE CASCADE)
├── amount          NUMERIC(12,2) NOT NULL
├── method          TEXT NOT NULL   -- 'cash' | 'bank_transfer' | 'credit_card' | 'qris' | 'other'
├── reference       TEXT
├── notes           TEXT
├── recorded_by     UUID (FK → profiles.id)
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

```sql
CREATE INDEX idx_payments_booking ON payments(booking_id);
```

---

#### `email_logs`
Tracks all outbound emails sent by the system.

```
email_logs
├── id                  UUID (PK, DEFAULT gen_random_uuid())
├── booking_id          UUID (FK → bookings.id, ON DELETE SET NULL)
├── customer_id         UUID (FK → customers.id, ON DELETE SET NULL)
├── template            TEXT NOT NULL
├── subject             TEXT NOT NULL
├── recipient_email     TEXT NOT NULL
├── status              TEXT NOT NULL   -- 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'
├── provider_message_id TEXT
├── error_message       TEXT
├── created_at          TIMESTAMPTZ DEFAULT now()
└── updated_at          TIMESTAMPTZ DEFAULT now()
```

```sql
CREATE INDEX idx_email_logs_booking ON email_logs(booking_id);
CREATE INDEX idx_email_logs_customer ON email_logs(customer_id);
```

---

#### `analytics_cache`
Pre-computed analytics metrics for fast dashboard reads.

```
analytics_cache
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── hotel_id        UUID NOT NULL (FK → hotel_settings.id, ON DELETE CASCADE)
├── metric_type     TEXT NOT NULL
├── period_start    DATE NOT NULL
├── period_end      DATE NOT NULL
├── payload         JSONB NOT NULL DEFAULT '{}'
├── computed_at     TIMESTAMPTZ DEFAULT now()
└── UNIQUE(hotel_id, metric_type, period_start, period_end)
```

---

#### `admin_audit_log`
Immutable log of all admin actions for compliance and auditing.

```
admin_audit_log
├── id              UUID (PK, DEFAULT gen_random_uuid())
├── user_id         UUID NOT NULL (FK → profiles.id)
├── action          TEXT NOT NULL
├── entity_type     TEXT NOT NULL
├── entity_id       UUID
├── old_values      JSONB
├── new_values      JSONB
├── ip_address      INET
└── created_at      TIMESTAMPTZ DEFAULT now()
```

```sql
CREATE INDEX idx_audit_log_user ON admin_audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON admin_audit_log(entity_type, entity_id);
```

---

### 4.3 Key Relationships

```
auth.users (1) ──── (1) profiles
profiles (1) ──── (0..1) customers

room_types (1) ──── (N) rooms
room_types (1) ──── (N) room_type_amenities ──── (N) amenities
room_types (1) ──── (N) room_type_photos
room_types (1) ──── (N) room_price_overrides

rooms (1) ──── (N) room_blocks
rooms (1) ──── (N) bookings

customers (1) ──── (N) bookings
customers (1) ──── (1) chat_threads
customers (1) ──── (N) call_logs

bookings (1) ──── (N) booking_audit_log
bookings (1) ──── (N) payments
bookings (1) ──── (N) email_logs
call_logs (N) ──── (0..1) bookings     -- call_logs.booking_id references bookings

chat_threads (1) ──── (N) chat_messages
chat_threads (1) ──── (N) chat_read_receipts
```

### 4.4 Row Level Security Policies Summary

| Table | customer policy | staff policy | admin policy |
|-------|----------------|--------------|--------------|
| `bookings` | SELECT/INSERT own rows | SELECT all; INSERT/UPDATE all | Full access |
| `chat_messages` | SELECT/INSERT own thread | SELECT/INSERT all threads | Full access |
| `chat_threads` | SELECT own thread | SELECT/UPDATE all | Full access |
| `call_logs` | No access | SELECT/INSERT/UPDATE own entries | Full access |
| `rooms` | SELECT active rooms | SELECT all | Full access |
| `room_types` | SELECT active | SELECT all | Full access |
| `profiles` | SELECT/UPDATE own row | SELECT all; UPDATE own | Full access |
| `customers` | SELECT own record | SELECT/INSERT/UPDATE all | Full access |
| `hotel_settings` | SELECT (public fields only) | SELECT | Full access |
| `payments` | No access | SELECT/INSERT all | Full access |
| `email_logs` | No access | SELECT all | Full access |
| `analytics_cache` | No access | SELECT | Full access |
| `admin_audit_log` | No access | No access | Full access |
| `chat_read_receipts` | SELECT/UPDATE own rows | SELECT/UPDATE all | Full access |

---

## 5. System Architecture

### 5.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VERCEL EDGE NETWORK                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    NEXT.JS 14 APP ROUTER                    │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │  App (Staff) │  │  App (Admin) │  │  Portal (Guest)  │  │   │
│  │  │  /dashboard  │  │  /admin/*    │  │  /portal/*       │  │   │
│  │  │  /bookings   │  │  /settings   │  │  /book/*         │  │   │
│  │  │  /chat       │  │  /analytics  │  │  /my-bookings    │  │   │
│  │  │  /calls      │  │  /rooms      │  │                  │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │   │
│  │         │                 │                    │            │   │
│  │  ┌──────▼─────────────────▼────────────────────▼─────────┐  │   │
│  │  │              NEXT.JS ROUTE HANDLERS                   │  │   │
│  │  │         /api/* (REST endpoints for mutations)         │  │   │
│  │  └──────────────────────────┬────────────────────────────┘  │   │
│  └─────────────────────────────┼───────────────────────────────┘   │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │    SUPABASE CLOUD       │
                    │                         │
                    │  ┌───────────────────┐  │
                    │  │  PostgreSQL DB    │  │
                    │  │  + RLS Policies   │  │
                    │  └────────┬──────────┘  │
                    │           │              │
                    │  ┌────────▼──────────┐  │
                    │  │  Supabase Auth    │  │
                    │  │  (JWT sessions)   │  │
                    │  └───────────────────┘  │
                    │                         │
                    │  ┌───────────────────┐  │
                    │  │  Supabase         │  │
                    │  │  Realtime         │  │◄── WebSocket (chat, room status)
                    │  │  (Channels)       │  │
                    │  └───────────────────┘  │
                    │                         │
                    │  ┌───────────────────┐  │
                    │  │  Supabase Storage │  │
                    │  │  (photos, files)  │  │
                    │  └───────────────────┘  │
                    │                         │
                    │  ┌───────────────────┐  │
                    │  │  Edge Functions   │  │
                    │  │  - send-email     │  │
                    │  │  - analytics-agg  │  │
                    │  │  - csv-export     │  │
                    │  │  - caller-lookup  │  │
                    │  └───────────────────┘  │
                    └─────────────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │    EXTERNAL SERVICES    │
                    │  - Resend (Email)       │
                    └────────────────────────┘
```

### 5.2 Next.js App Router Structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── forgot-password/page.tsx
│
├── (staff)/                        # Protected: staff + admin only
│   ├── layout.tsx                  # Staff shell (sidebar, header)
│   ├── dashboard/page.tsx
│   ├── bookings/
│   │   ├── page.tsx                # Booking list + calendar toggle
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── rooms/
│   │   ├── page.tsx                # Room grid / status board
│   │   ├── types/page.tsx
│   │   └── types/[id]/page.tsx
│   ├── chat/
│   │   ├── page.tsx                # Chat inbox
│   │   └── [threadId]/page.tsx
│   └── calls/
│       ├── page.tsx                # Call log list
│       └── new/page.tsx
│
├── (admin)/                        # Protected: admin only
│   ├── layout.tsx
│   ├── analytics/page.tsx
│   ├── settings/page.tsx
│   └── users/page.tsx
│
├── (portal)/                       # Public + authenticated customers
│   ├── layout.tsx                  # Portal shell (header, footer, chat widget)
│   ├── page.tsx                    # Home / search
│   ├── rooms/[slug]/page.tsx       # Room type detail
│   ├── book/
│   │   ├── page.tsx                # Step 1: Room selection
│   │   ├── details/page.tsx        # Step 2: Guest details
│   │   ├── review/page.tsx         # Step 3: Review & confirm
│   │   └── confirmation/page.tsx   # Step 4: Confirmation
│   └── my-account/
│       ├── page.tsx                # Account overview
│       └── bookings/[id]/page.tsx
│
└── api/
    ├── bookings/
    │   ├── route.ts                # POST: create booking
    │   └── [id]/
    │       ├── route.ts            # GET, PATCH, DELETE
    │       ├── confirm/route.ts    # POST: confirm
    │       ├── check-in/route.ts   # POST: check-in
    │       ├── check-out/route.ts  # POST: check-out
    │       └── no-show/route.ts    # PATCH: mark as no-show
    ├── rooms/route.ts
    ├── calls/route.ts
    └── availability/route.ts       # GET: available rooms for date range
```

### 5.3 Authentication Flow

```
Customer (Portal):
  Register/Login → Supabase Auth → JWT in httpOnly cookie
  → Middleware checks role = 'customer'
  → Access granted to /portal/* routes

Staff/Admin:
  Login → Supabase Auth → JWT in httpOnly cookie
  → Middleware checks role = 'staff' | 'admin'
  → Access granted to /(staff)/* routes
  → Admin-only routes additionally check role = 'admin'
```

### 5.4 Real-time Architecture

Supabase Realtime is used for two primary flows:

**Chat Delivery:**
```
Customer sends message
  → INSERT into chat_messages
  → Supabase Realtime broadcasts on channel: `chat:thread:{thread_id}`
  → Staff client subscribed to `chat:thread:*` receives message
  → UI updates without page refresh
  → Unread badge increments in staff nav
```

> **Note:** Staff subscribe to Postgres Changes on the `chat_messages` table filtered by RLS policies, not wildcard channel subscriptions (which Supabase Realtime does not support).

**Room Status Updates:**
```
Booking checked-in/checked-out
  → UPDATE rooms.status
  → Supabase Realtime broadcasts via Postgres Changes on `rooms` table
  → Staff room grid updates automatically
```

### 5.5 Data Flow: Booking Creation

```
1. Customer selects dates + room type on portal
2. Client calls GET /api/availability?check_in=&check_out=&type_id=
3. Route Handler queries available rooms (no confirmed/checked_in booking overlap, no blocks)
4. Specific room_id is NOT exposed to customer; one is assigned server-side on confirm
5. Customer submits booking form
6. Route Handler:
   a. Re-validates availability using `SELECT ... FOR UPDATE` on the target room row to prevent concurrent double-booking. If the lock cannot be acquired within 5 seconds, the request returns 409 Conflict.
   b. Calculates total (nightly breakdown with price overrides)
   c. INSERTs booking with status='pending'
   d. Calls Supabase Edge Function: send-confirmation-email
   e. Returns booking reference to client
7. For portal bookings: status auto-advances to 'confirmed' unless admin has "manual confirm" mode enabled
```

---

## 6. Page & Screen Inventory

### 6.1 Public / Portal Pages

| Page | Route | Description |
|------|-------|-------------|
| Home / Search | `/` | Hero search form, featured room types, hotel info |
| Room Type Detail | `/rooms/[slug]` | Full gallery, description, amenities, availability picker, "Book Now" CTA |
| Booking Step 1 | `/book` | Room selection / confirmation of selection |
| Booking Step 2 | `/book/details` | Guest details form (name, email, phone, special requests) |
| Booking Step 3 | `/book/review` | Full booking summary with price breakdown |
| Booking Confirmation | `/book/confirmation` | Success state with reference number, email sent notice |
| Login | `/login` | Supabase Auth sign-in form |
| Register | `/register` | New customer account form |
| Forgot Password | `/forgot-password` | Password reset email trigger |
| My Account | `/my-account` | Customer dashboard: upcoming stays, past stays |
| Booking Detail | `/my-account/bookings/[id]` | Single booking view with cancellation option |

### 6.2 Staff Pages

| Page | Route | Description |
|------|-------|-------------|
| Staff Dashboard | `/dashboard` | KPI cards, today's arrivals/departures, unread chats, follow-up calls |
| Booking List | `/bookings` | Filterable, sortable table of all bookings |
| Booking Calendar | `/bookings?view=calendar` | Gantt-style room-vs-date grid |
| New Booking | `/bookings/new` | Multi-step form for staff-created bookings |
| Booking Detail | `/bookings/[id]` | Full booking record, state transition buttons, audit log tab |
| Room Status Board | `/rooms` | Grid of all rooms with current status color coding |
| Room Types | `/rooms/types` | List of room types with pricing |
| Room Type Detail | `/rooms/types/[id]` | Edit room type: details, photos, amenities, price overrides |
| Chat Inbox | `/chat` | Two-panel: thread list (left), active conversation (right) |
| Chat Thread | `/chat/[threadId]` | Deep link to specific conversation |
| Call Log List | `/calls` | Filterable call log table |
| New Call Log | `/calls/new` | Call log entry form with customer lookup |

### 6.3 Admin Pages

| Page | Route | Description |
|------|-------|-------------|
| Analytics | `/analytics` | Full analytics dashboard with charts |
| User Management | `/users` | List staff/admin accounts, invite new, deactivate |
| Hotel Settings | `/settings` | Hotel info, cancellation policy, timezone, currency |

### 6.4 Key UI Components

| Component | Used On | Description |
|-----------|---------|-------------|
| `BookingStatusBadge` | Bookings list, detail | Color-coded status pill |
| `RoomStatusGrid` | Room board | Live status cards with color (green/red/yellow/grey) |
| `BookingCalendar` | Bookings calendar | Gantt grid using CSS Grid |
| `ChatWidget` | All portal pages | Floating chat bubble → slide-up panel |
| `ChatInbox` | Staff chat | Split-pane conversation list + message thread |
| `AvailabilityPicker` | Portal home, room detail | Date range picker with live availability indicator |
| `PriceBreakdown` | Booking review | Table of nightly rates with totals |
| `CallerLookup` | New call log | Live search input that queries customers table |
| `KPICard` | Dashboard, analytics | Metric title + value + trend indicator |
| `OccupancyChart` | Analytics | 30-day bar chart (Recharts) |
| `AuditLogTimeline` | Booking detail | Chronological event list |
| `BookingForm` | New booking (staff) | Multi-field form with room availability check |

---

## 7. API / Edge Function Requirements

### 7.1 Next.js Route Handlers

All Route Handlers validate the Supabase session server-side using the `@supabase/ssr` package. Unauthorized requests return `401`. Role-insufficient requests return `403`.

---

**GET `/api/availability`**

Purpose: Return available room types (and count of available rooms) for a given date range and occupancy.

Request params: `check_in` (DATE), `check_out` (DATE), `num_adults` (INT), `num_children` (INT)

Response: Array of room type objects with `available_count`, `price_per_night` (considering overrides).

Logic:
1. Find all rooms of each type where `max_occupancy` (derived: `max_adults + max_children`) >= requested guests.
2. Exclude room_ids that have overlapping bookings (status IN pending, confirmed, checked_in).
3. Exclude room_ids that have room_blocks overlapping the date range.
4. Return types with available_count > 0.

---

**POST `/api/bookings`**

Purpose: Create a new booking.

Auth: Required (staff/admin OR customer for own booking).

Body: `{ room_type_id, check_in_date, check_out_date, num_adults, num_children, customer_id (staff only), special_requests, source }`

Logic:
1. Re-run availability check (server-side, prevents TOCTOU).
2. Select a specific room_id (lowest room_number available).
3. Calculate `nightly_breakdown` and `total_amount` using price overrides.
4. Insert booking row.
5. Insert initial `booking_audit_log` entry.
6. Trigger `send-booking-email` Edge Function asynchronously.
7. Return booking reference.

---

**PATCH `/api/bookings/[id]`**

Purpose: Modify booking (dates, room type, special requests).

Auth: Staff/Admin or customer (own booking, only if status IN ('pending', 'confirmed') AND check_in_date is more than 48 hours away).

---

**POST `/api/bookings/[id]/confirm`**

Purpose: Transition pending → confirmed.

Auth: Staff/Admin only.

Side effects: Trigger confirmation email.

---

**POST `/api/bookings/[id]/check-in`**

Purpose: Transition confirmed → checked_in.

Auth: Staff/Admin only.

Side effects: Update `rooms.status` to 'occupied'.

---

**POST `/api/bookings/[id]/check-out`**

Purpose: Transition checked_in → checked_out.

Auth: Staff/Admin only.

Side effects: Update `rooms.status` to 'available'; return billing summary.

---

**POST `/api/bookings/[id]/cancel`**

Purpose: Cancel a booking.

Auth: Staff/Admin; Customer (own, if before cutoff).

Body: `{ reason_code, reason_text }`

Side effects: Update `rooms.status` if was checked_in; trigger cancellation email.

---

**PATCH `/api/bookings/[id]/no-show`**

Purpose: Mark a confirmed booking as no-show.

Auth: Staff/Admin only.

Side effects: Apply cancellation_fee per hotel policy; update `rooms.status` to 'available'; trigger no-show notification email.

---

**GET `/api/rooms/status`**

Purpose: Return current status of all rooms for the status board.

Auth: Staff/Admin only.

---

**POST `/api/calls`**

Purpose: Create a call log entry.

Auth: Staff/Admin only.

Body: `{ caller_phone, direction, call_datetime, duration_secs, summary, follow_up_flag, follow_up_due, customer_id (optional) }`

---

**GET `/api/calls/lookup?phone={number}`**

Purpose: Fuzzy phone number lookup against customers table.

Auth: Staff/Admin only.

Returns: Array of matching customer profiles.

---

**GET `/api/analytics/summary`**

Purpose: Return dashboard KPI data.

Auth: Admin (full); Staff (limited fields).

Returns: `{ occupancy_rate, revenue_today, revenue_month, revenue_year, arrivals_today, departures_today, unread_chat_count, pending_follow_ups }`

---

### 7.2 Supabase Edge Functions

---

**`send-booking-email`**

Trigger: Called from booking Route Handlers on create, confirm, cancel.

Input: `{ booking_id, email_type: 'confirmation' | 'cancellation' | 'modification' }`

Logic:
1. Fetch full booking record with customer, room type.
2. Render HTML email template.
3. Send via Resend API.
4. Log send status to a `email_logs` table.

---

**`analytics-aggregate`**

Trigger: Scheduled (every 15 minutes via Supabase cron) OR on-demand from dashboard.

Logic:
1. Calculate occupancy rate.
2. Aggregate revenue by day/month/year.
3. Upsert into `analytics_cache` table for fast dashboard reads.

---

**`csv-export`**

Trigger: Admin requests export from analytics page.

Input: `{ start_date, end_date, export_type: 'bookings' | 'revenue' }`

Logic:
1. Query bookings with full joins for the date range.
2. Stream CSV to Supabase Storage as a temp file.
3. Generate a signed URL valid for 60 seconds.
4. Return signed URL.

---

**`caller-lookup`**

Trigger: Called from new call log form on phone number input.

Input: `{ phone: string }`

Logic:
1. Normalize phone number (strip formatting).
2. Query customers where phone ILIKE '%{normalized_last_7_digits}'.
3. Return top 5 matches with name, email, last booking date.

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Requirement | Target | Measurement Method |
|-------------|--------|-------------------|
| Portal home page initial load (LCP) | < 2.5 seconds on 4G | Vercel Speed Insights / Lighthouse |
| Staff dashboard load (authenticated) | < 1.5 seconds | Browser DevTools Network tab |
| Availability search response time | < 800ms p95 | Supabase Query Performance panel |
| Chat message delivery end-to-end | < 500ms | Client-side timestamp delta |
| Booking creation (API round-trip) | < 1.5 seconds | Route Handler response time logging |
| Room status board real-time update | < 5 seconds after DB change | Manual QA with two browser sessions |
| Analytics dashboard KPI load | < 2 seconds (from cache) | Client-side performance marks |
| CSV export (up to 10,000 rows) | < 10 seconds | Manual QA |

**Database Indexing Strategy:**

Critical indexes required for query performance:

- `bookings(room_id, check_in_date, check_out_date, status)` — availability check queries
- `bookings(customer_id)` — customer booking history
- `bookings(check_in_date)` — today's arrivals queries
- `bookings(status, check_in_date)` — dashboard aggregations
- `chat_messages(thread_id, created_at)` — conversation loading
- `call_logs(caller_phone)` — caller lookup
- `customers(phone)` — caller lookup
- `room_price_overrides(room_type_id, start_date, end_date)` — pricing queries
- `bookings(check_out_date)` — departure queries
- `call_logs(customer_id)` — customer call history
- `call_logs(follow_up_flag, follow_up_due) WHERE follow_up_flag = true` — partial index for follow-up task list
- `room_blocks(room_id, start_date, end_date)` — availability exclusion queries
- `customers(email) WHERE email IS NOT NULL` — partial index for email lookups

```sql
-- Additional indexes
CREATE INDEX idx_bookings_checkout ON bookings(check_out_date);
CREATE INDEX idx_call_logs_customer ON call_logs(customer_id);
CREATE INDEX idx_call_logs_followup ON call_logs(follow_up_flag, follow_up_due) WHERE follow_up_flag = true;
CREATE INDEX idx_room_blocks_availability ON room_blocks(room_id, start_date, end_date);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
```

**Auto-update `updated_at` trigger:**

All tables with an `updated_at` column use a shared trigger function to keep the timestamp current on every update.

```sql
-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON room_types FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chat_threads FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hotel_settings FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON room_price_overrides FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON room_blocks FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON call_logs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_logs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### 8.2 Security

**Authentication & Authorization:**
- All non-public routes require a valid Supabase JWT.
- JWTs are stored in httpOnly cookies (not localStorage) to prevent XSS theft.
- Session refresh handled automatically by `@supabase/ssr`.
- Middleware (`middleware.ts`) enforces role-based route guards before page render.
- Supabase RLS policies provide defense-in-depth at the database layer.

**Data Protection:**
- Customer PII (ID numbers, date of birth) fields encrypted at rest by Supabase (PostgreSQL encryption at rest enabled).
- Supabase Storage buckets for room photos are public (read-only). Chat attachment buckets require a signed URL (valid 1 hour).
- All API communication over HTTPS/TLS 1.3.

**Input Validation:**
- All Route Handler inputs validated with Zod schemas before database operations.
- SQL injection is prevented by using Supabase's parameterized query client (no raw string interpolation).
- File upload validation: MIME type checked server-side (not just extension), maximum size enforced.

**Rate Limiting:**
- Vercel's built-in edge rate limiting applied to `/api/*` routes.
- Availability search endpoint: 30 requests/minute per IP.
- Chat message endpoint: 10 messages/minute per user.
- Login endpoint: 5 attempts/minute per IP (Supabase Auth built-in).

**Audit & Compliance:**
- All booking state changes recorded in `booking_audit_log` (immutable rows).
- Admin actions (user deactivation, settings changes) logged to a separate `admin_audit_log` table.
- Data retention: booking records retained for 7 years (configurable); chat messages 2 years active then archived.

### 8.3 Scalability

**Database:**
- Supabase Pro plan supports connection pooling via PgBouncer (up to 200 concurrent connections in transaction mode).
- `analytics_cache` table decouples dashboard reads from heavy aggregate queries.
- `booking_audit_log` partitioned by year after initial implementation if volume warrants.
- Read replicas can be added for analytics queries without impacting booking writes.

**Application:**
- Next.js on Vercel scales automatically (serverless functions per request).
- Static pages (portal home, room type pages) use ISR (Incremental Static Regeneration) with a 60-second revalidation window to serve cached content under high load.
- Supabase Realtime supports up to 500 concurrent WebSocket connections on Pro plan; scale-up path to Team/Enterprise plan available.

**Storage:**
- Supabase Storage scales to terabytes; no application-level sharding needed for v1.0.

### 8.4 Reliability & Availability

| Requirement | Target |
|-------------|--------|
| Overall system uptime | 99.5% monthly |
| Planned maintenance window | Off-peak hours (2 AM – 4 AM local time), communicated 48 hrs in advance |
| Data backup frequency | Daily automated Supabase backups (point-in-time recovery on Pro plan) |
| Recovery Time Objective (RTO) | < 4 hours |
| Recovery Point Objective (RPO) | < 24 hours |

### 8.5 Accessibility

- Portal and staff application target **WCAG 2.1 AA** compliance.
- All interactive elements have visible focus indicators.
- Color is never the sole indicator of state (icons + text labels accompany color coding).
- All images have descriptive `alt` attributes.
- Forms use proper `<label>` associations, ARIA roles where needed.
- shadcn/ui components provide accessible primitives (Radix UI under the hood).

### 8.6 Browser Support

| Browser | Minimum Version |
|---------|----------------|
| Chrome | Last 2 versions |
| Firefox | Last 2 versions |
| Safari | 15+ |
| Edge | Last 2 versions |
| Mobile Safari (iOS) | iOS 15+ |
| Mobile Chrome (Android) | Android 10+ |

---

## 9. Milestones / Phased Rollout

### Phase 1 — Foundation (Weeks 1–4)
**Goal:** Core infrastructure, authentication, and room management working end-to-end.

| Deliverable | Details |
|-------------|---------|
| Supabase project setup | Database schema deployed, RLS policies configured, Auth enabled |
| Next.js project scaffold | App Router structure, Tailwind + shadcn/ui configured, Supabase client set up, middleware for role-based routing |
| Authentication flows | Login, register, forgot password, session management for all three roles |
| Room Types CRUD | Admin can create/edit/delete room types with photos and amenities |
| Individual Rooms CRUD | Admin can create/edit rooms, assign to types, set out-of-service blocks |
| Seasonal pricing | Admin can define price override rules per room type + date range |
| Room status board | Staff can view room grid with current status |

**Exit Criteria:** Admin can configure a full room inventory; staff can view room status; authentication is secure and role-separated.

---

### Phase 2 — Booking Core (Weeks 5–8)
**Goal:** Full booking lifecycle for staff-created reservations.

| Deliverable | Details |
|-------------|---------|
| Availability engine | `/api/availability` Route Handler with conflict detection |
| Staff booking creation | New booking form with customer lookup/creation, room selection, pricing calculation |
| Booking list & detail | Filterable booking table, detail page with full information |
| Booking calendar view | Gantt-style room × date grid |
| Confirm / Check-in / Check-out | State transition buttons with validation and room status update |
| Booking cancellation | Cancel with reason, room inventory release |
| Booking audit log | Full trail displayed on booking detail page |
| Email notifications | Confirmation, check-out summary, cancellation emails via Resend |

**Exit Criteria:** Staff can manage the complete booking lifecycle for walk-in and phone guests; all state transitions work correctly with no availability conflicts.

---

### Phase 3 — Customer Portal (Weeks 9–12)
**Goal:** Public-facing booking portal live and accepting reservations.

| Deliverable | Details |
|-------------|---------|
| Portal home page | Search form, room type grid, hotel information |
| Room type detail page | Full gallery, amenities, availability picker |
| Booking flow (4 steps) | Search → Details → Review → Confirmation with race condition handling |
| Customer authentication | Register, login, magic link for portal customers |
| My Account | Booking list, booking detail, self-service cancellation |
| ISR for portal pages | Room type pages statically generated with 60s revalidation |
| Mobile responsiveness | Full QA pass for mobile breakpoints |
| Accessibility audit | WCAG 2.1 AA check and remediation |

**Exit Criteria:** Customers can discover, book, and manage reservations online without staff assistance; portal passes Lighthouse accessibility audit ≥ 90.

---

### Phase 4 — Communication (Weeks 13–15)
**Goal:** Real-time chat and call logging operational.

| Deliverable | Details |
|-------------|---------|
| Supabase Realtime setup | Channels configured for chat delivery |
| Chat widget (portal) | Floating widget on all portal pages, session handling for guest users |
| Staff chat inbox | Two-panel inbox with thread list, real-time message delivery, unread badges |
| File attachments in chat | Upload to Supabase Storage, preview in chat |
| Chat resolve/reopen | Workflow for managing resolved threads |
| Call log entry | Form with customer lookup (phone number), direction, summary |
| Caller lookup API | Fuzzy phone search against customers table |
| Booking from call | Pre-fill booking form from call log entry |
| Follow-up flags | Appear in staff dashboard task list |

**Exit Criteria:** Staff can handle all guest inquiries via chat; all phone calls are logged; zero context-switching required between systems.

---

### Phase 5 — Analytics & Hardening (Weeks 16–18)
**Goal:** Admin analytics dashboard complete; system hardened for production launch.

| Deliverable | Details |
|-------------|---------|
| Analytics dashboard | KPI cards, occupancy trend chart, revenue by room type |
| Analytics aggregate Edge Function | Scheduled aggregation into cache table |
| CSV export | Booking data export via signed Supabase Storage URL |
| Staff condensed dashboard | Operational-focused view (arrivals, departures, chats, follow-ups) |
| Performance audit | Achieve Core Web Vitals targets; add required database indexes |
| Security audit | Review RLS policies; penetration test input validation; verify cookie security |
| Rate limiting | Apply Vercel edge rate limiting to all API routes |
| Load testing | Simulate 100 concurrent users; verify no booking conflicts under load |
| Error monitoring setup | Integrate Sentry for client and server error tracking |
| Documentation | API documentation, staff onboarding guide, admin configuration guide |

**Exit Criteria:** All PRD features implemented and tested; performance targets met; security review passed; system ready for production traffic.

---

### Phase 6 — Production Launch & Stabilization (Week 19–20)
**Goal:** Controlled production launch with monitoring.

| Deliverable | Details |
|-------------|---------|
| Staging environment validation | Full regression test on staging with production-like data |
| Staff training sessions | 1-hour walkthrough with front desk team; admin configuration session |
| Soft launch | Internal team uses system for 1 week alongside existing tools |
| Hard launch | Existing tools decommissioned; booking portal goes live |
| Post-launch monitoring | Daily check of error rates, query performance, real-time delivery latency for first 2 weeks |

---

### Summary Timeline

```
Week  1-4  : Phase 1 — Foundation
Week  5-8  : Phase 2 — Booking Core
Week  9-12 : Phase 3 — Customer Portal
Week 13-15 : Phase 4 — Communication
Week 16-18 : Phase 5 — Analytics & Hardening
Week 19-20 : Phase 6 — Launch
──────────────────────────────────────
Total      : ~20 weeks (5 months)
```

---

### Appendix A — Glossary

| Term | Definition |
|------|-----------|
| PMS | Property Management System — the category of software this product belongs to |
| RLS | Row Level Security — PostgreSQL feature for per-row access control |
| OTA | Online Travel Agency (e.g., Booking.com, Expedia) — out of scope for v1.0 |
| ISR | Incremental Static Regeneration — Next.js feature for caching server-rendered pages |
| LCP | Largest Contentful Paint — Core Web Vitals performance metric |
| CLS | Cumulative Layout Shift — Core Web Vitals stability metric |
| Gantt-style Calendar | A calendar where each room is a row and bookings appear as horizontal bars spanning their dates |
| Soft Launch | A limited production release to internal users before public announcement |
| TOCTOU | Time-of-Check-Time-of-Use — a race condition where availability changes between check and action |

---

### Appendix B — Open Questions for Stakeholder Review

1. **Payment Processing:** Should v1.0 include an actual payment gateway (Stripe) or just record "payment collected offline" as a boolean on the booking? A full Stripe integration adds 2–3 weeks to Phase 3.

2. **Multi-Currency:** Is IDR the only required currency, or does the portal need multi-currency display for international guests?

3. **Channel Manager:** Has a preferred OTA channel manager been identified for v2.0 integration (e.g., Cloudbeds, SiteMinder)? Early API exploration could de-risk that phase.

4. **Phone System Integration:** Does the hotel use a VoIP system (e.g., Twilio, RingCentral)? If caller ID can be passed programmatically, the call log form can auto-populate — this changes the caller lookup implementation.

5. **Cancellation Policy Flexibility:** Is a single system-wide cancellation cutoff (default 24 hours) sufficient, or do different room types need different policies?

6. **Breakfast / Add-ons:** Should the booking flow support add-ons (e.g., breakfast package, airport transfer) in v1.0?

7. **Reporting vs. Analytics:** Beyond the dashboard and CSV export, are there specific report formats required for accounting or tax purposes?

---

*End of Document — GoStay Hotel Management System PRD v1.0*

*Document Owner: Product Team*
*Next Review Date: Prior to Phase 1 kickoff*

### Critical Files for Implementation

Based on the architecture designed in this PRD, the following files will be most critical to implement first, as all other features depend on them:

- `/app/middleware.ts` — Role-based route guard using Supabase SSR session; gates all `/(staff)`, `/(admin)`, and `/(portal)` route groups
- `/lib/supabase/server.ts` — Server-side Supabase client factory used by all Route Handlers and Server Components
- `/app/api/availability/route.ts` — Core availability check engine; both the customer portal and staff booking form depend on this logic being correct and race-condition-safe
- `/app/(staff)/bookings/[id]/page.tsx` — The most complex staff-facing page, encompassing state transitions, audit log, pricing summary, and real-time room status updates
- `/supabase/migrations/001_initial_schema.sql` — The foundational database migration defining all tables, indexes, foreign keys, and RLS policies described in Section 4