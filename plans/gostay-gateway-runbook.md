# GoStay dedicated WhatsApp gateway — deploy on 103.93.162.172 (Chatly-style)

Goal: GoStay OWNS its Baileys gateway (like Chatly). Its global `WEBHOOK_URL` = GoStay,
so **every** hotel session created on it auto-routes to GoStay — zero per-hotel config.

Host: `ventera@103.93.162.172` (same box as Chatly). Docker + a local registry present.
Free port confirmed: **3061**.

---

## Secrets (already generated / known)
```
POSTGRES_PASSWORD = wg_3d7b1b0cd9b205aad10873791ca4f9a35e25fdc99f403082
WEBHOOK_SECRET    = wh_6c43f702db84226ab2f64f82e58f6e386def94f36ba868f5   # must match GoStay
```

## Decide a subdomain (GoStay's serverless functions call the gateway API over this)
e.g. **`wa-gostay.ventera.ai`**  → this server (103.93.162.172), TLS.

---

## Steps (run on the server)

### 1. Get the gateway code
```bash
cd /opt
git clone <wa-ventera repo URL> wa-gostay      # same repo that builds wa.ventera.ai
#   (or: rsync the /var/www/wa-ventera tree from 76.13.198.168)
cd /opt/wa-gostay
```

### 2. Create `.env.production`  ⚠️ YOU run this (writing secrets to prod is blocked for me)
```bash
cat > .env.production <<'EOF'
POSTGRES_DB=wa_gostay
POSTGRES_USER=wa_gostay
POSTGRES_PASSWORD=wg_3d7b1b0cd9b205aad10873791ca4f9a35e25fdc99f403082
APP_PORT=3061
# GLOBAL webhook — the whole point: every session on THIS gateway posts to GoStay.
WEBHOOK_URL=https://app.gostay.id/api/wa/inbound
WEBHOOK_SECRET=wh_6c43f702db84226ab2f64f82e58f6e386def94f36ba868f5
SESSIONS_DIR=/app/sessions
EOF
#   Then fill any other REQUIRED keys from .env.production.example (open it and compare).
```

### 3. Build + start (isolated compose project so nothing clashes)
```bash
docker compose -p wa-gostay -f docker-compose.prod.yml up -d --build
docker compose -p wa-gostay -f docker-compose.prod.yml ps
# health: curl -s http://127.0.0.1:3061/  (should answer)
```

### 4. Reverse proxy  ⚠️ needs root/sudo (blocked for me)
Map `wa-gostay.ventera.ai` → `127.0.0.1:3061` with TLS, using whatever this box uses
(nginx/caddy/apache — same as Chatly's). Mirror Chatly's vhost, swap host+port.

### 5. DNS  ⚠️ your DNS provider
Add `wa-gostay.ventera.ai` → `103.93.162.172` (A record).

### 6. Create the admin + integration key on the NEW gateway
```bash
# first-run setup (no user yet):
curl -s -X POST https://wa-gostay.ventera.ai/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"username":"gostay-admin","password":"<pick-a-strong-one>"}'
# then log into https://wa-gostay.ventera.ai → Integrations → Create API key → copy int_...
```

---

## 7. Hand back to me
Give me: **the gateway URL** (`https://wa-gostay.ventera.ai`) + the **`int_...` key**.
I set on GoStay (Vercel) and redeploy:
```
WA_VENTERA_BASE_URL = https://wa-gostay.ventera.ai
WA_VENTERA_INT_KEY  = int_...
```
After that: every hotel that opens **/settings/whatsapp** and scans the QR is created
on THIS gateway → its inbound auto-flows to GoStay. Fully turnkey, like Chatly.

## Note on the current "gostay" session
It was paired on the SHARED wa.ventera.ai. On the dedicated gateway it must be
re-paired once (open /settings/whatsapp → Sambungkan → scan). One-time.
