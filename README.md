# LabERP — Mini Clinical Laboratory ERP System

A full-stack, single-project clinical laboratory management system built with Node.js, Express, SQLite, and vanilla JavaScript.

## Quick Start

```bash
cd lab-erp
npm install
npm start
```

Open http://localhost:3000

## Default Accounts

| Username       | Password   | Role          |
|----------------|------------|---------------|
| admin          | admin123   | ADMIN         |
| receptionist   | rec123     | RECEPTIONIST  |
| technician     | tech123    | TECHNICIAN    |
| biochemist     | bio123     | BIOCHEMIST    |

## Typical Workflow

1. **Receptionist** logs in → registers a patient → creates a lab order (selects tests)
2. **Technician** logs in → enters numeric results for each test → system auto-flags NORMAL/LOW/HIGH
3. **Biochemist** logs in → reviews results → validates (locks) → order becomes DELIVERED
4. Any role can open a printable HTML report from the order detail or patient history

## Project Structure

```
lab-erp/
├── server.js              # Express entry point
├── db/database.js         # SQLite schema, seed data, helpers
├── middleware/auth.js     # Session auth middleware
├── routes/
│   ├── auth.js            # POST /api/auth/login|logout, GET /api/auth/me
│   ├── patients.js        # CRUD /api/patients
│   ├── orders.js          # CRUD /api/orders
│   ├── catalog.js         # GET/PUT /api/catalog
│   ├── results.js         # POST/PUT /api/results
│   ├── dashboard.js       # GET /api/dashboard/stats
│   ├── users.js           # CRUD /api/users (admin only)
│   └── reports.js         # GET /report/:orderId (printable HTML)
├── public/
│   ├── index.html         # SPA shell
│   ├── css/style.css      # Medical white/blue UI
│   └── js/
│       ├── api.js         # Fetch wrapper + API client
│       ├── app.js         # Core: auth, navigation, modals, toasts
│       ├── dashboard.js   # Dashboard stats + critical alerts
│       ├── patients.js    # Patient management
│       ├── orders.js      # Order creation and tracking
│       ├── results.js     # Results entry + biochemist validation
│       ├── catalog.js     # Test catalog viewer/editor
│       └── users.js       # User management (admin)
└── lab-erp.db             # SQLite database (auto-created on first run)
```

## Features

- **Patient Management**: Register, search, edit patients; view complete order history
- **Order Management**: Create orders with multiple tests; barcode-style order numbers (LAB-YYYYMMDD-XXXX)
- **Test Catalog**: 16 preloaded tests with gender/age-group reference ranges
- **Results Entry**: Numeric input with live flag preview (NORMAL/LOW/HIGH/CRITICAL)
- **Validation**: Two-step workflow — technician enters, biochemist validates and locks
- **Reports**: Printable HTML report with patient info, results, flags, reference ranges, and validator signature
- **Dashboard**: Daily stats, critical value alerts (results >2× or <½ reference range)
- **Audit Trail**: Every result entry and validation logged with user + timestamp
- **Role-based Access**: Each role sees only their relevant modules

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite via better-sqlite3
- **Session**: express-session (in-memory, server-side)
- **Password hashing**: Node built-in `crypto` (PBKDF2-SHA512 with random salt)
- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript (zero frontend frameworks)
