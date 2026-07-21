# VSM2 Console Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist custom command shortcuts per-user in the central Postgres database via `SystemSettings` table.

**Architecture:** Add FastAPI REST endpoints in `vsm2_flasher.py` to retrieve and store JSON-serialized shortcuts lists under `user_shortcuts:<username>`. Update the React frontend `Vsm2FlasherTab.tsx` to load/save shortcuts via these API routes and display adding/deleting controls.

**Tech Stack:** FastAPI, SQLAlchemy, React, TailwindCSS.

## Global Constraints
- Target files: `backend/app/api/endpoints/vsm2_flasher.py`, `frontend/src/components/Vsm2FlasherTab.tsx`.
- Keep components focused and reusable.
- Follow existing patterns for database query sessions and current user injection.

---

### Task 1: Backend Endpoints & Database Storage

**Files:**
- Modify: `backend/app/api/endpoints/vsm2_flasher.py`
- Create: `backend/test_console_shortcuts.py`

**Interfaces:**
- Consumes: `SystemSettings` model from `app.models.system_settings`.
- Produces:
  - `GET /api/vsm2-flasher/console/shortcuts` -> returns `List[str]`
  - `POST /api/vsm2-flasher/console/shortcuts` -> returns `{"status": "success"}`

- [ ] **Step 1: Create backend unit test**
  Create `backend/test_console_shortcuts.py` with tests for retrieving default shortcuts, saving custom shortcuts, and retrieving customized shortcuts.
  ```python
  import pytest
  from unittest.mock import AsyncMock, patch

  @pytest.mark.asyncio
  async def test_get_default_shortcuts():
      # Test GET defaults when no database entry exists
      from app.api.endpoints.vsm2_flasher import get_shortcuts
      mock_db = AsyncMock()
      mock_db.execute.return_value.scalar_one_or_none.return_value = None
      
      mock_user = AsyncMock()
      mock_user.username = "testuser"
      
      res = await get_shortcuts(db=mock_db, current_user=mock_user)
      assert res == ["read temp", "read version", "read tech_data", "write led 1", "write led 0"]

  @pytest.mark.asyncio
  async def test_save_and_get_shortcuts():
      # Test POST saves shortcuts, and subsequent GET retrieves them
      from app.api.endpoints.vsm2_flasher import get_shortcuts, save_shortcuts, ShortcutsSaveRequest
      from app.models.system_settings import SystemSettings
      import json
      
      mock_db = AsyncMock()
      mock_user = AsyncMock()
      mock_user.username = "testuser"
      
      # Mock db save
      settings_record = SystemSettings(key="user_shortcuts:testuser", value=json.dumps(["custom cmd 1"]))
      mock_db.execute.return_value.scalar_one_or_none.return_value = settings_record
      
      req = ShortcutsSaveRequest(shortcuts=["custom cmd 1"])
      post_res = await save_shortcuts(payload=req, db=mock_db, current_user=mock_user)
      assert post_res == {"status": "success"}
      
      get_res = await get_shortcuts(db=mock_db, current_user=mock_user)
      assert get_res == ["custom cmd 1"]
  ```

- [ ] **Step 2: Run backend tests to verify they fail**
  Run: `pytest backend/test_console_shortcuts.py -v`
  Expected: FAIL (ImportError or NameError because functions are not implemented yet).

- [ ] **Step 3: Implement endpoints in `vsm2_flasher.py`**
  Add the Pydantic schema and endpoints to `backend/app/api/endpoints/vsm2_flasher.py`:
  ```python
  import json
  # ... existing imports ...
  from app.models.system_settings import SystemSettings

  class ShortcutsSaveRequest(BaseModel):
      shortcuts: List[str]

  @router.get("/console/shortcuts", response_model=List[str])
  async def get_shortcuts(
      db: AsyncSessionLocal = Depends(deps.get_db_async),
      current_user: User = Depends(deps.get_current_user)
  ):
      username = current_user.username
      key = f"user_shortcuts:{username}"
      
      # Query key-value store
      stmt = select(SystemSettings).where(SystemSettings.key == key)
      result = await db.execute(stmt)
      record = result.scalar_one_or_none()
      
      if record and record.value:
          try:
              return json.loads(record.value)
          except Exception:
              pass
      return ["read temp", "read version", "read tech_data", "write led 1", "write led 0"]

  @router.get("/console/shortcuts", response_model=List[str]) # Wait, replace the POST endpoint below
  @router.post("/console/shortcuts")
  async def save_shortcuts(
      payload: ShortcutsSaveRequest,
      db: AsyncSessionLocal = Depends(deps.get_db_async),
      current_user: User = Depends(deps.get_current_user)
  ):
      username = current_user.username
      key = f"user_shortcuts:{username}"
      
      stmt = select(SystemSettings).where(SystemSettings.key == key)
      result = await db.execute(stmt)
      record = result.scalar_one_or_none()
      
      val_str = json.dumps(payload.shortcuts)
      if record:
          record.value = val_str
      else:
          record = SystemSettings(key=key, value=val_str)
          db.add(record)
      
      await db.commit()
      return {"status": "success"}
  ```

