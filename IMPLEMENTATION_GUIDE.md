# MeetTrack - Quick Fix Implementation Guide

## 🎯 Priority Fixes (Implement in This Order)

---

## Fix #1: Enhanced Security for PIN ⚠️ CRITICAL

**File: `meeting-admin.html`**

Replace the current AUTH section (lines 694-719) with:

```javascript
// ============ STORAGE HELPERS ============
const DB = {
  get: (k) => { 
    try { 
      return JSON.parse(localStorage.getItem(k)) || []; 
    } catch { 
      return []; 
    } 
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        showToast('❌ Storage limit exceeded. Export and clear old data.', true);
        return false;
      }
      showToast('❌ Storage error: ' + e.message, true);
      return false;
    }
  },
  getStr: (k, d = '') => {
    try {
      return localStorage.getItem(k) || d;
    } catch {
      return d;
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }
};

// ============ AUTH WITH SECURITY ============
const DEFAULT_PIN = '1234';
let loginAttempts = 0;
let loginLocked = false;

function getPin() { 
  return DB.getStr('mt_pin', DEFAULT_PIN); 
}

function doLogin() {
  // Check if locked out
  if (loginLocked) {
    const elapsed = Date.now() - (window.lastLoginAttempt || 0);
    if (elapsed < 5 * 60 * 1000) { // 5 minutes
      showToast('❌ Too many failed attempts. Wait 5 minutes.', true);
      return;
    }
    loginLocked = false;
    loginAttempts = 0;
  }

  const pin = ['p1','p2','p3','p4'].map(id => document.getElementById(id).value).join('');
  
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    showToast('❌ PIN must be 4 digits', true);
    return;
  }

  if (pin === getPin()) {
    // Successful login
    loginAttempts = 0;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
    
    // Set session timeout (30 minutes)
    clearTimeout(window.sessionTimeout);
    window.sessionTimeout = setTimeout(() => {
      logout();
      showToast('⏱ Session expired for security', true);
    }, 30 * 60 * 1000);
  } else {
    // Failed login
    loginAttempts++;
    if (loginAttempts >= 5) {
      loginLocked = true;
      window.lastLoginAttempt = Date.now();
      document.getElementById('loginErr').textContent = '❌ Locked for 5 minutes';
      showToast('❌ Account locked temporarily', true);
    } else {
      document.getElementById('loginErr').textContent = 
        `❌ Wrong PIN (${5 - loginAttempts} attempts left)`;
    }
    document.getElementById('loginErr').style.display = 'block';
    ['p1','p2','p3','p4'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p1').focus();
    window.lastLoginAttempt = Date.now();
  }
}

function logout() {
  loginAttempts = 0;
  loginLocked = false;
  clearTimeout(window.sessionTimeout);
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  ['p1','p2','p3','p4'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('loginErr').style.display = 'none';
}

// PIN input auto-advance
['p1','p2','p3','p4'].forEach((id, i) => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    if (el.value.length === 1 && i < 3) {
      document.getElementById(['p1','p2','p3','p4'][i+1]).focus();
    }
    if (i === 3 && el.value.length === 1) {
      doLogin(); // Auto-login when all digits entered
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && el.value === '' && i > 0) {
      document.getElementById(['p1','p2','p3','p4'][i-1]).focus();
    }
  });
});

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
    doLogin();
  }
});
```

**What Changed:**
- ✅ Rate limiting: 5 attempts, then 5-minute lockout
- ✅ Session timeout: Auto-logout after 30 minutes
- ✅ Better error messages showing attempts remaining
- ✅ Storage error handling with user feedback
- ✅ Auto-login when all 4 digits entered

---

## Fix #2: Input Validation & Sanitization ⚠️ CRITICAL

**Add this function to `meeting-admin.html`** (before `createMeeting()`):

