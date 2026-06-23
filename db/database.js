'use strict';

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'lab-erp.db');
const db = new sqlite3.Database(DB_PATH);

// ─── Promise Wrappers ──────────────────────────────────────────────────────────

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function transaction(fn) {
  await run('BEGIN');
  try {
    const result = await fn();
    await run('COMMIT');
    return result;
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    throw err;
  }
}

// ─── Password Utilities ────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const computed = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// ─── Schema & Seed via async init() ───────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('RECEPTIONIST','TECHNICIAN','BIOCHEMIST','ADMIN')),
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dob TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('M','F')),
    id_number TEXT UNIQUE NOT NULL,
    contact TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS test_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sample_type TEXT NOT NULL,
    unit TEXT NOT NULL,
    ref_min_child_m  REAL, ref_max_child_m  REAL,
    ref_min_adult_m  REAL, ref_max_adult_m  REAL,
    ref_min_elder_m  REAL, ref_max_elder_m  REAL,
    ref_min_child_f  REAL, ref_max_child_f  REAL,
    ref_min_adult_f  REAL, ref_max_adult_f  REAL,
    ref_min_elder_f  REAL, ref_max_elder_f  REAL,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK(status IN ('PENDING','IN_PROCESS','COMPLETED','DELIVERED')),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    test_id INTEGER NOT NULL REFERENCES test_catalog(id),
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK(status IN ('PENDING','IN_PROCESS','COMPLETED'))
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL UNIQUE REFERENCES order_items(id),
    value REAL NOT NULL,
    flag TEXT NOT NULL CHECK(flag IN ('NORMAL','LOW','HIGH')),
    is_critical INTEGER DEFAULT 0,
    notes TEXT,
    entered_by INTEGER REFERENCES users(id),
    entered_at TEXT DEFAULT (datetime('now')),
    validated_by INTEGER REFERENCES users(id),
    validated_at TEXT,
    is_locked INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    stock_current REAL NOT NULL DEFAULT 0,
    stock_min REAL NOT NULL DEFAULT 0,
    stock_critical REAL NOT NULL DEFAULT 0,
    supplier TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS supply_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER NOT NULL REFERENCES supplies(id),
    type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
    quantity REAL NOT NULL,
    reason TEXT,
    reference TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS test_supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES test_catalog(id),
    supply_id INTEGER NOT NULL REFERENCES supplies(id),
    quantity_per_test REAL NOT NULL DEFAULT 1,
    UNIQUE(test_id, supply_id)
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'EFECTIVO',
    received_amount REAL,
    change_amount REAL,
    notes TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','CONFIRMED','RECEIVED','CANCELLED')),
    notes TEXT,
    total_amount REAL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    supply_id INTEGER NOT NULL REFERENCES supplies(id),
    quantity_ordered REAL NOT NULL,
    unit_price REAL DEFAULT 0,
    brand TEXT,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS fixed_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'OTRO',
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    period TEXT NOT NULL DEFAULT 'MENSUAL',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

// Helper: test with all ranges specified
function T(code, name, st, u, ncm,xcm,nam,xam,nem,xem, ncf,xcf,naf,xaf,nef,xef) {
  return { code, name, st, u, price:0, rt:'NUMERIC', ncm,xcm,nam,xam,nem,xem, ncf,xcf,naf,xaf,nef,xef };
}
// Helper: symmetric (same ranges M=F)
function S(code, name, st, u, nc,xc,na,xa,ne,xe) {
  return T(code, name, st, u, nc,xc,na,xa,ne,xe, nc,xc,na,xa,ne,xe);
}
// Helper: uniform (same ranges all groups & sexes)
function U(code, name, st, u, mn, mx) {
  return S(code, name, st, u, mn,mx,mn,mx,mn,mx);
}
// Helper: qualitative (no numeric ranges)
function Q(code, name, st, u) {
  return T(code, name, st, u, null,null,null,null,null,null, null,null,null,null,null,null);
}
// Helper with price and result_type
function P(code, name, st, u, price, rt, ncm,xcm,nam,xam,nem,xem, ncf,xcf,naf,xaf,nef,xef) {
  return { code, name, st, u, price: price||0, rt: rt||'NUMERIC', ncm,xcm,nam,xam,nem,xem, ncf,xcf,naf,xaf,nef,xef };
}

