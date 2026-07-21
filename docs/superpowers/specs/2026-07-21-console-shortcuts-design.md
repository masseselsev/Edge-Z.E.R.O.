# Design Spec: User-Specific Console Command Shortcuts

This document describes the design for persisting VSM2 flasher console shortcuts on the backend for each user using the existing `SystemSettings` table.

## Goals
- Allow users to add and remove custom command shortcuts in the VSM2 Flasher terminal panel.
- Persist shortcuts per-user in the central database rather than locally in the browser.
- Deliver this without changing the DB schema or requiring complex database migrations.

## Proposed Architecture

### 1. Database Persistence
We will store user shortcuts in the `system_settings` table:
- **Key format**: `user_shortcuts:<username>`
- **Value**: JSON-serialized list of strings, e.g., `["read temp", "read version", "write led 1"]`.

### 2. Backend API
We will add two endpoints in `vsm2_flasher.py`:

#### `GET /api/vsm2-flasher/console/shortcuts`
- **Authentication**: Requires active JWT token (current user).
- **Behavior**:
  - Queries `SystemSettings` where `key == f"user_shortcuts:{username}"`.
  - If a record exists, deserializes and returns the list of shortcuts.
  - If no record exists, returns the default list: `["read temp", "read version", "read tech_data", "write led 1", "write led 0"]`.
- **Response Format**: `List[str]`

#### `POST /api/vsm2-flasher/console/shortcuts`
- **Authentication**: Requires active JWT token (current user).
- **Request Body**: `List[str]`
- **Behavior**:
  - Validates input list size and elements.
  - Saves or updates the JSON-serialized list string in the `SystemSettings` table.
  - Returns `{"status": "success"}`.

### 3. Frontend Integration
In `Vsm2FlasherTab.tsx`:
- On component mount, query the `GET /api/vsm2-flasher/console/shortcuts` endpoint to load the user's saved shortcuts.
- Add a new input field `+ Add Command` next to the shortcut buttons.
- On hover, show a delete cross `✕` on each shortcut.
- When shortcuts are added or deleted, make a `POST` request to `/api/vsm2-flasher/console/shortcuts` to save the updated list on the server.