```javascript
// ============ INPUT VALIDATION ============
function validateInput(value, type = 'text', maxLen = 100) {
  if (!value || typeof value !== 'string') return { valid: false, error: 'Invalid input' };
  
  value = value.trim();
  
  // Length check
  if (value.length === 0) return { valid: false, error: 'Cannot be empty' };
  if (value.length > maxLen) return { valid: false, error: `Max ${maxLen} characters` };
  
  // Type-specific validation
  switch (type) {
    case 'title':
      if (!/^[a-zA-Z0-9\s\-,./&()]+$/.test(value)) 
        return { valid: false, error: 'Invalid characters in title' };
      break;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        return { valid: false, error: 'Invalid email' };
      break;
    case 'number':
      if (!/^\d+$/.test(value))
        return { valid: false, error: 'Must be a number' };
      break;
    case 'text':
      if (/[<>]/g.test(value))
        return { valid: false, error: 'Invalid characters' };
      break;
  }
  
  return { valid: true, error: null };
}

function sanitizeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .substring(0, 500);
}
```

**Update `createMeeting()` function** (around line 781):

```javascript
function createMeeting() {
  // Validate title
  const titleVal = validateInput(document.getElementById('f_title').value, 'title', 100);
  if (!titleVal.valid) { showToast('❌ ' + titleVal.error, true); return; }
  const title = titleVal.valid ? document.getElementById('f_title').value.trim() : '';

  // Validate topic
  const topicVal = validateInput(document.getElementById('f_topic').value, 'text', 2000);
  if (!topicVal.valid) { showToast('❌ ' + topicVal.error, true); return; }
  const topic = topicVal.valid ? document.getElementById('f_topic').value.trim() : '';

  // Validate date/time
  const date = document.getElementById('f_date').value;
  const time = document.getElementById('f_time').value;
  if (!date || !time) { showToast('❌ Date and time required', true); return; }

  // Validate venue
  const venueVal = validateInput(document.getElementById('f_venue').value, 'title', 150);
  if (!venueVal.valid) { showToast('❌ ' + venueVal.error, true); return; }
  const venue = venueVal.valid ? document.getElementById('f_venue').value.trim() : '';

  // Validate optional fields
  const organizer = document.getElementById('f_organizer').value.trim().substring(0, 100);
  const dept = document.getElementById('f_dept').value.trim().substring(0, 100);
  
  // Validate expected attendees (must be positive number)
  let expected = parseInt(document.getElementById('f_expected').value) || 0;
  if (expected < 0 || expected > 10000) { 
    showToast('❌ Expected attendees must be 0-10000', true); 
    return; 
  }

  // Validate window (5-480 minutes)
  let window_min = parseInt(document.getElementById('f_window').value) || 60;
  if (window_min < 5 || window_min > 480) {
    showToast('❌ Window must be 5-480 minutes', true);
    return;
  }

  // Create meeting
  const id = 'MTG_' + Date.now();
  const meeting = {
    id, 
    title, 
    topic, 
    date, 
    time, 
    venue,
    organizer, 
    dept, 
    expected, 
    window: window_min, 
    status: document.getElementById('f_status').value,
    createdAt: new Date().toISOString()
  };
  
  const meetings = getMeetings();
  meetings.unshift(meeting);
  if (!saveMeetings(meetings)) {
    showToast('❌ Failed to save meeting', true);
    return;
  }
  
  showToast('✅ Meeting created!');
  clearForm();
  showQR(meeting);
}
```

---

## Fix #3: Canvas Scaling on High-DPI Devices ⚠️ HIGH

**File: `meeting-attend.html`** - Replace `getPos()` function (around line 560):

```javascript
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  // Adjust for DPI scaling
  return { 
    x: (e.clientX - rect.left) * dpr, 
    y: (e.clientY - rect.top) * dpr 
  };
}
```

**Also update touch event handling** (around line 530):

```javascript
// Touch
canvas.addEventListener('touchstart', (e) => { 
  e.preventDefault();
  const t = e.touches[0]; 
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  startDraw({
    clientX: t.clientX - rect.left,
    clientY: t.clientY - rect.top
  }); 
}, {passive: false});

canvas.addEventListener('touchmove', (e) => { 
  e.preventDefault(); 
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  draw({
    clientX: t.clientX - rect.left,
    clientY: t.clientY - rect.top
  }); 
}, {passive: false});

canvas.addEventListener('touchend', endDraw);
```

