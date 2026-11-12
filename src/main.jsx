import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LandingPage from "./LandingPage.jsx";

const root = createRoot(document.getElementById("root"));
const isAppLaunch = new URLSearchParams(window.location.search).get("app") === "1";

if (isAppLaunch) {
  import("./appEntry.jsx").catch((error) => {
    console.error("Could not load the SGK application:", error);
    root.render(
      <main role="alert" style={{ maxWidth: 600, margin: "15vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Ứng dụng chưa tải được</h1>
        <p>Hãy kiểm tra kết nối rồi tải lại trang. Nếu lỗi vẫn còn, mở lại từ trang giới thiệu.</p>
        <a href={import.meta.env.BASE_URL}>Quay lại trang giới thiệu</a>
      </main>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  );
}
