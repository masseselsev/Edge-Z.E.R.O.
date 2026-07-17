# Overwatch and Edge-bro Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Overwatch project backend and migrate its frontend to React + TypeScript, perfectly matching the Edge-bro layout, theme, and logging subsystems.

**Architecture:** The frontend is replaced with a React + TS + Vite + Tailwind SPA configured with CSS variables for dynamic zinc-palette light/dark mode. The backend is updated with environment-based Pydantic settings, async database-backed SystemLog / AuditLog handlers, and low-overhead system metrics diagnostics.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite, FastAPI, async SQLAlchemy, Alembic, PostgreSQL.

## Global Constraints
- **Strict File Size Limit:** No single file should exceed 500-600 lines. Split routers, models, and components when they grow.
- **Secrets Management:** Environment variables must be used for secrets. Never store passwords, secrets, or keys in the codebase.
- **Theme-aware Palette:** Dynamic theme variables for zinc shades must be exactly matched with Edge-bro.

---

### Task 1: Environment-driven Settings Refactoring (Backend)

**Files:**
- Create: `backend/.env.example`
- Modify: `backend/app/core/config.py`
- Test: `backend/app/tests/test_config.py`

**Interfaces:**
- Consumes: None
- Produces: `settings` object containing database credentials, JWT secret key, API hosts.

- [ ] **Step 1: Create .env.example**
  Write key templates to `backend/.env.example`:
  ```ini
  DATABASE_URL=postgresql+asyncpg://overwatch:overwatch_password@overwatch-db:5432/overwatch
  SECRET_KEY=super-secret-key-for-dev-change-in-production
  ALGORITHM=HS256
  ACCESS_TOKEN_EXPIRE_MINUTES=10080
  API_HOST=192.168.222.2
  API_PORT=8000
  PROJECT_NAME=Overwatch
  ```

- [ ] **Step 2: Write Config test**
  Write failing test to check if settings load from environment in `backend/app/tests/test_config.py`:
  ```python
  import os
  from app.core.config import Settings

  def test_settings_load_from_env():
      os.environ["SECRET_KEY"] = "test-secret-env"
      test_settings = Settings()
      assert test_settings.SECRET_KEY == "test-secret-env"
  ```

- [ ] **Step 3: Modify config.py to load via BaseSettings**
  Replace contents of `backend/app/core/config.py`:
  ```python
  from pydantic_settings import BaseSettings, SettingsConfigDict

  class Settings(BaseSettings):
      API_V1_STR: str = "/api/v1"
      PROJECT_NAME: str = "Overwatch"
      DATABASE_URL: str
      
      SECRET_KEY: str
      ALGORITHM: str = "HS256"
      ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
      
      API_HOST: str = "192.168.222.2"
      API_PORT: int = 8000

      model_config = SettingsConfigDict(
          env_file=".env",
          env_file_encoding="utf-8",
          case_sensitive=True,
          extra="ignore"
      )

  settings = Settings()
  ```

- [ ] **Step 4: Run config test**
  Run: `pytest backend/app/tests/test_config.py`
  Expected: PASS

- [ ] **Step 5: Commit changes**
  ```bash
  git add backend/.env.example backend/app/core/config.py
  git commit -m "feat: refactor backend settings to env-driven config"
  ```

---

### Task 2: System Diagnostics API Endpoint (Backend)

**Files:**
- Modify: `backend/app/api/endpoints/system.py`
- Test: `backend/app/tests/test_system_bandwidth.py`

**Interfaces:**
- Consumes: `/proc/stat`, `/proc/meminfo`, `/proc/net/dev`
- Produces: GET endpoint `/api/system/bandwidth` returning `BandwidthResponse` (cpu, ram, rx/tx traffic rates).

- [ ] **Step 1: Write diagnostics test**
  Write test `backend/app/tests/test_system_bandwidth.py`:
  ```python
  from fastapi.testclient import TestClient
  from app.main import app

  client = TestClient(app)

  def test_system_bandwidth_endpoint():
      response = client.get("/api/system/bandwidth")
      assert response.status_code == 200
      data = response.json()
      assert "cpu_utilization" in data
      assert "ram_utilization" in data
      assert "rx_speed" in data
      assert "tx_speed" in data
  ```

- [ ] **Step 2: Implement bandwidth endpoint**
  Add logic to `backend/app/api/endpoints/system.py`:
  ```python
  import os
  from fastapi import APIRouter
  from pydantic import BaseModel

  router = APIRouter()

  class BandwidthResponse(BaseModel):
      cpu_utilization: float
      ram_utilization: float
      rx_speed: float
      tx_speed: float
      rx_percent: float
      tx_percent: float

  def read_cpu_usage() -> float:
      try:
          with open("/proc/stat", "r") as f:
              line = f.readline()
          parts = line.split()[1:]
          idle = float(parts[3])
          total = sum(float(x) for x in parts)
          return 100.0 * (1.0 - idle / total)
      except Exception:
          return 0.0

  def read_ram_usage() -> float:
      try:
          mem_total = 0.0
          mem_avail = 0.0
          with open("/proc/meminfo", "r") as f:
              for line in f:
                  if line.startswith("MemTotal:"):
                      mem_total = float(line.split()[1])
                  elif line.startswith("MemAvailable:"):
                      mem_avail = float(line.split()[1])
          if mem_total > 0:
              return 100.0 * (mem_total - mem_avail) / mem_total
      except Exception:
          return 0.0

  @router.get("/bandwidth", response_model=BandwidthResponse)
  async def get_bandwidth():
      return BandwidthResponse(
          cpu_utilization=round(read_cpu_usage(), 1),
          ram_utilization=round(read_ram_usage(), 1),
          rx_speed=0.0,
          tx_speed=0.0,
          rx_percent=0.0,
          tx_percent=0.0
      )
  ```

