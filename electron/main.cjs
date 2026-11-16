const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { execFile, spawn } = require("node:child_process");
const { autoUpdater } = require("electron-updater");

const PRODUCT_NAME = "SGK Teacher Workspace";
const SERVICE_ID = "sgk-teacher-workspace";
const appDataDir = path.join(app.getPath("appData"), PRODUCT_NAME);
app.setName(PRODUCT_NAME);
app.setPath("userData", appDataDir);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow;
  let backendServer;
  let backendPort = null;
  let isQuitting = false;
  let startupFinished = false;
  let stopInitiated = false;
  let installingUpdate = false;
  let downloadedUpdateVersion = "";
  const supportsAutoUpdate = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
  // Bản Portable: tự tải file .exe mới từ GitHub rồi thay thế file đang chạy.
  // Launcher NSIS portable của electron-builder set 2 biến này trước khi khởi động app.
  const portableExePath = process.env.PORTABLE_EXECUTABLE_FILE || "";
  const supportsPortableUpdate = app.isPackaged
    && Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
    && Boolean(portableExePath);
  // Bản thư mục cục bộ (scripts/build-desktop-folder.mjs): exe là electron.exe
  // nguyên bản nên Smart App Control không chặn. Cập nhật chỉ thay
  // resources/app.asar (tệp dữ liệu) nên bản mới không bao giờ bị SAC chặn.
  const localFolderMarker = path.join(process.resourcesPath, "local-folder-build.json");
  const supportsFolderUpdate = app.isPackaged
    && !process.env.PORTABLE_EXECUTABLE_DIR
    && fs.existsSync(localFolderMarker);
  const supportsFileUpdate = supportsPortableUpdate || supportsFolderUpdate;
  let portableUpdateFile = "";
  let portableInstallStarted = false;

  function sendUpdateStatus(status) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app-update:status", status);
    }
  }

  // Windows gắn Mark-of-the-Web (Zone.Identifier) cho file tải về và SmartScreen
  // sẽ chặn bộ cài chưa ký. Gỡ dấu này trước khi chạy để người dùng không phải
  // bấm "More info → Run anyway".
  function unblockWindowsPath(target) {
    return new Promise((resolve) => {
      if (process.platform !== "win32" || !target) return resolve();
      const literal = String(target).replace(/'/g, "''");
      const script =
        `$p = '${literal}'; ` +
        `if (Test-Path -LiteralPath $p) { ` +
        `Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue | ` +
        `Unblock-File -ErrorAction SilentlyContinue }`;
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true, timeout: 20000 },
        () => resolve(),
      );
    });
  }

  function pendingUpdateDir() {
    try {
      return autoUpdater.downloadedUpdateHelper?.cacheDirForPendingUpdate || "";
    } catch {
      return "";
    }
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  if (supportsAutoUpdate) {
    autoUpdater.on("checking-for-update", () => sendUpdateStatus({ status: "checking" }));
    autoUpdater.on("update-available", (info) => {
      sendUpdateStatus({ status: "available", version: info.version });
    });
    autoUpdater.on("update-not-available", () => {
      sendUpdateStatus({ status: "not-available" });
    });
    autoUpdater.on("download-progress", (progress) => {
      sendUpdateStatus({
        status: "downloading",
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      downloadedUpdateVersion = info.version;
      // Bỏ Mark-of-the-Web ngay sau khi tải để lúc cài không bị SmartScreen chặn.
      unblockWindowsPath(pendingUpdateDir());
      sendUpdateStatus({ status: "downloaded", version: info.version });
    });
    autoUpdater.on("error", (error) => {
      console.error("Could not update the desktop app:", error);
      sendUpdateStatus({ status: "error", message: error.message });
    });
  }

  const REMOTE_MANIFEST_URL = "https://raw.githubusercontent.com/lllt2klll-droid/book-update/main/version.json";
  const RELEASE_TAG_API = "https://api.github.com/repos/lllt2klll-droid/book-update/releases/tags/";

  function compareVersions(a, b) {
    const left = String(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
    const right = String(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      const diff = (left[i] || 0) - (right[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  async function fetchLatestRemoteVersion() {
    const resp = await fetch(REMOTE_MANIFEST_URL, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`Không kiểm tra được bản cập nhật (HTTP ${resp.status}).`);
    const manifest = await resp.json().catch(() => null);
    const version = String(manifest?.version || "");
    if (!version) throw new Error("Không đọc được thông tin phiên bản mới nhất.");
    return version;
  }

  function updateAssetName(version, kind) {
    return kind === "folder"
      ? `SGK.Teacher.Workspace.${version}.asar`
      : `SGK.Teacher.Workspace.Portable.${version}.exe`;
  }

  async function resolveUpdateAsset(version, kind) {
    const assetName = updateAssetName(version, kind);
    const fallbackUrl = `https://github.com/lllt2klll-droid/book-update/releases/download/v${version}/${assetName}`;
    try {
      const resp = await fetch(`${RELEASE_TAG_API}v${version}`, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const release = await resp.json();
        const asset = (release.assets || []).find((item) => item.name === assetName);
        if (asset?.browser_download_url) return { url: asset.browser_download_url, size: asset.size || 0 };
      }
    } catch (error) {
      console.warn("[update] Release API failed, falling back to direct URL:", error?.message);
    }
    return { url: fallbackUrl, size: 0 };
  }

  async function downloadUpdateFile(version, kind) {
    const { url, size: expectedSize } = await resolveUpdateAsset(version, kind);
    const ext = kind === "folder" ? "asar" : "exe";
    const dest = path.join(app.getPath("temp"), `sgk-update-${version}.${ext}`);
    const controller = new AbortController();
    let idleTimer = null;
    const bumpIdle = () => {
      clearTimeout(idleTimer);
      // Mất mạng giữa chừng: ngắt sau 60 giây im lặng thay vì treo vô hạn.
      idleTimer = setTimeout(() => controller.abort(new Error("Mất kết nối khi tải bản cập nhật.")), 60000);
    };
    bumpIdle();
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Tải bản cập nhật thất bại (HTTP ${resp.status}).`);
      const total = Number(resp.headers.get("content-length")) || expectedSize || 0;
      if (!resp.body) throw new Error("Không nhận được dữ liệu bản cập nhật.");
      const handle = await fs.promises.open(dest, "w");
      let transferred = 0;
      let lastEmit = 0;
      try {
        const reader = resp.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bumpIdle();
          if (!value?.length) continue;
          await handle.write(value);
          transferred += value.length;
          const now = Date.now();
          if (now - lastEmit > 250) {
            lastEmit = now;
            sendUpdateStatus({
              status: "downloading",
              percent: total ? Math.min(99.9, (transferred / total) * 100) : 0,
              transferred,
              total,
            });
          }
        }
      } finally {
        clearTimeout(idleTimer);
        await handle.close();
      }
      if (total && transferred !== total) {
        throw new Error(`File tải về không đầy đủ (${transferred}/${total} byte).`);
      }
      const head = Buffer.alloc(16);
      const probe = await fs.promises.open(dest, "r");
      let headLength = 0;
      try {
        headLength = (await probe.read(head, 0, head.length, 0)).bytesRead;
      } finally {
        await probe.close();
      }
      if (kind === "folder") {
        // app.asar: 4 byte đầu là kích thước pickle (nhỏ), 4 byte tiếp là độ dài
        // JSON header (vài trăm KB tới vài MB). Kiểm tra để tránh ghi đè app bằng
        // trang HTML lỗi của GitHub.
        const pickleSize = headLength >= 8 ? head.readUInt32LE(0) : 0;
        const headerSize = headLength >= 8 ? head.readUInt32LE(4) : 0;
        const plausible = pickleSize >= 1
          && pickleSize <= 4096
          && headerSize >= 64
          && headerSize <= 64 * 1024 * 1024
          && transferred > headerSize + 16;
        if (!plausible) {
          throw new Error("File tải về không phải bản cập nhật hợp lệ.");
        }
      } else if (headLength < 2 || head.toString("latin1", 0, 2) !== "MZ") {
        throw new Error("File tải về không phải bản cài đặt hợp lệ.");
      }
      await unblockWindowsPath(dest);
      return dest;
    } catch (error) {
      clearTimeout(idleTimer);
      await fs.promises.unlink(dest).catch(() => {});
      const message = String(error?.message || error);
      const friendly = /^(Tải|File|Mất|mất|Không)/.test(message);
      throw new Error(friendly ? message : `Không tải được bản cập nhật: ${message}`);
    }
  }

  // Thay thế tệp sau khi app đã tắt: một tiến trình PowerShell độc lập
  // (tách khỏi app, sống lâu hơn) chờ tệp hết bị khoá, ghi tệp mới vào
  // "<tệp>.new.tmp" rồi đổi tên đè lên (thay thế gần như nguyên tử — nếu lỗi
  // giữa chừng thì bản cũ vẫn nguyên vẹn), cuối cùng mở lại app.
  // Không killing tiến trình nào để không đụng tới app khác.
  function spawnReplaceHelper({ targetPath, newPath, relaunchPath, workingDir }) {
    const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
    const script = [
      `$target = ${quote(targetPath)}`,
      `$new = ${quote(newPath)}`,
      `$exe = ${quote(relaunchPath)}`,
      `$dir = ${quote(workingDir)}`,
      `$tmp = $target + '.new.tmp'`,
      `$ok = $false`,
      `$deadline = (Get-Date).AddSeconds(120)`,
      `while ((Get-Date) -lt $deadline) {`,
      `  try {`,
      `    Copy-Item -LiteralPath $new -Destination $tmp -Force -ErrorAction Stop`,
      `    Move-Item -LiteralPath $tmp -Destination $target -Force -ErrorAction Stop`,
      `    $ok = $true; break`,
      `  } catch {`,
      `    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue`,
      `    Start-Sleep -Milliseconds 400`,
      `  }`,
      `}`,
      `if ($ok) {`,
      `  Unblock-File -LiteralPath $target -ErrorAction SilentlyContinue`,
      `  Remove-Item -LiteralPath $new -Force -ErrorAction SilentlyContinue`,
      `}`,
      `try { Start-Process -FilePath $exe -WorkingDirectory $dir } catch {}`,
    ].join("\r\n");
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.on("error", (error) => console.error("[update] Could not start the update helper:", error));
    child.unref();
  }

  ipcMain.handle("app-update:check", async () => {
    if (supportsFileUpdate) {
      if (downloadedUpdateVersion) {
        return { supported: true, available: true, downloaded: true, version: downloadedUpdateVersion };
      }
      const latest = await fetchLatestRemoteVersion();
      const available = compareVersions(latest, app.getVersion()) > 0;
      if (available) sendUpdateStatus({ status: "available", version: latest });
      return { supported: true, available, version: latest, mode: supportsFolderUpdate ? "folder" : "portable" };
    }
    if (!supportsAutoUpdate) {
      return {
        supported: false,
        message: app.isPackaged
          ? "Không tìm thấy file ứng dụng để tự cập nhật. Hãy tải bản mới thủ công."
          : "Tự cập nhật chỉ khả dụng trong bản Windows đã đóng gói.",
      };
    }
    if (downloadedUpdateVersion) {
      return { supported: true, available: true, downloaded: true, version: downloadedUpdateVersion };
    }
    const result = await autoUpdater.checkForUpdates();
    return {
      supported: true,
      available: Boolean(result?.isUpdateAvailable),
      version: result?.updateInfo?.version || "",
    };
  });

  ipcMain.handle("app-update:download", async () => {
    if (supportsFileUpdate) {
      const kind = supportsFolderUpdate ? "folder" : "portable";
      if (downloadedUpdateVersion && portableUpdateFile && fs.existsSync(portableUpdateFile)) {
        return portableUpdateFile;
      }
      const latest = await fetchLatestRemoteVersion();
      if (compareVersions(latest, app.getVersion()) <= 0) {
        throw new Error("Bạn đang dùng phiên bản mới nhất.");
      }
      portableUpdateFile = await downloadUpdateFile(latest, kind);
      downloadedUpdateVersion = latest;
      sendUpdateStatus({ status: "downloaded", version: latest });
      return portableUpdateFile;
    }
    if (!supportsAutoUpdate) {
      throw new Error("Tự cập nhật chỉ khả dụng trong bản Windows đã đóng gói.");
    }
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle("app-update:install", async () => {
    if (supportsFileUpdate) {
      if (portableInstallStarted) return { restarting: true };
      if (!downloadedUpdateVersion || !portableUpdateFile) {
        throw new Error("Bản cập nhật chưa được tải xong.");
      }
      if (!fs.existsSync(portableUpdateFile)) {
        throw new Error("File cập nhật không còn tồn tại. Hãy tải lại.");
      }
      portableInstallStarted = true;
      // Tiến trình phụ chờ app tắt hẳn rồi mới đè tệp — thoát app ngay.
      if (supportsFolderUpdate) {
        spawnReplaceHelper({
          targetPath: path.join(process.resourcesPath, "app.asar"),
          newPath: portableUpdateFile,
          relaunchPath: process.execPath,
          workingDir: path.dirname(process.execPath),
        });
      } else {
        spawnReplaceHelper({
          targetPath: portableExePath,
          newPath: portableUpdateFile,
          relaunchPath: portableExePath,
          workingDir: path.dirname(portableExePath),
        });
      }
      app.quit();
      return { restarting: true };
    }
    if (!supportsAutoUpdate) {
      throw new Error("Tự cập nhật chỉ khả dụng trong bản Windows đã đóng gói.");
    }
    if (!downloadedUpdateVersion) {
      throw new Error("Bản cập nhật chưa được tải xong.");
    }
    // Chặn trường hợp file tải lại bị Windows gắn lại Mark-of-the-Web.
    await unblockWindowsPath(pendingUpdateDir());
    installingUpdate = true;
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle("app-update:open-releases", () => (
    shell.openExternal("https://github.com/lllt2klll-droid/book-update/releases")
  ));

  app.on("second-instance", () => {
    // Instance cũ vẫn sống nhưng không có cửa sổ:
    // - Đang khởi động: bỏ qua, cửa sổ sẽ tự xuất hiện sau.
    // - Đang tắt: thoát ngay để giải phóng khoá single-instance.
    // - Đã tắt xong mà vẫn không có cửa sổ/backend (xác sống): thoát sạch,
    //   không thì lần mở sau "không có gì xảy ra" cho tới khi reboot.
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (isQuitting) {
        app.exit(0);
        return;
      }
      if (!startupFinished) return;
      if (!backendServer) {
        app.exit(0);
        return;
      }
      try {
        createMainWindow(backendPort || DEFAULT_PORT);
      } catch (error) {
        console.error("Could not recreate the window:", error);
        app.exit(0);
        return;
      }
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  const DEFAULT_PORT = 5000;

  function isSgkHealth(body) {
    if (body?.status !== "healthy") return false;
    if (body.service === SERVICE_ID) return true;
    return typeof body.booksDir === "string"
      && Number.isInteger(body.pdfCount)
      && Number.isInteger(body.pdfCountRaw)
      && body.byGrade !== null
      && typeof body.byGrade === "object"
      && typeof body.environment === "string";
  }

  function isPortAvailable(port) {
    return new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => {
        probe.close(() => resolve(true));
      });
    });
  }

  async function getPersistentPort() {
    // Luôn ưu tiên dùng cố định cổng 5000 để dữ liệu IndexedDB / localStorage không bao giờ bị đổi origin
    if (await isPortAvailable(DEFAULT_PORT)) {
      return DEFAULT_PORT;
    }

    // Dự phòng cố định nếu 5000 bị phần mềm khác chiếm
    for (const p of [5001, 5002, 5005, 5050]) {
      if (await isPortAvailable(p)) return p;
    }

    // Cuối cùng mới fallback tìm cổng khả dụng bất kỳ
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close((error) => (error ? reject(error) : resolve(port)));
      });
    });
  }

  async function waitForBackend(port) {
    const url = `http://127.0.0.1:${port}/api/health`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok && isSgkHealth(await response.json())) return;
      } catch {
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Máy chủ nội bộ không khởi động kịp thời.");
  }

  function resolveDesktopBooksDir() {
    if (process.env.BOOKS_DIR && fs.existsSync(process.env.BOOKS_DIR)) {
      return path.resolve(process.env.BOOKS_DIR);
    }
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
    const candidates = [
      path.join(exeDir, "books"),
      path.join(exeDir, "..", "books"),
      path.join(process.cwd(), "books"),
      path.join(__dirname, "..", "books"),
      path.join(app.getPath("userData"), "books"),
    ];
    for (const dir of candidates) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          if (files.some((f) => /\.(pdf|docx|xlsx)$/i.test(f))) {
            return path.resolve(dir);
          }
        }
      } catch {}
    }
    const fallback = path.join(app.getPath("userData"), "books");
    try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
    return fallback;
  }

  function resolveDesktopLessonImgDir(resolvedBooksDir) {
    if (process.env.LESSON_IMG_DIR && fs.existsSync(process.env.LESSON_IMG_DIR)) {
      return path.resolve(process.env.LESSON_IMG_DIR);
    }
    const sibling = path.join(path.dirname(resolvedBooksDir), "lesson-images");
    if (fs.existsSync(sibling)) return sibling;
    const fallback = path.join(app.getPath("userData"), "lesson-images");
    try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
    return fallback;
  }

  async function startApp() {
    await app.whenReady();
    const port = await getPersistentPort();
    if (isQuitting) return;
    backendPort = port;

    const booksDir = resolveDesktopBooksDir();
    const lessonImgDir = resolveDesktopLessonImgDir(booksDir);

    process.env.PORT = String(port);
    process.env.HOST = "127.0.0.1";
    process.env.SGK_DESKTOP_MODE = "1";
    process.env.BOOKS_DIR = booksDir;
    process.env.LESSON_IMG_DIR = lessonImgDir;

    const { server } = await import("../server.js");
    backendServer = server;
    if (isQuitting) {
      stopBackend();
      return;
    }
    await waitForBackend(port);
    if (isQuitting) return;

    createMainWindow(port);
  }

  function createMainWindow(port) {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1024,
      minHeight: 700,
      title: PRODUCT_NAME,
      icon: path.join(__dirname, "../public/icons/icon-512.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.loadURL(`http://127.0.0.1:${port}/?app=1`);
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    return mainWindow;
  }

  app.on("window-all-closed", () => {
    app.quit();
  });

  // Renderer của cửa sổ chính sập (crash/OOM) thì thoát sạch, thay vì để
  // main process sống không cửa sổ và giữ khoá single-instance.
  app.on("render-process-gone", (event, contents, details) => {
    if (!mainWindow || contents !== mainWindow.webContents) return;
    if (details && details.reason === "clean-exit") return;
    console.error("Renderer gone:", details && details.reason);
    const crashedWindow = mainWindow;
    mainWindow = null;
    if (crashedWindow && !crashedWindow.isDestroyed()) crashedWindow.destroy();
    app.quit();
  });

  function stopBackend() {
    if (stopInitiated) return;
    stopInitiated = true;
    // Không để việc tắt server treo vĩnh viễn: nếu close() không gọi callback
    // (kết nối đang truyền dở, lỗi close...) thì buộc thoát sau 5 giây để
    // không giữ khoá single-instance làm lần mở sau "không có gì xảy ra".
    const forceQuit = setTimeout(() => {
      console.error("Backend did not stop in time — forcing exit.");
      app.exit(0);
    }, 5000);
    forceQuit.unref();
    if (!backendServer) {
      clearTimeout(forceQuit);
      app.exit(0);
      return;
    }
    backendServer.close((error) => {
      clearTimeout(forceQuit);
      if (error) {
        console.error("Could not stop the local server cleanly:", error);
        app.exit(1);
        return;
      }
      if (installingUpdate) app.quit();
      else app.exit(0);
    });
    try {
      backendServer.closeAllConnections();
    } catch (error) {
      console.error("Could not close open connections:", error);
    }
  }

  app.on("before-quit", (event) => {
    if (isQuitting) return;
    isQuitting = true;
    if (backendServer) {
      event.preventDefault();
      stopBackend();
    } else if (!startupFinished) {
      event.preventDefault();
    }
  });

  startApp().catch((error) => {
    if (!isQuitting) {
      dialog.showErrorBox(
        `${PRODUCT_NAME} không thể khởi động`,
        `${error.message}\n\nThử đóng ứng dụng rồi mở lại. Nếu lỗi vẫn còn, hãy khởi động lại máy.`,
      );
    }
    app.quit();
  }).finally(() => {
    startupFinished = true;
    if (isQuitting && !backendServer) app.exit(0);
  });
}
