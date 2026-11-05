import { app, BrowserWindow, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appName = "SGK Teacher Workspace";

app.setName(appName);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let backendServer;
  let closingServer = false;
  let mainWindow;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("before-quit", (event) => {
    if (!backendServer?.listening || closingServer) return;
    event.preventDefault();
    closingServer = true;
    backendServer.close((error) => {
      if (error) console.error("Could not stop the local server cleanly:", error);
      app.quit();
    });
  });

  app.whenReady().then(async () => {
    const dataDir = path.join(app.getPath("appData"), appName);
    fs.mkdirSync(dataDir, { recursive: true });
    app.setPath("userData", dataDir);
    const booksDir = path.join(dataDir, "books");
    const lessonImagesDir = path.join(dataDir, "lesson-images");
    fs.mkdirSync(booksDir, { recursive: true });
    fs.mkdirSync(lessonImagesDir, { recursive: true });

    process.env.NODE_ENV = "production";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    process.env.BOOKS_DIR = booksDir;
    process.env.LESSON_IMG_DIR = lessonImagesDir;

    try {
      const { server } = await import("../server.js");
      backendServer = server;
      if (!server.listening) {
        await new Promise((resolve, reject) => {
          server.once("listening", resolve);
          server.once("error", reject);
        });
      }

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("The local server did not provide a usable address.");
      }

      mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: appName,
        icon: path.join(__dirname, "../dist/icons/icon-512.png"),
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: !app.isPackaged,
        },
      });

      mainWindow.on("closed", () => {
        mainWindow = undefined;
      });
      await mainWindow.loadURL(`http://127.0.0.1:${address.port}`);
    } catch (error) {
      console.error("Could not start the desktop app:", error);
      dialog.showErrorBox(
        appName,
        `Không thể khởi động ứng dụng.\n\n${error.message || error}`,
      );
      app.quit();
    }
  });
}
