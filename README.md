# Edge-Z.E.R.O. — Zero-Touch Onboarding Hub

**English** | [Русский](README_ru.md)

**Edge-Z.E.R.O.** is an industrial bare-metal automated provisioning platform (PXE/iPXE Zero-Touch Provisioning), centralized OS configuration management engine, and monitoring hub for road video recording devices and edge nodes.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20TypeScript%20%2B%20Vite-indigo)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLAlchemy%20%2B%20AsyncPG-emerald)
![Docker](https://img.shields.io/badge/Infrastructure-Docker%20Compose-blue)

---

## 🌟 Key Features

### ⚡ Zero-Touch PXE Provisioning & Auto-Discovery
* **Universal High-Speed Auto-Boot:** `dnsmasq` serves `ipxe.efi` and `undionly.kpxe` bootloaders via DHCP/TFTP, while kernel (`vmlinuz`) and ramdisk (`initrd.gz`) delivery streams over **1 Gbps HTTP** (TCP) for sub-second loading.
* **10-Minute Time-Bounded Auto-Discovery:** Real-time DHCP log parser and iPXE loop handler automatically discover new hardware within a 10-minute sliding window, ignoring inactive or powered-off historical devices.
* **ProxyDHCP Mode:** Operates seamlessly alongside existing network routers (MikroTik, Cisco, etc.) without DHCP pool conflicts.
* **Dynamic Templates & Local Apt Caching:** On-the-fly generation of `preseed.cfg` (Debian) and `user-data` (Ubuntu Subiquity) routed through an embedded local Apt caching proxy (`port 3142`) for gigabit package installation speeds.

### 🖥️ Location Profiles & Visual OS Configurator (Profiles)
* **Location Profiles:** Bind devices to physical geographic locations with specific network and regional presets.
* **Visual Preseed Configurator:** Interactive management of Locale, Timezone, Keyboard layout, Package mirrors, NTP, Gateway, DNS, and SSH public keys.
* **Transparent Password Hashing:** Server-side SHA-512 crypt password hashing for root and non-root user accounts before preseed template rendering.

### 📊 Real-Time Installation Logs & Progress Tracker
* **Physical TTY Text Console:** Forces live scrolling text mode (`DEBIAN_FRONTEND=text console=tty0`) on target device monitors, bypassing blue GUI windows.
* **Zero-Touch Automatic Reboot:** Automated unattended reboot upon completion (`d-i finish-install/reboot_in_progress note`).
* **Syslog Receiver (Debian):** Embedded UDP syslog server (`5140/udp`) receives detailed streaming logs from Debian Installer (`d-i preseed/syslog-server`) in real time with automatic box fallback matching.
* **Subiquity HTTP (Ubuntu):** Tracks high-level Ubuntu installation phases via REST `/report` endpoint.
* **Interactive ConsoleDrawer & On-Demand Terminal:** Live console drawer with 4-stage progress tracker (PXE Boot → OS Install → Run Scripts → Finalizing) accessible on-demand via a dedicated `Terminal` button in the Fleet view.

### 💻 Web SSH Terminal
* **Browser Terminal via xterm.js:** Full-featured terminal with automatic window auto-fitting (`@xterm/addon-fit`) and ANSI color support.
* **WebSocket SSH Proxy:** Bidirectional proxy bridge (`/api/ssh/{box_id}` + `asyncssh`) for direct SSH terminal access to `ACTIVE` or `MAINTENANCE` nodes directly from the browser.

### 🔍 Hardware Inspection & Integrity Audits (Baseline Diff)
* **Automated Diagnostics:** Post-install diagnostic collector captures full hardware specs (CPU, RAM, PCI video capture cards, USB hubs, `/dev/ttyS*` serial ports, storage, NICs).
* **Baseline Comparison (Diff):** Interactive visual diff modal highlighting hardware additions, removals, or tampering relative to the accepted baseline.
* **Heartbeat Monitoring:** Background health checker automatically flags unreachable nodes as `MAINTENANCE` and sends alerts.

### 🔄 Backup Cluster Synchronization (Edge B.R.O.)
* **Node Alignment:** Matches provisioned devices against the Edge B.R.O. backup orchestrator cluster.
* **One-Click Enrollment:** Direct registration and auth credential transfer to the backup cluster in one click.

### 🔔 Security & Alerting
* **Role-Based Access Control:** Configurable user roles (Administrator, Operator, Viewer).
* **Telegram Notifications:** Individual `telegram_id` subscriptions for instant alerts when a device transitions to active status.
* **Audit Logging:** System and user activity logs stored in PostgreSQL and viewable in the UI.

---

## 🛠 System Architecture

```
                               ┌────────────────────────────────────────┐
                               │        Edge Z.E.R.O. Frontend          │
                               │    (React 19 + TypeScript + Vite)      │
                               └──────────────────┬─────────────────────┘
                                                  │ HTTP / WebSockets
                                                  ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │                                    FastAPI Backend                                       │
 │  ┌─────────────────────┐      ┌─────────────────────────┐      ┌──────────────────────┐  │
 │  │ REST API Endpoints  │      │  SSH Proxy (WebSocket)  │      │ Syslog UDP Listener  │  │
 │  └──────────┬──────────┘      └────────────┬────────────┘      └──────────┬───────────┘  │
 └─────────────┼──────────────────────────────┼──────────────────────────────┼──────────────┘
               │                              │                              │
               ▼                              ▼                              ▼
    ┌──────────────────┐            ┌──────────────────┐           ┌──────────────────┐
    │  PostgreSQL DB   │            │ Box SSH Daemon   │           │ Bare-Metal Box   │
    │ (SQLAlchemy 2.0) │            │ (Port 22/2222)   │           │ (d-i / Subiquity)│
    └──────────────────┘            └──────────────────┘           └──────────────────┘
```

---

## 🚦 Device Lifecycle

```
  ┌───────────────┐        ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
  │  Unregistered │ ─────> │   REGISTERED  │ ─────> │   INSTALLING  │ ─────> │     ACTIVE    │
  │ (Auto-Detect) │        │ (Set Config)  │        │ (PXE + Log)   │        │ (SSH + B.R.O) │
  └───────────────┘        └───────────────┘        └───────────────┘        └───────────────┘
```

1. **Discovery:** A physical node powers on and issues a PXE DHCP request. Edge Z.E.R.O. captures the MAC address and registers it as `NEW`.
2. **Configuration:** Operator assigns internal SN, selects Location, and chooses OS Image (Debian/Ubuntu).
3. **Installation:** On reboot, the device fetches TFTP/HTTP boot files, streams live syslog data, and executes `init.sh` post-install scripts.
4. **Active Deployment:** Device sends final callback, transitions to `ACTIVE`, saves hardware baseline, and registers in Edge B.R.O.

---

## 📦 Quick Start

### Prerequisites
* **Docker Engine** 24.0+
* **Docker Compose** 2.20+

### Deployment

1. Clone repository:
   ```bash
   git clone https://github.com/masseselsev/edge-zero.git
   cd edge-zero
   ```

2. Launch Docker stack:
   ```bash
   docker compose up -d --build
   ```

3. Access web interface:
   * **Web UI:** http://localhost:5555
   * **API Docs:** http://localhost:7000/docs

### Default Credentials
On initial fresh database creation:
* **Username:** `admin`
* **Password:** `q1w2e3r4` *(or `admin123` on previously deployed DB volumes)*

To reset the superadmin password:
```bash
docker compose exec edge-zero-core python /app/create_admin.py
```

---

## 📄 License

Distributed under the MIT License.
