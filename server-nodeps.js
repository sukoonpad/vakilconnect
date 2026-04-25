// ============================================================
//  VakilConnect Zero-Dependency Server
//  Uses only Node.js built-ins — NO npm install needed!
//  Requires: Node.js 22.5+ (for node:sqlite)
//  Run: node server-nodeps.js
// ============================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const url = require('node:url');

// node:sqlite requires --experimental-sqlite flag on some Node versions
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n  [ERROR] node:sqlite not available.');
  console.error('  You need Node.js 22.5 or newer. Your version: ' + process.version);
  console.error('  Install latest from https://nodejs.org/\n');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = 'local-dev-secret-change-in-prod';

// ============ DATABASE SETUP ============
function openDb(p) {
  const d = new DatabaseSync(p);
  try { d.exec('PRAGMA journal_mode = WAL;'); } catch (e) {}
  try { d.exec('PRAGMA foreign_keys = ON;'); } catch (e) {}
  return d;
}

let dbPath = path.join(__dirname, 'vakilconnect.db');
let db;
try {
  db = openDb(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS _probe (id INTEGER); DROP TABLE _probe;');
} catch (err) {
  console.log('  [INFO] Local folder does not support SQLite writes, using OS temp folder');
  try { db && db.close(); } catch (e) {}
  dbPath = path.join(os.tmpdir(), 'vakilconnect.db');
  db = openDb(dbPath);
}
console.log('  [DB]', dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    phone TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS advocates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bar_council_id TEXT UNIQUE,
    specializations TEXT,
    city TEXT,
    experience_years INTEGER,
    starting_fee REAL,
    rating REAL DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    bio TEXT,
    verified INTEGER DEFAULT 1,
    verification_status TEXT DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT UNIQUE,
    client_id INTEGER,
    advocate_id INTEGER,
    case_type TEXT,
    title TEXT,
    description TEXT,
    city TEXT,
    budget_min REAL,
    budget_max REAL,
    urgency TEXT,
    status TEXT DEFAULT 'posted',
    total_fee REAL,
    platform_fee REAL,
    timeline TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS escrow_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    milestone_name TEXT,
    amount REAL,
    percentage INTEGER,
    sequence_order INTEGER,
    status TEXT DEFAULT 'locked',
    paid_at DATETIME,
    released_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    sender_id INTEGER,
    receiver_id INTEGER,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    raised_by INTEGER,
    issue_type TEXT,
    amount_in_dispute REAL,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advocate_id INTEGER,
    plan TEXT,
    mrr REAL,
    status TEXT DEFAULT 'active',
    next_billing_date TEXT
  );
`);

// ============ SEED DATA ============
function seed() {
  const count = db.prepare('SELECT COUNT(*) as n FROM advocates').get().n;
  if (count > 0) return;

  console.log('  Seeding database...');
  const advocates = [
    {name:'Priya Sharma', email:'priya@vakil.in', bar:'D/2345/2012', specs:'Court Marriage,Family Law', city:'Delhi', exp:12, fee:8500, rating:4.9, reviews:327, bio:'Specialist in court marriage registrations with 12+ years experience. 98% success rate.'},
    {name:'Rajesh Kumar', email:'rajesh@vakil.in', bar:'M/1203/2006', specs:'Criminal Defense', city:'Mumbai', exp:18, fee:25000, rating:4.8, reviews:412, bio:'Senior criminal lawyer with High Court experience.'},
    {name:'Anita Desai', email:'anita@vakil.in', bar:'K/4567/2014', specs:'Property,Real Estate', city:'Bangalore', exp:10, fee:12000, rating:4.7, reviews:256, bio:'Property law expert, RERA specialist.'},
    {name:'Vikram Singh', email:'vikram@vakil.in', bar:'D/8901/2009', specs:'Divorce,Family Law', city:'Delhi', exp:15, fee:18000, rating:4.9, reviews:589, bio:'Empathetic divorce lawyer. 90% mutual consent rate.'},
    {name:'Sneha Reddy', email:'sneha@vakil.in', bar:'K/2341/2016', specs:'Corporate,Startups', city:'Bangalore', exp:8, fee:35000, rating:4.8, reviews:187, bio:'Startup lawyer. 40+ funded startups advised.'},
    {name:'Mohammed Khan', email:'khan@vakil.in', bar:'M/5678/2010', specs:'Criminal,Cyber Crime', city:'Mumbai', exp:14, fee:22000, rating:4.7, reviews:298, bio:'Cybercrime and white-collar defense specialist.'},
    {name:'Kavita Menon', email:'kavita@vakil.in', bar:'T/3456/2013', specs:'Cheque Bounce,NI Act', city:'Chennai', exp:11, fee:6500, rating:4.9, reviews:445, bio:'NI Act expert. Recovered over 50 crore for clients.'},
    {name:'Arjun Nair', email:'arjun@vakil.in', bar:'W/7890/2015', specs:'Labour,Employment', city:'Kolkata', exp:9, fee:9500, rating:4.6, reviews:134, bio:'Employment law specialist.'},
    {name:'Pooja Bhatt', email:'pooja@vakil.in', bar:'M/4321/2017', specs:'Court Marriage,Registration', city:'Pune', exp:7, fee:7000, rating:4.8, reviews:201, bio:'Quick turnaround for marriage registrations.'},
    {name:'Suresh Iyer', email:'suresh@vakil.in', bar:'A/5432/2008', specs:'Tax,GST', city:'Hyderabad', exp:16, fee:28000, rating:4.7, reviews:167, bio:'Former IT officer. Tax tribunal expert.'},
    {name:'Neha Gupta', email:'neha@vakil.in', bar:'D/6543/2018', specs:'Property,Civil', city:'Delhi', exp:6, fee:10500, rating:4.5, reviews:98, bio:'Civil litigation specialist.'},
    {name:'Amit Patel', email:'amit@vakil.in', bar:'M/1234/2004', specs:'Corporate,Mergers', city:'Mumbai', exp:20, fee:55000, rating:4.9, reviews:312, bio:'M&A expert.'}
  ];

  const insertUser = db.prepare('INSERT INTO users (email, full_name, role) VALUES (?, ?, ?)');
  const insertAdv = db.prepare('INSERT INTO advocates (user_id, bar_council_id, specializations, city, experience_years, starting_fee, rating, total_reviews, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  for (const a of advocates) {
    const r = insertUser.run(a.email, a.name, 'advocate');
    insertAdv.run(r.lastInsertRowid, a.bar, a.specs, a.city, a.exp, a.fee, a.rating, a.reviews, a.bio);
  }

  insertUser.run('admin@vakilconnect.in', 'Platform Admin', 'admin');
  const clientRun = insertUser.run('client@test.in', 'Test Client', 'client');

  const caseNo = 'VC-' + new Date().getFullYear() + '-00347';
  const timeline = JSON.stringify([
    {title:'Case Posted', date:'Apr 12, 2026', state:'done'},
    {title:'Advocate Hired — Priya Sharma', date:'Apr 13, 2026', state:'done'},
    {title:'Initial Consultation', date:'Apr 14, 2026', state:'done'},
    {title:'Documents Submitted', date:'Apr 18, 2026', state:'done'},
    {title:'30-Day Notice Period', date:'Apr 19 - May 19', state:'active'},
    {title:'Registration Hearing', date:'May 20, 2026', state:'pending'}
  ]);
  const caseRun = db.prepare("INSERT INTO cases (case_number, client_id, advocate_id, case_type, title, description, city, status, total_fee, platform_fee, timeline) VALUES (?, ?, 1, 'Court Marriage', 'Court Marriage Registration - Delhi', 'Need advocate for court marriage', 'Delhi', 'in_progress', 8500, 425, ?)").run(caseNo, clientRun.lastInsertRowid, timeline);

  const msIns = db.prepare('INSERT INTO escrow_milestones (case_id, milestone_name, amount, percentage, sequence_order, status, paid_at, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const now = new Date().toISOString();
  msIns.run(caseRun.lastInsertRowid, 'Initial Consultation', 2000, 25, 1, 'released', now, now);
  msIns.run(caseRun.lastInsertRowid, 'Documentation & Filing', 3000, 35, 2, 'released', now, now);
  msIns.run(caseRun.lastInsertRowid, 'Hearing Representation', 2500, 30, 3, 'escrow', now, null);
  msIns.run(caseRun.lastInsertRowid, 'Case Closure', 1000, 10, 4, 'locked', null, null);

  const chatIns = db.prepare('INSERT INTO chat_messages (case_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)');
  chatIns.run(caseRun.lastInsertRowid, 1, clientRun.lastInsertRowid, 'Hello! Aapke documents mil gaye hain. SDM office ne 30-day notice accept kar liya hai.');
  chatIns.run(caseRun.lastInsertRowid, clientRun.lastInsertRowid, 1, 'Great! Koi aur document chahiye?');
  chatIns.run(caseRun.lastInsertRowid, 1, clientRun.lastInsertRowid, 'Nahi, abhi bas wait karna hai. Next hearing 20 May ko hai.');

  const disIns = db.prepare('INSERT INTO disputes (case_id, raised_by, issue_type, amount_in_dispute) VALUES (?, ?, ?, ?)');
  disIns.run(caseRun.lastInsertRowid, clientRun.lastInsertRowid, 'Non-delivery of service', 25000);
  disIns.run(caseRun.lastInsertRowid, clientRun.lastInsertRowid, 'Quality concerns', 12000);

  const subIns = db.prepare('INSERT INTO subscriptions (advocate_id, plan, mrr, status, next_billing_date) VALUES (?, ?, ?, ?, ?)');
  subIns.run(1, 'Premium Pro', 4999, 'active', 'May 15, 2026');
  subIns.run(2, 'Premium Pro', 4999, 'active', 'May 3, 2026');
  subIns.run(3, 'Standard', 1999, 'active', 'May 8, 2026');
  subIns.run(5, 'Enterprise', 9999, 'active', 'May 22, 2026');

  const pending = [
    {name:'Rohit Verma', email:'rohit@new.in', bar:'D/1234/2024', specs:'Criminal', city:'Delhi'},
    {name:'Swati Mishra', email:'swati@new.in', bar:'M/5678/2023', specs:'Family Law', city:'Mumbai'},
    {name:'Karan Joshi', email:'karan@new.in', bar:'K/9012/2024', specs:'Corporate', city:'Bangalore'},
    {name:'Ritika Agarwal', email:'ritika@new.in', bar:'D/3456/2022', specs:'Property', city:'Delhi'},
    {name:'Arjun Roy', email:'arjun.r@new.in', bar:'W/7890/2023', specs:'Labour', city:'Kolkata'}
  ];
  for (const a of pending) {
    const u = insertUser.run(a.email, a.name, 'advocate');
    db.prepare("INSERT INTO advocates (user_id, bar_council_id, specializations, city, experience_years, starting_fee, verified, verification_status) VALUES (?, ?, ?, ?, 5, 10000, 0, 'pending')").run(u.lastInsertRowid, a.bar, a.specs, a.city);
  }

  console.log('  [OK] Seeded 12 verified advocates + 5 pending + 1 test client + sample case');
}
seed();

// ============ JWT (HS256 via node:crypto) ============
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function signJwt(payload, expiresInSec = 30 * 24 * 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest());
  return h + '.' + p + '.' + sig;
}
function verifyJwt(token) {
  try {
    const [h, p, s] = token.split('.');
    const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest());
    if (s !== expected) return null;
    const payload = JSON.parse(b64urlDecode(p).toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}

// ============ TINY HTTP ROUTER ============
const routes = [];
function route(method, pattern, handler) {
  const paramNames = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { paramNames.push(n); return '([^/]+)'; }) + '$');
  routes.push({ method, re, paramNames, handler });
}

function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function getAuthUser(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const payload = verifyJwt(h.slice(7));
  if (!payload) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
}

// ============ ROUTES ============

// Auth
route('POST', '/api/auth/send-otp', async (req, res, params, body) => {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  console.log('\n  [OTP] for ' + body.identifier + ': ' + otp + '\n');
  sendJson(res, 200, { success: true, message: 'OTP sent', debug_otp: otp });
});

route('POST', '/api/auth/verify-otp', async (req, res, params, body) => {
  const { identifier, otp, full_name } = body;
  if (!otp || otp.length !== 6) return sendJson(res, 400, { error: 'Invalid OTP' });
  const isEmail = identifier && identifier.includes('@');
  const field = isEmail ? 'email' : 'phone';
  let user = db.prepare('SELECT * FROM users WHERE ' + field + ' = ?').get(identifier);
  if (!user) {
    const r = db.prepare('INSERT INTO users (' + field + ", full_name, role) VALUES (?, ?, 'client')")
      .run(identifier, full_name || identifier.split('@')[0]);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  }
  sendJson(res, 200, { success: true, token: signJwt({ userId: user.id }), user });
});

route('GET', '/api/auth/me', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  sendJson(res, 200, { user });
});

// Advocates
route('GET', '/api/advocates', async (req, res, params, body, query) => {
  const { city, specialization, search, sort = 'rating' } = query;
  let sql = 'SELECT a.*, u.full_name, u.email FROM advocates a JOIN users u ON a.user_id = u.id WHERE a.verified = 1';
  const args = [];
  if (city) { sql += ' AND a.city = ?'; args.push(city); }
  if (specialization && specialization !== 'All') { sql += ' AND a.specializations LIKE ?'; args.push('%' + specialization + '%'); }
  if (search) { sql += ' AND (u.full_name LIKE ? OR a.specializations LIKE ? OR a.city LIKE ?)'; args.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
  const order = { 'rating': 'a.rating DESC', 'price-low': 'a.starting_fee ASC', 'price-high': 'a.starting_fee DESC', 'exp': 'a.experience_years DESC' }[sort] || 'a.rating DESC';
  sql += ' ORDER BY ' + order;
  const rows = db.prepare(sql).all(...args);
  sendJson(res, 200, { advocates: rows, total: rows.length });
});

route('GET', '/api/advocates/recommend/ai', async (req, res, params, body, query) => {
  const { case_type, city } = query;
  let sql = 'SELECT a.*, u.full_name, (a.rating * 20 + a.experience_years * 2 - a.starting_fee/1000.0) as match_score FROM advocates a JOIN users u ON a.user_id = u.id WHERE a.verified = 1';
  const args = [];
  if (case_type) { sql += ' AND a.specializations LIKE ?'; args.push('%' + case_type + '%'); }
  if (city) { sql += ' AND a.city = ?'; args.push(city); }
  sql += ' ORDER BY match_score DESC LIMIT 5';
  sendJson(res, 200, { recommendations: db.prepare(sql).all(...args) });
});

route('GET', '/api/advocates/:id', async (req, res, params) => {
  const adv = db.prepare('SELECT a.*, u.full_name, u.email FROM advocates a JOIN users u ON a.user_id = u.id WHERE a.id = ?').get(params.id);
  if (!adv) return sendJson(res, 404, { error: 'Not found' });
  sendJson(res, 200, { advocate: adv, reviews: [] });
});

// Cases
route('POST', '/api/cases', async (req, res, params, body) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const { case_type, title, description, city, budget_min, budget_max, urgency } = body;
  const caseNo = 'VC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
  const timeline = JSON.stringify([{ title: 'Case Posted', date: new Date().toISOString(), state: 'done' }]);
  const r = db.prepare('INSERT INTO cases (case_number, client_id, case_type, title, description, city, budget_min, budget_max, urgency, timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(caseNo, user.id, case_type, title, description, city, budget_min, budget_max, urgency, timeline);
  const newCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(r.lastInsertRowid);
  sendJson(res, 200, { success: true, case: newCase });
});

route('GET', '/api/cases/mine', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const cases = db.prepare('SELECT c.*, u.full_name as advocate_name FROM cases c LEFT JOIN advocates a ON c.advocate_id = a.id LEFT JOIN users u ON a.user_id = u.id WHERE c.client_id = ? ORDER BY c.created_at DESC').all(user.id);
  const withMilestones = cases.map(c => ({
    ...c,
    timeline: JSON.parse(c.timeline || '[]'),
    milestones: db.prepare('SELECT * FROM escrow_milestones WHERE case_id = ? ORDER BY sequence_order').all(c.id)
  }));
  sendJson(res, 200, { cases: withMilestones });
});

route('POST', '/api/cases/:id/hire', async (req, res, params, body) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const { advocate_id, total_fee } = body;
  const platformFee = total_fee * 0.05;
  db.prepare("UPDATE cases SET advocate_id = ?, status = 'hired', total_fee = ?, platform_fee = ? WHERE id = ? AND client_id = ?")
    .run(advocate_id, total_fee, platformFee, params.id, user.id);
  const ms = [
    { name: 'Initial Consultation', pct: 25 },
    { name: 'Documentation & Filing', pct: 35 },
    { name: 'Hearing Representation', pct: 30 },
    { name: 'Case Closure', pct: 10 }
  ];
  ms.forEach((m, i) => {
    db.prepare('INSERT INTO escrow_milestones (case_id, milestone_name, amount, percentage, sequence_order, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(params.id, m.name, total_fee * m.pct / 100, m.pct, i + 1, i === 0 ? 'escrow' : 'locked');
  });
  sendJson(res, 200, { success: true });
});

// Escrow (mock Razorpay)
route('POST', '/api/escrow/order', async (req, res, params, body) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const ms = db.prepare('SELECT * FROM escrow_milestones WHERE id = ?').get(body.milestone_id);
  if (!ms) return sendJson(res, 404, { error: 'Not found' });
  sendJson(res, 200, { order_id: 'order_mock_' + Date.now(), amount: ms.amount * 100, currency: 'INR', key_id: 'rzp_test_mock', mock: true });
});

route('POST', '/api/escrow/verify', async (req, res, params, body) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  db.prepare("UPDATE escrow_milestones SET status = 'escrow', paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(body.milestone_id);
  sendJson(res, 200, { success: true });
});

route('POST', '/api/escrow/release/:id', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const ms = db.prepare('SELECT * FROM escrow_milestones WHERE id = ?').get(params.id);
  if (!ms) return sendJson(res, 404, { error: 'Not found' });
  db.prepare("UPDATE escrow_milestones SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = ?").run(params.id);
  db.prepare("UPDATE escrow_milestones SET status = 'escrow' WHERE case_id = ? AND sequence_order = ? AND status = 'locked'")
    .run(ms.case_id, ms.sequence_order + 1);
  sendJson(res, 200, { success: true, released: ms.amount * 0.95, commission: ms.amount * 0.05 });
});

route('GET', '/api/escrow/summary', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const r = db.prepare("SELECT COALESCE(SUM(CASE WHEN m.status='escrow' THEN m.amount ELSE 0 END),0) as in_escrow, COALESCE(SUM(CASE WHEN m.status='released' THEN m.amount ELSE 0 END),0) as released, COALESCE(SUM(CASE WHEN m.status='locked' THEN m.amount ELSE 0 END),0) as locked FROM escrow_milestones m JOIN cases c ON m.case_id = c.id WHERE c.client_id = ?").get(user.id);
  sendJson(res, 200, { summary: r });
});

// Chat
route('GET', '/api/chat/:case_id', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const msgs = db.prepare('SELECT m.*, u.full_name as sender_name FROM chat_messages m JOIN users u ON m.sender_id = u.id WHERE m.case_id = ? ORDER BY m.created_at ASC').all(params.case_id);
  sendJson(res, 200, { messages: msgs });
});

route('POST', '/api/chat/:case_id', async (req, res, params, body) => {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
  const r = db.prepare('INSERT INTO chat_messages (case_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)')
    .run(params.case_id, user.id, body.receiver_id || 1, body.message);
  const msg = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(r.lastInsertRowid);
  sendJson(res, 200, { message: msg });
});

// Admin
route('GET', '/api/admin/metrics', async (req, res) => {
  const m = db.prepare("SELECT (SELECT COALESCE(SUM(amount),0) FROM escrow_milestones WHERE status='escrow') as escrow_held, (SELECT COALESCE(SUM(amount*0.05),0) FROM escrow_milestones WHERE status='released') as commission_earned, (SELECT COUNT(*) FROM advocates WHERE verification_status='pending') as pending_verifications, (SELECT COUNT(*) FROM disputes WHERE status IN ('open','mediating')) as active_disputes, (SELECT COUNT(*) FROM users) as active_users, (SELECT COUNT(*) FROM cases) as cases_this_month").get();
  sendJson(res, 200, { metrics: m });
});

route('GET', '/api/admin/revenue', async (req, res) => {
  sendJson(res, 200, {
    data: [
      { day: 'Mon', commission: 82000 },
      { day: 'Tue', commission: 95000 },
      { day: 'Wed', commission: 78000 },
      { day: 'Thu', commission: 124000 },
      { day: 'Fri', commission: 156000 },
      { day: 'Sat', commission: 98000 },
      { day: 'Sun', commission: 112000 }
    ]
  });
});

route('GET', '/api/admin/verifications', async (req, res) => {
  const rows = db.prepare("SELECT a.*, u.full_name, u.email FROM advocates a JOIN users u ON a.user_id = u.id WHERE a.verification_status = 'pending' ORDER BY a.created_at ASC").all();
  sendJson(res, 200, { pending: rows });
});

route('POST', '/api/admin/verifications/:id/approve', async (req, res, params) => {
  db.prepare("UPDATE advocates SET verified = 1, verification_status = 'approved' WHERE id = ?").run(params.id);
  sendJson(res, 200, { success: true });
});

route('POST', '/api/admin/verifications/:id/reject', async (req, res, params) => {
  db.prepare("UPDATE advocates SET verification_status = 'rejected' WHERE id = ?").run(params.id);
  sendJson(res, 200, { success: true });
});

route('GET', '/api/admin/disputes', async (req, res) => {
  const rows = db.prepare("SELECT d.*, c.case_number, c.title as case_title, u.full_name as client_name FROM disputes d JOIN cases c ON d.case_id = c.id JOIN users u ON d.raised_by = u.id WHERE d.status IN ('open','mediating')").all();
  sendJson(res, 200, { disputes: rows });
});

route('POST', '/api/admin/disputes/:id/resolve', async (req, res, params, body) => {
  const s = body.action === 'refund' ? 'refunded' : body.action === 'mediate' ? 'mediating' : 'resolved';
  db.prepare('UPDATE disputes SET status = ? WHERE id = ?').run(s, params.id);
  sendJson(res, 200, { success: true });
});

route('GET', '/api/admin/subscriptions', async (req, res) => {
  const rows = db.prepare('SELECT s.*, u.full_name as advocate_name FROM subscriptions s JOIN advocates a ON s.advocate_id = a.id JOIN users u ON a.user_id = u.id').all();
  sendJson(res, 200, { subscriptions: rows });
});

// Health + info
route('GET', '/api/health', async (req, res) => {
  sendJson(res, 200, { status: 'healthy', mode: 'local-dev-nodeps', db: 'node:sqlite' });
});

route('GET', '/api', async (req, res) => {
  sendJson(res, 200, { name: 'VakilConnect Zero-Dep API', version: '1.0.0', mode: 'dev-nodeps' });
});

// ============ STATIC FILE SERVING ============
function serveStatic(req, res, urlPath) {
  // Map /, /app to VakilConnect.html
  let filePath;
  if (urlPath === '/' || urlPath === '/app') {
    filePath = path.join(__dirname, 'VakilConnect.html');
  } else {
    filePath = path.join(__dirname, decodeURIComponent(urlPath));
  }
  // Security: prevent path traversal
  const base = path.resolve(__dirname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(base)) return sendJson(res, 403, { error: 'Forbidden' });

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: 'Not found' });
    const ext = path.extname(resolved).toLowerCase();
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(resolved).pipe(res);
  });
}

// ============ SERVER ============
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  const parsed = url.parse(req.url, true);
  const urlPath = parsed.pathname;
  const query = parsed.query;

  // Try API routes
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = urlPath.match(r.re);
    if (!m) continue;
    const params = {};
    r.paramNames.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    const body = (req.method === 'POST' || req.method === 'PUT') ? await parseBody(req) : {};
    try {
      return await r.handler(req, res, params, body, query);
    } catch (e) {
      console.error('  [ERROR]', urlPath, e.message);
      return sendJson(res, 500, { error: 'Internal server error', message: e.message });
    }
  }

  // Fall back to static files
  if (req.method === 'GET') return serveStatic(req, res, urlPath);

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  const n = db.prepare('SELECT COUNT(*) as n FROM advocates').get().n;
  console.log('');
  console.log('  ====================================================');
  console.log('    VakilConnect Zero-Dep Server');
  console.log('    (No npm install needed - only Node.js builtins)');
  console.log('  ====================================================');
  console.log('    Server:    http://localhost:' + PORT);
  console.log('    Frontend:  http://localhost:' + PORT + '/app');
  console.log('    API docs:  http://localhost:' + PORT + '/api');
  console.log('    Database:  node:sqlite (' + n + ' advocates)');
  console.log('    Node.js:   ' + process.version);
  console.log('  ====================================================');
  console.log('    Press Ctrl+C to stop');
  console.log('');
});