const SEED_TESTS = [
  // ── HEMATOLOGÍA ─────────────────────────────────────────────────────────────
  T('CBC',    'Hemograma - Hemoglobina',                     'Sangre Total',   'g/dL',       11.0,16.0,13.5,17.5,12.0,17.0, 11.0,15.0,12.0,16.0,11.5,15.5),
  T('WBC',    'Hemograma - Leucocitos',                      'Sangre Total',   '10³/μL',     5.0,13.0,4.5,11.0,4.5,11.0,    5.0,13.0,4.5,11.0,4.5,11.0),
  U('PLT',    'Plaquetas',                                   'Sangre Total',   '10³/μL',     150,400),
  T('HCT',    'Hematocrito',                                 'Sangre Total',   '%',          34,47,41,52,38,50,              34,43,36,46,34,46),
  U('MCV',    'Volumen Corpuscular Medio (VCM)',             'Sangre Total',   'fL',         80,100),
  U('MCH',    'Hemoglobina Corpuscular Media (HCM)',         'Sangre Total',   'pg',         27,33),
  U('MCHC',   'Conc. Hemoglobina Corpuscular (CHCM)',       'Sangre Total',   'g/dL',       32,36),
  U('RDW',    'Ancho Distribución Eritrocitaria (ADE)',      'Sangre Total',   '%',          11.5,14.5),
  U('NEU',    'Neutrófilos (%)',                             'Sangre Total',   '%',          50,70),
  U('LYM',    'Linfocitos (%)',                              'Sangre Total',   '%',          20,40),
  U('MON',    'Monocitos (%)',                               'Sangre Total',   '%',          2,8),
  U('EOS',    'Eosinófilos (%)',                             'Sangre Total',   '%',          1,4),
  U('BAS',    'Basófilos (%)',                               'Sangre Total',   '%',          0,1),
  U('RETIC',  'Reticulocitos',                               'Sangre Total',   '%',          0.5,2.5),
  T('VSG',    'Velocidad de Sedimentación (VSG)',            'Sangre Total',   'mm/h',       0,10,0,15,0,20,                 0,15,0,20,0,30),
  T('PT',     'TP/INR',                                      'Sangre Citrada', 'segundos',   11,14,11,13.5,11,14,            11,14,11,13.5,11,14),
  U('APTT',   'TTPa (Tiempo Tromboplastina Parcial Act.)',   'Sangre Citrada', 'segundos',   25,35),
  U('FIBR',   'Fibrinógeno',                                 'Sangre Citrada', 'mg/dL',      200,400),
  U('DDIMT',  'Dímero-D',                                   'Plasma',         'ng/mL FEU',  0,500),
  T('FERR',   'Ferritina Sérica',                            'Suero',          'ng/mL',      7,140,20,250,20,300,            7,140,10,120,12,150),
  T('IRON',   'Hierro Sérico',                               'Suero',          'μg/dL',      50,120,60,160,60,160,           50,120,50,150,50,150),
  U('TIBC',   'Capacidad Total Fijación Hierro (CTFH)',     'Suero',          'μg/dL',      250,370),
  U('HBA1C',  'Hemoglobina Glicosilada (HbA1c)',            'Sangre Total',   '%',          4.0,5.7),
  U('CRP',    'Proteína C Reactiva (PCR)',                   'Suero',          'mg/L',       0,10),
  U('HSCRP',  'PCR Ultrasensible (hsPCR)',                  'Suero',          'mg/L',       0,3),
  U('PCT',    'Procalcitonina',                              'Suero',          'ng/mL',      0,0.5),
  T('LDH',    'Lactato Deshidrogenasa (LDH)',               'Suero',          'U/L',        300,700,135,250,135,270,        300,700,135,250,135,270),
  U('TROPI',  'Troponina I',                                 'Suero',          'ng/mL',      0,0.04),
  U('CKMB',   'CK-MB (Creatina Quinasa MB)',                'Suero',          'U/L',        0,25),
  T('CK',     'Creatina Quinasa Total (CK)',                 'Suero',          'U/L',        30,200,30,200,30,200,           25,150,25,150,25,150),
  U('MYO',    'Mioglobina',                                  'Suero',          'μg/L',       0,85),
  U('BNP',    'Péptido Natriurético B (BNP)',               'Suero',          'pg/mL',      0,100),
  U('TRANSF', 'Transferrina',                                'Suero',          'mg/dL',      200,360),
  U('IL6',    'Interleucina-6 (IL-6)',                      'Suero',          'pg/mL',      0,7),
  U('PROCAL', 'Procalcitonina Alta Sensibilidad',            'Suero',          'ng/mL',      0,0.25),

  // ── BIOQUÍMICA GENERAL ──────────────────────────────────────────────────────
  T('GLU',    'Glucosa (Ayunas)',                            'Suero',          'mg/dL',      60,100,70,100,70,110,           60,100,70,100,70,110),
  T('CREAT',  'Creatinina',                                  'Suero',          'mg/dL',      0.3,0.7,0.7,1.2,0.8,1.3,       0.3,0.7,0.5,1.0,0.6,1.1),
  U('UREA',   'Urea',                                        'Suero',          'mg/dL',      7,25),
  T('URIC',   'Ácido Úrico',                                 'Suero',          'mg/dL',      2.0,5.5,3.5,7.2,3.5,7.5,       2.0,5.5,2.5,6.0,2.5,6.5),
  T('ALT',    'ALT (Alanina Aminotransferasa)',              'Suero',          'U/L',        7,30,7,40,7,40,                 7,30,7,35,7,35),
  T('AST',    'AST (Aspartato Aminotransferasa)',            'Suero',          'U/L',        10,35,10,40,10,40,              10,35,10,35,10,35),
  T('GGT',    'Gamma Glutamil Transferasa (GGT)',            'Suero',          'U/L',        5,32,10,50,10,50,               5,24,7,30,7,30),
  T('ALP',    'Fosfatasa Alcalina (FAL)',                    'Suero',          'U/L',        100,390,44,147,44,160,          100,390,44,147,44,160),
  U('BILIT',  'Bilirrubina Total',                           'Suero',          'mg/dL',      0.2,1.2),
  U('BILID',  'Bilirrubina Directa (Conjugada)',             'Suero',          'mg/dL',      0,0.3),
  U('BILII',  'Bilirrubina Indirecta (No Conjugada)',       'Suero',          'mg/dL',      0.1,0.9),
  U('PROT',   'Proteínas Totales',                           'Suero',          'g/dL',       6.0,8.3),
  U('ALB',    'Albúmina',                                    'Suero',          'g/dL',       3.5,5.5),
  U('GLOB',   'Globulinas',                                  'Suero',          'g/dL',       2.0,3.5),
  U('CALC',   'Calcio Total',                                'Suero',          'mg/dL',      8.5,10.5),
  T('PHOS',   'Fósforo (Fosfato Sérico)',                   'Suero',          'mg/dL',      4.0,7.0,2.5,4.5,2.5,4.5,       4.0,7.0,2.5,4.5,2.5,4.5),
  U('MG',     'Magnesio',                                    'Suero',          'mg/dL',      1.7,2.3),
  U('AMYL',   'Amilasa',                                     'Suero',          'U/L',        25,125),
  U('LIPA',   'Lipasa',                                      'Suero',          'U/L',        13,60),
  U('GLUP',   'Glucosa Postprandial (2h)',                   'Suero',          'mg/dL',      70,140),
  T('INSUL',  'Insulina Basal',                              'Suero',          'μUI/mL',     2,25,2,25,2,25,                 2,25,2,25,2,25),
  U('HOMO',   'Homocisteína',                                'Suero',          'μmol/L',     5,15),
  U('CYSTC',  'Cistatina C',                                 'Suero',          'mg/L',       0.5,1.0),
  T('AMO',    'Amoníaco (Amonio)',                           'Plasma',         'μg/dL',      40,80,15,45,15,50,              40,80,15,45,15,50),
  U('LACT',   'Ácido Láctico',                               'Sangre',         'mmol/L',     0.5,2.2),
  T('CHE',    'Colinesterasa',                               'Suero',          'U/L',        5000,12000,5000,12000,5000,12000, 4500,11000,4500,11000,4500,11000),
  U('FRUC',   'Fructosamina',                                'Suero',          'μmol/L',     205,285),
  U('PEPTC',  'Péptido C',                                   'Suero',          'ng/mL',      0.9,4.0),
  U('HOMAIR', 'HOMA-IR (Resistencia a Insulina)',           'Suero',          'ratio',      0,2.5),
  U('LPA',    'Lipoproteína(a)',                             'Suero',          'mg/dL',      0,30),
  T('APOB',   'Apolipoproteína B',                           'Suero',          'mg/dL',      60,140,60,140,60,140,           60,130,60,130,60,130),
  T('APOA1',  'Apolipoproteína A1',                         'Suero',          'mg/dL',      110,180,110,180,110,180,        120,200,120,200,120,200),
  U('OSMO',   'Osmolalidad Sérica',                         'Suero',          'mOsm/kg',    280,295),
  U('OSMOU',  'Osmolalidad Urinaria',                       'Orina',          'mOsm/kg',    50,1200),
  T('MICRO',  'Microalbuminuria',                            'Orina 24h',      'mg/24h',     0,30,0,30,0,30,                 0,30,0,30,0,30),
  U('PROT24', 'Proteínas en Orina 24h',                     'Orina 24h',      'mg/24h',     0,150),
  T('CREA24', 'Creatinina en Orina 24h',                    'Orina 24h',      'mg/24h',     700,2000,700,2000,700,2000,     500,1500,500,1500,500,1500),
  U('CALC24', 'Calcio en Orina 24h',                        'Orina 24h',      'mg/24h',     50,300),
  U('BUN',    'Nitrógeno Ureico en Sangre (BUN)',           'Suero',          'mg/dL',      7,25),
  U('URINP',  'Proteínas en Orina (Spot)',                  'Orina',          'mg/dL',      0,14),
  U('CERUL',  'Ceruloplasmina',                             'Suero',          'mg/dL',      20,60),
  U('PREA',   'Prealbúmina (Transtiretina)',                'Suero',          'mg/dL',      17,34),
  T('GH',     'Hormona de Crecimiento (GH)',                'Suero',          'ng/mL',      0,10,0,5,0,5,                   0,10,0,5,0,5),
  T('IGF1',   'Factor Crecimiento Insulínico-1 (IGF-1)',   'Suero',          'ng/mL',      115,307,115,307,81,225,          115,307,115,307,81,225),
  U('COPP',   'Cobre Sérico',                               'Suero',          'μg/dL',      70,140),
  U('ACHOCR', 'Cociente Albúmina/Creatinina (CAC)',        'Orina',          'mg/g',       0,30),

  // ── PERFIL LIPÍDICO ─────────────────────────────────────────────────────────
  U('CHOL',   'Colesterol Total',                            'Suero',          'mg/dL',      100,200),
  T('HDL',    'Colesterol HDL',                             'Suero',          'mg/dL',      40,80,40,80,40,80,              50,90,50,90,50,90),
  U('LDL',    'Colesterol LDL',                             'Suero',          'mg/dL',      50,100),
  U('TRIG',   'Triglicéridos',                              'Suero',          'mg/dL',      50,150),
  U('VLDL',   'Colesterol VLDL',                            'Suero',          'mg/dL',      5,40),
  U('NCHOL',  'Colesterol No-HDL',                          'Suero',          'mg/dL',      0,130),
  T('RCARD',  'Índice Riesgo Cardiovascular (CT/HDL)',      'Suero',          'ratio',      0,5,0,5,0,5,                    0,4.5,0,4.5,0,4.5),
  U('ACHOL',  'Ácidos Biliares Totales',                   'Suero',          'μmol/L',     0,10),
  U('LIPO',   'Lipoproteína(a) hs',                        'Suero',          'nmol/L',     0,75),
  U('NFAT',   'Ácidos Grasos Libres (NEFA)',               'Suero',          'mEq/L',      0.1,0.9),

  // ── TIROIDES ────────────────────────────────────────────────────────────────
  T('TSH',    'TSH (Hormona Estimulante de Tiroides)',      'Suero',          'mIU/L',      0.7,6.4,0.4,4.0,0.4,4.5,       0.7,6.4,0.4,4.0,0.4,4.5),
  T('FT4',    'T4 Libre (Tiroxina Libre)',                  'Suero',          'ng/dL',      0.8,2.0,0.8,1.8,0.8,1.8,       0.8,2.0,0.8,1.8,0.8,1.8),
  U('FT3',    'T3 Libre (Triyodotironina Libre)',           'Suero',          'pg/mL',      2.3,4.2),
  U('T4T',    'T4 Total (Tiroxina Total)',                  'Suero',          'μg/dL',      5.1,14.1),
  U('T3T',    'T3 Total (Triyodotironina Total)',           'Suero',          'ng/dL',      80,200),
  U('ANTITG', 'Anticuerpos Anti-Tiroglobulina (Anti-TG)', 'Suero',          'UI/mL',      0,115),
  U('ANTIPO', 'Anticuerpos Anti-TPO',                       'Suero',          'UI/mL',      0,34),
  U('TRAB',   'Anticuerpos Anti-Receptor TSH (TRAb)',      'Suero',          'UI/L',       0,1.75),
  U('TGLOBU', 'Tiroglobulina',                             'Suero',          'ng/mL',      1.4,78),
  T('CALCIT', 'Calcitonina',                               'Suero',          'pg/mL',      0,9.52,0,9.52,0,9.52,           0,6.4,0,6.4,0,6.4),
  U('TBG',    'Globulina Fijadora de Tiroxina (TBG)',      'Suero',          'μg/mL',      14,31),
  U('PTH',    'Parathormona Intacta (PTH)',                 'Suero',          'pg/mL',      18.5,88),
  U('IODOU',  'Yodo Urinario',                             'Orina',          'μg/L',       100,200),
  U('TSHS',   'TSH Ultrasensible',                         'Suero',          'mIU/L',      0.27,4.2),
  U('TGAB2',  'Anti-TG Anticuerpos (Alta Sensib.)',        'Suero',          'UI/mL',      0,4),

  // ── HORMONAS ────────────────────────────────────────────────────────────────
  T('LH',     'Hormona Luteinizante (LH)',                  'Suero',          'mUI/mL',     0.8,7.6,1.7,8.6,1.7,8.6,       1.1,11.6,1.1,11.6,1.1,11.6),
  T('FSH',    'Hormona Folículo Estimulante (FSH)',         'Suero',          'mUI/mL',     0.7,11.1,1.5,12.4,1.5,12.4,    2.8,11.3,3.0,8.9,26.7,133.4),
  T('PROL',   'Prolactina',                                 'Suero',          'ng/mL',      2.6,13.1,2.6,13.1,2.6,13.1,    3.3,26.7,3.3,26.7,3.3,26.7),
  T('PROG',   'Progesterona',                               'Suero',          'ng/mL',      0.1,0.2,0.1,0.2,0.1,0.2,       0.1,0.3,0.2,25.0,0.1,0.3),
  T('TESTO',  'Testosterona Total',                         'Suero',          'ng/dL',      20,900,270,1070,270,1070,       20,75,15,70,15,70),
  T('TESTOF', 'Testosterona Libre',                         'Suero',          'pg/mL',      5,21,9,30,5,20,                 0.6,3.8,0.6,3.8,0.3,3.0),
  T('ESTR2',  'Estradiol (E2)',                             'Suero',          'pg/mL',      10,40,10,40,10,40,              12,58,12,370,5,54),
  T('DHEAS',  'DHEA-S (Dehidroepiandrosterona-S)',         'Suero',          'μg/dL',      45,380,70,520,25,240,           20,340,45,270,18,190),
  T('CORT',   'Cortisol (8:00 am)',                         'Suero',          'μg/dL',      5,25,5,25,5,25,                 5,25,5,25,5,25),
  U('ACTH',   'ACTH (Corticotropina)',                      'Plasma',         'pg/mL',      7.2,63.3),
  T('ALDO',   'Aldosterona',                                'Suero',          'pg/mL',      40,310,40,310,40,310,           40,310,40,310,40,310),
  U('RENIN',  'Actividad Renina Plasmática',               'Plasma',         'ng/mL/h',    0.6,4.3),
  Q('HCG',    'β-hCG (Gonadotropina Coriónica)',           'Suero',          'mUI/mL'),
  T('17OHP',  '17-Hidroxiprogesterona',                    'Suero',          'ng/mL',      0.1,1.7,0.1,1.7,0.1,1.7,       0.1,1.7,0.1,1.7,0.1,1.7),
  T('ANDR',   'Androstenediona',                            'Suero',          'ng/mL',      0.7,3.1,0.7,3.1,0.7,3.1,       0.6,3.1,0.6,3.1,0.6,3.1),
  T('SHBG',   'Globulina Fijadora Hormonas Sex. (SHBG)',  'Suero',          'nmol/L',     13,71,13,71,10,57,               18,144,18,144,18,144),
  T('AMH',    'Hormona Antimülleriana (AMH)',              'Suero',          'ng/mL',      0.7,19,0.7,19,0.7,19,           0.9,9.5,0.9,9.5,0.1,3.0),
  T('CORTOU', 'Cortisol en Orina 24h',                     'Orina 24h',      'μg/24h',     20,90,20,90,20,90,              20,90,20,90,20,90),
  T('METAP',  'Metanefrinas Plasmáticas',                  'Plasma',         'pg/mL',      0,90,0,90,0,90,                 0,60,0,60,0,60),
  T('NORMET', 'Normetanefrinas Plasmáticas',               'Plasma',         'pg/mL',      0,180,0,180,0,180,              0,120,0,120,0,120),
  U('INSPOST','Insulina Posprandial (2h)',                  'Suero',          'μUI/mL',     0,60),
  T('LEPIN',  'Leptina',                                    'Suero',          'ng/mL',      0.7,5.3,0.7,5.3,0.7,5.3,       3.7,11.1,3.7,11.1,3.7,11.1),
  U('ADIPO',  'Adiponectina',                               'Suero',          'μg/mL',      5,15),
  T('ESTR1',  'Estrona (E1)',                               'Suero',          'pg/mL',      17,200,17,200,17,200,           17,200,20,170,20,170),
  T('ESTR3',  'Estriol (E3)',                               'Suero',          'ng/mL',      0.3,5.0,0.3,5.0,0.3,5.0,       0.3,5.0,0.3,5.0,0.3,5.0),

  // ── MARCADORES TUMORALES ────────────────────────────────────────────────────
  U('AFP',    'Alfafetoproteína (AFP)',                      'Suero',          'ng/mL',      0,10),
  U('CEA',    'Antígeno Carcinoembrionario (CEA)',          'Suero',          'ng/mL',      0,5),
  U('CA125',  'CA 125 (Cáncer de Ovario)',                 'Suero',          'UI/mL',      0,35),
  U('CA199',  'CA 19-9 (Cáncer Páncreas/Colon)',          'Suero',          'UI/mL',      0,37),
  U('CA153',  'CA 15-3 (Cáncer de Mama)',                 'Suero',          'UI/mL',      0,31),
  T('PSA',    'PSA Total (Antígeno Prostático)',            'Suero',          'ng/mL',      0,4,0,4,0,6.5,                  null,null,null,null,null,null),
  T('PSAF',   'PSA Libre',                                  'Suero',          'ng/mL',      0,1,0,1,0,1.5,                  null,null,null,null,null,null),
  U('CYFR',   'CYFRA 21-1 (Cáncer de Pulmón)',            'Suero',          'ng/mL',      0,3.3),
  U('NSE',    'Enolasa Neuroespecífica (NSE)',              'Suero',          'ng/mL',      0,16.3),
  U('CA724',  'CA 72-4 (Cáncer Gástrico)',                 'Suero',          'UI/mL',      0,6.9),
  T('HE4',    'HE4 (Proteína Epidídimo Humano 4)',         'Suero',          'pmol/L',     null,null,null,null,null,null,   0,70,0,70,0,70),
  U('S100',   'Proteína S-100',                             'Suero',          'μg/L',       0,0.11),
  U('BETA2',  'Beta-2 Microglobulina',                     'Suero',          'mg/L',       0.8,2.4),
  T('BCHCG',  'β-hCG (Marcador Tumoral)',                  'Suero',          'mUI/mL',     0,5,0,5,0,5,                    null,null,null,null,null,null),
  U('PLAP',   'Fosfatasa Alcalina Placentaria',            'Suero',          'UI/L',       0,3),
  U('SCC',    'SCC (Antígeno Células Escamosas)',          'Suero',          'ng/mL',      0,1.5),
  U('CA50',   'CA 50',                                      'Suero',          'UI/mL',      0,17),
  U('CA242',  'CA 242',                                     'Suero',          'UI/mL',      0,20),

  // ── INMUNOLOGÍA Y AUTOINMUNIDAD ──────────────────────────────────────────────
  Q('ANA',    'Anticuerpos Antinucleares (ANA)',            'Suero',          'título'),
  U('ANTIDS', 'Anti-ADN Doble Cadena (Anti-dsDNA)',        'Suero',          'UI/mL',      0,25),
  Q('ANCA',   'ANCA (Citoplasma/Perinuclear)',              'Suero',          'título'),
  Q('ANTISMA','Anti-Sm (Anti-Smith)',                       'Suero',          'AU/mL'),
  Q('ANTISSA','Anti-SSA/Ro',                                'Suero',          'AU/mL'),
  Q('ANTISSB','Anti-SSB/La',                                'Suero',          'AU/mL'),
  Q('ANTISCL','Anti-Scl-70',                                'Suero',          'AU/mL'),
  Q('ANTIJO', 'Anti-Jo-1',                                  'Suero',          'AU/mL'),
  U('ACARDG', 'Anticardiolipina IgG',                       'Suero',          'GPL-U/mL',   0,15),
  U('ACARDM', 'Anticardiolipina IgM',                       'Suero',          'MPL-U/mL',   0,12),
  U('B2GPI',  'Anti-Beta2 Glicoproteína I IgG',            'Suero',          'U/mL',       0,20),
  U('RF',     'Factor Reumatoide (FR)',                     'Suero',          'UI/mL',      0,14),
  U('ANTICCP','Anti-CCP (Anti-Péptido Citrulinado)',       'Suero',          'U/mL',       0,17),
  U('C3',     'Complemento C3',                             'Suero',          'mg/dL',      90,180),
  U('C4',     'Complemento C4',                             'Suero',          'mg/dL',      16,47),
  U('IGA',    'Inmunoglobulina IgA',                        'Suero',          'mg/dL',      70,400),
  T('IGM',    'Inmunoglobulina IgM',                        'Suero',          'mg/dL',      40,230,40,230,40,230,           50,300,50,300,50,300),
  U('IGG',    'Inmunoglobulina IgG',                        'Suero',          'mg/dL',      700,1600),
  U('IGE',    'Inmunoglobulina IgE Total',                  'Suero',          'UI/mL',      0,100),
  Q('ELPROT', 'Electroforesis de Proteínas',                'Suero',          'g/dL'),
  U('ATTGA',  'Anti-Transglutaminasa IgA',                 'Suero',          'U/mL',       0,20),
  Q('ANTIHIS','Anti-Histona',                               'Suero',          'AU/mL'),
  U('CRYO',   'Crioglobulinas',                             'Suero',          'mg/dL',      0,8),
  Q('ANTIMIR','Anti-Mitocondria',                           'Suero',          'título'),
  Q('ANTISML','Anti-Músculo Liso',                          'Suero',          'título'),

  // ── SEROLOGÍA INFECCIOSA ─────────────────────────────────────────────────────
  Q('VDRL',   'VDRL (Sífilis)',                             'Suero',          '—'),
  Q('FTAABS', 'FTA-ABS (Sífilis Confirmatoria)',            'Suero',          '—'),
  Q('HIV',    'VIH 1/2 + Antígeno p24',                    'Suero',          '—'),
  Q('HBSAG',  'HBsAg (Antígeno de Superficie Hep. B)',    'Suero',          '—'),
  U('ANTIHBS','Anti-HBs (Anticuerpos Hep. B)',             'Suero',          'mUI/mL',     10,1000),
  Q('ANTIHBC','Anti-HBc Total (Hepatitis B)',               'Suero',          '—'),
  Q('HBSAGM', 'Anti-HBc IgM (Hep. B aguda)',              'Suero',          '—'),
  Q('HBEAG',  'HBeAg (Antígeno e Hepatitis B)',            'Suero',          '—'),
  Q('ANTIHCV','Anti-VHC (Anticuerpo Hepatitis C)',         'Suero',          '—'),
  Q('ANTIHAV','Anti-VHA IgM (Hepatitis A aguda)',          'Suero',          '—'),
  Q('ANTIHAG','Anti-VHA IgG (Hepatitis A)',                'Suero',          '—'),
  U('TOXOG',  'Toxoplasma IgG',                             'Suero',          'UI/mL',      0,8),
  Q('TOXOM',  'Toxoplasma IgM',                             'Suero',          '—'),
  Q('CMVG',   'CMV IgG (Citomegalovirus)',                  'Suero',          '—'),
  Q('CMVM',   'CMV IgM',                                    'Suero',          '—'),
  Q('EBVCAG', 'VEB IgG VCA (Virus Epstein-Barr)',          'Suero',          '—'),
  Q('VARICG', 'Varicela IgG (VZV)',                         'Suero',          '—'),
  Q('RUBELG', 'Rubéola IgG',                                'Suero',          '—'),
  Q('RUBELM', 'Rubéola IgM',                                'Suero',          '—'),
  Q('BRUCAB', 'Brucella IgG/IgM',                           'Suero',          '—'),
  Q('LEISHAB','Leishmania Anticuerpos',                     'Suero',          '—'),
  Q('CHAGAB', 'Chagas IgG (Trypanosoma cruzi)',             'Suero',          '—'),
  Q('DENGAB', 'Dengue NS1 + IgG + IgM',                   'Suero',          '—'),
  Q('COVIDAG','COVID-19 IgG/IgM',                           'Suero',          '—'),
  Q('INFLAB', 'Influenza A/B Antígeno',                     'Muestra Nasal',  '—'),
  Q('HPYLORI','H. pylori Anticuerpos',                      'Suero',          '—'),
  Q('PARVOB', 'Parvovirus B19 IgG',                         'Suero',          '—'),
  Q('MEASG',  'Sarampión IgG',                              'Suero',          '—'),
  Q('TREP',   'Treponema pallidum IgG/IgM (TPPA)',         'Suero',          '—'),
  Q('LEPTOG', 'Leptospira Anticuerpos (MAT)',               'Suero',          '—'),

  // ── URIANÁLISIS Y FUNCIÓN RENAL ──────────────────────────────────────────────
  T('UA',     'Uroanálisis pH',                             'Orina',          'pH',         4.5,8.0,4.5,8.0,4.5,8.0,       4.5,8.0,4.5,8.0,4.5,8.0),
  U('UADEN',  'Densidad Urinaria',                          'Orina',          'g/mL',       1.005,1.030),
  U('UAPROT', 'Proteínas en Orina (Tira)',                 'Orina',          'mg/dL',      0,14),
  U('UAGLU',  'Glucosa en Orina',                           'Orina',          'mg/dL',      0,15),
  U('UACETO', 'Cetonas en Orina',                           'Orina',          'mg/dL',      0,5),
  U('UABIL',  'Bilirrubina en Orina',                       'Orina',          'mg/dL',      0,0.2),
  U('UAURO',  'Urobilinógeno en Orina',                     'Orina',          'EU/dL',      0.1,1.0),
  Q('UANIT',  'Nitritos en Orina',                          'Orina',          '—'),
  Q('UASANG', 'Sangre/Hemoglobina en Orina',               'Orina',          '—'),
  Q('UASEDIM','Sedimento Urinario (Microscópico)',          'Orina',          '—'),
  T('CLCRE',  'Depuración de Creatinina (CrCl)',           'Orina 24h+Suero','mL/min',     80,125,80,125,60,100,           75,115,75,115,55,90),
  U('EGFR',   'Filtración Glomerular Estimada (eGFR)',     'Suero',          'mL/min/1.73m²',60,999),
  T('URAT24', 'Uratos en Orina 24h',                       'Orina 24h',      'mg/24h',     250,750,250,750,250,750,        250,750,250,750,250,750),
  T('OXAL24', 'Oxalato en Orina 24h',                      'Orina 24h',      'mg/24h',     0,45,0,45,0,45,                 0,40,0,40,0,40),
  U('NGAL',   'NGAL (Lipocalina de Neutrófilos)',           'Orina',          'ng/mL',      0,130),
  U('PROTH1', 'Índice Proteinuria/Creatinina',             'Orina',          'mg/mg',      0,0.2),
  Q('UROCULT','Urocultivo',                                  'Orina',          'UFC/mL'),
  Q('PHSANG', 'pH Arterial (Gasometría)',                   'Sangre Arterial','—'),

  // ── MICROBIOLOGÍA ────────────────────────────────────────────────────────────
  Q('COPRO',  'Coprocultivo',                               'Heces',          '—'),
  Q('OVHEC',  'Parásitos y Huevos en Heces',               'Heces',          '—'),
  Q('HEMCULT','Hemocultivo (Aerobio/Anaerobio)',            'Sangre',         '—'),
  Q('SECCULT','Cultivo de Secreción',                       'Muestra',        '—'),
  Q('ESPCULT','Cultivo de Esputo (BK+Común)',              'Esputo',         '—'),
  Q('ANTIBIO','Antibiograma (Sensibilidad)',                'Muestra',        '—'),
  Q('LCRCULT','Cultivo de LCR',                             'LCR',            '—'),
  Q('GRAM',   'Tinción de Gram',                            'Muestra',        '—'),
  Q('ZIEHL',  'Tinción Ziehl-Neelsen (BK)',                'Esputo',         '—'),
  Q('PCRTUBC','PCR Tuberculosis (GeneXpert)',               'Esputo',         '—'),
  Q('FUNGOCL','Cultivo de Hongos',                          'Muestra',        '—'),
  Q('MICROD', 'Microscopía Directa (Hongos)',               'Muestra',        '—'),
  Q('STREPA', 'Test Streptococo A Rápido',                  'Exudado Faríng.','—'),
  Q('INFLPCR','Influenza A/B PCR',                          'Muestra Nasal',  '—'),
  Q('RASKCLT','Cultivo de Rasguño/Herida',                 'Muestra',        '—'),

  // ── GASES Y ELECTROLITOS ─────────────────────────────────────────────────────
  U('NATR',   'Sodio (Na+)',                                 'Suero',          'mEq/L',      136,145),
  U('POTK',   'Potasio (K+)',                                'Suero',          'mEq/L',      3.5,5.0),
  U('CHLOR',  'Cloro (Cl-)',                                 'Suero',          'mEq/L',      98,107),
  U('BICAR',  'Bicarbonato (HCO3-)',                        'Sangre',         'mEq/L',      22,29),
  U('PHGAS',  'pH Gases Arteriales',                        'Sangre Arterial','—',          7.35,7.45),
  U('PCO2',   'pCO2 (Presión CO2 Arterial)',               'Sangre Arterial','mmHg',       35,45),
  T('PO2',    'pO2 (Presión O2 Arterial)',                  'Sangre Arterial','mmHg',       80,100,80,100,75,100,           80,100,80,100,75,100),
  U('SATO2',  'Saturación de O2 (SatO2)',                  'Sangre Arterial','%',          95,100),
  U('EB',     'Exceso de Base',                             'Sangre Arterial','mEq/L',      -2,2),
  U('LACTAR', 'Lactato Arterial',                           'Sangre Arterial','mmol/L',     0.5,2.0),
  U('IOCAL',  'Calcio Iónico',                              'Sangre',         'mmol/L',     1.15,1.35),
  U('PHOSU',  'Fósforo en Orina 24h',                      'Orina 24h',      'mg/24h',     400,1300),

  // ── VITAMINAS Y MINERALES ────────────────────────────────────────────────────
  U('VITD',   'Vitamina D (25-OH)',                         'Suero',          'ng/mL',      20,100),
  U('VITB12', 'Vitamina B12 (Cobalamina)',                  'Suero',          'pg/mL',      200,900),
  U('VITB9',  'Ácido Fólico (Vitamina B9)',                'Suero',          'ng/mL',      3.1,17.5),
  U('VITA',   'Vitamina A (Retinol)',                       'Suero',          'μg/dL',      30,80),
  U('VITE',   'Vitamina E (Tocoferol α)',                  'Suero',          'mg/L',       5.5,17),
  U('VITK',   'Vitamina K1 (Filoquinona)',                 'Plasma',         'ng/mL',      0.15,1.5),
  U('VITB1',  'Vitamina B1 (Tiamina)',                      'Sangre Total',   'nmol/L',     70,180),
  U('VITB6',  'Vitamina B6 (Piridoxal-5-P)',               'Plasma',         'nmol/L',     20,120),
  U('ZINC',   'Zinc Sérico',                                'Suero',          'μg/dL',      60,120),
  U('SELEN',  'Selenio Sérico',                             'Suero',          'μg/L',       60,120),
  U('MANG',   'Manganeso',                                  'Sangre Total',   'μg/L',       7.7,12.1),
  U('COBAL',  'Cobalto Sérico',                             'Suero',          'μg/L',       0.1,0.4),
];

