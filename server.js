import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============ SECURITY MIDDLEWARE ============
app.use(helmet()); // Security headers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later'
});

app.use('/api/', limiter);

// ============ IN-MEMORY DATABASE (For MVP) ============
// In production, use MongoDB with persistence
let db = {
  meetings: [],
  attendance: [],
  admins: [],
  sessions: []
};

// Load from JSON file if exists
const dbFile = './data.json';
function loadDB() {
  try {
    if (fs.existsSync(dbFile)) {
      const data = fs.readFileSync(dbFile, 'utf-8');
      db = JSON.parse(data);
    }
  } catch (e) {
    console.log('Could not load DB file, using empty DB');
  }
  // Ensure settings object exists
  db.settings = db.settings || {};
}

// ============ ENCRYPTION HELPERS ============
const ENC_ALGO = 'aes-256-gcm';
function getEncKey() {
  const seed = process.env.JSONBIN_ENC_KEY || process.env.JWT_SECRET || 'dev-secret-key';
  return crypto.createHash('sha256').update(String(seed)).digest();
}

function encryptSecret(plain) {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { data: encrypted.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
}

function decryptSecret(obj) {
  try {
    if (!obj) return null;
    // If legacy plain string stored, return it
    if (typeof obj === 'string') return obj;
    const key = getEncKey();
    const iv = Buffer.from(obj.iv, 'base64');
    const tag = Buffer.from(obj.tag, 'base64');
    const data = Buffer.from(obj.data, 'base64');
    const decipher = crypto.createDecipheriv(ENC_ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    console.error('Decrypt failed', e);
    return null;
  }
}

function saveDB() {
  try {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Could not save DB:', e);
  }
}

loadDB();

// ============ UTILITIES ============
function sanitize(str, maxLen = 100) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '').substring(0, maxLen);
}

function generateToken(adminId) {
  return jwt.sign(
    { adminId, iat: Date.now() },
    process.env.JWT_SECRET || 'dev-secret-key',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
  } catch (e) {
    return null;
  }
}

// ============ MIDDLEWARE ============
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.adminId = decoded.adminId;
  next();
};

// ============ ROUTES ============

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    uptime: process.uptime()
  });
});

