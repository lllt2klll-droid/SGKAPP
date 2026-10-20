// Sinh public/books/catalog.json cho GitHub Pages (che do tinh).
// Quet thu muc sach, parse metadata tu ten file (giong parseBookFilename trong server.js),
// gan url toi hosting ngoai (mac dinh repo SGKBOOKS tren GitHub).
//
// Dung: npm run books:catalog
// Env tuy chon:
//   BOOKS_DIR       - thu muc sach (mac dinh ../books)
//   BOOKS_BASE_URL  - base URL host PDF (mac dinh raw.githubusercontent repo SGKBOOKS)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SUPPORTED = new Set([".pdf"]);
const BOOKS_BASE_URL = (
  process.env.BOOKS_BASE_URL ||
  "https://raw.githubusercontent.com/lllt2klll-droid/SGKBOOKS/main"
).replace(/\/$/, "");

function resolveBooksDir() {
  if (process.env.BOOKS_DIR) return path.resolve(process.env.BOOKS_DIR);
  for (const rel of ["../books", "./books", "../../books"]) {
    const dir = path.resolve(ROOT, rel);
    try {
      if (
        fs.existsSync(dir) &&
        fs.readdirSync(dir).some((f) => SUPPORTED.has(path.extname(f).toLowerCase()))
      ) {
        return dir;
      }
    } catch {}
  }
  return path.resolve(ROOT, "../books");
}

function makeCleanTitle(n) {
  n = n.replace(/^\d+[-_\s]*/, "");
  const cut = n.search(
    /(kết nối tri thức|ket noi tri thuc|ket-noi|kntt|blogtailieu|với cuộc sống|voi cuoc song|cuộc sống)/i,
  );
  if (cut > 0) n = n.slice(0, cut);
  n = n.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/[()]/g, "");
  n = n.replace(/\btoan\b/gi, "Toán").replace(/\btoán\b/gi, "Toán");
  n = n.replace(/tieng viet/gi, "Tiếng Việt").replace(/\btiếng việt\b/gi, "Tiếng Việt");
  n = n.replace(/\blop\b/gi, "Lớp").replace(/\blớp\b/gi, "Lớp");
  n = n.replace(/\btap\b/gi, "Tập").replace(/\btập\b/gi, "Tập");
  n = n.replace(/\bkntt\b/gi, "").replace(/\s{2,}/g, " ").trim();
  n = n.replace(/^./, (c) => c.toUpperCase());
  return n;
}

function parseBookFilename(filename) {
  const name = filename.replace(/\.[a-z0-9]+$/i, "");
  let grade = 1;
  let subject = "Khác";
  let term = 1;
  const norm = name.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");

  if (norm.includes("toán") || norm.includes("toan")) subject = "Toán";
  else if (norm.includes("tiếng việt") || norm.includes("tieng viet")) subject = "Tiếng Việt";
  else if (norm.includes("tiếng anh") || norm.includes("tieng anh") || norm.includes("english")) subject = "Tiếng Anh";
  else if (norm.includes("đạo đức") || norm.includes("dao duc")) subject = "Đạo đức";
  else if (norm.includes("tự nhiên") || norm.includes("tu nhien") || norm.includes("tnxh")) subject = "Tự nhiên và Xã hội";
  else if (norm.includes("lịch sử") || norm.includes("lich su") || norm.includes("địa lí") || norm.includes("dia li") || norm.includes("lsdl")) subject = "Lịch sử và Địa lí";
  else if (norm.includes("khoa học") || norm.includes("khoa hoc")) subject = "Khoa học";
  else if (norm.includes("tin học") || norm.includes("tin hoc")) subject = "Tin học";
  else if (norm.includes("công nghệ") || norm.includes("cong nghe")) subject = "Công nghệ";
  else if (norm.includes("thể chất") || norm.includes("the chat") || norm.includes("gdtc") || norm.includes("thể dục") || norm.includes("the duc")) subject = "Giáo dục thể chất";
  else if (norm.includes("âm nhạc") || norm.includes("am nhac")) subject = "Âm nhạc";
  else if (norm.includes("mĩ thuật") || norm.includes("mi thuat") || norm.includes("mỹ thuật") || norm.includes("my thuat")) subject = "Mĩ thuật";
  else if (norm.includes("trải nghiệm") || norm.includes("trai nghiem") || norm.includes("hoạt động") || norm.includes("hoat dong")) subject = "Hoạt động trải nghiệm";

  const gradeMatch =
    name.match(/^\s*0*([1-5])\s*[-_\s]/) ||
    name.match(/(?:lớp|lop)\s*([1-5])/i) ||
    name.match(/(?:toán|toan|việt|viet|anh|đạo|tự nhiên|lịch sử|khoa|tin|công|thể|âm|mĩ|hoạt)[\s._-]*([1-5])(?!\d)/i);
  if (gradeMatch) grade = parseInt(gradeMatch[1]);

  term =
    norm.includes("tập 2") || norm.includes("tap 2") || norm.includes("tap hai") || norm.includes("taphai")
      ? 2
      : 1;

  let title = `Sách Giáo Khoa ${subject} Lớp ${grade} - Tập ${term}`;
  const smart = makeCleanTitle(name);
  if (smart.length >= 6) title = /tập\s?\d/i.test(smart) ? smart : `${smart} - Tập ${term}`;

  return { filename: null, title, grade, subject, term, size: 0 };
}

const BOOKS_DIR = resolveBooksDir();
const files = fs
  .readdirSync(BOOKS_DIR)
  .filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()))
  .sort();

const books = files.map((filename) => {
  const meta = parseBookFilename(filename);
  let size = 0;
  try {
    size = fs.statSync(path.join(BOOKS_DIR, filename)).size;
  } catch {}
  return {
    ...meta,
    filename,
    size,
    url: `${BOOKS_BASE_URL}/${encodeURIComponent(filename)}`,
  };
});

books.sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, "vi") || a.term - b.term);

const outDir = path.join(ROOT, "public", "books");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "catalog.json");
fs.writeFileSync(
  outFile,
  JSON.stringify({ generatedAt: new Date().toISOString(), booksBaseUrl: BOOKS_BASE_URL, books }, null, 2),
);

const totalMB = (books.reduce((s, b) => s + b.size, 0) / 1024 / 1024).toFixed(1);
console.log(`Da sinh ${outFile}: ${books.length} sach, tong ${totalMB} MB, base: ${BOOKS_BASE_URL}`);