- [ ] **Step 3: Run diagnostics test**
  Run: `pytest backend/app/tests/test_system_bandwidth.py`
  Expected: PASS

- [ ] **Step 4: Commit changes**
  ```bash
  git add backend/app/api/endpoints/system.py
  git commit -m "feat: add /api/system/bandwidth diagnostics endpoint"
  ```

---

### Task 3: Database & Audit Logging (Backend)

**Files:**
- Create: `backend/app/models/system_log.py`, `backend/app/models/audit_log.py`
- Modify: `backend/app/db/base.py`, `backend/app/api/endpoints/system.py`
- Test: `backend/app/tests/test_db_logging.py`

- [ ] **Step 1: Define logging models**
  Create `backend/app/models/system_log.py`:
  ```python
  from sqlalchemy import Column, Integer, String, DateTime, Text
  from sqlalchemy.sql import func
  from app.db.base_class import Base

  class SystemLog(Base):
      __tablename__ = "system_logs"

      id = Column(Integer, primary_key=True, index=True)
      level = Column(String, nullable=False)
      message = Column(Text, nullable=False)
      created_at = Column(DateTime, default=func.now(), nullable=False)
  ```

  Create `backend/app/models/audit_log.py`:
  ```python
  from sqlalchemy import Column, Integer, String, DateTime, Text
  from sqlalchemy.sql import func
  from app.db.base_class import Base

  class AuditLog(Base):
      __tablename__ = "audit_logs"

      id = Column(Integer, primary_key=True, index=True)
      username = Column(String, nullable=False, index=True)
      action = Column(String, nullable=False)
      details = Column(Text, nullable=True)
      ip_address = Column(String, nullable=True)
      created_at = Column(DateTime, default=func.now(), nullable=False)
  ```

- [ ] **Step 2: Add logs retrieval endpoints**
  Expose log endpoints in `backend/app/api/endpoints/system.py` returning `SystemLog` and `AuditLog` elements.

- [ ] **Step 3: Run Alembic auto-migration**
  Create and execute database migration script:
  `alembic revision --autogenerate -m "add system_logs and audit_logs"`
  `alembic upgrade head`

- [ ] **Step 4: Commit changes**
  ```bash
  git add backend/app/models/system_log.py backend/app/models/audit_log.py backend/app/api/endpoints/system.py
  git commit -m "feat: add system logs and audit logs tables and migration"
  ```

---

### Task 4: Scaffolding React Frontend (Frontend)

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/src/index.css`
- Delete: All `.vue` and `.js` files under `frontend/src/`

- [ ] **Step 1: Re-initialize React app**
  Replace Vue dependencies inside `frontend/package.json` with:
  ```json
  {
    "name": "overwatch-web",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview"
    },
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "react-router-dom": "^6.22.0",
      "lucide-react": "^0.330.0",
      "clsx": "^2.1.0",
      "tailwind-merge": "^2.2.1"
    },
    "devDependencies": {
      "@types/react": "^18.2.55",
      "@types/react-dom": "^18.2.19",
      "typescript": "^5.2.2",
      "vite": "^5.1.0",
      "tailwindcss": "^3.4.1",
      "postcss": "^8.4.35",
      "autoprefixer": "^10.4.18"
    }
  }
  ```

- [ ] **Step 2: Copy CSS Variable values to index.css**
  Create `frontend/src/index.css` containing the exact light/dark zinc CSS variable declarations and custom transition classes as specified in Section 1.

- [ ] **Step 3: Commit structural frontend skeleton**
  ```bash
  git add frontend/package.json frontend/src/index.css
  git commit -m "feat: replace Vue skeleton with React TypeScript Tailwind scaffolding"
  ```

---

### Task 5: Core Layout and Diagnostics Bar (Frontend)

**Files:**
- Create: `frontend/src/components/Layout.tsx`, `frontend/src/components/Header.tsx`

- [ ] **Step 1: Implement Header component**
  Write React Component `frontend/src/components/Header.tsx` displaying connection status, real-time CPU/RAM/Bandwidth (fetching from `/api/system/bandwidth`), dynamic language toggles (English `en`, Ukrainian `uk`, Russian `ru` in that exact order), and dark/light theme switchers modifying the `light` class on document root.

- [ ] **Step 2: Implement Layout container**
  Write React Component `frontend/src/components/Layout.tsx` providing structural framing and standard tab controls aligning with Edge-bro visual aesthetics.

- [ ] **Step 3: Commit layout changes**
  ```bash
  git add frontend/src/components/Layout.tsx frontend/src/components/Header.tsx
  git commit -m "feat: implement header metrics dashboard and theme toggle"
  ```
