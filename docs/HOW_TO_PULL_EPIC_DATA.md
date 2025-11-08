# How to Pull REAL Data from Epic Sandbox

## Step 1: Configure Epic Sandbox

1. **Get Epic Client ID**:
   - Go to: https://fhir.epic.com/Interconnect-FHIR-oauth/oauth2
   - Register your application
   - Get your Client ID

2. **Add to `.env` file**:
   ```bash
   EPIC_CLIENT_ID=your-client-id-here
   EPIC_REDIRECT_URI=http://localhost:4000/api/ehr/epic/callback
   ```

## Step 2: Connect to Epic Sandbox

### Option A: Via Browser (Recommended)

1. **Start your server**:
   ```bash
   cd middleware-platform
   npm start
   ```

2. **Open browser and visit**:
   ```
   http://localhost:4000/api/ehr/epic/connect?provider_id=default
   ```

3. **Authorize the app**:
   - You'll be redirected to Epic sandbox login
   - Login with Epic sandbox credentials
   - Authorize the application
   - You'll be redirected back with a connection

### Option B: Via API

```bash
curl "http://localhost:4000/api/ehr/epic/connect?provider_id=default"
```

Copy the `auth_url` from the response and open it in your browser.

## Step 3: Sync Epic Data

### Option A: Automatic Sync (Background)

The EHR sync service runs automatically every 2 minutes and will pull data from Epic.

### Option B: Manual Sync (Via API)

```bash
# Get your connection ID first
curl "http://localhost:4000/api/ehr/epic/status?connection_id=all"

# Sync data for today
curl -X POST "http://localhost:4000/api/ehr/epic/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "your-connection-id",
    "date": "2024-11-07"
  }'
```

### Option C: Using the Script

```bash
cd middleware-platform
node scripts/sync-epic-data.js
```

## Step 4: View Data in Clients Tab

1. **Refresh your browser** on the Clients tab
2. **You should see**:
   - EPIC badge on patients with Epic data
   - ICD-10 diagnosis codes
   - CPT procedure codes
   - Observations (vitals/notes)
   - "View Full EHR Details" button

## What Data We Pull from Epic

- **Encounters**: Visit records
- **Conditions**: Diagnoses (ICD-10 codes)
- **Procedures**: Procedures (CPT codes)
- **Observations**: Vitals, clinical notes
- **DocumentReferences**: Clinical documents (if available)
- **DiagnosticReports**: Lab reports (if available)

## Troubleshooting

### "No Epic connections found"
- Make sure you completed the OAuth flow
- Check: `http://localhost:4000/api/ehr/epic/status?connection_id=all`

### "EPIC_CLIENT_ID not configured"
- Add `EPIC_CLIENT_ID` to your `.env` file
- Restart the server

### "No data synced"
- Epic sandbox may not have test data for your patient
- Try syncing for a different date
- Check Epic sandbox documentation for test patients

### "Connection expired"
- Epic tokens expire after a period
- Re-connect via `/api/ehr/epic/connect`
- The system will auto-refresh tokens when possible

## Epic Sandbox Resources

- **Epic FHIR Documentation**: https://fhir.epic.com/
- **Epic OAuth Setup**: https://fhir.epic.com/Interconnect-FHIR-oauth/oauth2
- **Epic Sandbox**: https://fhir.epic.com/interconnect-fhir-oauth

## Next Steps

Once you have Epic data:
1. ✅ View it in the Clients tab
2. ✅ See ICD-10 and CPT codes
3. ✅ View clinical notes and observations
4. ✅ Use it for medical coding (when integrated)
5. ✅ Use it for insurance claims (when integrated)