// Initialize admin account
app.post('/api/auth/init', [
  body('pin').isLength({ min: 4, max: 4 }).matches(/^\d{4}$/),
  body('password').isLength({ min: 8 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  if (db.admins.length > 0) {
    return res.status(400).json({ error: 'Admin already initialized' });
  }

  const { pin, password } = req.body;
  const adminId = uuidv4();
  const hashedPin = bcrypt.hashSync(pin, 10);
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.admins.push({
    id: adminId,
    pin: hashedPin,
    password: hashedPassword,
    createdAt: new Date().toISOString(),
    sessions: 0
  });

  saveDB();

  res.json({
    message: 'Admin initialized successfully',
    adminId,
    token: generateToken(adminId)
  });
});

// Admin login with PIN
app.post('/api/auth/login', loginLimiter, [
  body('pin').isLength({ min: 4, max: 4 }).matches(/^\d{4}$/)
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid PIN format' });
  }

  const { pin } = req.body;
  const admin = db.admins[0]; // Single admin for now

  if (!admin) {
    return res.status(400).json({ error: 'No admin account' });
  }

  const isValid = bcrypt.compareSync(pin, admin.pin);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const token = generateToken(admin.id);
  res.json({
    message: 'Logged in successfully',
    token,
    adminId: admin.id
  });
});

// Get all meetings
app.get('/api/meetings', auth, (req, res) => {
  res.json({
    data: db.meetings,
    count: db.meetings.length,
    timestamp: new Date().toISOString()
  });
});

// Create meeting
app.post('/api/meetings', auth, [
  body('title').notEmpty().isLength({ max: 100 }),
  body('topic').notEmpty().isLength({ max: 2000 }),
  body('date').isISO8601(),
  body('time').matches(/^\d{2}:\d{2}$/),
  body('venue').notEmpty().isLength({ max: 150 }),
  body('window').isInt({ min: 5, max: 480 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { title, topic, date, time, venue, organizer, dept, expected, window: window_min, status } = req.body;

  const meeting = {
    id: 'MTG_' + Date.now(),
    title: sanitize(title, 100),
    topic: sanitize(topic, 2000),
    date,
    time,
    venue: sanitize(venue, 150),
    organizer: sanitize(organizer, 100),
    dept: sanitize(dept, 100),
    expected: Math.min(Math.max(parseInt(expected) || 0, 0), 10000),
    window: window_min,
    status: status || 'active',
    adminId: req.adminId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.meetings.unshift(meeting);
  saveDB();

  res.status(201).json({
    message: 'Meeting created successfully',
    data: meeting
  });
});

// Update meeting status
app.patch('/api/meetings/:id/status', auth, [
  body('status').isIn(['active', 'ended'])
], (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const meeting = db.meetings.find(m => m.id === id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  meeting.status = status;
  meeting.updatedAt = new Date().toISOString();
  saveDB();

  res.json({
    message: 'Meeting updated',
    data: meeting
  });
});

// Delete meeting
app.delete('/api/meetings/:id', auth, (req, res) => {
  const { id } = req.params;

  db.meetings = db.meetings.filter(m => m.id !== id);
  db.attendance = db.attendance.filter(a => a.meetingId !== id);
  saveDB();

  res.json({
    message: 'Meeting deleted',
    deletedId: id
  });
});

// Get attendance records
app.get('/api/attendance', auth, (req, res) => {
  const { meetingId, search } = req.query;

  let filtered = db.attendance;

  if (meetingId) {
    filtered = filtered.filter(a => a.meetingId === meetingId);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.designation || '').toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json({
    data: filtered,
    count: filtered.length,
    timestamp: new Date().toISOString()
  });
});

// Mark attendance
app.post('/api/attendance', [
  body('meetingId').notEmpty(),
  body('name').notEmpty().isLength({ max: 100 }),
  body('signature').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { meetingId, name, designation, department, empId, signature, sigType, device } = req.body;

  // Verify meeting exists
  const meeting = db.meetings.find(m => m.id === meetingId);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  // Verify meeting is active
  if (meeting.status !== 'active') {
    return res.status(400).json({ error: 'Meeting attendance closed' });
  }

  // Check attendance window
  const meetingTime = new Date(`${meeting.date}T${meeting.time}`);
  const now = new Date();

  if (now < meetingTime) {
    return res.status(400).json({ error: 'Meeting hasn\'t started' });
  }

  const minutesElapsed = (now - meetingTime) / 60000;
  if (minutesElapsed > meeting.window) {
    return res.status(400).json({ error: 'Attendance window closed' });
  }

  // Check if already marked
  const existing = db.attendance.find(a =>
    a.meetingId === meetingId &&
    a.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    return res.status(400).json({ error: 'Already marked attendance' });
  }

  const attendance = {
    id: 'ATD_' + Date.now(),
    meetingId,
    name: sanitize(name, 100),
    designation: sanitize(designation, 80),
    department: sanitize(department, 80),
    empId: sanitize(empId, 50),
    signature,
    sigType,
    device,
    timestamp: new Date().toISOString()
  };

  db.attendance.push(attendance);
  saveDB();

  // Trigger background JSONBin sync if configured
  if (db.settings && db.settings.jsonbin && db.settings.jsonbin.key && db.settings.jsonbin.bin) {
    pushToJSONBinServer().catch(err => console.error('JSONBin push failed:', err));
  }

  res.status(201).json({
    message: 'Attendance marked',
    data: attendance
  });
});

// ============ JSONBin SERVER SYNC ============
async function pushToJSONBinServer() {
  try {
    const jb = db.settings.jsonbin;
    if (!jb || !jb.key || !jb.bin) throw new Error('JSONBin not configured');
    const key = decryptSecret(jb.key);
    if (!key) throw new Error('Could not decrypt JSONBin key');

    const payload = {
      exportDate: new Date().toISOString(),
      meetings: db.meetings,
      attendance: db.attendance
    };

    const res = await fetch(`https://api.jsonbin.io/v3/b/${jb.bin}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': key
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`JSONBin push failed: ${res.status} ${txt}`);
    }
    return true;
  } catch (err) {
    throw err;
  }
}

async function pullFromJSONBinServer() {
  try {
    const jb = db.settings.jsonbin;
    if (!jb || !jb.key || !jb.bin) throw new Error('JSONBin not configured');
    const key = decryptSecret(jb.key);
    if (!key) throw new Error('Could not decrypt JSONBin key');

    const res = await fetch(`https://api.jsonbin.io/v3/b/${jb.bin}/latest`, {
      method: 'GET',
      headers: { 'X-Master-Key': key }
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`JSONBin pull failed: ${res.status} ${txt}`);
    }

    const data = await res.json();
    const rec = data && data.record ? data.record : data;
    return rec;
  } catch (err) {
    throw err;
  }
}

// Protected endpoints to manage JSONBin settings and sync
app.get('/api/admin/jsonbin', auth, (req, res) => {
  const jb = db.settings.jsonbin || null;
  res.json({ configured: !!(jb && jb.key && jb.bin), bin: jb ? jb.bin : null });
});

app.post('/api/admin/jsonbin', auth, [
  body('key').notEmpty(),
  body('bin').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid payload' });
  const { key, bin } = req.body;
  // Encrypt key at rest
  try {
    const enc = encryptSecret(key);
    db.settings.jsonbin = { key: enc, bin: sanitize(bin, 200), updatedAt: new Date().toISOString() };
    saveDB();
    res.json({ message: 'JSONBin settings saved (key encrypted)' });
  } catch (e) {
    console.error('Could not encrypt JSONBin key', e);
    return res.status(500).json({ error: 'Could not save settings' });
  }
});

app.post('/api/admin/jsonbin/push', auth, async (req, res) => {
  try {
    await pushToJSONBinServer();
    res.json({ message: 'Pushed to JSONBin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Push failed', details: err.message });
  }
});

app.post('/api/admin/jsonbin/pull', auth, async (req, res) => {
  try {
    const rec = await pullFromJSONBinServer();
    if (!rec) return res.status(404).json({ error: 'No record in bin' });

    // Merge remote data
    const remoteMeet = rec.meetings || [];
    const remoteAtd = rec.attendance || [];

    const mapMeet = {};
    db.meetings.forEach(m => mapMeet[m.id] = m);
    remoteMeet.forEach(m => { if (!mapMeet[m.id]) mapMeet[m.id] = m; });
    db.meetings = Object.values(mapMeet).sort((a,b)=> new Date(b.createdAt||0)-new Date(a.createdAt||0));

    const mapAtd = {};
    db.attendance.forEach(a => mapAtd[a.id] = a);
    remoteAtd.forEach(a => { if (!mapAtd[a.id]) mapAtd[a.id] = a; });
    db.attendance = Object.values(mapAtd).sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));

    saveDB();
    res.json({ message: 'Pulled and merged data', meetings: db.meetings.length, attendance: db.attendance.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Pull failed', details: err.message });
  }
});

// Export attendance as CSV
app.get('/api/attendance/export/csv', auth, (req, res) => {
  const { meetingId } = req.query;

  let filtered = db.attendance;
  if (meetingId) {
    filtered = filtered.filter(a => a.meetingId === meetingId);
  }

  if (filtered.length === 0) {
    return res.status(400).json({ error: 'No data to export' });
  }

  const headers = ['#', 'Name', 'Designation', 'Department', 'Meeting', 'Date', 'Time'];
  const rows = filtered.map((a, i) => {
    const meeting = db.meetings.find(m => m.id === a.meetingId);
    return [
      i + 1,
      a.name,
      a.designation || '',
      a.department || '',
      meeting?.title || '',
      meeting?.date || '',
      meeting?.time || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
  res.send(csv);
});

// Export attendance as JSON
app.get('/api/attendance/export/json', auth, (req, res) => {
  const { meetingId } = req.query;

  let filtered = db.attendance;
  if (meetingId) {
    filtered = filtered.filter(a => a.meetingId === meetingId);
  }

  if (filtered.length === 0) {
    return res.status(400).json({ error: 'No data to export' });
  }

  // Remove large signature data from export
  const clean = filtered.map(a => {
    const copy = { ...a };
    delete copy.signature;
    return copy;
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=attendance.json');
  res.send(JSON.stringify(clean, null, 2));
});

// Create backup
app.get('/api/backup', auth, (req, res) => {
  const backup = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    meetings: db.meetings,
    attendance: db.attendance
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=meettrack-backup.json');
  res.send(JSON.stringify(backup, null, 2));
});

// Restore from backup
app.post('/api/backup/restore', auth, [
  body('meetings').isArray(),
  body('attendance').isArray()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid backup format' });
  }

  const { meetings, attendance } = req.body;

  db.meetings = meetings;
  db.attendance = attendance;
  saveDB();

  res.json({
    message: 'Backup restored successfully',
    meetingsCount: meetings.length,
    attendanceCount: attendance.length
  });
});

// Get dashboard stats
app.get('/api/stats', auth, (req, res) => {
  const totalMeetings = db.meetings.length;
  const activeMeetings = db.meetings.filter(m => m.status === 'active').length;
  const totalAttendance = db.attendance.length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = db.attendance.filter(a =>
    a.timestamp.startsWith(todayStr)
  ).length;

  res.json({
    totalMeetings,
    activeMeetings,
    totalAttendance,
    todayAttendance,
    timestamp: new Date().toISOString()
  });
});

// Change admin PIN
app.post('/api/admin/pin', auth, [
  body('currentPin').isLength({ min: 4, max: 4 }),
  body('newPin').isLength({ min: 4, max: 4 }).matches(/^\d{4}$/)
], (req, res) => {
  const { currentPin, newPin } = req.body;
  const admin = db.admins.find(a => a.id === req.adminId);

  if (!admin) {
    return res.status(404).json({ error: 'Admin not found' });
  }

  const isValid = bcrypt.compareSync(currentPin, admin.pin);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid current PIN' });
  }

  admin.pin = bcrypt.hashSync(newPin, 10);
  admin.updatedAt = new Date().toISOString();
  saveDB();

  res.json({
    message: 'PIN changed successfully'
  });
});

// Clear all data
app.post('/api/admin/clear-all', auth, (req, res) => {
  db.meetings = [];
  db.attendance = [];
  saveDB();

  res.json({
    message: 'All data cleared',
    timestamp: new Date().toISOString()
  });
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// ============ SERVER START ============
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║        MeetTrack Server v2.0         ║
╚══════════════════════════════════════╝

📍 Server running on: http://localhost:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📚 API Base: http://localhost:${PORT}/api

📖 Documentation:
   GET    /health              - Server status
   POST   /api/auth/init       - Initialize admin
   POST   /api/auth/login      - Login with PIN
   GET    /api/meetings        - Get all meetings
   POST   /api/meetings        - Create meeting
   GET    /api/attendance      - Get attendance
   POST   /api/attendance      - Mark attendance
   GET    /api/stats           - Dashboard stats
   GET    /api/backup          - Export backup
   POST   /api/backup/restore  - Restore backup

🔐 Data stored in: ${dbFile}
  `);

  // Create backups directory
  try {
    fs.mkdirSync('./backups', { recursive: true });
    fs.mkdirSync('./logs', { recursive: true });
  } catch (e) {
    // Directories may already exist
  }
});

export default app;
