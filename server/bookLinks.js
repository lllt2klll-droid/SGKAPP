const GOOGLE_DRIVE_HOST = "drive.google.com";
const GOOGLE_DOCS_HOST = "docs.google.com";

export function parseGoogleBookLink(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Link không hợp lệ.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ![GOOGLE_DRIVE_HOST, GOOGLE_DOCS_HOST].includes(url.hostname)
  ) {
    throw new Error("Chỉ hỗ trợ link chia sẻ Google Drive hoặc Google Docs.");
  }

  const isGoogleDoc = url.hostname === GOOGLE_DOCS_HOST;
  const pathPattern = isGoogleDoc
    ? /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/
    : /^\/file\/d\/([A-Za-z0-9_-]+)/;
  const pathId = url.pathname.match(pathPattern)?.[1];
  const id = pathId || (!isGoogleDoc ? url.searchParams.get("id") : "");
  if (!id || !/^[A-Za-z0-9_-]{5,200}$/.test(id)) {
    throw new Error("Không tìm thấy mã tài liệu trong link chia sẻ.");
  }

  const previewUrl = isGoogleDoc
    ? `https://${GOOGLE_DOCS_HOST}/document/d/${id}/preview`
    : `https://${GOOGLE_DRIVE_HOST}/file/d/${id}/preview`;

  return {
    id,
    sourceUrl: url.href,
    previewUrl,
    sourceLabel: isGoogleDoc ? "Google Docs" : "Google Drive",
  };
}