- [ ] **Step 4: Run backend tests to verify they pass**
  Run: `pytest backend/test_console_shortcuts.py -v`
  Expected: PASS.

- [ ] **Step 5: Commit backend changes**
  ```bash
  git add backend/app/api/endpoints/vsm2_flasher.py backend/test_console_shortcuts.py
  git commit -m "feat: implement database shortcuts storage and backend endpoints"
  ```

---

### Task 2: Frontend Implementation

**Files:**
- Modify: `frontend/src/components/Vsm2FlasherTab.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/vsm2-flasher/console/shortcuts`
  - `POST /api/vsm2-flasher/console/shortcuts`

- [ ] **Step 1: Load shortcuts from backend on mount**
  Modify `Vsm2FlasherTab.tsx` to query shortcuts from API instead of hardcoding.
  ```typescript
  // Replace:
  // const [quickActions, setQuickActions] = useState<string[]>([
  //   'read temp', 'read version', 'read tech_data', 'write led 1', 'write led 0'
  // ]);
  // With:
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [newShortcut, setNewShortcut] = useState('');
  ```
  Add fetching logic:
  ```typescript
  const fetchShortcuts = async () => {
    try {
      const res = await fetch('/api/vsm2-flasher/console/shortcuts');
      if (res.ok) {
        setQuickActions(await res.json());
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchRepoStatus();
    fetchConsoleCommands();
    detectHostIps();
    fetchShortcuts();  // Load shortcuts on mount
    
    // ... existing EventSource logic ...
  }, []);
  ```

- [ ] **Step 2: Add save function and inline shortcuts editing**
  Add save/update functions to `Vsm2FlasherTab.tsx`:
  ```typescript
  const saveShortcuts = async (updated: string[]) => {
    setQuickActions(updated);
    try {
      await fetch('/api/vsm2-flasher/console/shortcuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcuts: updated })
      });
    } catch (e) { console.error(e); }
  };

  const handleAddShortcut = () => {
    const val = newShortcut.trim();
    if (val && !quickActions.includes(val)) {
      const updated = [...quickActions, val];
      saveShortcuts(updated);
    }
    setNewShortcut('');
  };
  ```

- [ ] **Step 3: Modify Shortcuts JSX markup**
  Replace the shortcuts section in JSX (around line 350):
  ```tsx
              {consoleConnected && (
                <div className="pt-2 space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-500">Quick Command Shortcuts</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {quickActions.map(action => (
                      <button
                        key={action}
                        onClick={() => handleConsoleSend(action)}
                        disabled={sendingCmd}
                        className="group flex items-center px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-mono text-zinc-300 rounded hover:text-indigo-400 transition-all cursor-pointer"
                      >
                        <span>{action}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = quickActions.filter(a => a !== action);
                            saveShortcuts(updated);
                          }}
                          className="ml-2 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete shortcut"
                        >
                          ✕
                        </span>
                      </button>
                    ))}
                    
                    <input
                      type="text"
                      value={newShortcut}
                      onChange={(e) => setNewShortcut(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddShortcut();
                      }}
                      onBlur={handleAddShortcut}
                      placeholder="+ Add Command"
                      className="px-3 py-1 bg-zinc-950 border border-dashed border-zinc-800 text-[11px] font-mono text-zinc-400 rounded outline-none focus:border-indigo-500 focus:border-solid transition-colors max-w-[130px]"
                    />
                  </div>
                </div>
              )}
  ```

- [ ] **Step 4: Commit frontend changes**
  ```bash
  git add frontend/src/components/Vsm2FlasherTab.tsx
  git commit -m "feat: implement shortcuts adding, deleting, and backend sync on frontend"
  ```
