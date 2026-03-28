

# BreakTrack: Email/Password Authentication + UI Improvements

## Overview

This plan converts the agent login system from PIN-based (localStorage) to proper email/password authentication using Supabase, and modernizes the Login and Agent Panel UIs.

---

## What Changes

### 1. Connect Supabase Backend
- Enable Supabase (Lovable Cloud) to handle authentication and data storage
- Create database tables for agents, break sessions, and active breaks
- Set up Row-Level Security (RLS) so agents can only see their own data
- Create a user roles table to distinguish agents from managers

### 2. Database Schema

**Tables to create:**

- `profiles` -- stores agent display name, linked to auth.users
- `user_roles` -- stores roles (agent, manager) per user
- `break_sessions` -- completed break records (agent, type, start, end, duration, date)
- `active_breaks` -- currently active breaks (one per agent at most)

Management will create agent accounts by entering a name, email, and password. The system will use Supabase Auth to register each agent.

### 3. New Login UI (Modern, Clean)
- A centered, vertical login card with the BreakTrack logo/icon at the top
- Email and password input fields
- A "Sign In" button
- Clean, minimal design with the existing teal/navy theme
- No more agent name grid or PIN pad
- The "Management Dashboard" link moves to a separate management login or is role-gated after sign-in

### 4. Role-Based Routing
- After login, the system checks the user's role
- **Agent role** -- redirected to `/agent` (Agent Panel)
- **Manager role** -- redirected to `/management` (Management Dashboard)
- Agents cannot access the management dashboard
- Managers can access both views

### 5. Agent Panel UI Improvements
- Cleaner header with avatar and greeting ("Welcome back, Taz")
- Larger, more prominent break timer with animated ring/circle progress
- Break type selection as visual icon buttons instead of a dropdown
- Daily usage shown as a circular progress indicator
- Today's break history in a cleaner card layout
- Smooth transitions and micro-animations

### 6. Management: Add New Agents
- Updated "Add Agent" dialog to accept: Name, Email, Password
- Creates a Supabase Auth user and assigns the "agent" role
- Removes PIN-based logic entirely

---

## Technical Details

### Supabase Setup
1. Enable Lovable Cloud (Supabase integration)
2. Run migrations to create tables with RLS policies
3. Create a `has_role()` security definer function to safely check roles
4. Seed initial agent accounts (the 19 agents listed) with default passwords that management can share

### Auth Flow
- Use `supabase.auth.signInWithPassword()` for login
- Use `supabase.auth.signUp()` in the management panel to create agents
- Use `onAuthStateChange` listener for session management
- Protected routes check role before rendering

### File Changes
| File | Change |
|---|---|
| `src/pages/Index.tsx` | Replace with email/password login form |
| `src/pages/AgentPanel.tsx` | Redesign UI, switch from localStorage to Supabase queries |
| `src/pages/ManagementDashboard.tsx` | Update "Add Agent" to create Supabase auth users; read data from DB |
| `src/hooks/useAgentAuth.ts` | Replace with Supabase auth hook |
| `src/lib/store.ts` | Replace localStorage functions with Supabase client calls |
| `src/lib/types.ts` | Keep break types; remove PIN-related types |
| `src/App.tsx` | Add auth context provider and protected route wrappers |
| New: `src/integrations/supabase/` | Auto-generated Supabase client files |
| New: `src/components/ProtectedRoute.tsx` | Route guard checking auth + role |

### Migration SQL (summary)
- Create `profiles` table linked to `auth.users`
- Create `user_roles` table with `app_role` enum (agent, manager)
- Create `break_sessions` and `active_breaks` tables
- Enable RLS on all tables
- Create `has_role()` function
- Set up trigger to auto-create profile on signup