const SEED_SUPPLIES = [
  { code:'REAG001', name:'Reactivo Glucosa',             cat:'Reactivos',               unit:'mL',          cur:500, min:200, crit:50 },
  { code:'REAG002', name:'Reactivo Colesterol',          cat:'Reactivos',               unit:'mL',          cur:300, min:100, crit:30 },
  { code:'REAG003', name:'Reactivo Triglicéridos',       cat:'Reactivos',               unit:'mL',          cur:200, min:100, crit:30 },
  { code:'REAG004', name:'Reactivo Creatinina',          cat:'Reactivos',               unit:'mL',          cur:400, min:150, crit:50 },
  { code:'REAG005', name:'Reactivo ALT/AST',             cat:'Reactivos',               unit:'mL',          cur:250, min:100, crit:30 },
  { code:'REAG006', name:'Reactivo Hemograma (CBC)',     cat:'Reactivos',               unit:'mL',          cur:1000,min:300, crit:100},
  { code:'REAG007', name:'Reactivo HbA1c',               cat:'Reactivos',               unit:'kit',         cur:5,   min:2,   crit:1  },
  { code:'REAG008', name:'Reactivo Bilirrubinas',        cat:'Reactivos',               unit:'mL',          cur:180, min:80,  crit:25 },
  { code:'REAG009', name:'Reactivo Urea/BUN',            cat:'Reactivos',               unit:'mL',          cur:350, min:120, crit:40 },
  { code:'REAG010', name:'Reactivo Ácido Úrico',         cat:'Reactivos',               unit:'mL',          cur:280, min:100, crit:30 },
  { code:'MAT001',  name:'Tubos Vacutainer EDTA 3mL',   cat:'Material de laboratorio', unit:'unidad',      cur:500, min:200, crit:50 },
  { code:'MAT002',  name:'Tubos Vacutainer SST 5mL',    cat:'Material de laboratorio', unit:'unidad',      cur:400, min:150, crit:50 },
  { code:'MAT003',  name:'Tubos Citrato 2.7mL',         cat:'Material de laboratorio', unit:'unidad',      cur:200, min:80,  crit:20 },
  { code:'MAT004',  name:'Agujas Vacutainer 21G',        cat:'Material de laboratorio', unit:'unidad',      cur:600, min:200, crit:50 },
  { code:'MAT005',  name:'Contenedores Orina 80mL',      cat:'Material de laboratorio', unit:'unidad',      cur:300, min:100, crit:30 },
  { code:'MAT006',  name:'Puntas de Pipeta 200μL',       cat:'Material de laboratorio', unit:'caja (1000)', cur:10,  min:3,   crit:1  },
  { code:'MAT007',  name:'Puntas de Pipeta 1000μL',      cat:'Material de laboratorio', unit:'caja (1000)', cur:8,   min:3,   crit:1  },
  { code:'MAT008',  name:'Tubos Eppendorf 1.5mL',        cat:'Material de laboratorio', unit:'bolsa (500)', cur:6,   min:2,   crit:1  },
  { code:'EPP001',  name:'Guantes Nitrilo Talla M',      cat:'EPP',                     unit:'caja (100)',  cur:20,  min:5,   crit:2  },
  { code:'EPP002',  name:'Mascarillas Quirúrgicas',       cat:'EPP',                     unit:'caja (50)',   cur:15,  min:5,   crit:2  },
  { code:'EPP003',  name:'Batas de Laboratorio',          cat:'EPP',                     unit:'unidad',      cur:10,  min:4,   crit:2  },
  { code:'EPP004',  name:'Lentes de Protección',          cat:'EPP',                     unit:'unidad',      cur:8,   min:3,   crit:2  },
  { code:'TIRA001', name:'Tiras Reactivas Uroanálisis',  cat:'Tiras reactivas',         unit:'caja (100)',  cur:8,   min:3,   crit:1  },
  { code:'TIRA002', name:'Tiras Glucómetro',              cat:'Tiras reactivas',         unit:'caja (50)',   cur:5,   min:2,   crit:1  },
  { code:'SOL001',  name:'Solución Salina 0.9%',          cat:'Soluciones',              unit:'litro',       cur:20,  min:8,   crit:3  },
  { code:'SOL002',  name:'Alcohol Etílico 96°',           cat:'Soluciones',              unit:'litro',       cur:10,  min:4,   crit:2  },
  { code:'SOL003',  name:'Hipoclorito Sodio 5%',          cat:'Soluciones',              unit:'litro',       cur:8,   min:3,   crit:1  },
  { code:'SOL004',  name:'Agua Destilada',                cat:'Soluciones',              unit:'litro',       cur:30,  min:10,  crit:3  },
];