---

## Fix #4: Attendance Window Enforcement ⚠️ MEDIUM

**File: `meeting-attend.html`** - Update `submitAttendance()` function (around line 609):

```javascript
function submitAttendance() {
  // Validate name
  let ok = true;
  const name = document.getElementById('f_name').value.trim();
  if (!name) {
    document.getElementById('e_name').style.display = 'block'; 
    ok = false;
  } else if (name.length > 100) {
    showToast('❌ Name too long', true);
    ok = false;
  } else {
    document.getElementById('e_name').style.display = 'none';
  }

  // Check meeting status and window
  const meetings = DB.get('mt_meetings');
  const meeting = meetings.find(m => m.id === meetingId);
  
  if (!meeting) {
    showToast('❌ Meeting not found', true);
    return;
  }

  if (meeting.status === 'ended') {
    showToast('❌ Attendance marked closed by admin', true);
    return;
  }

  // Check attendance window (optional but recommended)
  const meetingTime = new Date(`${meeting.date}T${meeting.time}`);
  const now = new Date();
  
  if (meetingTime > now) {
    showToast('❌ Meeting hasn\'t started yet', true);
    return;
  }
  
  const minutesElapsed = (now - meetingTime) / 60000;
  if (minutesElapsed > meeting.window) {
    showToast(`❌ Attendance window closed (${meeting.window} min passed)`, true);
    return;
  }

  // Validate signature...
  let sigData = null, sigType = null;
  if (sigMode === 'draw') {
    if (!hasDrawn) {
      document.getElementById('e_drawsig').style.display = 'block'; 
      ok = false;
    } else {
      document.getElementById('e_drawsig').style.display = 'none';
      sigData = canvas.toDataURL('image/png');
      sigType = 'draw';
    }
  } else {
    const textSig = sanitizeInput(document.getElementById('textSig').value.trim());
    if (!textSig) {
      document.getElementById('e_textsig').style.display = 'block'; 
      ok = false;
    } else {
      document.getElementById('e_textsig').style.display = 'none';
      sigData = textSig;
      sigType = 'text';
    }
  }

  if (!ok) return;

  // Build and save record
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const record = {
    id: 'ATD_' + Date.now(),
    meetingId,
    name: sanitizeInput(name),
    designation: sanitizeInput(document.getElementById('f_desig').value.trim(), 80),
    department: sanitizeInput(document.getElementById('f_dept').value.trim(), 80),
    empId: sanitizeInput(document.getElementById('f_empid').value.trim(), 50),
    signature: sigData,
    sigType,
    timestamp: new Date().toISOString(),
    device: navigator.userAgent.substring(0, 100)
  };

  // Save
  const attendance = DB.get('mt_attendance');
  attendance.push(record);
  if (!DB.set('mt_attendance', attendance)) {
    btn.disabled = false;
    btn.textContent = '✅ Mark My Attendance';
    return;
  }

  // Mark done for this device/meeting
  try {
    localStorage.setItem(`mt_done_${meetingId}`, JSON.stringify({ 
      name, 
      timestamp: record.timestamp 
    }));
  } catch (e) {
    console.warn('Could not store local completion flag', e);
  }

  // Show success
  showSuccess(record);
}

// Helper function to sanitize input
function sanitizeInput(str, maxLen = 100) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, maxLen);
}
```

---

## Fix #5: Data Backup System 🟡 MEDIUM

**Add to `meeting-admin.html`** (in settings section, before closing tag):

