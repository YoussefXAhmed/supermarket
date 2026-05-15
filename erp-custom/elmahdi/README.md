# Elmahdi (Frappe app)

Server-side session identity for the supermarket ERP SPA.

## Install (Frappe v15)

Replace paths with yours. **Do not copy the literal `/path/to/...` placeholder.**

```bash
cd ~/frappe-bench

# 1. Link app (real path — verify with ls -la apps/elmahdi)
rm -f apps/elmahdi
ln -s /home/youssef/supermarket-erp/erp-custom/elmahdi apps/elmahdi
ls -la apps/elmahdi/elmahdi/hooks.py   # must exist

# 2. Register on bench (required before build or install-app)
grep -qx elmahdi sites/apps.txt || echo elmahdi >> sites/apps.txt

# 3. Install Python package + assets
./env/bin/pip install -e apps/elmahdi
bench build --app elmahdi

# 4. Install on site (use your site name, not YOUR_SITE)
bench --site supermarket.local install-app elmahdi
bench --site supermarket.local clear-cache
```

**Dev bench** (no supervisor): start with `bench start`, not `bench restart`.  
If Redis ports are in use, stop the other `bench start` first (`pkill -f "redis.*13000"` or close that terminal).

## Troubleshooting

| Error | Cause | Fix |
|-------|--------|-----|
| `paths[0] must be of type string. Received undefined` on `bench build` | `elmahdi` missing from `sites/apps.txt` | `echo elmahdi >> sites/apps.txt` |
| `App elmahdi not in apps.txt` | Same | Add to `sites/apps.txt`, then retry install |
| Build/install can't find hooks | Broken symlink (`/path/to/...`) | Fix `ln -s` to real repo path |
| `supervisorctl restart frappe: ERROR` | Dev bench, no supervisor | Use `bench start` instead |
| Redis `Address already in use` | Another bench already running | Stop other `bench start` |

## Verify

```bash
bench --site supermarket.local console
```

```python
import frappe
frappe.get_installed_apps()  # includes 'elmahdi'
frappe.get_module("elmahdi.elmahdi")
import elmahdi.api.auth
```

API (logged-in session):  
`GET /api/method/elmahdi.api.auth.get_session_identity`

### Test with curl

Use a **real** username and password (not the placeholders `YOUR_USER` / `YOUR_PASSWORD`).

```bash
COOKIE=/tmp/erp-cookies.txt
SITE=http://supermarket.local:8000

# 1. Login — must return "Logged In" (or similar), not AuthenticationError
curl -s -c "$COOKIE" -b "$COOKIE" \
  "$SITE/api/method/login" \
  --data-urlencode 'usr=Administrator' \
  --data-urlencode 'pwd=YOUR_ACTUAL_PASSWORD'

# 2. Session identity (requires successful login above)
curl -s -b "$COOKIE" \
  "$SITE/api/method/elmahdi.api.auth.get_session_identity"
```

If login fails, the second call runs as **Guest**. Frappe then reports
`get_session_identity is not whitelisted` — that message is misleading; it means
**you are not logged in**, not that the decorator is missing.

Quick server-side check (no HTTP):

```bash
bench --site supermarket.local execute elmahdi.api.auth.get_session_identity
```

## App layout

```text
apps/elmahdi/
└── elmahdi/
    ├── hooks.py
    ├── modules.txt
    ├── patches.txt
    ├── api/auth.py
    ├── config/desktop.py
    ├── elmahdi/__init__.py    # Frappe module package
    └── public/
```
