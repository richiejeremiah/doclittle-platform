const Database = require('better-sqlite3');
const db = new Database('middleware.db');

// Disable foreign key constraints during migrations (they can cause issues with ALTER TABLE)
db.pragma('foreign_keys = OFF');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    api_url TEXT NOT NULL,
    webhook_url TEXT,
    enabled_platforms TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_sync (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    merchant_product_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    platform_product_id TEXT,
    sync_status TEXT DEFAULT 'pending',
    last_synced DATETIME,
    product_data TEXT,
    universal_data TEXT,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    platform_order_id TEXT,
    merchant_order_id TEXT,
    product_id TEXT,
    amount REAL,
    status TEXT DEFAULT 'pending',
    customer_email TEXT,
    customer_phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS checkout_sessions (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    session_data TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS ap2_mandates (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    mandate_data TEXT NOT NULL,
    signature TEXT,
    verified BOOLEAN DEFAULT FALSE,
    merchant_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS shopping_carts (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    intent_mandate_id TEXT,
    items TEXT NOT NULL,
    subtotal REAL,
    tax REAL,
    shipping REAL,
    total REAL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS ap2_transactions (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    intent_mandate_id TEXT,
    cart_mandate_id TEXT,
    payment_mandate_id TEXT,
    cart_id TEXT,
    order_id TEXT,
    amount REAL,
    status TEXT DEFAULT 'pending',
    audit_trail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS voice_checkouts (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    amount REAL NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    customer_email TEXT,
    payment_token TEXT,
    payment_intent_id TEXT,
    merchant_order_id TEXT,
    fhir_patient_id TEXT,
    fhir_encounter_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    FOREIGN KEY (fhir_patient_id) REFERENCES fhir_patients(resource_id),
    FOREIGN KEY (fhir_encounter_id) REFERENCES fhir_encounters(resource_id)
  );

  CREATE TABLE IF NOT EXISTS payment_tokens (
    token TEXT PRIMARY KEY,
    checkout_id TEXT NOT NULL,
    verification_code TEXT,
    verification_code_expires DATETIME,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME,
    FOREIGN KEY (checkout_id) REFERENCES voice_checkouts(id)
  );

  -- ============================================
  -- FRAUD DETECTION TABLES
  -- ============================================

  CREATE TABLE IF NOT EXISTS fraud_checks (
    id TEXT PRIMARY KEY,
    transaction_id TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    merchant_id TEXT,
    agent_platform TEXT,
    risk_score INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    signals TEXT,
    is_fraud BOOLEAN DEFAULT FALSE,
    requires_verification BOOLEAN DEFAULT FALSE,
    reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by TEXT,
    reviewed_at DATETIME,
    action_taken TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS fraud_blacklist (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    reason TEXT,
    added_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, value)
  );

  CREATE TABLE IF NOT EXISTS fraud_whitelist (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    added_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, value)
  );

  CREATE TABLE IF NOT EXISTS agent_stats (
    platform TEXT PRIMARY KEY,
    total_transactions INTEGER DEFAULT 0,
    fraud_count INTEGER DEFAULT 0,
    chargeback_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_fraud_checks_customer_phone ON fraud_checks(customer_phone);
  CREATE INDEX IF NOT EXISTS idx_fraud_checks_customer_email ON fraud_checks(customer_email);
  CREATE INDEX IF NOT EXISTS idx_fraud_checks_risk_score ON fraud_checks(risk_score);
  CREATE INDEX IF NOT EXISTS idx_fraud_checks_created_at ON fraud_checks(created_at);
  CREATE INDEX IF NOT EXISTS idx_transactions_customer_phone ON transactions(customer_phone);
  CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email);
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

  -- ============================================
  -- FHIR RESOURCES - Healthcare Data Layer
  -- ============================================

  CREATE TABLE IF NOT EXISTS fhir_patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id TEXT UNIQUE NOT NULL,
    version_id INTEGER DEFAULT 1,
    resource_data TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    name TEXT,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fhir_encounters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id TEXT UNIQUE NOT NULL,
    version_id INTEGER DEFAULT 1,
    resource_data TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    status TEXT NOT NULL,
    call_id TEXT,
    start_time DATETIME,
    end_time DATETIME,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
  );

  CREATE TABLE IF NOT EXISTS fhir_communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id TEXT UNIQUE NOT NULL,
    version_id INTEGER DEFAULT 1,
    resource_data TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    sent_time DATETIME,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id),
    FOREIGN KEY (encounter_id) REFERENCES fhir_encounters(resource_id)
  );

  CREATE TABLE IF NOT EXISTS fhir_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id TEXT UNIQUE NOT NULL,
    version_id INTEGER DEFAULT 1,
    resource_data TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    code TEXT,
    value TEXT,
    effective_date DATETIME,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id),
    FOREIGN KEY (encounter_id) REFERENCES fhir_encounters(resource_id)
  );

  CREATE TABLE IF NOT EXISTS fhir_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    user_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- FHIR Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_fhir_patients_phone ON fhir_patients(phone);
  CREATE INDEX IF NOT EXISTS idx_fhir_patients_email ON fhir_patients(email);
  CREATE INDEX IF NOT EXISTS idx_fhir_patients_name ON fhir_patients(name);
  CREATE INDEX IF NOT EXISTS idx_fhir_encounters_patient_id ON fhir_encounters(patient_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_encounters_call_id ON fhir_encounters(call_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_encounters_start_time ON fhir_encounters(start_time);
  CREATE INDEX IF NOT EXISTS idx_fhir_communications_patient_id ON fhir_communications(patient_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_communications_encounter_id ON fhir_communications(encounter_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_observations_patient_id ON fhir_observations(patient_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_observations_encounter_id ON fhir_observations(encounter_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_audit_resource_type ON fhir_audit_log(resource_type);
  CREATE INDEX IF NOT EXISTS idx_fhir_audit_resource_id ON fhir_audit_log(resource_id);
  CREATE INDEX IF NOT EXISTS idx_fhir_audit_timestamp ON fhir_audit_log(timestamp);

  -- ============================================
  -- EHR INTEGRATION TABLES
  -- ============================================

  CREATE TABLE IF NOT EXISTS ehr_connections (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    ehr_name TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    auth_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at DATETIME,
    state_token TEXT,
    patient_id TEXT,
    connected_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ehr_encounters (
    id TEXT PRIMARY KEY,
    fhir_encounter_id TEXT UNIQUE NOT NULL,
    patient_id TEXT NOT NULL,
    appointment_id TEXT,
    provider_id TEXT,
    start_time DATETIME,
    end_time DATETIME,
    status TEXT,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  );

  CREATE TABLE IF NOT EXISTS ehr_conditions (
    id TEXT PRIMARY KEY,
    ehr_encounter_id TEXT NOT NULL,
    icd10_code TEXT NOT NULL,
    description TEXT,
    is_primary BOOLEAN DEFAULT 0,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ehr_encounter_id) REFERENCES ehr_encounters(id)
  );

  CREATE TABLE IF NOT EXISTS ehr_procedures (
    id TEXT PRIMARY KEY,
    ehr_encounter_id TEXT NOT NULL,
    cpt_code TEXT NOT NULL,
    modifier TEXT,
    description TEXT,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ehr_encounter_id) REFERENCES ehr_encounters(id)
  );

  CREATE TABLE IF NOT EXISTS ehr_observations (
    id TEXT PRIMARY KEY,
    ehr_encounter_id TEXT NOT NULL,
    type TEXT,
    value TEXT,
    unit TEXT,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ehr_encounter_id) REFERENCES ehr_encounters(id)
  );

  -- EHR Indexes
  CREATE INDEX IF NOT EXISTS idx_ehr_connections_provider_id ON ehr_connections(provider_id);
  CREATE INDEX IF NOT EXISTS idx_ehr_connections_ehr_name ON ehr_connections(ehr_name);
  CREATE INDEX IF NOT EXISTS idx_ehr_encounters_patient_id ON ehr_encounters(patient_id);
  CREATE INDEX IF NOT EXISTS idx_ehr_encounters_appointment_id ON ehr_encounters(appointment_id);
  CREATE INDEX IF NOT EXISTS idx_ehr_encounters_start_time ON ehr_encounters(start_time);
  CREATE INDEX IF NOT EXISTS idx_ehr_conditions_encounter_id ON ehr_conditions(ehr_encounter_id);
  CREATE INDEX IF NOT EXISTS idx_ehr_conditions_icd10_code ON ehr_conditions(icd10_code);
  CREATE INDEX IF NOT EXISTS idx_ehr_procedures_encounter_id ON ehr_procedures(ehr_encounter_id);
  CREATE INDEX IF NOT EXISTS idx_ehr_procedures_cpt_code ON ehr_procedures(cpt_code);
  CREATE INDEX IF NOT EXISTS idx_ehr_observations_encounter_id ON ehr_observations(ehr_encounter_id);
`);

// Run migrations AFTER tables are created
// Migration: Add appointment_id column if it doesn't exist (for existing databases)
try {
  // Check if voice_checkouts table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='voice_checkouts'
  `).get();

  if (tableExists) {
    const tableInfo = db.prepare(`PRAGMA table_info(voice_checkouts)`).all();
    const hasAppointmentId = tableInfo.some(col => col.name === 'appointment_id');
    if (!hasAppointmentId) {
      console.log('📦 Adding appointment_id column to voice_checkouts table...');
      db.exec(`ALTER TABLE voice_checkouts ADD COLUMN appointment_id TEXT;`);
      console.log('✅ Migration complete: appointment_id column added');
    }
    // Create index after column is added (or if it already exists)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_checkouts_appointment_id ON voice_checkouts(appointment_id);`);
  }
} catch (migrationError) {
  console.warn('⚠️  Migration check failed:', migrationError.message);
}

// Migration: Add verification_code columns to payment_tokens if they don't exist
try {
  // Check if payment_tokens table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='payment_tokens'
  `).get();

  if (tableExists) {
    const paymentTokensInfo = db.prepare(`PRAGMA table_info(payment_tokens)`).all();
    const hasVerificationCode = paymentTokensInfo.some(col => col.name === 'verification_code');
    const hasVerificationCodeExpires = paymentTokensInfo.some(col => col.name === 'verification_code_expires');

    if (!hasVerificationCode) {
      console.log('📦 Adding verification_code column to payment_tokens table...');
      db.exec(`ALTER TABLE payment_tokens ADD COLUMN verification_code TEXT;`);
      console.log('✅ Migration complete: verification_code column added');
    }

    if (!hasVerificationCodeExpires) {
      console.log('📦 Adding verification_code_expires column to payment_tokens table...');
      db.exec(`ALTER TABLE payment_tokens ADD COLUMN verification_code_expires DATETIME;`);
      console.log('✅ Migration complete: verification_code_expires column added');
    }
  }
} catch (migrationError) {
  console.warn('⚠️  Payment tokens migration check failed:', migrationError.message);
}

// Migration: Add eligibility detail columns if they don't exist
try {
  const eligExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='eligibility_checks'`).get();
  if (eligExists) {
    const info = db.prepare(`PRAGMA table_info(eligibility_checks)`).all();
    const needDeductTotal = !info.some(c => c.name === 'deductible_total');
    const needDeductRemain = !info.some(c => c.name === 'deductible_remaining');
    const needCoins = !info.some(c => c.name === 'coinsurance_percent');
    const needPlan = !info.some(c => c.name === 'plan_summary');
    if (needDeductTotal) db.exec(`ALTER TABLE eligibility_checks ADD COLUMN deductible_total REAL;`);
    if (needDeductRemain) db.exec(`ALTER TABLE eligibility_checks ADD COLUMN deductible_remaining REAL;`);
    if (needCoins) db.exec(`ALTER TABLE eligibility_checks ADD COLUMN coinsurance_percent REAL;`);
    if (needPlan) db.exec(`ALTER TABLE eligibility_checks ADD COLUMN plan_summary TEXT;`);
  }
} catch (migrationError) {
  console.warn('⚠️  Eligibility checks migration failed:', migrationError.message);
}

// Migration: Add EHR sync columns to appointments table
try {
  const apptExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='appointments'`).get();
  if (apptExists) {
    const info = db.prepare(`PRAGMA table_info(appointments)`).all();
    const needEhrSynced = !info.some(c => c.name === 'ehr_synced');
    const needPrimaryIcd10 = !info.some(c => c.name === 'primary_icd10');
    const needPrimaryCpt = !info.some(c => c.name === 'primary_cpt');
    if (needEhrSynced) {
      console.log('📦 Adding ehr_synced column to appointments table...');
      db.exec(`ALTER TABLE appointments ADD COLUMN ehr_synced BOOLEAN DEFAULT 0;`);
    }
    if (needPrimaryIcd10) {
      console.log('📦 Adding primary_icd10 column to appointments table...');
      db.exec(`ALTER TABLE appointments ADD COLUMN primary_icd10 TEXT;`);
    }
    if (needPrimaryCpt) {
      console.log('📦 Adding primary_cpt column to appointments table...');
      db.exec(`ALTER TABLE appointments ADD COLUMN primary_cpt TEXT;`);
    }
    if (needEhrSynced || needPrimaryIcd10 || needPrimaryCpt) {
      console.log('✅ Migration complete: EHR columns added to appointments');
    }
  }
} catch (migrationError) {
  console.warn('⚠️  Appointments EHR migration failed:', migrationError.message);
}

// Continue with remaining table creation
db.exec(`
  -- ============================================
  -- USERS TABLE
  -- ============================================
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'healthcare_provider',
    merchant_id TEXT,
    picture TEXT,
    auth_method TEXT DEFAULT 'email',
    google_id TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_name TEXT NOT NULL,
    patient_phone TEXT,
    patient_email TEXT,
    patient_id TEXT,
    appointment_type TEXT DEFAULT 'Mental Health Consultation',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration_minutes INTEGER DEFAULT 50,
    provider TEXT DEFAULT 'DocLittle Mental Health Team',
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    reminder_sent BOOLEAN DEFAULT 0,
    calendar_event_id TEXT,
    calendar_link TEXT,
    cancellation_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
  );

  CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
  CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(patient_phone);
  CREATE INDEX IF NOT EXISTS idx_appointments_email ON appointments(patient_email);
  CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

  -- ============================================
  -- INSURANCE & BILLING TABLES
  -- ============================================

  CREATE TABLE IF NOT EXISTS eligibility_checks (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    member_id TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    service_code TEXT,
    date_of_service TEXT,
    eligible BOOLEAN DEFAULT 0,
    copay_amount REAL DEFAULT 0,
    allowed_amount REAL DEFAULT 0,
    insurance_pays REAL DEFAULT 0,
    deductible_total REAL,
    deductible_remaining REAL,
    coinsurance_percent REAL,
    plan_summary TEXT,
    response_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
  );

  CREATE TABLE IF NOT EXISTS insurance_claims (
    id TEXT PRIMARY KEY,
    appointment_id TEXT,
    patient_id TEXT,
    member_id TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    service_code TEXT,
    diagnosis_code TEXT,
    total_amount REAL NOT NULL,
    copay_amount REAL DEFAULT 0,
    insurance_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'submitted',
    x12_claim_id TEXT,
    idempotency_key TEXT,
    blockchain_proof TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status_checked_at DATETIME,
    approved_at DATETIME,
    paid_at DATETIME,
    response_data TEXT,
    circle_transfer_id TEXT,
    payment_status TEXT DEFAULT 'pending',
    payment_amount REAL,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
  );

  CREATE TABLE IF NOT EXISTS insurance_payers (
    id TEXT PRIMARY KEY,
    payer_id TEXT UNIQUE NOT NULL,
    payer_name TEXT NOT NULL,
    aliases TEXT,
    supported_transactions TEXT,
    is_active BOOLEAN DEFAULT 1,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patient_insurance (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    payer_name TEXT,
    member_id TEXT NOT NULL,
    group_number TEXT,
    plan_name TEXT,
    relationship_code TEXT DEFAULT 'self',
    is_primary BOOLEAN DEFAULT 1,
    is_verified BOOLEAN DEFAULT 0,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
  );

  CREATE INDEX IF NOT EXISTS idx_eligibility_checks_patient_id ON eligibility_checks(patient_id);
  CREATE INDEX IF NOT EXISTS idx_eligibility_checks_member_id ON eligibility_checks(member_id);
  CREATE INDEX IF NOT EXISTS idx_insurance_claims_appointment_id ON insurance_claims(appointment_id);
  CREATE INDEX IF NOT EXISTS idx_insurance_claims_patient_id ON insurance_claims(patient_id);
  CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);
  CREATE INDEX IF NOT EXISTS idx_insurance_claims_idem ON insurance_claims(idempotency_key);
  CREATE INDEX IF NOT EXISTS idx_insurance_payers_payer_id ON insurance_payers(payer_id);
  CREATE INDEX IF NOT EXISTS idx_insurance_payers_name ON insurance_payers(payer_name);
  CREATE INDEX IF NOT EXISTS idx_patient_insurance_patient_id ON patient_insurance(patient_id);
  CREATE INDEX IF NOT EXISTS idx_patient_insurance_payer_id ON patient_insurance(payer_id);
  CREATE INDEX IF NOT EXISTS idx_patient_insurance_member_id ON patient_insurance(member_id);

  -- ============================================
  -- CIRCLE PAYMENT INTEGRATION TABLES
  -- ============================================

  CREATE TABLE IF NOT EXISTS circle_accounts (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    circle_wallet_id TEXT UNIQUE,
    circle_account_id TEXT,
    currency TEXT DEFAULT 'USDC',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS circle_transfers (
    id TEXT PRIMARY KEY,
    claim_id TEXT,
    from_wallet_id TEXT NOT NULL,
    to_wallet_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USDC',
    circle_transfer_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (claim_id) REFERENCES insurance_claims(id)
  );

  CREATE INDEX IF NOT EXISTS idx_circle_accounts_entity_type ON circle_accounts(entity_type);
  CREATE INDEX IF NOT EXISTS idx_circle_accounts_entity_id ON circle_accounts(entity_id);
  CREATE INDEX IF NOT EXISTS idx_circle_transfers_claim_id ON circle_transfers(claim_id);
  CREATE INDEX IF NOT EXISTS idx_circle_transfers_status ON circle_transfers(status);
  CREATE INDEX IF NOT EXISTS idx_circle_transfers_circle_transfer_id ON circle_transfers(circle_transfer_id);

  CREATE TABLE IF NOT EXISTS patient_portal_sessions (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    phone TEXT NOT NULL,
    verification_code TEXT,
    verified BOOLEAN DEFAULT 0,
    verified_at DATETIME,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
  );

  CREATE INDEX IF NOT EXISTS idx_portal_sessions_phone ON patient_portal_sessions(phone);
  CREATE INDEX IF NOT EXISTS idx_portal_sessions_verified ON patient_portal_sessions(verified);

  CREATE TABLE IF NOT EXISTS cpt_codes (
    code TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    is_new BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_cpt_codes_description ON cpt_codes(description);
`);

// Re-enable foreign keys after table creation
db.pragma('foreign_keys = ON');

/**
 * Migration: Add missing columns to insurance_claims table
 * This handles the case where the table was created before circle_transfer_id, payment_status, and payment_amount were added
 */
function migrateInsuranceClaimsTable() {
  try {
    // Temporarily disable foreign keys for migration
    db.pragma('foreign_keys = OFF');
    
    // Get table info to check existing columns
    const tableInfo = db.prepare("PRAGMA table_info(insurance_claims)").all();
    const columnNames = tableInfo.map(col => col.name);

    // Check and add circle_transfer_id if missing
    if (!columnNames.includes('circle_transfer_id')) {
      console.log('🔄 Migrating: Adding circle_transfer_id column to insurance_claims table');
      db.prepare("ALTER TABLE insurance_claims ADD COLUMN circle_transfer_id TEXT").run();
    }

    // Check and add payment_status if missing
    if (!columnNames.includes('payment_status')) {
      console.log('🔄 Migrating: Adding payment_status column to insurance_claims table');
      db.prepare("ALTER TABLE insurance_claims ADD COLUMN payment_status TEXT DEFAULT 'pending'").run();
    }

    // Check and add payment_amount if missing
    if (!columnNames.includes('payment_amount')) {
      console.log('🔄 Migrating: Adding payment_amount column to insurance_claims table');
      db.prepare("ALTER TABLE insurance_claims ADD COLUMN payment_amount REAL").run();
    }
    
    // Re-enable foreign keys after migration
    db.pragma('foreign_keys = ON');
  } catch (error) {
    console.error('❌ Error during insurance_claims table migration:', error);
    // Re-enable foreign keys even if migration fails
    db.pragma('foreign_keys = ON');
    // Don't throw - allow the app to continue even if migration fails
  }
}

// Run migration on startup
migrateInsuranceClaimsTable();

/**
 * Helper to safely stringify data
 */
function safeStringify(data) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
}


module.exports = {
  // ============================================
  // MERCHANTS
  // ============================================
  createMerchant: (merchant) => {
    return db.prepare(`
      INSERT INTO merchants (id, name, api_key, api_url, webhook_url, enabled_platforms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      merchant.id,
      merchant.name,
      merchant.api_key,
      merchant.api_url,
      merchant.webhook_url || null,
      JSON.stringify(merchant.enabled_platforms || ['acp', 'ap2'])
    );
  },

  getMerchant: (id) => db.prepare('SELECT * FROM merchants WHERE id = ?').get(id),

  getMerchantByApiKey: (apiKey) => {
    return db.prepare('SELECT * FROM merchants WHERE api_key = ?').get(apiKey);
  },

  getAllMerchants: () => db.prepare('SELECT * FROM merchants').all(),

  // ============================================
  // PRODUCT SYNC
  // ============================================
  syncProduct: (sync) => {
    return db.prepare(`
      INSERT OR REPLACE INTO product_sync 
      (id, merchant_id, merchant_product_id, platform, platform_product_id, 
       sync_status, last_synced, product_data, universal_data)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `).run(
      sync.id,
      sync.merchant_id,
      sync.merchant_product_id,
      sync.platform,
      sync.platform_product_id || null,
      sync.sync_status || 'synced',
      safeStringify(sync.product_data),
      safeStringify(sync.universal_data)
    );
  },

  getSyncedProducts: (merchantId, platform) => {
    return db.prepare(
      'SELECT * FROM product_sync WHERE merchant_id = ? AND platform = ?'
    ).all(merchantId, platform);
  },

  getUniversalProducts: (merchantId) => {
    return db.prepare(
      'SELECT * FROM product_sync WHERE merchant_id = ? AND universal_data IS NOT NULL'
    ).all(merchantId);
  },

  // ============================================
  // TRANSACTIONS
  // ============================================
  createTransaction: (transaction) => {
    return db.prepare(`
      INSERT INTO transactions 
      (id, merchant_id, platform, platform_order_id, merchant_order_id, 
       product_id, amount, status, customer_email, customer_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transaction.id,
      transaction.merchant_id,
      transaction.platform,
      transaction.platform_order_id || null,
      transaction.merchant_order_id || null,
      transaction.product_id,
      transaction.amount,
      transaction.status || 'pending',
      transaction.customer_email,
      transaction.customer_phone || null
    );
  },

  updateTransaction: (id, updates) => {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    return db.prepare(`UPDATE transactions SET ${fields} WHERE id = ?`).run(...values);
  },

  getTransaction: (id) => db.prepare('SELECT * FROM transactions WHERE id = ?').get(id),

  getAllTransactions: () => {
    return db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
  },

  getTransactionsByCustomer: (phone, email) => {
    return db.prepare(
      'SELECT * FROM transactions WHERE customer_phone = ? OR customer_email = ? ORDER BY created_at DESC'
    ).all(phone, email);
  },

  getTransactionsByMerchant: (merchantId) => {
    return db.prepare(
      'SELECT * FROM transactions WHERE merchant_id = ? ORDER BY created_at DESC'
    ).all(merchantId);
  },

  getTransactionsByPhone: (phone, sinceDate) => {
    return db.prepare(
      'SELECT * FROM transactions WHERE customer_phone = ? AND created_at >= ? ORDER BY created_at DESC'
    ).all(phone, sinceDate.toISOString());
  },

  getTransactionsByEmail: (email, sinceDate) => {
    return db.prepare(
      'SELECT * FROM transactions WHERE customer_email = ? AND created_at >= ? ORDER BY created_at DESC'
    ).all(email, sinceDate.toISOString());
  },

  // ============================================
  // CHECKOUT SESSIONS
  // ============================================
  createCheckoutSession: (session) => {
    return db.prepare(`
      INSERT INTO checkout_sessions (id, merchant_id, platform, session_data, status, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))
    `).run(
      session.id,
      session.merchant_id,
      session.platform,
      safeStringify(session.session_data),
      session.status || 'pending'
    );
  },

  getCheckoutSession: (id) => {
    return db.prepare('SELECT * FROM checkout_sessions WHERE id = ?').get(id);
  },

  updateCheckoutSession: (id, status, sessionData) => {
    return db.prepare(`
      UPDATE checkout_sessions 
      SET status = ?, session_data = ?
      WHERE id = ?
    `).run(status, safeStringify(sessionData), id);
  },

  // ============================================
  // AP2 MANDATES
  // ============================================
  storeMandate: (mandate) => {
    return db.prepare(`
      INSERT OR REPLACE INTO ap2_mandates (id, type, mandate_data, signature, verified, merchant_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mandate.id,
      mandate.type,
      JSON.stringify(mandate),
      typeof mandate.signature === 'string' ? mandate.signature : JSON.stringify(mandate.signature),
      mandate.verified ? 1 : 0,
      mandate.merchant_id || null,
      mandate.expires_at || null
    );
  },

  getMandate: (id) => {
    return db.prepare('SELECT * FROM ap2_mandates WHERE id = ?').get(id);
  },

  updateMandateVerification: (id, verified) => {
    return db.prepare('UPDATE ap2_mandates SET verified = ? WHERE id = ?').run(verified, id);
  },

  // ============================================
  // SHOPPING CARTS
  // ============================================
  createCart: (cart) => {
    return db.prepare(`
      INSERT INTO shopping_carts 
      (id, merchant_id, intent_mandate_id, items, subtotal, tax, shipping, total, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+1 hour'))
    `).run(
      cart.id,
      cart.merchant_id,
      cart.intent_mandate_id || null,
      JSON.stringify(cart.items),
      cart.subtotal,
      cart.tax,
      cart.shipping,
      cart.total
    );
  },

  getCart: (id) => {
    return db.prepare('SELECT * FROM shopping_carts WHERE id = ?').get(id);
  },

  updateCart: (id, cart) => {
    return db.prepare(`
      UPDATE shopping_carts 
      SET items = ?, subtotal = ?, tax = ?, shipping = ?, total = ?
      WHERE id = ?
    `).run(
      JSON.stringify(cart.items),
      cart.subtotal,
      cart.tax,
      cart.shipping,
      cart.total,
      id
    );
  },

  // ============================================
  // AP2 TRANSACTIONS
  // ============================================
  createAP2Transaction: (transaction) => {
    return db.prepare(`
      INSERT INTO ap2_transactions 
      (id, merchant_id, intent_mandate_id, cart_mandate_id, payment_mandate_id, 
       cart_id, order_id, amount, status, audit_trail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transaction.id,
      transaction.merchant_id,
      transaction.intent_mandate_id || null,
      transaction.cart_mandate_id || null,
      transaction.payment_mandate_id || null,
      transaction.cart_id || null,
      transaction.order_id || null,
      transaction.amount,
      transaction.status || 'pending',
      JSON.stringify(transaction.audit_trail || [])
    );
  },

  getAP2Transaction: (id) => {
    return db.prepare('SELECT * FROM ap2_transactions WHERE id = ?').get(id);
  },

  updateAP2Transaction: (id, updates) => {
    const fields = Object.keys(updates).map(key =>
      key === 'audit_trail' ? `${key} = ?` : `${key} = ?`
    ).join(', ');
    const values = Object.values(updates).map(v =>
      typeof v === 'object' ? JSON.stringify(v) : v
    );
    return db.prepare(`UPDATE ap2_transactions SET ${fields} WHERE id = ?`).run(...values, id);
  },

  getAllAP2Transactions: () => {
    return db.prepare('SELECT * FROM ap2_transactions ORDER BY created_at DESC').all();
  },

  // ============================================
  // VOICE CHECKOUTS
  // ============================================
  createVoiceCheckout: (checkout) => {
    // Ensure customer_phone is never null (required field)
    const customerPhone = checkout.customer_phone || '0000000000';

    return db.prepare(`
      INSERT INTO voice_checkouts 
      (id, merchant_id, product_id, product_name, quantity, amount, 
       customer_phone, customer_name, customer_email, appointment_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      checkout.id,
      checkout.merchant_id,
      checkout.product_id,
      checkout.product_name,
      checkout.quantity || 1,
      checkout.amount,
      customerPhone,
      checkout.customer_name || null,
      checkout.customer_email || null,
      checkout.appointment_id || null,
      checkout.status || 'pending'
    );
  },

  getVoiceCheckout: (id) => {
    return db.prepare('SELECT * FROM voice_checkouts WHERE id = ?').get(id);
  },

  updateVoiceCheckout: (id, updates) => {
    const fields = [];
    const values = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.payment_intent_id) {
      fields.push('payment_intent_id = ?');
      values.push(updates.payment_intent_id);
    }
    if (updates.merchant_order_id) {
      fields.push('merchant_order_id = ?');
      values.push(updates.merchant_order_id);
    }
    if (updates.payment_token) {
      fields.push('payment_token = ?');
      values.push(updates.payment_token);
    }
    if (updates.fhir_patient_id) {
      fields.push('fhir_patient_id = ?');
      values.push(updates.fhir_patient_id);
    }
    if (updates.fhir_encounter_id) {
      fields.push('fhir_encounter_id = ?');
      values.push(updates.fhir_encounter_id);
    }
    if (updates.appointment_id !== undefined) {
      fields.push('appointment_id = ?');
      values.push(updates.appointment_id);
    }
    if (updates.status === 'completed') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (fields.length === 0) return;

    values.push(id);
    const query = `UPDATE voice_checkouts SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(query).run(...values);
  },

  getAllVoiceCheckouts: () => {
    return db.prepare('SELECT * FROM voice_checkouts ORDER BY created_at DESC').all();
  },

  getVoiceCheckoutsByMerchant: (merchantId) => {
    return db.prepare('SELECT * FROM voice_checkouts WHERE merchant_id = ? ORDER BY created_at DESC').all(merchantId);
  },

  // ============================================
  // PAYMENT TOKENS
  // ============================================
  createPaymentToken: (token) => {
    return db.prepare(`
      INSERT INTO payment_tokens (token, checkout_id, verification_code, verification_code_expires, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      token.token,
      token.checkout_id,
      token.verification_code || null,
      token.verification_code_expires || null,
      token.status || 'pending'
    );
  },

  getPaymentToken: (token) => {
    return db.prepare('SELECT * FROM payment_tokens WHERE token = ?').get(token);
  },

  updatePaymentToken: (token, updates) => {
    const fields = [];
    const values = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'used') {
        fields.push('used_at = CURRENT_TIMESTAMP');
      }
    }

    if (fields.length === 0) return;

    values.push(token);
    const query = `UPDATE payment_tokens SET ${fields.join(', ')} WHERE token = ?`;
    return db.prepare(query).run(...values);
  },

  // ============================================
  // FRAUD DETECTION
  // ============================================

  createFraudCheck: (check) => {
    return db.prepare(`
      INSERT INTO fraud_checks 
      (id, transaction_id, customer_phone, customer_email, merchant_id, agent_platform,
       risk_score, risk_level, signals, is_fraud, requires_verification)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      check.id,
      check.transaction_id,
      check.customer_phone,
      check.customer_email,
      check.merchant_id,
      check.agent_platform,
      check.risk_score,
      check.risk_level,
      check.signals,
      check.is_fraud ? 1 : 0,
      check.requires_verification ? 1 : 0
    );
  },

  getFraudCheck: (transactionId) => {
    return db.prepare('SELECT * FROM fraud_checks WHERE transaction_id = ?').get(transactionId);
  },

  getFraudChecksByCustomer: (phone, email) => {
    return db.prepare(
      'SELECT * FROM fraud_checks WHERE customer_phone = ? OR customer_email = ?'
    ).all(phone, email);
  },

  getAllFraudChecks: (limit = 100) => {
    return db.prepare('SELECT * FROM fraud_checks ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  getHighRiskFraudChecks: () => {
    return db.prepare(
      'SELECT * FROM fraud_checks WHERE risk_score >= 80 AND reviewed = 0 ORDER BY created_at DESC'
    ).all();
  },

  updateFraudCheckReview: (id, reviewedBy, actionTaken) => {
    return db.prepare(`
      UPDATE fraud_checks 
      SET reviewed = 1, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, action_taken = ?
      WHERE id = ?
    `).run(reviewedBy, actionTaken, id);
  },

  // Blacklist
  addToBlacklist: (type, value, reason, addedBy = 'system') => {
    try {
      return db.prepare(`
        INSERT INTO fraud_blacklist (id, type, value, reason, added_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        require('crypto').randomBytes(16).toString('hex'),
        type,
        value,
        reason,
        addedBy
      );
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        return { changes: 0 };
      }
      throw error;
    }
  },

  removeFromBlacklist: (type, value) => {
    return db.prepare('DELETE FROM fraud_blacklist WHERE type = ? AND value = ?').run(type, value);
  },

  checkBlacklist: (type, value) => {
    return db.prepare('SELECT * FROM fraud_blacklist WHERE type = ? AND value = ?').get(type, value);
  },

  getAllBlacklisted: () => {
    return db.prepare('SELECT * FROM fraud_blacklist ORDER BY created_at DESC').all();
  },

  // Whitelist
  addToWhitelist: (type, value, addedBy = 'system') => {
    try {
      return db.prepare(`
        INSERT INTO fraud_whitelist (id, type, value, added_by)
        VALUES (?, ?, ?, ?)
      `).run(
        require('crypto').randomBytes(16).toString('hex'),
        type,
        value,
        addedBy
      );
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        return { changes: 0 };
      }
      throw error;
    }
  },

  removeFromWhitelist: (type, value) => {
    return db.prepare('DELETE FROM fraud_whitelist WHERE type = ? AND value = ?').run(type, value);
  },

  checkWhitelist: (type, value) => {
    return db.prepare('SELECT * FROM fraud_whitelist WHERE type = ? AND value = ?').get(type, value);
  },

  getAllWhitelisted: () => {
    return db.prepare('SELECT * FROM fraud_whitelist ORDER BY created_at DESC').all();
  },

  // Agent Stats
  getAgentStats: (platform) => {
    const stats = db.prepare('SELECT * FROM agent_stats WHERE platform = ?').get(platform);

    if (!stats) {
      return {
        total_transactions: 0,
        fraud_rate: 0,
        chargeback_rate: 0,
        success_rate: 0
      };
    }

    return {
      total_transactions: stats.total_transactions,
      fraud_rate: stats.total_transactions > 0 ? stats.fraud_count / stats.total_transactions : 0,
      chargeback_rate: stats.total_transactions > 0 ? stats.chargeback_count / stats.total_transactions : 0,
      success_rate: stats.total_transactions > 0 ? stats.success_count / stats.total_transactions : 0
    };
  },

  updateAgentStats: (platform, updates) => {
    const existing = db.prepare('SELECT * FROM agent_stats WHERE platform = ?').get(platform);

    if (!existing) {
      return db.prepare(`
        INSERT INTO agent_stats (platform, total_transactions, fraud_count, chargeback_count, success_count)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        platform,
        updates.total_transactions || 0,
        updates.fraud_count || 0,
        updates.chargeback_count || 0,
        updates.success_count || 0
      );
    }

    return db.prepare(`
      UPDATE agent_stats 
      SET total_transactions = total_transactions + ?,
          fraud_count = fraud_count + ?,
          chargeback_count = chargeback_count + ?,
          success_count = success_count + ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE platform = ?
    `).run(
      updates.total_transactions || 0,
      updates.fraud_count || 0,
      updates.chargeback_count || 0,
      updates.success_count || 0,
      platform
    );
  },

  // Fraud Statistics
  getFraudStats: (timeframe = '24h') => {
    let sinceDate;
    const now = new Date();

    switch (timeframe) {
      case '1h':
        sinceDate = new Date(now - 60 * 60 * 1000);
        break;
      case '24h':
        sinceDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        sinceDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        sinceDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        sinceDate = new Date(now - 24 * 60 * 60 * 1000);
    }

    const checks = db.prepare(
      'SELECT * FROM fraud_checks WHERE created_at >= ?'
    ).all(sinceDate.toISOString());

    const total = checks.length;
    const blocked = checks.filter(c => c.is_fraud).length;
    const verified = checks.filter(c => c.requires_verification).length;
    const approved = checks.filter(c => !c.is_fraud && !c.requires_verification).length;

    const avgRiskScore = total > 0
      ? checks.reduce((sum, c) => sum + c.risk_score, 0) / total
      : 0;

    return {
      timeframe,
      total_checks: total,
      blocked_count: blocked,
      verification_required: verified,
      approved_count: approved,
      block_rate: total > 0 ? (blocked / total * 100).toFixed(2) : 0,
      avg_risk_score: avgRiskScore.toFixed(2),
      high_risk_count: checks.filter(c => c.risk_score >= 80).length,
      medium_risk_count: checks.filter(c => c.risk_score >= 50 && c.risk_score < 80).length,
      low_risk_count: checks.filter(c => c.risk_score < 50).length
    };
  },

  // ==========================================
  // FHIR RESOURCES - Healthcare Data Layer
  // ==========================================

  // Create FHIR Patient
  createFHIRPatient(patientResource) {
    const stmt = db.prepare(`
      INSERT INTO fhir_patients (
        resource_id, resource_data, phone, email, name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const phone = patientResource.telecom?.find(t => t.system === 'phone')?.value;
    const email = patientResource.telecom?.find(t => t.system === 'email')?.value;
    const name = patientResource.name?.[0]
      ? `${patientResource.name[0].given?.join(' ')} ${patientResource.name[0].family}`.trim()
      : null;

    return stmt.run(
      patientResource.id,
      JSON.stringify(patientResource),
      phone,
      email,
      name
    );
  },

  // Get FHIR Patient by ID
  getFHIRPatient(resourceId) {
    const stmt = db.prepare('SELECT * FROM fhir_patients WHERE resource_id = ? AND is_deleted = 0');
    const row = stmt.get(resourceId);
    if (!row) return null;
    return {
      ...row,
      resource_data: JSON.parse(row.resource_data)
    };
  },

  // Get FHIR Patient by Phone
  getFHIRPatientByPhone(phone) {
    const stmt = db.prepare('SELECT * FROM fhir_patients WHERE phone = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get(phone);
    if (!row) return null;
    return {
      ...row,
      resource_data: JSON.parse(row.resource_data)
    };
  },

  // Update FHIR Patient
  updateFHIRPatient(resourceId, patientResource) {
    const stmt = db.prepare(`
      UPDATE fhir_patients
      SET resource_data = ?,
          phone = ?,
          email = ?,
          name = ?,
          version_id = version_id + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE resource_id = ?
    `);

    const phone = patientResource.telecom?.find(t => t.system === 'phone')?.value;
    const email = patientResource.telecom?.find(t => t.system === 'email')?.value;
    const name = patientResource.name?.[0]
      ? `${patientResource.name[0].given?.join(' ')} ${patientResource.name[0].family}`.trim()
      : null;

    return stmt.run(
      JSON.stringify(patientResource),
      phone,
      email,
      name,
      resourceId
    );
  },

  // Search FHIR Patients
  searchFHIRPatients(params = {}) {
    let query = 'SELECT * FROM fhir_patients WHERE is_deleted = 0';
    const queryParams = [];

    if (params.name) {
      // Search by name column (case-insensitive)
      query += ' AND (LOWER(name) LIKE LOWER(?) OR name LIKE ?)';
      const namePattern = `%${params.name}%`;
      queryParams.push(namePattern);
      queryParams.push(namePattern);
    }
    if (params.phone) {
      query += ' AND phone = ?';
      queryParams.push(params.phone);
    }
    if (params.email) {
      query += ' AND email = ?';
      queryParams.push(params.email);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(params.limit || 50);

    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams);

    // Also search in resource_data JSON for name fields if name search didn't yield results
    let results = rows.map(row => ({
      ...row,
      resource_data: JSON.parse(row.resource_data)
    }));

    // If name search and no results, try searching in JSON
    if (params.name && results.length === 0) {
      const allPatients = db.prepare('SELECT * FROM fhir_patients WHERE is_deleted = 0 LIMIT 200').all();
      const nameLower = params.name.toLowerCase();
      results = allPatients
        .map(row => {
          try {
            const resourceData = JSON.parse(row.resource_data);
            const name = resourceData.name?.[0];
            if (name) {
              const given = (name.given || []).join(' ').toLowerCase();
              const family = (name.family || '').toLowerCase();
              const fullName = `${given} ${family}`.trim();
              if (fullName.includes(nameLower) || given.includes(nameLower) || family.includes(nameLower)) {
                return {
                  ...row,
                  resource_data: resourceData
                };
              }
            }
            return null;
          } catch (e) {
            return null;
          }
        })
        .filter(p => p !== null)
        .slice(0, params.limit || 50);
    }

    return results;
  },

  // Create FHIR Encounter (Voice Call Session)
  createFHIREncounter(encounterResource) {
    const stmt = db.prepare(`
      INSERT INTO fhir_encounters (
        resource_id, resource_data, patient_id, status, call_id, start_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const patientId = encounterResource.subject?.reference?.replace('Patient/', '');
    const callId = encounterResource.extension?.find(
      e => e.url === 'https://doclittle.health/extension/voice-call-id'
    )?.valueString;

    return stmt.run(
      encounterResource.id,
      JSON.stringify(encounterResource),
      patientId,
      encounterResource.status,
      callId,
      encounterResource.period?.start
    );
  },

  // Get FHIR Encounter by ID
  getFHIREncounter(resourceId) {
    const stmt = db.prepare('SELECT * FROM fhir_encounters WHERE resource_id = ? AND is_deleted = 0');
    const row = stmt.get(resourceId);
    if (!row) return null;
    return {
      ...row,
      resource_data: JSON.parse(row.resource_data)
    };
  },

  // Get FHIR Encounter by Call ID
  getFHIREncounterByCallId(callId) {
    const stmt = db.prepare('SELECT * FROM fhir_encounters WHERE call_id = ? AND is_deleted = 0');
    const row = stmt.get(callId);
    if (!row) return null;
    return {
      ...row,
      resource_data: JSON.parse(row.resource_data)
    };
  },

  // Update FHIR Encounter
  updateFHIREncounter(resourceId, encounterResource) {
    const stmt = db.prepare(`
      UPDATE fhir_encounters
      SET resource_data = ?,
          status = ?,
          end_time = ?,
          version_id = version_id + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE resource_id = ?
    `);

    return stmt.run(
      JSON.stringify(encounterResource),
      encounterResource.status,
      encounterResource.period?.end,
      resourceId
    );
  },

  // Get Patient Encounters
  getPatientEncounters(patientId, limit = 20) {
    const stmt = db.prepare(`
      SELECT * FROM fhir_encounters
      WHERE patient_id = ? AND is_deleted = 0
      ORDER BY start_time DESC
      LIMIT ?
    `);
    const rows = stmt.all(patientId, limit);

    return rows.map(row => ({
      ...row,
      resource_data: JSON.parse(row.resource_data)
    }));
  },

  // Create FHIR Communication (Transcript)
  createFHIRCommunication(communicationResource) {
    const stmt = db.prepare(`
      INSERT INTO fhir_communications (
        resource_id, resource_data, patient_id, encounter_id, sent_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const patientId = communicationResource.subject?.reference?.replace('Patient/', '');
    const encounterId = communicationResource.encounter?.reference?.replace('Encounter/', '');

    return stmt.run(
      communicationResource.id,
      JSON.stringify(communicationResource),
      patientId,
      encounterId,
      communicationResource.sent
    );
  },

  // Get FHIR Communication by ID
  getFHIRCommunication(resourceId) {
    const stmt = db.prepare('SELECT * FROM fhir_communications WHERE resource_id = ? AND is_deleted = 0');
    const row = stmt.get(resourceId);
    if (!row) return null;
    return {
      ...row,
      resource_data: JSON.parse(row.resource_data)
    };
  },

  // Get Encounter Communications
  getEncounterCommunications(encounterId) {
    const stmt = db.prepare(`
      SELECT * FROM fhir_communications
      WHERE encounter_id = ? AND is_deleted = 0
      ORDER BY sent_time ASC
    `);
    const rows = stmt.all(encounterId);

    return rows.map(row => ({
      ...row,
      resource_data: JSON.parse(row.resource_data)
    }));
  },

  // Create FHIR Observation (Assessment)
  createFHIRObservation(observationResource) {
    const stmt = db.prepare(`
      INSERT INTO fhir_observations (
        resource_id, resource_data, patient_id, encounter_id, code, value, effective_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const patientId = observationResource.subject?.reference?.replace('Patient/', '');
    const encounterId = observationResource.encounter?.reference?.replace('Encounter/', '');
    const code = observationResource.code?.coding?.[0]?.code;
    const value = observationResource.valueInteger || observationResource.valueString;

    return stmt.run(
      observationResource.id,
      JSON.stringify(observationResource),
      patientId,
      encounterId,
      code,
      JSON.stringify(value),
      observationResource.effectiveDateTime
    );
  },

  // Get Patient Observations
  getPatientObservations(patientId, limit = 50) {
    const stmt = db.prepare(`
      SELECT * FROM fhir_observations
      WHERE patient_id = ? AND is_deleted = 0
      ORDER BY effective_date DESC
      LIMIT ?
    `);
    const rows = stmt.all(patientId, limit);

    return rows.map(row => ({
      ...row,
      resource_data: JSON.parse(row.resource_data),
      value: JSON.parse(row.value)
    }));
  },

  // Create FHIR Audit Log
  createFHIRAuditLog(action, resourceType, resourceId, userId, ipAddress, userAgent) {
    const stmt = db.prepare(`
      INSERT INTO fhir_audit_log (
        action, resource_type, resource_id, user_id, ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    return stmt.run(action, resourceType, resourceId, userId, ipAddress, userAgent);
  },

  // Get Audit Logs
  getFHIRAuditLogs(params = {}) {
    let query = 'SELECT * FROM fhir_audit_log WHERE 1=1';
    const queryParams = [];

    if (params.resourceType) {
      query += ' AND resource_type = ?';
      queryParams.push(params.resourceType);
    }
    if (params.resourceId) {
      query += ' AND resource_id = ?';
      queryParams.push(params.resourceId);
    }
    if (params.userId) {
      query += ' AND user_id = ?';
      queryParams.push(params.userId);
    }
    if (params.startDate) {
      query += ' AND timestamp >= ?';
      queryParams.push(params.startDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    queryParams.push(params.limit || 100);

    const stmt = db.prepare(query);
    return stmt.all(...queryParams);
  },

  // ============================================
  // USER MANAGEMENT
  // ============================================

  // Create user
  createUser(user) {
    const stmt = db.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, role, merchant_id, picture, auth_method, google_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      user.id,
      user.email,
      user.password_hash || null,
      user.name,
      user.role || 'healthcare_provider',
      user.merchant_id || null,
      user.picture || null,
      user.auth_method || 'email',
      user.google_id || null
    );
  },

  // Get user by email
  getUserByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
    return stmt.get(email);
  },

  // Get user by ID
  getUserById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
    return stmt.get(id);
  },

  // Get user by Google ID
  getUserByGoogleId(googleId) {
    const stmt = db.prepare('SELECT * FROM users WHERE google_id = ? AND is_active = 1');
    return stmt.get(googleId);
  },

  // Update user
  updateUser(id, updates) {
    const fields = [];
    const values = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.picture !== undefined) {
      fields.push('picture = ?');
      values.push(updates.picture);
    }
    if (updates.role) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.merchant_id !== undefined) {
      fields.push('merchant_id = ?');
      values.push(updates.merchant_id);
    }
    if (updates.password_hash) {
      fields.push('password_hash = ?');
      values.push(updates.password_hash);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(query).run(...values);
  },

  // Update last login
  updateUserLastLogin(id) {
    const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(id);
  },

  // Get all users
  getAllUsers() {
    const stmt = db.prepare('SELECT id, email, name, role, merchant_id, picture, auth_method, created_at, last_login FROM users WHERE is_active = 1 ORDER BY created_at DESC');
    return stmt.all();
  },

  // Deactivate user (soft delete)
  deactivateUser(id) {
    const stmt = db.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(id);
  },

  // ============================================
  // APPOINTMENTS
  // ============================================

  // Create new appointment
  createAppointment(appointment) {
    // Note: buffer_before_minutes and buffer_after_minutes are stored in notes JSON
    // or we can add columns later if needed - for now, calculate from appointment_type
    const stmt = db.prepare(`
      INSERT INTO appointments (
        id, patient_name, patient_phone, patient_email, patient_id,
        appointment_type, date, time, start_time, end_time,
        duration_minutes, provider, status, notes,
        calendar_event_id, calendar_link, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Store buffer times in notes as JSON if not already JSON
    let notes = appointment.notes || '';
    if (appointment.buffer_before_minutes || appointment.buffer_after_minutes) {
      try {
        const notesObj = notes ? JSON.parse(notes) : {};
        notesObj.buffer_before_minutes = appointment.buffer_before_minutes;
        notesObj.buffer_after_minutes = appointment.buffer_after_minutes;
        notesObj.timezone = appointment.timezone;
        notes = JSON.stringify(notesObj);
      } catch (e) {
        // If notes is not JSON, append buffer info
        notes = `${notes}\nBuffer: ${appointment.buffer_before_minutes || 0}min before, ${appointment.buffer_after_minutes || 0}min after`.trim();
      }
    }

    return stmt.run(
      appointment.id,
      appointment.patient_name,
      appointment.patient_phone,
      appointment.patient_email,
      appointment.patient_id || null,
      appointment.appointment_type,
      appointment.date,
      appointment.time,
      appointment.start_time,
      appointment.end_time,
      appointment.duration_minutes,
      appointment.provider,
      appointment.status,
      notes,
      appointment.calendar_event_id,
      appointment.calendar_link,
      appointment.created_at
    );
  },

  // Get appointment by ID
  getAppointment(id) {
    const stmt = db.prepare('SELECT * FROM appointments WHERE id = ? OR id LIKE ?');
    return stmt.get(id, `%${id}%`);
  },

  // Get appointments by date
  getAppointmentsByDate(date) {
    const stmt = db.prepare('SELECT * FROM appointments WHERE date = ? ORDER BY time ASC');
    return stmt.all(date);
  },

  // Search appointments by phone or email
  searchAppointments(searchTerm) {
    const stmt = db.prepare(`
      SELECT * FROM appointments
      WHERE patient_phone LIKE ? OR patient_email LIKE ?
      ORDER BY date DESC, time DESC
    `);
    return stmt.all(`%${searchTerm}%`, `%${searchTerm}%`);
  },

  // Get all appointments (with optional filters)
  getAllAppointments(filters = {}) {
    let query = 'SELECT * FROM appointments WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.date) {
      query += ' AND date = ?';
      params.push(filters.date);
    }

    if (filters.provider) {
      query += ' AND provider = ?';
      params.push(filters.provider);
    }

    query += ' ORDER BY date DESC, time DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  },

  // Update appointment status
  updateAppointmentStatus(id, status, reason = null) {
    const stmt = db.prepare(`
      UPDATE appointments
      SET status = ?,
          cancellation_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? OR id LIKE ?
    `);
    return stmt.run(status, reason, id, `%${id}%`);
  },

  // Update appointment details (for rescheduling)
  updateAppointment(id, updates) {
    const fields = [];
    const values = [];

    if (updates.date !== undefined) {
      fields.push('date = ?');
      values.push(updates.date);
    }
    if (updates.time !== undefined) {
      fields.push('time = ?');
      values.push(updates.time);
    }
    if (updates.start_time !== undefined) {
      fields.push('start_time = ?');
      values.push(updates.start_time);
    }
    if (updates.end_time !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.end_time);
    }
    // Note: appointments table has no timezone column; store timezone in notes JSON if needed
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.appointment_type !== undefined) {
      fields.push('appointment_type = ?');
      values.push(updates.appointment_type);
    }
    if (updates.duration_minutes !== undefined) {
      fields.push('duration_minutes = ?');
      values.push(updates.duration_minutes);
    }

    if (fields.length === 0) {
      return { changes: 0 };
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE appointments
      SET ${fields.join(', ')}
      WHERE id = ? OR id LIKE ?
    `;

    const stmt = db.prepare(query);
    return stmt.run(...values, id, `%${id}%`);
  },

  // Update appointment reminder sent flag
  markReminderSent(id) {
    const stmt = db.prepare(`
      UPDATE appointments
      SET reminder_sent = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Delete appointment (hard delete)
  deleteAppointment(id) {
    const stmt = db.prepare('DELETE FROM appointments WHERE id = ? OR id LIKE ?');
    return stmt.run(id, `%${id}%`);
  },

  // Get upcoming appointments (next 7 days)
  getUpcomingAppointments(limit = 10) {
    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare(`
      SELECT * FROM appointments
      WHERE date >= ? AND status IN ('scheduled', 'confirmed')
      ORDER BY date ASC, time ASC
      LIMIT ?
    `);
    return stmt.all(today, limit);
  },

  // ============================================
  // INSURANCE & BILLING
  // ============================================

  // Create eligibility check record
  createEligibilityCheck(eligibility) {
    const stmt = db.prepare(`
      INSERT INTO eligibility_checks (
        id, patient_id, member_id, payer_id, service_code,
        date_of_service, eligible, copay_amount, allowed_amount,
        insurance_pays, deductible_total, deductible_remaining,
        coinsurance_percent, plan_summary, response_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      eligibility.id,
      eligibility.patient_id || null,
      eligibility.member_id,
      eligibility.payer_id,
      eligibility.service_code || null,
      eligibility.date_of_service || null,
      eligibility.eligible ? 1 : 0,
      eligibility.copay_amount || 0,
      eligibility.allowed_amount || 0,
      eligibility.insurance_pays || 0,
      eligibility.deductible_total !== undefined ? eligibility.deductible_total : null,
      eligibility.deductible_remaining !== undefined ? eligibility.deductible_remaining : null,
      eligibility.coinsurance_percent !== undefined ? eligibility.coinsurance_percent : null,
      eligibility.plan_summary || null,
      eligibility.response_data || null,
      eligibility.created_at || new Date().toISOString()
    );
  },

  // Get eligibility check by ID
  getEligibilityCheck(id) {
    const stmt = db.prepare('SELECT * FROM eligibility_checks WHERE id = ?');
    return stmt.get(id);
  },

  // Get eligibility checks for a patient
  getEligibilityChecksByPatient(patientId) {
    const stmt = db.prepare(`
      SELECT * FROM eligibility_checks
      WHERE patient_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(patientId);
  },

  // Create insurance claim
  createInsuranceClaim(claim) {
    try {
      const stmt = db.prepare(`
        INSERT INTO insurance_claims (
          id, appointment_id, patient_id, member_id, payer_id,
          service_code, diagnosis_code, total_amount, copay_amount,
          insurance_amount, status, x12_claim_id, blockchain_proof,
          submitted_at, response_data, circle_transfer_id, payment_status, payment_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        claim.id,
        claim.appointment_id || null,
        claim.patient_id || null,
        claim.member_id,
        claim.payer_id,
        claim.service_code || null,
        claim.diagnosis_code || null,
        claim.total_amount,
        claim.copay_amount || 0,
        claim.insurance_amount || 0,
        claim.status || 'submitted',
        claim.x12_claim_id || null,
        claim.blockchain_proof || null,
        claim.submitted_at || new Date().toISOString(),
        claim.response_data || null,
        claim.circle_transfer_id || null,
        claim.payment_status || 'pending',
        claim.payment_amount || null
      );
      return result;
    } catch (error) {
      console.error('❌ Error creating insurance claim:', error);
      console.error('Claim data:', JSON.stringify(claim, null, 2));
      throw error; // Re-throw to be handled by caller
    }
  },

  // Get insurance claim by ID
  getInsuranceClaim(id) {
    const stmt = db.prepare('SELECT * FROM insurance_claims WHERE id = ?');
    return stmt.get(id);
  },

  // Get insurance claim by idempotency key
  getInsuranceClaimByIdempotency(idemKey) {
    const stmt = db.prepare('SELECT * FROM insurance_claims WHERE idempotency_key = ? ORDER BY submitted_at DESC LIMIT 1');
    return stmt.get(idemKey);
  },

  // Get claims for an appointment
  getClaimsByAppointment(appointmentId) {
    const stmt = db.prepare(`
      SELECT * FROM insurance_claims
      WHERE appointment_id = ?
      ORDER BY submitted_at DESC
    `);
    return stmt.all(appointmentId);
  },

  // Get claims for a patient
  getClaimsByPatient(patientId) {
    const stmt = db.prepare(`
      SELECT * FROM insurance_claims
      WHERE patient_id = ?
      ORDER BY submitted_at DESC
    `);
    return stmt.all(patientId);
  },

  getClaimById(claimId) {
    const stmt = db.prepare(`
      SELECT * FROM insurance_claims
      WHERE id = ?
    `);
    return stmt.get(claimId);
  },

  // ============================================
  // CIRCLE PAYMENT METHODS
  // ============================================

  // Create Circle account
  createCircleAccount(account) {
    const stmt = db.prepare(`
      INSERT INTO circle_accounts (
        id, entity_type, entity_id, circle_wallet_id, circle_account_id,
        currency, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      account.id,
      account.entity_type,
      account.entity_id,
      account.circle_wallet_id,
      account.circle_account_id || null,
      account.currency || 'USDC',
      account.status || 'active',
      account.created_at || new Date().toISOString(),
      account.updated_at || new Date().toISOString()
    );
  },

  // Get Circle account by entity
  getCircleAccountByEntity(entityType, entityId) {
    const stmt = db.prepare(`
      SELECT * FROM circle_accounts
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(entityType, entityId);
  },

  // Get Circle account by wallet ID
  getCircleAccountByWalletId(walletId) {
    const stmt = db.prepare(`
      SELECT * FROM circle_accounts
      WHERE circle_wallet_id = ?
    `);
    return stmt.get(walletId);
  },

  // Create Circle transfer
  createCircleTransfer(transfer) {
    const stmt = db.prepare(`
      INSERT INTO circle_transfers (
        id, claim_id, from_wallet_id, to_wallet_id, amount, currency,
        circle_transfer_id, status, error_message, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      transfer.id,
      transfer.claim_id || null,
      transfer.from_wallet_id,
      transfer.to_wallet_id,
      transfer.amount,
      transfer.currency || 'USDC',
      transfer.circle_transfer_id || null,
      transfer.status || 'pending',
      transfer.error_message || null,
      transfer.created_at || new Date().toISOString(),
      transfer.completed_at || null
    );
  },

  // Update Circle transfer
  updateCircleTransfer(id, updates) {
    const fields = [];
    const values = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.circle_transfer_id !== undefined) {
      fields.push('circle_transfer_id = ?');
      values.push(updates.circle_transfer_id);
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }
    if (updates.completed_at !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completed_at);
    }

    if (fields.length === 0) {
      return { changes: 0 };
    }

    values.push(id);
    const query = `UPDATE circle_transfers SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(query).run(...values);
  },

  // Get Circle transfer by ID
  getCircleTransfer(id) {
    const stmt = db.prepare(`
      SELECT * FROM circle_transfers
      WHERE id = ?
    `);
    return stmt.get(id);
  },

  // Get Circle transfer by Circle transfer ID
  getCircleTransferByCircleId(circleTransferId) {
    const stmt = db.prepare(`
      SELECT * FROM circle_transfers
      WHERE circle_transfer_id = ?
    `);
    return stmt.get(circleTransferId);
  },

  // Get Circle transfers by claim ID
  getCircleTransfersByClaim(claimId) {
    const stmt = db.prepare(`
      SELECT * FROM circle_transfers
      WHERE claim_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(claimId);
  },

  // Update insurance claim
  updateInsuranceClaim(id, updates) {
    const fields = [];
    const values = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.submitted_at !== undefined) {
      fields.push('submitted_at = ?');
      values.push(updates.submitted_at);
    }
    if (updates.status_checked_at !== undefined) {
      fields.push('status_checked_at = ?');
      values.push(updates.status_checked_at);
    }
    if (updates.approved_at !== undefined) {
      fields.push('approved_at = ?');
      values.push(updates.approved_at);
    }
    if (updates.paid_at !== undefined) {
      fields.push('paid_at = ?');
      values.push(updates.paid_at);
    }
    if (updates.response_data !== undefined) {
      fields.push('response_data = ?');
      values.push(updates.response_data);
    }
    if (updates.circle_transfer_id !== undefined) {
      fields.push('circle_transfer_id = ?');
      values.push(updates.circle_transfer_id);
    }
    if (updates.payment_status !== undefined) {
      fields.push('payment_status = ?');
      values.push(updates.payment_status);
    }
    if (updates.payment_amount !== undefined) {
      fields.push('payment_amount = ?');
      values.push(updates.payment_amount);
    }
    if (updates.insurance_amount !== undefined) {
      fields.push('insurance_amount = ?');
      values.push(updates.insurance_amount);
    }

    if (fields.length === 0) {
      return { changes: 0 };
    }

    values.push(id);

    const query = `
      UPDATE insurance_claims
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    const stmt = db.prepare(query);
    return stmt.run(...values);
  },

  // Get all claims with optional filters
  getAllClaims(filters = {}) {
    let query = 'SELECT * FROM insurance_claims WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.patient_id) {
      query += ' AND patient_id = ?';
      params.push(filters.patient_id);
    }

    if (filters.appointment_id) {
      query += ' AND appointment_id = ?';
      params.push(filters.appointment_id);
    }

    query += ' ORDER BY submitted_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  },

  // ============================================
  // PAYER CACHE
  // ============================================

  // Upsert payer to cache
  upsertPayer(payer) {
    const stmt = db.prepare(`
      INSERT INTO insurance_payers (id, payer_id, payer_name, aliases, supported_transactions, is_active, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(payer_id) DO UPDATE SET
        payer_name = excluded.payer_name,
        aliases = excluded.aliases,
        supported_transactions = excluded.supported_transactions,
        is_active = excluded.is_active,
        last_updated = excluded.last_updated
    `);
    return stmt.run(
      payer.id,
      payer.payer_id,
      payer.payer_name,
      payer.aliases ? JSON.stringify(payer.aliases) : null,
      payer.supported_transactions ? JSON.stringify(payer.supported_transactions) : null,
      payer.is_active !== undefined ? (payer.is_active ? 1 : 0) : 1,
      new Date().toISOString()
    );
  },

  // Get payer by payer_id
  getPayerByPayerId(payerId) {
    const stmt = db.prepare('SELECT * FROM insurance_payers WHERE payer_id = ? AND is_active = 1');
    return stmt.get(payerId);
  },

  // Search payers by name (fuzzy search)
  searchPayersByName(searchTerm) {
    const stmt = db.prepare(`
      SELECT * FROM insurance_payers
      WHERE (payer_name LIKE ? OR aliases LIKE ?)
      AND is_active = 1
      ORDER BY payer_name
      LIMIT 50
    `);
    return stmt.all(`%${searchTerm}%`, `%${searchTerm}%`);
  },

  // Get all cached payers
  getAllCachedPayers(limit = 1000) {
    const stmt = db.prepare(`
      SELECT * FROM insurance_payers
      WHERE is_active = 1
      ORDER BY payer_name
      LIMIT ?
    `);
    return stmt.all(limit);
  },

  // Get payer cache count
  getPayerCacheCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM insurance_payers WHERE is_active = 1');
    return stmt.get().count;
  },

  // ============================================
  // PATIENT INSURANCE
  // ============================================

  // Create or update patient insurance
  upsertPatientInsurance(insurance) {
    // Check if patient already has this insurance (inline the check to avoid circular dependency)
    let existing = null;
    if (insurance.member_id) {
      const checkStmt = db.prepare(`
        SELECT * FROM patient_insurance
        WHERE patient_id = ? AND member_id = ?
        ORDER BY is_primary DESC, created_at DESC
        LIMIT 1
      `);
      existing = checkStmt.get(insurance.patient_id, insurance.member_id);
    } else {
      // Get primary insurance
      const checkStmt = db.prepare(`
        SELECT * FROM patient_insurance
        WHERE patient_id = ? AND is_primary = 1
        ORDER BY created_at DESC
        LIMIT 1
      `);
      existing = checkStmt.get(insurance.patient_id);
    }

    if (existing) {
      // Update existing
      const stmt = db.prepare(`
        UPDATE patient_insurance
        SET payer_id = ?,
            payer_name = ?,
            group_number = ?,
            plan_name = ?,
            relationship_code = ?,
            is_primary = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      return stmt.run(
        insurance.payer_id,
        insurance.payer_name || null,
        insurance.group_number || null,
        insurance.plan_name || null,
        insurance.relationship_code || 'self',
        insurance.is_primary !== undefined ? (insurance.is_primary ? 1 : 0) : 1,
        existing.id
      );
    } else {
      // Create new
      const stmt = db.prepare(`
        INSERT INTO patient_insurance (
          id, patient_id, payer_id, payer_name, member_id,
          group_number, plan_name, relationship_code, is_primary, is_verified, verified_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      return stmt.run(
        insurance.id,
        insurance.patient_id,
        insurance.payer_id,
        insurance.payer_name || null,
        insurance.member_id,
        insurance.group_number || null,
        insurance.plan_name || null,
        insurance.relationship_code || 'self',
        insurance.is_primary !== undefined ? (insurance.is_primary ? 1 : 0) : 1,
        insurance.is_verified !== undefined ? (insurance.is_verified ? 1 : 0) : 0,
        insurance.verified_at || null
      );
    }
  },

  // Get patient insurance by patient_id and member_id
  getPatientInsurance(patientId, memberId = null) {
    if (memberId) {
      const stmt = db.prepare(`
        SELECT * FROM patient_insurance
        WHERE patient_id = ? AND member_id = ?
        ORDER BY is_primary DESC, created_at DESC
        LIMIT 1
      `);
      return stmt.get(patientId, memberId);
    } else {
      // Get primary insurance
      const stmt = db.prepare(`
        SELECT * FROM patient_insurance
        WHERE patient_id = ? AND is_primary = 1
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return stmt.get(patientId);
    }
  },

  // Get all insurance for a patient
  getAllPatientInsurance(patientId) {
    const stmt = db.prepare(`
      SELECT * FROM patient_insurance
      WHERE patient_id = ?
      ORDER BY is_primary DESC, created_at DESC
    `);
    return stmt.all(patientId);
  },

  // Verify patient insurance
  verifyPatientInsurance(insuranceId) {
    const stmt = db.prepare(`
      UPDATE patient_insurance
      SET is_verified = 1,
          verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(insuranceId);
  },

  // ============================================
  // EHR INTEGRATION
  // ============================================

  // Get EHR connection
  getEHRConnection(connectionId) {
    return db.prepare('SELECT * FROM ehr_connections WHERE id = ?').get(connectionId);
  },

  // Get EHR connections by provider
  getEHRConnectionsByProvider(providerId) {
    return db.prepare('SELECT * FROM ehr_connections WHERE provider_id = ? ORDER BY connected_at DESC').all(providerId);
  },

  // Get active EHR connections
  getActiveEHRConnections() {
    return db.prepare(`
      SELECT * FROM ehr_connections 
      WHERE access_token IS NOT NULL 
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND connected_at IS NOT NULL
    `).all();
  },

  // Get EHR encounter by FHIR ID
  getEHREncounterByFHIRId(fhirEncounterId) {
    return db.prepare('SELECT * FROM ehr_encounters WHERE fhir_encounter_id = ?').get(fhirEncounterId);
  },

  // Get EHR encounters by appointment
  getEHREncountersByAppointment(appointmentId) {
    return db.prepare(`
      SELECT * FROM ehr_encounters 
      WHERE appointment_id = ? 
      ORDER BY start_time DESC
    `).all(appointmentId);
  },

  // Get EHR encounters by patient
  getEHREncountersByPatient(patientId) {
    return db.prepare(`
      SELECT * FROM ehr_encounters 
      WHERE patient_id = ? 
      ORDER BY start_time DESC
    `).all(patientId);
  },

  // Get conditions (ICD-10) for encounter
  getEHRConditions(encounterId) {
    return db.prepare(`
      SELECT * FROM ehr_conditions 
      WHERE ehr_encounter_id = ? 
      ORDER BY is_primary DESC, created_at
    `).all(encounterId);
  },

  // Get procedures (CPT) for encounter
  getEHRProcedures(encounterId) {
    return db.prepare(`
      SELECT * FROM ehr_procedures 
      WHERE ehr_encounter_id = ? 
      ORDER BY created_at
    `).all(encounterId);
  },

  // Get observations for encounter
  getEHRObservations(encounterId) {
    return db.prepare(`
      SELECT * FROM ehr_observations 
      WHERE ehr_encounter_id = ? 
      ORDER BY created_at
    `).all(encounterId);
  },

  // Get EHR summary for appointment
  getEHRSummaryForAppointment(appointmentId) {
    const encounter = db.prepare(`
      SELECT * FROM ehr_encounters 
      WHERE appointment_id = ? 
      LIMIT 1
    `).get(appointmentId);

    if (!encounter) {
      return null;
    }

    return {
      encounter,
      conditions: this.getEHRConditions(encounter.id),
      procedures: this.getEHRProcedures(encounter.id),
      observations: this.getEHRObservations(encounter.id)
    };
  },

  // Get EHR summary for patient
  getEHRSummaryForPatient(patientId) {
    const encounters = this.getEHREncountersByPatient(patientId);

    return encounters.map(encounter => ({
      encounter,
      conditions: this.getEHRConditions(encounter.id),
      procedures: this.getEHRProcedures(encounter.id),
      observations: this.getEHRObservations(encounter.id)
    }));
  },

  // Database reference for direct access
  db
};

// ============================================
// KNOWLEDGE BASE EXTENSIONS
// ============================================

module.exports.bulkUpsertCptCodes = function bulkUpsertCptCodes(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { inserted: 0 };
  }

  const stmt = db.prepare(`
    INSERT INTO cpt_codes (code, description, category, subcategory, is_new)
    VALUES (@code, @description, @category, @subcategory, @is_new)
    ON CONFLICT(code) DO UPDATE SET
      description = excluded.description,
      category = excluded.category,
      subcategory = excluded.subcategory,
      is_new = excluded.is_new,
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction((codes) => {
    for (const item of codes) {
      if (!item || !item.code || !item.description) continue;
      stmt.run({
        code: String(item.code).toUpperCase(),
        description: item.description,
        category: item.category || null,
        subcategory: item.subcategory || null,
        is_new: item.is_new ? 1 : 0
      });
    }
  });

  insertMany(items);
  return { inserted: items.length };
};

module.exports.searchCptCodes = function searchCptCodes(query, limit = 10) {
  if (!query || !query.trim()) return [];
  const term = `%${query.trim().toLowerCase()}%`;
  return db.prepare(`
    SELECT code, description, category, subcategory
    FROM cpt_codes
    WHERE LOWER(code) LIKE ? OR LOWER(description) LIKE ?
    ORDER BY CASE WHEN LOWER(code) LIKE ? THEN 0 ELSE 1 END,
             description
    LIMIT ?
  `).all(term, term, term, limit);
};

module.exports.getCptCodesByCodes = function getCptCodesByCodes(codes = []) {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const normalized = codes
    .map(code => String(code || '').trim().toUpperCase())
    .filter(code => code.length > 0);

  if (normalized.length === 0) return [];

  const placeholders = normalized.map(() => '?').join(', ');
  return db.prepare(
    `SELECT code, description, category, subcategory FROM cpt_codes WHERE code IN (${placeholders})`
  ).all(...normalized);
};