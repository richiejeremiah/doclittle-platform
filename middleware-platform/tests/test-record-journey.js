#!/usr/bin/env node
/*
 * End-to-end smoke test: Patient -> Schedule -> DB -> Record linkage (FHIR)
 * Usage: node tests/test-record-journey.js [BASE_URL]
 */

const axios = require('axios');

const BASE = process.argv[2] || 'http://localhost:4000';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(title, data) {
  console.log(`\n=== ${title} ===`);
  if (data !== undefined) console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

(async () => {
  try {
    const unique = Date.now();
    const patient = {
      patient_name: `Test User ${unique}`,
      patient_phone: `+1555${Math.floor(1000000 + Math.random()*8999999)}`,
      patient_email: `test${unique}@example.com`,
      date: new Date(Date.now() + 24*60*60*1000).toISOString().slice(0,10), // tomorrow
      time: '2:00 PM',
      appointment_type: 'Mental Health Consultation',
      timezone: 'America/New_York'
    };

    // 1) Schedule appointment (voice endpoint)
    log('1) Scheduling appointment', patient);
    const schedRes = await axios.post(`${BASE}/voice/appointments/schedule`, { args: patient });
    if (!schedRes.data.success) throw new Error('Schedule failed');
    const appt = schedRes.data.appointment;
    log('Scheduled', appt);

    // 2) Verify appointment appears via search (by phone)
    await sleep(300); // tiny delay for DB write
    const searchRes = await axios.post(`${BASE}/voice/appointments/search`, { args: { phone: patient.patient_phone } });
    if (!searchRes.data.success || !searchRes.data.count) throw new Error('Search failed to return appointment');
    const found = searchRes.data.appointments.find(a => a.id === appt.id);
    if (!found) throw new Error('Scheduled appointment not found via search');
    log('Search returned appointment', found);

    // 3) Verify upcoming list includes appointment
    const upcRes = await axios.get(`${BASE}/api/admin/appointments/upcoming?limit=20`);
    if (!upcRes.data.success) throw new Error('Upcoming list failed');
    const inUpcoming = (upcRes.data.appointments||[]).some(a => a.id === appt.id);
    if (!inUpcoming) console.warn('⚠️  Appointment not yet in upcoming list (may be date/time window related).');
    else log('Upcoming includes appointment');

    // 4) Fetch admin appointments and ensure FHIR record linkage is present (patient_id)
    const allRes = await axios.get(`${BASE}/api/admin/appointments?status=scheduled`);
    if (!allRes.data.success) throw new Error('Admin appointments failed');
    const adminAppt = (allRes.data.appointments||[]).find(a => a.id === appt.id);
    if (!adminAppt) throw new Error('Admin view did not return the appointment');
    if (!adminAppt.patient_id) throw new Error('FHIR patient_id missing on appointment (record not linked)');
    log('Admin appointment with FHIR link', { id: adminAppt.id, patient_id: adminAppt.patient_id });

    console.log('\n✅ TEST PASSED: Record created/linked and appointment discoverable across endpoints.');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ TEST FAILED:', e.message);
    process.exit(1);
  }
})();


