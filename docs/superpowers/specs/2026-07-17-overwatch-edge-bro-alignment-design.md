# Overwatch and Edge-bro Alignment Design Specification

This design document outlines the plan to align the **Overwatch** project with the **Backup-edge-Restore (Edge-bro)** ecosystem. It details the complete migration of the frontend to React + TypeScript and enhancements to the backend (logging, metrics, configurations).

---

## 1. Frontend Migration Spec

### Tech Stack Conversion
- **Framework:** React 18+ (moving away from Vue 3).
- **Language:** TypeScript (for consistency and type-safety).
- **Styling:** Tailwind CSS + custom styles mapping zinc levels to CSS variables (exact replica of Edge-bro's `index.css`).
- **Icons:** `lucide-react` (replacing custom SVG/CSS icons).
- **Build Tool:** Vite.

### Layout & Navigation Structure
The sidebar will be replaced by a top-bar header with two distinct rows:
1. **Row 1: Title & Controls**
   - **Left:** Logo `edge.OVERWATCH` + Connection indicator.
   - **Center:** Real-time diagnostics widgets (CPU, RAM, Bandwidth utilization) polling `/api/system/bandwidth` every 3 seconds.
   - **Right:** 
     - User profile dropdown menu (Logout, Password reset).
     - Language Selector dropdown (English `en`, Ukrainian `uk`, Russian `ru` in that exact order).
     - Theme Switcher (Dark/Light mode) toggling the `.light` class on the `<html>` or `<body>` element.
2. **Row 2: Tab Navigation**
   - Centered flat button navigation mapping the tabs:
     - **Dashboard:** Core summary metrics (Boxes count, status breakdown, active alarms).
     - **Inventory:** Table of all boxes, expandable detail panels, batch actions (Register, tag, provision, delete), location picker.
     - **Library:** OS ISO files management, component definitions, component templates.
     - **Init Scripts:** Post-provisioning init script uploads and assignment.
     - **Logs:** Dynamic list of running background tasks (Celery/Async tasks list) and database logging console (terminal output format).
     - **Settings:** App/DHCP/Network configurations.

### Dark/Light Mode Theme System
We will import Edge-bro's color system using the CSS variables from `index.css`:
```css
:root {
  --zinc-50: 250 250 250;
  --zinc-100: 244 244 245;
  --zinc-200: 228 228 231;
  --zinc-300: 212 212 216;
  --zinc-400: 161 161 170;
  --zinc-500: 113 113 122;
  --zinc-700: 63 63 70;
  --zinc-750: 48 48 54;
  --zinc-800: 39 39 42;
  --zinc-900: 24 24 27;
  --zinc-950: 9 9 11;
  --body-bg: 11 15 25;      /* #0b0f19 */
  --body-text: 243 244 246; /* #f3f4f6 */
}
.light {
  --zinc-950: 249 250 251;  /* light-gray sunken */
  --zinc-900: 255 255 255;  /* pure white cards */
  --zinc-800: 228 228 231;  /* borders */
  --zinc-750: 244 244 245;
  --zinc-700: 212 212 216;
  --zinc-500: 100 116 139;
  --zinc-400: 71 85 105;
  --zinc-300: 30 41 59;
  --zinc-200: 15 23 42;
  --zinc-100: 2 6 23;
  --zinc-50: 0 0 0;
  --body-bg: 243 244 246;   /* light page background */
  --body-text: 15 23 42;
}
```
All components will utilize Tailwind's variable alpha values (e.g. `bg-zinc-900 border-zinc-800 text-zinc-300`) to automatically adjust colors when switching between dark and light themes.

---

## 2. Backend & API Alignment Spec

### Environment Configuration & Secrets Management
- All hardcoded configurations will be removed from `app/core/config.py`.
- We will add a `.env.example` in the root of the project.
- Pydantic Settings will load settings directly from environmental variables or `.env`.

### DB Logging Handler (`SystemLog`)
- **Table Definition:**
  - `id`: Integer (PK, Serial)
  - `level`: String (INFO, WARNING, ERROR, DEBUG)
  - `message`: Text
  - `created_at`: DateTime (timezone aware)
- **Log Handler:** Build a custom async log handler that intercepts logging events from standard loggers (`uvicorn`, `fastapi`) and logs to the database using the async engine.

### Admin Audit Logging (`AuditLog`)
- **Table Definition:**
  - `id`: Integer (PK, Serial)
  - `username`: String
  - `action`: String
  - `details`: Text
  - `ip_address`: String
  - `created_at`: DateTime
- **Audit Decorator:** Implement `log_user_action` to record security/configuration actions performed by administrators, resolving client IP addresses accurately.

### System Diagnostics API Endpoint
- **Path:** `/api/system/bandwidth`
- **Output:** Returns CPU utilization, RAM usage, network interface read/write traffic rates, and percentages.
- **Implementation:** Low-overhead Linux file parser reading from `/proc/stat`, `/proc/meminfo`, and `/proc/net/dev`.

---

## 3. Deployment & Multi-Container Setup
- Align docker configs to support hot-reloading for the React frontend, caching, and database credentials mapping.