async function init() {
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA foreign_keys = ON');

  // Create tables
  await new Promise((resolve, reject) => db.exec(SCHEMA, err => err ? reject(err) : resolve()));

  // Migrations: add new columns to existing tables
  const tcCols = (await all("PRAGMA table_info(test_catalog)")).map(c => c.name);
  if (!tcCols.includes('result_type'))    await run("ALTER TABLE test_catalog ADD COLUMN result_type TEXT DEFAULT 'NUMERIC'");
  if (!tcCols.includes('parameters'))     await run("ALTER TABLE test_catalog ADD COLUMN parameters TEXT");
  if (!tcCols.includes('price'))          await run("ALTER TABLE test_catalog ADD COLUMN price REAL DEFAULT 0");
  if (!tcCols.includes('estimated_time')) await run("ALTER TABLE test_catalog ADD COLUMN estimated_time INTEGER DEFAULT 0");

  const ordCols = (await all("PRAGMA table_info(orders)")).map(c => c.name);
  if (!ordCols.includes('total_price'))    await run("ALTER TABLE orders ADD COLUMN total_price REAL DEFAULT 0");
  if (!ordCols.includes('payment_status')) await run("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'PENDIENTE'");

  const resCols = (await all("PRAGMA table_info(results)")).map(c => c.name);
  if (!resCols.includes('value_text')) await run("ALTER TABLE results ADD COLUMN value_text TEXT");

  const supCols = (await all("PRAGMA table_info(supplies)")).map(c => c.name);
  if (!supCols.includes('brand'))                 await run("ALTER TABLE supplies ADD COLUMN brand TEXT");
  if (!supCols.includes('price_per_unit'))         await run("ALTER TABLE supplies ADD COLUMN price_per_unit REAL DEFAULT 0");
  if (!supCols.includes('determinations_per_unit'))await run("ALTER TABLE supplies ADD COLUMN determinations_per_unit REAL DEFAULT 1");
  if (!supCols.includes('lead_time_days'))         await run("ALTER TABLE supplies ADD COLUMN lead_time_days INTEGER DEFAULT 7");

  const usrCols = (await all("PRAGMA table_info(users)")).map(c => c.name);
  if (!usrCols.includes('firma_url')) await run("ALTER TABLE users ADD COLUMN firma_url TEXT DEFAULT NULL");

  // Expand flag CHECK constraint to support ABNORMAL / SIGNIFICANT / NOT_SIGNIFICANT / INFORMATIVO
  const flagCheck = await get("SELECT sql FROM sqlite_master WHERE type='table' AND name='results'");
  if (flagCheck && flagCheck.sql && flagCheck.sql.includes("flag IN ('NORMAL','LOW','HIGH')")) {
    await run(`CREATE TABLE IF NOT EXISTS results_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL UNIQUE REFERENCES order_items(id),
      value REAL NOT NULL DEFAULT 0,
      value_text TEXT,
      flag TEXT NOT NULL DEFAULT 'NORMAL',
      is_critical INTEGER DEFAULT 0,
      notes TEXT,
      entered_by INTEGER REFERENCES users(id),
      entered_at TEXT DEFAULT (datetime('now')),
      validated_by INTEGER REFERENCES users(id),
      validated_at TEXT,
      is_locked INTEGER DEFAULT 0
    )`);
    await run(`INSERT OR IGNORE INTO results_new
      SELECT id, order_item_id, COALESCE(value,0), value_text, flag, is_critical,
             notes, entered_by, entered_at, validated_by, validated_at, is_locked
      FROM results`);
    await run(`DROP TABLE results`);
    await run(`ALTER TABLE results_new RENAME TO results`);
    console.log('[DB] results table migrated — flag constraint expanded');
  }

  // PRICE_MAP for seeding prices on standard tests
  const PRICE_MAP = {
    // Hematología
    CBC:15, WBC:15, PLT:12, HCT:12, MCV:12, MCH:12, MCHC:12, RDW:12,
    NEU:15, LYM:15, MON:15, EOS:15, BAS:15, RETIC:15,
    VSG:12, PT:20, APTT:20, FIBR:25, DDIMT:40,
    FERR:35, IRON:25, TIBC:25, HBA1C:35, CRP:20, HSCRP:30, PCT:45,
    LDH:20, TROPI:50, CKMB:40, CK:25, MYO:40, BNP:50, TRANSF:25,
    // Bioquímica
    GLU:12, CREAT:12, UREA:12, URIC:12,
    ALT:15, AST:15, GGT:15, ALP:15,
    BILIT:15, BILID:15, BILII:15, PROT:15, ALB:15, GLOB:15,
    CALC:15, PHOS:15, MG:15, AMYL:20, LIPA:20,
    GLUP:15, INSUL:40, HCG:30,
    // Perfil lipídico individual
    CHOL:15, HDL:15, LDL:15, TRIG:15, VLDL:15,
    // Tiroides
    TSH:40, FT4:40, FT3:40, T4T:35, T3T:35, ANTITG:45, ANTIPO:45, TRAB:55, TSHS:45,
    PTH:50, CALCIT:50,
    // Hormonas
    LH:45, FSH:45, PROL:45, PROG:45, TESTO:50, TESTOF:55, ESTR2:50,
    DHEAS:50, CORT:45, ACTH:55, ALDO:55,
    // Marcadores tumorales
    AFP:60, CEA:60, CA125:70, CA199:70, CA153:70, PSA:60, PSAF:60,
    CYFR:65, NSE:65, HE4:80, BETA2:60,
    // Serología
    VDRL:20, FTAABS:30, HIV:30, HBSAG:30, ANTIHBS:30, ANTIHCV:35,
    TOXOG:35, TOXOM:35, HPYLORI:30, DENGAB:35, COVIDAG:25,
    // Uroanálisis simple
    UA:12, UADEN:10, UAPROT:10, UANIT:10, UASEDIM:20,
    // Microbiología
    COPRO:40, OVHEC:25, HEMCULT:70, SECCULT:50, ESPCULT:60, ZIEHL:30, PCRTUBC:120,
    GRAM:25,
    // Electrolitos
    NATR:15, POTK:15, CHLOR:15, BICAR:15,
    // Vitaminas
    VITD:55, VITB12:50, VITB9:45, VITA:55, VITE:55,
  };

  // Seed/update test catalog: INSERT new tests, UPDATE names of existing
  await transaction(async () => {
    for (const t of SEED_TESTS) {
      await run(
        `INSERT OR IGNORE INTO test_catalog
          (code,name,sample_type,unit,
           ref_min_child_m,ref_max_child_m,ref_min_adult_m,ref_max_adult_m,ref_min_elder_m,ref_max_elder_m,
           ref_min_child_f,ref_max_child_f,ref_min_adult_f,ref_max_adult_f,ref_min_elder_f,ref_max_elder_f)
         VALUES (?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?)`,
        [t.code,t.name,t.st,t.u, t.ncm??null,t.xcm??null,t.nam??null,t.xam??null,t.nem??null,t.xem??null,
         t.ncf??null,t.xcf??null,t.naf??null,t.xaf??null,t.nef??null,t.xef??null]
      );
      await run(
        `UPDATE test_catalog SET name=?, sample_type=?, unit=?, price=COALESCE(NULLIF(price,0),?), result_type=COALESCE(NULLIF(result_type,'NUMERIC'),?) WHERE code=?`,
        [t.name, t.st, t.u, t.price||0, t.rt||'NUMERIC', t.code]
      );
      if (PRICE_MAP[t.code]) {
        await run('UPDATE test_catalog SET price=? WHERE code=? AND (price=0 OR price IS NULL)', [PRICE_MAP[t.code], t.code]);
      }
    }
  });

  // Seed special multi-parameter / titer tests
  const SPECIAL_TESTS = [
    {
      code: 'HEMO_CBC', name: 'Hemograma Completo', sample_type: 'Sangre Total',
      unit: '—', result_type: 'MULTI_PARAMETER', price: 35, estimated_time: 30,
      parameters: JSON.stringify([
        {id:'hgb', name:'Hemoglobina', unit:'g/dL', type:'NUMERIC', section:'ERITROCITOS',
          ref:{child_m:{min:11,max:16},adult_m:{min:13.5,max:17.5},elder_m:{min:12,max:17},child_f:{min:11,max:15},adult_f:{min:12,max:16},elder_f:{min:11.5,max:15.5}}},
        {id:'hct', name:'Hematocrito', unit:'%', type:'NUMERIC', section:'ERITROCITOS',
          ref:{child_m:{min:34,max:47},adult_m:{min:41,max:52},elder_m:{min:38,max:50},child_f:{min:34,max:43},adult_f:{min:36,max:46},elder_f:{min:34,max:46}}},
        {id:'mcv', name:'VCM', unit:'fL', type:'NUMERIC', section:'ERITROCITOS',
          ref:{child_m:{min:80,max:100},adult_m:{min:80,max:100},elder_m:{min:80,max:100},child_f:{min:80,max:100},adult_f:{min:80,max:100},elder_f:{min:80,max:100}}},
        {id:'mch', name:'HCM', unit:'pg', type:'NUMERIC', section:'ERITROCITOS',
          ref:{child_m:{min:27,max:33},adult_m:{min:27,max:33},elder_m:{min:27,max:33},child_f:{min:27,max:33},adult_f:{min:27,max:33},elder_f:{min:27,max:33}}},
        {id:'mchc', name:'CHCM', unit:'g/dL', type:'NUMERIC', section:'ERITROCITOS',
          ref:{child_m:{min:32,max:36},adult_m:{min:32,max:36},elder_m:{min:32,max:36},child_f:{min:32,max:36},adult_f:{min:32,max:36},elder_f:{min:32,max:36}}},
        {id:'rdw', name:'ADE (RDW)', unit:'%', type:'NUMERIC', section:'ERITROCITOS',
          ref:{child_m:{min:11.5,max:14.5},adult_m:{min:11.5,max:14.5},elder_m:{min:11.5,max:14.5},child_f:{min:11.5,max:14.5},adult_f:{min:11.5,max:14.5},elder_f:{min:11.5,max:14.5}}},
        {id:'wbc', name:'Leucocitos', unit:'x10³/µL', type:'NUMERIC', section:'LEUCOCITOS',
          ref:{child_m:{min:5,max:13},adult_m:{min:4.5,max:11},elder_m:{min:4.5,max:11},child_f:{min:5,max:13},adult_f:{min:4.5,max:11},elder_f:{min:4.5,max:11}}},
        {id:'neu_p', name:'Neutrófilos %', unit:'%', type:'NUMERIC', section:'LEUCOCITOS',
          ref:{child_m:{min:50,max:70},adult_m:{min:50,max:70},elder_m:{min:50,max:70},child_f:{min:50,max:70},adult_f:{min:50,max:70},elder_f:{min:50,max:70}}},
        {id:'lym_p', name:'Linfocitos %', unit:'%', type:'NUMERIC', section:'LEUCOCITOS',
          ref:{child_m:{min:20,max:40},adult_m:{min:20,max:40},elder_m:{min:20,max:40},child_f:{min:20,max:40},adult_f:{min:20,max:40},elder_f:{min:20,max:40}}},
        {id:'mon_p', name:'Monocitos %', unit:'%', type:'NUMERIC', section:'LEUCOCITOS',
          ref:{child_m:{min:2,max:8},adult_m:{min:2,max:8},elder_m:{min:2,max:8},child_f:{min:2,max:8},adult_f:{min:2,max:8},elder_f:{min:2,max:8}}},
        {id:'eos_p', name:'Eosinófilos %', unit:'%', type:'NUMERIC', section:'LEUCOCITOS',
          ref:{child_m:{min:1,max:4},adult_m:{min:1,max:4},elder_m:{min:1,max:4},child_f:{min:1,max:4},adult_f:{min:1,max:4},elder_f:{min:1,max:4}}},
        {id:'bas_p', name:'Basófilos %', unit:'%', type:'NUMERIC', section:'LEUCOCITOS',
          ref:{child_m:{min:0,max:1},adult_m:{min:0,max:1},elder_m:{min:0,max:1},child_f:{min:0,max:1},adult_f:{min:0,max:1},elder_f:{min:0,max:1}}},
        {id:'plt', name:'Plaquetas', unit:'x10³/µL', type:'NUMERIC', section:'PLAQUETAS',
          ref:{child_m:{min:150,max:400},adult_m:{min:150,max:400},elder_m:{min:150,max:400},child_f:{min:150,max:400},adult_f:{min:150,max:400},elder_f:{min:150,max:400}}}
      ])
    },
    {
      code: 'ORINA_UA', name: 'Examen Completo de Orina (Uroanálisis)', sample_type: 'Orina',
      unit: '—', result_type: 'MULTI_PARAMETER', price: 20, estimated_time: 20,
      parameters: JSON.stringify([
        {id:'color', name:'Color', unit:'', type:'QUALITATIVE', section:'FÍSICO',
          options:['Amarillo','Ámbar','Naranja','Rojo','Marrón','Verde','Blanco'], abnormal_values:['Rojo','Marrón','Verde','Blanco']},
        {id:'aspecto', name:'Aspecto', unit:'', type:'QUALITATIVE', section:'FÍSICO',
          options:['Claro','Ligeramente turbio','Turbio','Muy turbio'], abnormal_values:['Turbio','Muy turbio']},
        {id:'densidad', name:'Densidad', unit:'g/mL', type:'NUMERIC', section:'FÍSICO',
          ref:{child_m:{min:1.005,max:1.030},adult_m:{min:1.005,max:1.030},elder_m:{min:1.005,max:1.030},child_f:{min:1.005,max:1.030},adult_f:{min:1.005,max:1.030},elder_f:{min:1.005,max:1.030}}},
        {id:'ph', name:'pH', unit:'', type:'NUMERIC', section:'FÍSICO',
          ref:{child_m:{min:4.5,max:8.5},adult_m:{min:4.5,max:8.5},elder_m:{min:4.5,max:8.5},child_f:{min:4.5,max:8.5},adult_f:{min:4.5,max:8.5},elder_f:{min:4.5,max:8.5}}},
        {id:'proteinas', name:'Proteínas', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Negativo','+','++','+++','++++'], abnormal_threshold:1},
        {id:'glucosa_u', name:'Glucosa', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Negativo','+','++','+++'], abnormal_threshold:1},
        {id:'cetonas', name:'Cetonas', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Negativo','+','++','+++'], abnormal_threshold:1},
        {id:'bilirrubina_u', name:'Bilirrubina', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Negativo','+','++','+++'], abnormal_threshold:1},
        {id:'urobilinogeno', name:'Urobilinógeno', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Normal','+','++','+++'], abnormal_threshold:1},
        {id:'nitritos', name:'Nitritos', unit:'', type:'QUALITATIVE', section:'QUÍMICO',
          options:['Negativo','Positivo'], abnormal_values:['Positivo']},
        {id:'leucocitos_est', name:'Leucocitos esterasa', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Negativo','+','++','+++'], abnormal_threshold:1},
        {id:'sangre_u', name:'Sangre/Hemoglobina', unit:'', type:'SEMI_QUANTITATIVE', section:'QUÍMICO',
          options:['Negativo','+','++','+++'], abnormal_threshold:1},
        {id:'leu_micro', name:'Leucocitos', unit:'x campo', type:'NUMERIC', section:'MICROSCÓPICO',
          ref:{child_m:{min:0,max:5},adult_m:{min:0,max:5},elder_m:{min:0,max:5},child_f:{min:0,max:5},adult_f:{min:0,max:5},elder_f:{min:0,max:5}}},
        {id:'eri_micro', name:'Eritrocitos', unit:'x campo', type:'NUMERIC', section:'MICROSCÓPICO',
          ref:{child_m:{min:0,max:3},adult_m:{min:0,max:3},elder_m:{min:0,max:3},child_f:{min:0,max:3},adult_f:{min:0,max:3},elder_f:{min:0,max:3}}},
        {id:'cel_epi', name:'Células epiteliales', unit:'', type:'SEMI_QUANTITATIVE', section:'MICROSCÓPICO',
          options:['Escasas','Moderadas','Abundantes'], abnormal_threshold:1},
        {id:'cilindros', name:'Cilindros', unit:'', type:'QUALITATIVE', section:'MICROSCÓPICO',
          options:['No se observan','Hialinos escasos','Granulosos','Leucocitarios','Eritrocitarios'], abnormal_values:['Granulosos','Leucocitarios','Eritrocitarios']},
        {id:'bacterias', name:'Bacterias', unit:'', type:'SEMI_QUANTITATIVE', section:'MICROSCÓPICO',
          options:['No se observan','Escasas','Moderadas','Abundantes'], abnormal_threshold:1},
        {id:'levaduras', name:'Levaduras', unit:'', type:'SEMI_QUANTITATIVE', section:'MICROSCÓPICO',
          options:['No se observan','Escasas','Moderadas'], abnormal_threshold:1}
      ])
    },
    {
      code: 'LIPID_PF', name: 'Perfil Lipídico Completo', sample_type: 'Suero',
      unit: '—', result_type: 'MULTI_PARAMETER', price: 45, estimated_time: 30,
      parameters: JSON.stringify([
        {id:'chol', name:'Colesterol Total', unit:'mg/dL', type:'NUMERIC', section:'LÍPIDOS',
          ref:{child_m:{min:100,max:200},adult_m:{min:100,max:200},elder_m:{min:100,max:200},child_f:{min:100,max:200},adult_f:{min:100,max:200},elder_f:{min:100,max:200}}},
        {id:'hdl', name:'Colesterol HDL', unit:'mg/dL', type:'NUMERIC', section:'LÍPIDOS',
          ref:{child_m:{min:40,max:80},adult_m:{min:40,max:80},elder_m:{min:40,max:80},child_f:{min:50,max:90},adult_f:{min:50,max:90},elder_f:{min:50,max:90}}},
        {id:'ldl', name:'Colesterol LDL', unit:'mg/dL', type:'NUMERIC', section:'LÍPIDOS',
          ref:{child_m:{min:50,max:100},adult_m:{min:50,max:100},elder_m:{min:50,max:100},child_f:{min:50,max:100},adult_f:{min:50,max:100},elder_f:{min:50,max:100}}},
        {id:'trig', name:'Triglicéridos', unit:'mg/dL', type:'NUMERIC', section:'LÍPIDOS',
          ref:{child_m:{min:50,max:150},adult_m:{min:50,max:150},elder_m:{min:50,max:150},child_f:{min:50,max:150},adult_f:{min:50,max:150},elder_f:{min:50,max:150}}},
        {id:'vldl', name:'VLDL', unit:'mg/dL', type:'NUMERIC', section:'LÍPIDOS',
          ref:{child_m:{min:5,max:40},adult_m:{min:5,max:40},elder_m:{min:5,max:40},child_f:{min:5,max:40},adult_f:{min:5,max:40},elder_f:{min:5,max:40}}},
        {id:'idx_aterog', name:'Índice Aterogénico (CT/HDL)', unit:'ratio', type:'NUMERIC', section:'ÍNDICES',
          ref:{child_m:{min:0,max:5},adult_m:{min:0,max:5},elder_m:{min:0,max:5},child_f:{min:0,max:4.5},adult_f:{min:0,max:4.5},elder_f:{min:0,max:4.5}}}
      ])
    },
    {
      code: 'VDRL_T', name: 'VDRL (Sífilis — Cuantitativo)', sample_type: 'Suero',
      unit: '—', result_type: 'TITER', price: 25, estimated_time: 30,
      parameters: JSON.stringify([
        {id:'titer', name:'Título VDRL', type:'TITER',
          options:['No reactivo','1/2','1/4','1/8','1/16','1/32','1/64','1/128','1/256'],
          significant_threshold:'1/8', abnormal_values:['1/8','1/16','1/32','1/64','1/128','1/256']}
      ])
    },
    {
      code: 'WIDAL_T', name: 'Widal (Fiebre Tifoidea)', sample_type: 'Suero',
      unit: '—', result_type: 'MULTI_PARAMETER', price: 30, estimated_time: 30,
      parameters: JSON.stringify([
        {id:'to', name:'S. typhi O (TO)', type:'TITER',
          options:['No reactivo','1/20','1/40','1/80','1/160','1/320'],
          significant_threshold:'1/160', abnormal_values:['1/160','1/320']},
        {id:'th', name:'S. typhi H (TH)', type:'TITER',
          options:['No reactivo','1/20','1/40','1/80','1/160','1/320'],
          significant_threshold:'1/160', abnormal_values:['1/160','1/320']},
        {id:'ah', name:'S. paratyphi AH', type:'TITER',
          options:['No reactivo','1/20','1/40','1/80','1/160','1/320'],
          significant_threshold:'1/160', abnormal_values:['1/160','1/320']},
        {id:'bh', name:'S. paratyphi BH', type:'TITER',
          options:['No reactivo','1/20','1/40','1/80','1/160','1/320'],
          significant_threshold:'1/160', abnormal_values:['1/160','1/320']}
      ])
    },
    {
      code: 'UROCULT', name: 'Urocultivo y Antibiograma', sample_type: 'Orina',
      unit: '—', result_type: 'MULTI_PARAMETER', price: 45, estimated_time: 72,
      parameters: JSON.stringify([
        {id:'desarrollo', name:'Desarrollo bacteriano', type:'QUALITATIVE',
          options:['Sin desarrollo','Desarrollo escaso (<10,000 UFC/mL)','Desarrollo moderado (10,000-100,000 UFC/mL)','Desarrollo abundante (>100,000 UFC/mL)'],
          abnormal_values:['Desarrollo moderado (10,000-100,000 UFC/mL)','Desarrollo abundante (>100,000 UFC/mL)']},
        {id:'organismo', name:'Microorganismo aislado', type:'TEXT'},
        {id:'antibiograma', name:'Antibiograma / Sensibilidad', type:'TEXT'}
      ])
    },
    {
      code: 'HIV_RAPID', name: 'VIH 1/2 Prueba Rápida', sample_type: 'Suero/Sangre',
      unit: '—', result_type: 'QUALITATIVE', price: 30, estimated_time: 30,
      parameters: JSON.stringify([
        {id:'resultado', name:'Resultado VIH', type:'QUALITATIVE',
          options:['No Reactivo','Reactivo','Indeterminado'],
          abnormal_values:['Reactivo','Indeterminado']}
      ])
    },
    {
      code: 'EMBA_TEST', name: 'Test de Embarazo (βhCG Cualitativo)', sample_type: 'Suero/Orina',
      unit: '—', result_type: 'QUALITATIVE', price: 15, estimated_time: 15,
      parameters: JSON.stringify([
        {id:'resultado', name:'Resultado', type:'QUALITATIVE',
          options:['Negativo','Positivo'],
          abnormal_values:['Positivo']}
      ])
    }
  ];

  await transaction(async () => {
    for (const t of SPECIAL_TESTS) {
      const existing = await get('SELECT id FROM test_catalog WHERE code = ?', [t.code]);
      if (!existing) {
        await run(
          `INSERT INTO test_catalog (code, name, sample_type, unit, result_type, parameters, price, estimated_time)
           VALUES (?,?,?,?,?,?,?,?)`,
          [t.code, t.name, t.sample_type, t.unit, t.result_type, t.parameters, t.price, t.estimated_time]
        );
      } else {
        await run(
          `UPDATE test_catalog SET name=?, sample_type=?, result_type=?, parameters=?, price=?, estimated_time=? WHERE code=?`,
          [t.name, t.sample_type, t.result_type, t.parameters, t.price, t.estimated_time, t.code]
        );
      }
    }
  });

  const catRow = await get('SELECT COUNT(*) AS n FROM test_catalog');
  console.log('[DB] Test catalog ready with', catRow.n, 'tests.');

  // Seed default users
  const userRow = await get('SELECT COUNT(*) AS n FROM users');
  if (!userRow || userRow.n === 0) {
    await transaction(async () => {
      const users = [
        { u:'admin',        p:'admin123',  n:'System Administrator', r:'ADMIN'        },
        { u:'receptionist', p:'rec123',    n:'Maria Reception',      r:'RECEPTIONIST' },
        { u:'technician',   p:'tech123',   n:'John Technician',      r:'TECHNICIAN'   },
        { u:'biochemist',   p:'bio123',    n:'Dr. Sarah Biochemist', r:'BIOCHEMIST'   },
      ];
      for (const usr of users) {
        await run('INSERT INTO users (username,password_hash,full_name,role) VALUES (?,?,?,?)',
          [usr.u, hashPassword(usr.p), usr.n, usr.r]);
      }
    });
    console.log('[DB] Seeded 4 default users.');
  }

  // Seed supplies (INSERT OR IGNORE to preserve existing stock)
  await transaction(async () => {
    for (const s of SEED_SUPPLIES) {
      await run(
        `INSERT OR IGNORE INTO supplies
          (code, name, category, unit, stock_current, stock_min, stock_critical)
         VALUES (?,?,?,?,?,?,?)`,
        [s.code, s.name, s.cat, s.unit, s.cur, s.min, s.crit]
      );
    }
  });
  const supRow = await get('SELECT COUNT(*) AS n FROM supplies');
  console.log('[DB] Supplies ready with', supRow.n, 'items.');

  // Seed test_supplies linkages (only if table is empty)
  const tsRow = await get('SELECT COUNT(*) AS n FROM test_supplies');
  if (tsRow && tsRow.n === 0) {
    // Helper: link tests by code to supplies by code with a quantity
    async function linkTS(testCode, supplyCode, qty) {
      const t = await get('SELECT id FROM test_catalog WHERE code = ?', [testCode]);
      const s = await get('SELECT id FROM supplies WHERE code = ?', [supplyCode]);
      if (t && s) {
        await run('INSERT OR IGNORE INTO test_supplies (test_id, supply_id, quantity_per_test) VALUES (?,?,?)',
          [t.id, s.id, qty]);
      }
    }
    // Universal blood draw (shared across serum/plasma tests)
    const serumTests = ['GLU','CREAT','UREA','URIC','ALT','AST','GGT','ALP','BILIT','BILID','BILII',
      'PROT','ALB','CALC','MG','AMYL','LIPA','CHOL','HDL','LDL','TRIG','VLDL',
      'TSH','FT4','FT3','T4T','LH','FSH','PROL','PROG','TESTO','ESTR2',
      'CRP','HSCRP','FERR','IRON','HBA1C','INSUL','VITD','VITB12','LIPID_PF'];
    for (const tc of serumTests) {
      await linkTS(tc, 'MAT002', 1);       // Tubo SST
      await linkTS(tc, 'MAT004', 1);       // Aguja 21G
      await linkTS(tc, 'EPP001', 0.02);    // Guantes (1 par de caja 100)
      await linkTS(tc, 'SOL002', 2);       // Alcohol 2mL
    }
    const edtaTests = ['CBC','WBC','PLT','HCT','MCV','MCH','MCHC','RDW','NEU','LYM','MON','EOS','BAS','VSG','HBA1C','HEMO_CBC'];
    for (const tc of edtaTests) {
      await linkTS(tc, 'MAT001', 1);       // Tubo EDTA
      await linkTS(tc, 'MAT004', 1);
      await linkTS(tc, 'EPP001', 0.02);
      await linkTS(tc, 'SOL002', 2);
      await linkTS(tc, 'REAG006', 1);      // Reactivo CBC 1mL
    }
    const citrateTests = ['PT','APTT','FIBR'];
    for (const tc of citrateTests) {
      await linkTS(tc, 'MAT003', 1);       // Tubo citrato
      await linkTS(tc, 'MAT004', 1);
      await linkTS(tc, 'EPP001', 0.02);
      await linkTS(tc, 'SOL002', 2);
    }
    // Specific reagents
    await linkTS('GLU',     'REAG001', 0.5);
    await linkTS('GLUP',    'REAG001', 0.5);
    await linkTS('CHOL',    'REAG002', 0.5);
    await linkTS('LIPID_PF','REAG002', 0.5);
    await linkTS('TRIG',    'REAG003', 0.5);
    await linkTS('LIPID_PF','REAG003', 0.5);
    await linkTS('CREAT',   'REAG004', 0.5);
    await linkTS('ALT',     'REAG005', 0.5);
    await linkTS('AST',     'REAG005', 0.5);
    await linkTS('UREA',    'REAG009', 0.5);
    await linkTS('BILIT',   'REAG008', 0.5);
    await linkTS('BILID',   'REAG008', 0.3);
    // Urine tests
    const urineTests = ['UA','UADEN','UAPROT','UANIT','UASEDIM','ORINA_UA'];
    for (const tc of urineTests) {
      await linkTS(tc, 'MAT005', 1);       // Contenedor orina
      await linkTS(tc, 'TIRA001', 0.01);   // Tira reactiva (1 de caja 100)
      await linkTS(tc, 'EPP001', 0.02);
    }
    // Serology / rapid tests
    await linkTS('VDRL',    'MAT002', 1);
    await linkTS('HIV',     'MAT002', 1);
    await linkTS('HIV_RAPID','MAT002',1);
    await linkTS('HBSAG',   'MAT002', 1);
    await linkTS('EMBA_TEST','MAT005',1);
    await linkTS('VDRL_T',  'MAT002', 1);
    // Widal
    await linkTS('WIDAL_T', 'MAT002', 1);
    // Tips and eppendorf for all pipetting tests
    const pipetTests = ['GLU','CREAT','UREA','CHOL','HDL','LDL','TRIG','ALT','AST','BILIT'];
    for (const tc of pipetTests) {
      await linkTS(tc, 'MAT006', 0.003); // ~3 tips per test from box of 1000
      await linkTS(tc, 'MAT008', 0.002); // eppendorf
    }
    console.log('[DB] test_supplies linkages seeded.');
  }

  // Seed default fixed costs (only if empty)
  const fcRow = await get('SELECT COUNT(*) AS n FROM fixed_costs');
  if (fcRow && fcRow.n === 0) {
    const defaultCosts = [
      { type:'SALARIO', description:'Salario Bioquímica',    amount:2500, period:'MENSUAL' },
      { type:'SALARIO', description:'Salario Técnico Lab.',  amount:1800, period:'MENSUAL' },
      { type:'SALARIO', description:'Salario Recepcionista', amount:1400, period:'MENSUAL' },
      { type:'ALQUILER', description:'Alquiler Local',       amount:1200, period:'MENSUAL' },
      { type:'SERVICIO', description:'Agua y Luz',           amount:300,  period:'MENSUAL' },
      { type:'SERVICIO', description:'Internet y Teléfono',  amount:120,  period:'MENSUAL' },
      { type:'IMPUESTO', description:'SUNAT / Tributos',     amount:400,  period:'MENSUAL' },
    ];
    for (const c of defaultCosts) {
      await run('INSERT INTO fixed_costs (type, description, amount, period) VALUES (?,?,?,?)',
        [c.type, c.description, c.amount, c.period]);
    }
    console.log('[DB] Fixed costs seeded.');
  }

  // ─── PAP Tables ────────────────────────────────────────────────────────────
  await run(`CREATE TABLE IF NOT EXISTS pap_paquetes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha_recepcion TEXT NOT NULL,
    indicacion TEXT DEFAULT 'PARTICULAR',
    hallazgos TEXT,
    observaciones TEXT,
    total_laminas INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'PENDIENTE',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pap_resultados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paquete_id INTEGER REFERENCES pap_paquetes(id),
    codigo TEXT UNIQUE NOT NULL,
    numero_lamina INTEGER NOT NULL,
    ipress TEXT NOT NULL,
    paciente TEXT NOT NULL,
    edad INTEGER,
    fecha_recepcion TEXT,
    fecha_resultado TEXT,
    indicacion TEXT DEFAULT 'PARTICULAR',
    hallazgos TEXT,
    resultado_bethesda TEXT DEFAULT 'NILM',
    observaciones TEXT,
    estado TEXT DEFAULT 'PENDIENTE',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pap_correlativo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL UNIQUE,
    ultimo_numero INTEGER DEFAULT 0
  )`);

  console.log('[DB] PAP tables ready.');
}

// ─── Helper Utilities ──────────────────────────────────────────────────────────

function getAgeGroup(dob) {
  const birth = new Date(dob);
  const now = new Date();
  const age = (now - birth) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 18) return 'child';
  if (age < 65) return 'adult';
  return 'elder';
}

function calculateFlag(value, test, gender, dob) {
  const g  = (gender || '').toUpperCase() === 'M' ? 'm' : 'f';
  const ag = getAgeGroup(dob);
  const min = test[`ref_min_${ag}_${g}`];
  const max = test[`ref_max_${ag}_${g}`];
  if (min === null || min === undefined || max === null || max === undefined) return 'NORMAL';
  if (value < min) return 'LOW';
  if (value > max) return 'HIGH';
  return 'NORMAL';
}

function isCritical(value, test, gender, dob) {
  const g  = (gender || '').toUpperCase() === 'M' ? 'm' : 'f';
  const ag = getAgeGroup(dob);
  const min = test[`ref_min_${ag}_${g}`];
  const max = test[`ref_max_${ag}_${g}`];
  if (min === null || min === undefined || max === null || max === undefined) return false;
  return value > max * 2 || (min > 0 && value < min / 2);
}

async function auditLog(userId, action, entityType, entityId, details) {
  await run(
    'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId, typeof details === 'object' ? JSON.stringify(details) : details]
  );
}

async function generateOrderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const row = await get(`SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = date('now')`);
  const seq = (row ? row.n : 0) + 1;
  return `LAB-${date}-${String(seq).padStart(4, '0')}`;
}

module.exports = { run, get, all, transaction, hashPassword, verifyPassword, calculateFlag, isCritical, auditLog, generateOrderNumber, getAgeGroup, init };
