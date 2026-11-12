const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
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
  let isQuitting = false;
  let startupFinished = false;
  let installingUpdate = false;
  let downloadedUpdateVersion = "";
  const supportsAutoUpdate = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;

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

  ipcMain.handle("app-update:check", async () => {
    if (!supportsAutoUpdate) {
      return {
        supported: false,
        message: app.isPackaged
          ? "Bản Portable chưa hỗ trợ tự cài đặt cập nhật. Hãy tải bản Setup."
          : "Tự cập nhật chỉ khả dụng trong bản Setup đã đóng gói.",
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
    if (!supportsAutoUpdate) {
      throw new Error("Bản Portable chưa hỗ trợ tự cài đặt cập nhật. Hãy tải bản Setup.");
    }
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle("app-update:install", async () => {
    if (!supportsAutoUpdate) {
      throw new Error("Bản Portable chưa hỗ trợ tự cài đặt cập nhật. Hãy tải bản Setup.");
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
    if (!mainWindow) return;
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
  }

  app.on("window-all-closed", () => {
    app.quit();
  });

  function stopBackend() {
    if (!backendServer) {
      app.exit(0);
      return;
    }
    backendServer.close((error) => {
      if (error) {
        console.error("Could not stop the local server cleanly:", error);
        app.exit(1);
        return;
      }
      if (installingUpdate) app.quit();
      else app.exit(0);
    });
    backendServer.closeAllConnections();
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
