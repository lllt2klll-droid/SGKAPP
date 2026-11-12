const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("sgkUpdater", {
  checkForUpdates: () => ipcRenderer.invoke("app-update:check"),
  downloadUpdate: () => ipcRenderer.invoke("app-update:download"),
  installUpdate: () => ipcRenderer.invoke("app-update:install"),
  openReleases: () => ipcRenderer.invoke("app-update:open-releases"),
  onStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("app-update:status", listener);
    return () => ipcRenderer.removeListener("app-update:status", listener);
  },
});

// Electron 32+ bỏ File.path. Chỉ bản desktop mới lấy được đường dẫn thật
// để liên kết file PDF gốc mà không sao chép vào thư mục books/.
contextBridge.exposeInMainWorld("sgkDesktopFiles", {
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
});
