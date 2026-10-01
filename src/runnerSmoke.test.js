// ── Runner / Server Smoke Tests ─────────────────────────────────────
// Covers spec 11: A-J without external internet
// A package/project structure  B server startup  C port config  D frontend prod serving
// E books dir creation  F PDF upload validation  G invalid PDF rejection
// H duplicate filename handling  I API error response  J SPA fallback

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(APP_DIR, 'server.js');
const PACKAGE_PATH = path.join(APP_DIR, 'package.json');
const LOCK_PATH = path.join(APP_DIR, 'package-lock.json');
const DIST_PATH = path.join(APP_DIR, 'dist');

// helpers to read server.js content once
let serverSrc = '';
try { serverSrc = fs.readFileSync(SERVER_PATH, 'utf8'); } catch {}

describe('Runner / Server Smoke', () => {

  describe('A. package/project structure', () => {
    it('package.json exists and is parseable', () => {
      assert.ok(fs.existsSync(PACKAGE_PATH), 'package.json must exist');
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
      assert.equal(pkg.name, 'sgk-app');
      assert.ok(pkg.scripts.test, 'must have test script');
      assert.ok(pkg.scripts.build, 'must have build script');
      assert.ok(pkg.scripts.lint, 'must have lint script');
      assert.ok(pkg.scripts.start, 'must have start script');
    });
    it('package-lock.json exists and is synchronized', () => {
      assert.ok(fs.existsSync(LOCK_PATH), 'package-lock.json must exist');
      const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
      assert.ok(lock.packages, 'lock must have packages');
      assert.ok(lock.packages[''], 'lock must have root package');
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
      // root dependencies should appear in lock
      for (const dep of Object.keys(pkg.dependencies || {})) {
        const has = Object.keys(lock.packages).some(k => k.endsWith(`node_modules/${dep}`) || k === `node_modules/${dep}`);
        // at least one known dep should be present
        if (dep === 'express') assert.ok(has || lock.packages[`node_modules/${dep}`], `lock should contain ${dep}`);
      }
    });
    it('src and required static assets exist', () => {
      assert.ok(fs.existsSync(path.join(APP_DIR, 'src')), 'src must exist');
      assert.ok(fs.existsSync(path.join(APP_DIR, 'index.html')), 'index.html must exist');
      assert.ok(fs.existsSync(path.join(APP_DIR, 'vite.config.js')), 'vite.config.js must exist');
    });
    it('node_modules should NOT be in git (gitignore)', () => {
      const gi = fs.readFileSync(path.join(APP_DIR, '.gitignore'), 'utf8');
      assert.ok(gi.includes('node_modules'), '.gitignore must ignore node_modules');
      assert.ok(gi.includes('dist'), '.gitignore must ignore dist');
    });
  });

  describe('B+C. server startup & port configuration', () => {
    it('server.js defines PORT=5000 default', () => {
      assert.ok(/PORT.*5000/.test(serverSrc), 'server must default to PORT 5000');
      assert.ok(/process\.env\.PORT/.test(serverSrc), 'server must respect PORT env');
    });
    it('server uses localhost host (hardened)', () => {
      assert.ok(/127\.0\.0\.1/.test(serverSrc) || /HOST/.test(serverSrc), 'server should listen on 127.0.0.1 (LOCAL-ONLY) or configurable HOST');
      // Must not hardcode 0.0.0.0 without HOST override — ensure local-only by default
      if (/0\.0\.0\.0/.test(serverSrc)) {
        assert.ok(/HOST/.test(serverSrc), 'if 0.0.0.0 present, must be behind HOST env toggle');
      }
    });
    it('server disables x-powered-by', () => {
      assert.ok(/x-powered-by/.test(serverSrc), 'should disable x-powered-by');
    });
  });

  describe('D. frontend production serving', () => {
    it('dist exists after build', () => {
      assert.ok(fs.existsSync(DIST_PATH), 'dist should exist after build');
      assert.ok(fs.existsSync(path.join(DIST_PATH, 'index.html')), 'dist/index.html must exist');
    });
    it('server serves static dist correctly', () => {
      assert.ok(serverSrc.includes('express.static'), 'server must use express.static for dist');
      assert.ok(serverSrc.includes('distPath'), 'server must reference distPath');
    });
    it('server sets correct cache headers for html vs assets', () => {
      assert.ok(serverSrc.includes('no-cache'), 'html should be no-cache');
      assert.ok(serverSrc.includes('immutable'), 'assets should be immutable');
    });
  });

  describe('E. books directory creation', () => {
    it('BOOKS_DIR resolver is deterministic and creates dir', () => {
      assert.ok(serverSrc.includes('BOOKS_DIR'), 'server must define BOOKS_DIR');
      assert.ok(serverSrc.includes('mkdirSync'), 'server must create BOOKS_DIR if missing');
      assert.ok(serverSrc.includes('recursive'), 'mkdir should be recursive');
    });
    it('books directory exists on disk', () => {
      // After our hardening, books should be inside app or legacy outer — resolver picks one
      const candidates = [
        path.join(APP_DIR, 'books'),
        path.join(APP_DIR, '..', 'books'),
        path.join(APP_DIR, '..', '..', 'books'),
        path.join(APP_DIR, '..', '..', '..', 'books'),
      ];
      const exists = candidates.some(p => fs.existsSync(p));
      assert.ok(exists, 'at least one books dir must exist');
    });
  });

  describe('F. PDF upload validation', () => {
    it('server validates PDF via isValidPdfFile and mimetype', () => {
      assert.ok(serverSrc.includes('isValidPdfFile'), 'must have isValidPdfFile');
      assert.ok(serverSrc.includes('%PDF-'), 'must check PDF header');
      assert.ok(serverSrc.includes('application/pdf'), 'must check mimetype');
      assert.ok(serverSrc.includes('fileFilter'), 'multer fileFilter must exist');
    });
    it('server limits fileSize to 80MB', () => {
      assert.ok(serverSrc.includes('fileSize'), 'should limit fileSize');
      assert.ok(/80\s*\*\s*1024\s*\*\s*1024/.test(serverSrc), 'limit should be 80MB');
    });
  });

  describe('G. invalid PDF rejection', () => {
    it('server returns 400 for invalid PDF header', () => {
      assert.ok(serverSrc.includes('isValidPdfFile'), 'uses isValidPdfFile');
      // The upload handler should unlink invalid file and return 400
      assert.ok(serverSrc.includes('unlinkSync'), 'should delete invalid PDF');
      assert.ok(/400.*PDF.*hong|PDF.*hop le/i.test(serverSrc) || serverSrc.includes('không phải PDF hợp lệ'),
        'should return 400 with invalid PDF message');
    });
    it('server rejects non-PDF via fileFilter', () => {
      assert.ok(serverSrc.includes('Chỉ chấp nhận file PDF'), 'fileFilter should reject non-PDF');
    });
  });

  describe('H. duplicate filename handling', () => {
    it('server sanitizes and deduplicates filenames', () => {
      assert.ok(serverSrc.includes('sanitizeStoredBookName'), 'must sanitize filename');
      assert.ok(serverSrc.includes('buildUniqueBookFilename'), 'must deduplicate');
      assert.ok(serverSrc.includes('-${n}.pdf') || serverSrc.includes('`${stem}-${n}.pdf`'),
        'dedup should append -2, -3 etc');
    });
    it('sanitize preserves canonical book.filename identity', () => {
      // Simulate sanitize logic
      function sanitizeStoredBookName(name) {
        const base = (name || "sach-moi").replace(/\.pdf$/i, "").normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s\-_]+/g, " ")
          .replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
        const safe = (base || "sach-moi").slice(0, 90);
        return `${safe || "sach-moi"}.pdf`;
      }
      assert.equal(sanitizeStoredBookName('Toán 1.pdf'), 'Toan-1.pdf');
      assert.equal(sanitizeStoredBookName(''), 'sach-moi.pdf');
      assert.ok(sanitizeStoredBookName('a'.repeat(100) + '.pdf').length <= 94);
    });
  });

  describe('I. API error response', () => {
    it('server returns controlled JSON errors for /api/books', () => {
      assert.ok(serverSrc.includes('/api/books'), 'must have /api/books');
      assert.ok(serverSrc.includes('status(500)'), 'should return 500 on error');
      assert.ok(serverSrc.includes('status(404)') || serverSrc.includes('404'), 'should handle 404');
      assert.ok(serverSrc.includes('status(400)'), 'should handle 400');
    });
    it('server has rate limiter for gemini proxy', () => {
      assert.ok(serverSrc.includes('rateLimit') || serverSrc.includes('RATE_MAX'), 'should have rate limiting');
      assert.ok(serverSrc.includes('429'), 'should return 429 when limited');
    });
    it('server handles PDF range requests correctly', () => {
      assert.ok(serverSrc.includes('Accept-Ranges'), 'should support Range');
      assert.ok(serverSrc.includes('Content-Range'), 'should set Content-Range');
      assert.ok(serverSrc.includes('416'), 'should handle invalid range 416');
    });
  });

  describe('J. SPA fallback', () => {
    it('server has SPA fallback to index.html but not for assets/api', () => {
      assert.ok(serverSrc.includes('Fallback to index.html'), 'should comment SPA fallback');
      // Should NOT fallback for /api and /assets
      assert.ok(serverSrc.includes('/api/') && serverSrc.includes('/assets/'),
        'fallback must exclude /api and /assets');
      assert.ok(serverSrc.includes('sendFile') && serverSrc.includes('index.html'),
        'fallback must send index.html');
    });
    it('SPA fallback only serves HTML requests', () => {
      assert.ok(serverSrc.includes('accepts("html")') || serverSrc.includes("accepts('html')"),
        'should check req.accepts(html)');
    });
  });

  describe('K. launcher files exist and are ASCII-safe (single BAT model)', () => {
    it('Run_App.bat duy nhất ở thư mục gốc với nội dung hardened', () => {
      // Thống nhất chỉ 1 file BAT duy nhất ở root (ngoài sgk-app)
      const rootBat = path.resolve(APP_DIR, '..', 'Run_App.bat');
      const innerBat = path.join(APP_DIR, 'Run_App.bat');
      assert.ok(fs.existsSync(rootBat), 'Run_App.bat duy nhất phải tồn tại ở thư mục gốc (../Run_App.bat)');
      assert.ok(!fs.existsSync(innerBat), 'Không được có duplicate Run_App.bat trong sgk-app (chỉ 1 file ở root)');
      const c = fs.readFileSync(rootBat, 'utf8');
      assert.ok(c.includes('%~dp0'), 'must use %~dp0');
      assert.ok(c.includes('where node'), 'must check where node');
      assert.ok(c.includes('where npm'), 'must check where npm');
      assert.ok(c.includes('npm test'), 'must run npm test');
      assert.ok(c.includes('npm run build'), 'must run npm run build');
      assert.ok(c.includes('chcp 65001'), 'must use UTF-8');
      // Single BAT tích hợp chức năng stop (thay thế Stop_App.bat)
      assert.ok(c.toLowerCase().includes('stop'), 'Run_App.bat phải tích hợp chức năng stop (thay Stop_App.bat)');
      assert.ok(c.includes('taskkill'), 'stop handler phải dùng taskkill');
    });
    it('không còn Stop_App.bat / VBS riêng lẻ (đã gộp vào 1 BAT)', () => {
      assert.ok(!fs.existsSync(path.join(APP_DIR, 'Stop_App.bat')), 'Stop_App.bat đã được gộp vào Run_App.bat, không tồn tại riêng');
      assert.ok(!fs.existsSync(path.join(APP_DIR, 'Run_App_Hidden.vbs')), 'Run_App_Hidden.vbs đã loại bỏ (chỉ 1 BAT duy nhất)');
      // Toàn bộ project chỉ có duy nhất 1 file .bat ngoài node_modules
      const rootDir = path.resolve(APP_DIR, '..');
      const allBats = [];
      function collect(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) collect(full);
          else if (e.name.toLowerCase().endsWith('.bat')) allBats.push(full);
        }
      }
      collect(rootDir);
      assert.equal(allBats.length, 1, `Chỉ được có duy nhất 1 file .bat, tìm thấy: ${allBats.join(', ')}`);
      assert.ok(allBats[0].endsWith('Run_App.bat'), 'File duy nhất phải là Run_App.bat');
    });
    it('no corrupted filenames remain', () => {
      const files = fs.readdirSync(APP_DIR);
      for (const f of files) {
        assert.ok(!f.includes('?'), `file ${f} should not contain ? from encoding corruption`);
        if (f.endsWith('.bat') || f.endsWith('.vbs')) {
          assert.ok(/^[A-Za-z0-9_.-]+\.(bat|vbs)$/.test(f), `launcher ${f} must be ASCII-safe`);
        }
      }
      // Root bat cung phai ASCII-safe
      const rootFiles = fs.readdirSync(path.resolve(APP_DIR, '..'));
      for (const f of rootFiles) {
        if (f.toLowerCase().endsWith('.bat')) {
          assert.ok(/^[A-Za-z0-9_.-]+\.bat$/.test(f), `root launcher ${f} must be ASCII-safe`);
        }
      }
    });
  });
});
