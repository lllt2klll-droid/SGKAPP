#!/usr/bin/env node
/**
 * Tạo bản desktop chạy được khi Windows bật Smart App Control.
 *
 * Vì sao cần cách này: Smart App Control chặn mọi file .exe chưa ký, kể cả
 * bộ cài/portable do electron-builder tạo (electron-builder phải sửa exe để gắn
 * icon + asar integrity → mất chữ ký gốc của Electron). Cách duy nhất còn chạy
 * được là dùng đúng electron.exe NGUYÊN BẢN (Windows đã biết) và để mã ứng dụng
 * trong resources/app.asar.
 *
 * Kết quả: thư mục "SGK Desktop" ở thư mục gốc dự án — nhấn đúp
 * "SGK Desktop\SGK Teacher Workspace.exe" là mở app, đầy đủ tính năng gồm
 * liên kết PDF gốc.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..");
const winUnpacked = path.join(appDir, "release", "windows", "win-unpacked");
const targetDir = path.join(repoRoot, "SGK Desktop");
const pristineElectron = path.join(appDir, "node_modules", "electron", "dist", "electron.exe");

function run(command, args) {
  execFileSync(command, args, { cwd: appDir, stdio: "inherit", shell: true });
}

if (!fs.existsSync(pristineElectron)) {
  console.error("[LOI] Khong tim thay node_modules/electron/dist/electron.exe. Hay chay: npm install");
  process.exit(1);
}

console.log("[1/4] Build giao dien...");
run("npm", ["run", "build"]);

console.log("[2/4] Dong goi thu muc ung dung...");
run("npx", ["electron-builder", "--win", "dir"]);

if (!fs.existsSync(winUnpacked)) {
  console.error("[LOI] Khong thay release/windows/win-unpacked sau khi dong goi.");
  process.exit(1);
}

console.log("[3/4] Thay exe da bi chinh sua bang electron.exe nguyen ban...");
const appExe = path.join(winUnpacked, "SGK Teacher Workspace.exe");
fs.copyFileSync(pristineElectron, appExe);

console.log("[4/4] Chuyen sang thu muc goc...");
fs.rmSync(targetDir, { recursive: true, force: true });
fs.renameSync(winUnpacked, targetDir);

console.log(`\nXong: ${path.join(targetDir, "SGK Teacher Workspace.exe")}`);
console.log("Thu muc SGK Desktop phai duoc giu nguyen (khong tach roi cac file .dll).");
