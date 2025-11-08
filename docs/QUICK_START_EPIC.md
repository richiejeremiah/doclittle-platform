# Quick Start: Pull REAL Data from Epic Sandbox

## Why You Don't See Epic Data Yet

The Clients tab is ready to show Epic data, but **you need to connect to Epic sandbox first** and sync the data.

## 3 Steps to See Epic Data

### Step 1: Configure Epic (One-time setup)

Add to your `.env` file:
```bash
EPIC_CLIENT_ID=your-epic-client-id
EPIC_REDIRECT_URI=http://localhost:4000/api/ehr/epic/callback
```

**Get Epic Client ID:**
- Go to: https://fhir.epic.com/Interconnect-FHIR-oauth/oauth2
- Register your app
- Copy the Client ID

### Step 2: Connect to Epic Sandbox

1. **Start your server:**
   ```bash
   cd middleware-platform
   npm start
   ```

2. **Open in browser:**
   ```
   http://localhost:4000/api/ehr/epic/connect?provider_id=default
   ```

3. **Authorize:**
   - You'll be redirected to Epic sandbox
   - Login with Epic sandbox credentials
   - Authorize the app
   - You'll be redirected back

### Step 3: Sync Epic Data

**Option A: Use the script** (easiest)
```bash
cd middleware-platform
node scripts/sync-epic-data.js
```

**Option B: Use the API**
```bash
# Get your connection ID
curl "http://localhost:4000/api/ehr/epic/status?connection_id=all"

# Sync data (replace YOUR_CONNECTION_ID)
curl -X POST "http://localhost:4000/api/ehr/epic/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "YOUR_CONNECTION_ID"
  }'
```

### Step 4: View in Clients Tab

1. **Refresh your browser** on the Clients tab
2. **You'll see:**
   - ✅ **EPIC badge** on patients with Epic data
   - ✅ **ICD-10 codes** (diagnoses)
   - ✅ **CPT codes** (procedures)  
   - ✅ **Observations** (vitals/notes)
   - ✅ **"View Full EHR Details"** button

## What Data Gets Pulled

From Epic sandbox, we pull:
- **Encounters** → Visit records
- **Conditions** → Diagnoses (ICD-10 codes like F41.1)
- **Procedures** → Procedures (CPT codes like 90837)
- **Observations** → Vitals, clinical notes

## Troubleshooting

### "No Epic connections found"
- Make sure you completed Step 2 (OAuth flow)
- Check: `http://localhost:4000/api/ehr/epic/status?connection_id=all`

### "EPIC_CLIENT_ID not configured"
- Add `EPIC_CLIENT_ID` to `.env`
- Restart server

### "No data synced"
- Epic sandbox may not have test data
- Try syncing without date filter
- Check Epic sandbox documentation

### "Patient not found in DocLittle"
- Epic patient ID must match your FHIR patient ID
- Create patients in DocLittle first, or link Epic patients

## Next Steps

Once you see Epic data:
1. ✅ It appears automatically in Clients tab
2. ✅ Click "View Full EHR Details" to see all data
3. ✅ Use it for medical coding (when integrated)
4. ✅ Use it for insurance claims (when integrated)

---

**The UI is ready - you just need to connect Epic and sync!** 🚀

