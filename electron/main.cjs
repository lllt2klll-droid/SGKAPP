const { app, BrowserWindow, dialog } = require("electron");
const net = require("node:net");
const path = require("node:path");

const PRODUCT_NAME = "SGK Teacher Workspace";
const appDataDir = path.join(app.getPath("appData"), PRODUCT_NAME);
app.setName(PRODUCT_NAME);
app.setPath("userData", appDataDir);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow;
  let backendServer;
  let isQuitting = false;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  function findAvailablePort() {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close((error) => error ? reject(error) : resolve(port));
      });
    });
  }

  async function waitForBackend(port) {
    const url = `http://127.0.0.1:${port}/api/health`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error("Máy chủ nội bộ không khởi động kịp thời.");
  }

  async function startApp() {
    await app.whenReady();
    const port = await findAvailablePort();

    process.env.PORT = String(port);
    process.env.HOST = "127.0.0.1";
    process.env.SGK_DESKTOP_MODE = "1";
    process.env.BOOKS_DIR = path.join(app.getPath("userData"), "books");
    process.env.LESSON_IMG_DIR = path.join(app.getPath("userData"), "lesson-images");

    const { server } = await import("../server.js");
    backendServer = server;
    await waitForBackend(port);

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1024,
      minHeight: 700,
      title: PRODUCT_NAME,
      icon: path.join(__dirname, "../public/icons/icon-512.png"),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  app.on("before-quit", (event) => {
    if (!backendServer || isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    backendServer.close(() => app.exit(0));
  });

  startApp().catch((error) => {
    dialog.showErrorBox(
      `${PRODUCT_NAME} không thể khởi động`,
      `${error.message}\n\nThử đóng ứng dụng rồi mở lại. Nếu lỗi vẫn còn, hãy khởi động lại máy.`,
    );
    app.quit();
  });
}
