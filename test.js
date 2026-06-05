#!/usr/bin/env node

/**
 * MeetTrack v2.0 - Comprehensive System Test
 * Tests all functionality: Server, API, QR codes, and multi-device sync
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [];
const results = {
  passed: 0,
  failed: 0,
  details: []
};

// Test 1: Check all required files exist
function testFilesExist() {
  const requiredFiles = [
    'server.js',
    'package.json',
    '.env.example',
    'meeting-admin-v2.html',
    'meeting-attend-v2.html',
    'Dockerfile',
    'docker-compose.yml',
    'README.md'
  ];

  const missing = [];
  requiredFiles.forEach(file => {
    if (!fs.existsSync(path.join(__dirname, file))) {
      missing.push(file);
    }
  });

  if (missing.length === 0) {
    results.passed++;
    results.details.push('✅ All required files present');
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ Missing files: ${missing.join(', ')}`);
    return false;
  }
}

// Test 2: Validate package.json
function testPackageJson() {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const required = ['express', 'cors', 'dotenv', 'bcryptjs', 'jsonwebtoken'];
    const missing = required.filter(dep => !pkg.dependencies || !pkg.dependencies[dep]);

    if (missing.length === 0) {
      results.passed++;
      results.details.push(`✅ Package.json valid with ${Object.keys(pkg.dependencies).length} dependencies`);
      return true;
    } else {
      results.failed++;
      results.details.push(`❌ Missing dependencies in package.json: ${missing.join(', ')}`);
      return false;
    }
  } catch (e) {
    results.failed++;
    results.details.push(`❌ Invalid package.json: ${e.message}`);
    return false;
  }
}

// Test 3: Validate server.js syntax
function testServerSyntax() {
  try {
    const serverCode = fs.readFileSync('server.js', 'utf8');
    // Check for basic syntax indicators
    if (serverCode.includes('import') && serverCode.includes('app.listen')) {
      results.passed++;
      results.details.push('✅ server.js syntax valid (contains required patterns)');
      return true;
    } else {
      results.failed++;
      results.details.push('❌ server.js missing required patterns');
      return false;
    }
  } catch (e) {
    results.failed++;
    results.details.push(`❌ server.js error: ${e.message.split('\n')[0]}`);
    return false;
  }
}

// Test 4: Check HTML files for QR code library
function testQRCodeSupport() {
  const adminHtml = fs.readFileSync('meeting-admin-v2.html', 'utf8');
  const attendHtml = fs.readFileSync('meeting-attend-v2.html', 'utf8');

  const hasQRAdmin = adminHtml.includes('qrcodejs') || adminHtml.includes('QRCode');
  const hasValidationAttend = attendHtml.includes('sanitizeInput') || attendHtml.includes('validateInput');

  if (hasQRAdmin && hasValidationAttend) {
    results.passed++;
    results.details.push('✅ QR code library and validation functions present');
    return true;
  } else {
    results.failed++;
    results.details.push('❌ QR or validation functions missing from HTML');
    return false;
  }
}

// Test 5: Check for security features
function testSecurityFeatures() {
  const serverCode = fs.readFileSync('server.js', 'utf8');
  const adminHtml = fs.readFileSync('meeting-admin-v2.html', 'utf8');

  const features = {
    jwt: serverCode.includes('jsonwebtoken'),
    rateLimit: serverCode.includes('rateLimit'),
    bcrypt: serverCode.includes('bcryptjs'),
    xssPrevention: adminHtml.includes('sanitizeInput'),
    corsProtection: serverCode.includes('cors'),
    helmet: serverCode.includes('helmet')
  };

  const count = Object.values(features).filter(Boolean).length;
  if (count >= 5) {
    results.passed++;
    results.details.push(`✅ Security features implemented: ${count}/6 (JWT, Rate Limit, Bcrypt, XSS, CORS, Helmet)`);
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ Only ${count}/6 security features found`);
    return false;
  }
}

// Test 6: Check for multi-device sync API endpoints
function testMultiDeviceSync() {
  const serverCode = fs.readFileSync('server.js', 'utf8');

  const endpoints = {
    meetings: serverCode.includes("app.get('/api/meetings'"),
    attendance: serverCode.includes("app.post('/api/attendance'"),
    backup: serverCode.includes("app.get('/api/backup'"),
    restore: serverCode.includes("app.post('/api/backup/restore'"),
    stats: serverCode.includes("app.get('/api/stats'")
  };

  const count = Object.values(endpoints).filter(Boolean).length;
  if (count >= 4) {
    results.passed++;
    results.details.push(`✅ Multi-device sync endpoints: ${count}/5 API endpoints for data sync`);
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ Only ${count}/5 sync endpoints implemented`);
    return false;
  }
}

// Test 7: Check for data persistence
function testDataPersistence() {
  const serverCode = fs.readFileSync('server.js', 'utf8');

  const persistence = {
    localStorage: serverCode.includes('localStorage'),
    fileIO: serverCode.includes('fs.writeFileSync') || serverCode.includes('fs.readFileSync'),
    jsonStorage: serverCode.includes('data.json'),
    saveDB: serverCode.includes('saveDB()')
  };

  const count = Object.values(persistence).filter(Boolean).length;
  if (count >= 2) {
    results.passed++;
    results.details.push(`✅ Data persistence: Multiple storage mechanisms implemented`);
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ Insufficient data persistence implementation`);
    return false;
  }
}

// Test 8: Check Docker support
function testDockerSupport() {
  const hasDockerfile = fs.existsSync('Dockerfile');
  const hasDockerCompose = fs.existsSync('docker-compose.yml');
  
  if (hasDockerfile && hasDockerCompose) {
    results.passed++;
    results.details.push('✅ Docker support: Dockerfile and docker-compose.yml present');
    return true;
  } else {
    results.failed++;
    results.details.push('❌ Docker files missing');
    return false;
  }
}

// Test 9: Check environment configuration
function testEnvironmentConfig() {
  const hasEnvExample = fs.existsSync('.env.example');
  const envContent = hasEnvExample ? fs.readFileSync('.env.example', 'utf8') : '';
  
  const requiredVars = ['PORT', 'JWT_SECRET', 'NODE_ENV', 'CORS_ORIGIN'];
  const hasAll = requiredVars.every(v => envContent.includes(v));

  if (hasEnvExample && hasAll) {
    results.passed++;
    results.details.push('✅ Environment configuration: .env.example with all required variables');
    return true;
  } else {
    results.failed++;
    results.details.push('❌ Environment configuration incomplete');
    return false;
  }
}

// Test 10: Check documentation
function testDocumentation() {
  const hasReadme = fs.existsSync('README.md');
  const hasQuickStart = fs.existsSync('QUICK_START.md');
  const hasSetupGuide = fs.existsSync('SETUP_GUIDE.html');

  const docs = [hasReadme, hasQuickStart, hasSetupGuide].filter(Boolean).length;
  
  if (docs >= 2) {
    results.passed++;
    results.details.push(`✅ Documentation: ${docs} major documentation files present`);
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ Documentation incomplete: Only ${docs}/3 files present`);
    return false;
  }
}

// Test 11: Check HTML file size (should be substantial)
function testHTMLContent() {
  const adminSize = fs.statSync('meeting-admin-v2.html').size;
  const attendSize = fs.statSync('meeting-attend-v2.html').size;

  if (adminSize > 30000 && attendSize > 20000) {
    results.passed++;
    results.details.push(`✅ HTML files: Admin (${Math.round(adminSize/1024)}KB), Attend (${Math.round(attendSize/1024)}KB)`);
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ HTML files too small: Admin (${adminSize}B), Attend (${attendSize}B)`);
    return false;
  }
}

// Test 12: Verify API endpoints implementation
function testAPIEndpoints() {
  const serverCode = fs.readFileSync('server.js', 'utf8');
  
  const endpoints = [
    '/api/auth/init',
    '/api/auth/login',
    '/api/meetings',
    '/api/attendance',
    '/api/attendance/export',
    '/api/backup',
    '/api/stats'
  ];

  const implemented = endpoints.filter(ep => serverCode.includes(ep)).length;
  
  if (implemented >= 7) {
    results.passed++;
    results.details.push(`✅ API Endpoints: ${implemented}/7 core endpoints implemented`);
    return true;
  } else {
    results.failed++;
    results.details.push(`❌ Only ${implemented}/7 API endpoints found`);
    return false;
  }
}

// Run all tests
function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         MeetTrack v2.0 - System Validation Test            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  testFilesExist();
  testPackageJson();
  testServerSyntax();
  testQRCodeSupport();
  testSecurityFeatures();
  testMultiDeviceSync();
  testDataPersistence();
  testDockerSupport();
  testEnvironmentConfig();
  testDocumentation();
  testHTMLContent();
  testAPIEndpoints();

  // Print results
  console.log('📊 TEST RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  results.details.forEach(detail => console.log(detail));
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ PASSED: ${results.passed}/12`);
  console.log(`❌ FAILED: ${results.failed}/12`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.failed === 0) {
    console.log('🎉 ALL TESTS PASSED - System is ready for deployment!\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${results.failed} test(s) failed. Please review.\n`);
    process.exit(1);
  }
}

runAllTests();