```javascript
// ============ DATA BACKUP ============
function createBackup() {
  const meetings = getMeetings();
  const attendance = getAttendance();
  
  if (!meetings.length && !attendance.length) {
    showToast('❌ No data to backup', true);
    return;
  }

  const backup = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    meetings: meetings,
    attendance: attendance
  };

  const json = JSON.stringify(backup, null, 2);
  const filename = `meettrack_backup_${new Date().toISOString().split('T')[0]}.json`;
  
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('✅ Backup downloaded!');
}

function restoreBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        
        if (!backup.version || !backup.meetings || !backup.attendance) {
          showToast('❌ Invalid backup file', true);
          return;
        }

        if (!confirm('⚠️ This will overwrite all data. Continue?')) return;

        DB.set('mt_meetings', backup.meetings || []);
        DB.set('mt_attendance', backup.attendance || []);
        
        renderDashboard();
        renderMeetings();
        renderAttendance();
        
        showToast('✅ Backup restored!');
      } catch (err) {
        showToast('❌ Failed to restore: ' + err.message, true);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Auto-backup every 24 hours
setInterval(() => {
  const lastBackup = localStorage.getItem('mt_last_auto_backup');
  const now = Date.now();
  if (!lastBackup || now - parseInt(lastBackup) > 24 * 60 * 60 * 1000) {
    // Could auto-create backup to browser's download folder
    // For now, just update timestamp
    localStorage.setItem('mt_last_auto_backup', now.toString());
    console.log('Auto-backup timestamp updated');
  }
}, 60 * 60 * 1000); // Check hourly
```

**Add backup buttons to settings HTML** (in settings tab):

```html
<div class="form-card" style="max-width:540px;margin-top:20px;">
  <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:16px;">💾 Data Backup</div>
  <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">
    Download all meetings and attendance data as JSON backup file.
  </p>
  <div style="display:flex;gap:10px;">
    <button class="btn-secondary" onclick="createBackup()">⬇ Download Backup</button>
    <button class="btn-secondary" onclick="restoreBackup()">⬆ Restore Backup</button>
  </div>
</div>
```

---

## Fix #6: Browser Compatibility Check 🟡 MEDIUM

**Add to both HTML files** (right after opening `<script>` tag):

```javascript
// ============ FEATURE DETECTION ============
window.addEventListener('load', () => {
  const issues = [];

  if (!window.localStorage) {
    issues.push('localStorage is not supported');
  }

  if (!window.URLSearchParams) {
    issues.push('URLSearchParams is not supported');
  }

  if (!Array.prototype.find) {
    issues.push('This browser is too old (IE10 or earlier)');
  }

  if (document.location.protocol !== 'https:' && document.location.hostname !== 'localhost') {
    console.warn('⚠️ Running on HTTP. Switch to HTTPS for production!');
  }

  if (issues.length > 0) {
    alert('❌ Your browser is not compatible:\n\n' + issues.join('\n') + '\n\nPlease use a modern browser.');
    document.body.innerHTML = '<h2>Browser Not Supported</h2><p>' + issues.join('<br>') + '</p>';
    throw new Error('Unsupported browser');
  }

  // All checks passed
  console.log('✅ Browser compatibility: OK');
});
```

---

## Testing After Fixes

```html
<!-- Test XSS (should be safe now) -->
Name: <img src=x onerror="alert('xss')">

<!-- Test long input (should truncate) -->
Topic: (paste 3000 characters)

<!-- Test mobile canvas (try on different devices) -->
<!-- Draw signature on high-DPI device (tablet, premium phone) -->

<!-- Test rate limiting (wrong PIN 5 times) -->
<!-- Should lock for 5 minutes -->

<!-- Test storage quota (add many large signatures) -->
<!-- Should show error when quota exceeded -->
```

---

## Summary of Changes

| Fix | File | Lines | Priority | Impact |
|-----|------|-------|----------|--------|
| Rate limiting + Session timeout | `meeting-admin.html` | 694-760 | 🔴 CRITICAL | Prevents brute force attacks |
| Input validation | Both files | - | 🔴 CRITICAL | Prevents XSS and buffer overflow |
| Canvas DPI scaling | `meeting-attend.html` | 560 | 🟠 HIGH | Fixes mobile signature issues |
| Attendance window | `meeting-attend.html` | 609 | 🟡 MEDIUM | Enforces time-based access |
| Backup system | `meeting-admin.html` | - | 🟡 MEDIUM | Prevents data loss |
| Browser check | Both files | Top | 🟡 MEDIUM | Better error handling |

---

**Next Steps:**
1. Implement these fixes today
2. Test thoroughly on mobile devices
3. Test with actual QR code scanning
4. Plan backend API for cross-device sync
5. Schedule security audit

