// ── TOC Excel helpers — import/export mục lục qua bảng Excel ──
import { makeTocKey } from "./tocData.js";

function normHeader(s) {
  return String(s || "").trim().toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

const HEADER_MAP = {
  "ma sach": "key",
  "ma": "key",
  "key": "key",
  "ten sach": "bookTitle",
  "tensach": "bookTitle",
  "lop": "grade",
  "mon": "subject",
  "tap": "term",
  "tieu de": "title",
  "tieude": "title",
  "ten bai": "title",
  "ten": "title",
  "mo ta": "sub",
  "mota": "sub",
  "trang": "page",
  "trang pdf": "page",
  "page": "page",
  "do sau": "depth",
  "depth": "depth",
  "tuan": "tuann",
  "tuann": "tuann",
};

function mapHeaders(row) {
  const mapped = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normHeader(k);
    const target = HEADER_MAP[nk] || null;
    if (target) mapped[target] = v;
    else {
      // fallback: try contains
      if (nk.includes("ma sach") || nk === "key") mapped["key"] = v;
      else if (nk.includes("tieu de") || nk.includes("ten bai")) mapped["title"] = v;
      else if (nk.includes("mo ta") || nk === "sub") mapped["sub"] = v;
      else if (nk.includes("trang") || nk === "page") mapped["page"] = v;
      else if (nk.includes("do sau") || nk === "depth") mapped["depth"] = v;
    }
  }
  return mapped;
}

export async function parseTocExcel(arrayBuffer, selectedBook = null) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error("File Excel không có sheet nào");
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) throw new Error("Sheet trống — hãy điền dữ liệu theo mẫu");

  // Detect mode: nếu có cột Ma sách / Lớp / Môn / Tập thì là multi-book
  const sampleKeys = Object.keys(rows[0] || {}).map(normHeader);
  const hasBookMeta = sampleKeys.some(k => ["ma sach","lop","mon","tap","key"].includes(k));

  const booksMap = new Map();

  function ensureBook(rowMapped, fallbackBook) {
    let key = String(rowMapped.key || "").trim();
    let bookTitle = String(rowMapped.bookTitle || "").trim();
    let grade = Number(rowMapped.grade) || Number(fallbackBook?.grade) || 1;
    let subject = String(rowMapped.subject || fallbackBook?.subject || "").trim();
    let term = Number(rowMapped.term) || Number(fallbackBook?.term) || 1;
    // Kẹp lớp 1-5, kỳ 1-2 để tránh Excel ghi 0/99 lọt vào thư viện
    if (!Number.isFinite(grade) || grade < 1 || grade > 5) grade = 1;
    if (term !== 1 && term !== 2) term = 1;

    if (!key) {
      if (fallbackBook) {
        key = fallbackBook.key || makeTocKey({ subject: fallbackBook.subject, grade: fallbackBook.grade, term: fallbackBook.term });
        bookTitle = bookTitle || fallbackBook.title || "";
        subject = subject || fallbackBook.subject || "";
        grade = grade || fallbackBook.grade || 1;
        term = term || fallbackBook.term || 1;
      } else {
        // fallback: tạo key từ title
        key = makeTocKey({ subject: subject || "Khác", grade, term });
      }
    }
    if (!booksMap.has(key)) {
      booksMap.set(key, {
        key,
        title: bookTitle || key,
        grade,
        subject: subject || "Khác",
        term,
        items: [],
      });
    }
    return booksMap.get(key);
  }

  for (const raw of rows) {
    const m = mapHeaders(raw);
    const title = String(m.title || "").trim();
    if (!title) continue; // bỏ dòng trống
    // Trang: lấy SỐ ĐẦU TIÊN trong chuỗi ("12-15" → 12, "tr. 8" → 8).
    // Trước đây replace(/[^0-9]/g,"") biến "12-15" → 1215 và "" → 1 im lặng.
    const pageRaw = String(m.page ?? "").trim();
    const pageMatch = pageRaw.match(/\d+/);
    if (!pageMatch) continue; // không có số trang → bỏ dòng, tránh gán sai trang 1
    const page = Math.max(1, parseInt(pageMatch[0], 10) || 1);
    const depthRawStr = String(m.depth ?? "").trim();
    const startsBai = title.toLowerCase().startsWith("bài") || title.toLowerCase().startsWith("bai");
    // Ô trống → đoán theo "Bài" (luật cũ); ô có số → giữ cấp 0-5 (sửa lỗi ép 0/1 mất cấp 2-3).
    // Lưu ý: ô ghi 0 cho "Bài X" vẫn ra 1 như luật cũ (không phân biệt được 0-mặc-định với 0-ghi-tay).
    let depth;
    if (depthRawStr === "" || (Number(depthRawStr) === 0 && startsBai)) {
      depth = startsBai ? 1 : 0;
    } else {
      const dr = Number(m.depth);
      depth = Number.isFinite(dr) && dr >= 0 ? Math.min(Math.floor(dr), 5) : (startsBai ? 1 : 0);
    }
    const sub = String(m.sub || "").trim();
    const tuann = String(m.tuann || "").trim();

    let book;
    if (hasBookMeta) {
      book = ensureBook(m, selectedBook);
    } else {
      if (!selectedBook) throw new Error("Vui lòng chọn sách trước khi nhập (hoặc thêm cột Mã sách/Lớp/Môn/Tập vào Excel)");
      book = ensureBook({}, selectedBook);
      // override grade/subject/term từ selectedBook
      book.title = selectedBook.title || book.title;
      book.grade = selectedBook.grade || book.grade;
      book.subject = selectedBook.subject || book.subject;
      book.term = selectedBook.term || book.term;
      book.key = selectedBook.key || book.key;
    }

    book.items.push({
      title,
      sub,
      page: Math.max(1, page),
      depth,
      tuann: tuann || "",
    });
  }

  if (!booksMap.size) throw new Error("Không đọc được dòng mục lục nào — kiểm tra lại tiêu đề cột");

  // Sắp xếp items theo page
  for (const b of booksMap.values()) {
    b.items.sort((a, b) => a.page - b.page);
  }

  return [...booksMap.values()];
}

export async function generateTocTemplateExcel(books = []) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Sheet 1: Mẫu nhập
  const sample = [
    {
      "Mã sách": "tiengviet1t1",
      "Tên sách": "Tiếng Việt 1 - Tập 1",
      "Lớp": 1,
      "Môn": "Tiếng Việt",
      "Tập": 1,
      "Tiêu đề": "BÀI 1",
      "Mô tả": "A a",
      "Trang (PDF)": 15,
      "Độ sâu": 1,
      "Tuần": "",
    },
    {
      "Mã sách": "tiengviet1t1",
      "Tên sách": "Tiếng Việt 1 - Tập 1",
      "Lớp": 1,
      "Môn": "Tiếng Việt",
      "Tập": 1,
      "Tiêu đề": "BÀI 2",
      "Mô tả": "B b",
      "Trang (PDF)": 17,
      "Độ sâu": 1,
      "Tuần": "",
    },
  ];
  const ws1 = XLSX.utils.json_to_sheet(sample);
  ws1["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 6 }, { wch: 16 }, { wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws1, "MauNhap");

  // Sheet 2: Danh sách sách hiện có (để tham khảo)
  if (books.length) {
    const list = books.map(b => ({
      "Mã sách": b.key || "",
      "Tên sách": b.title || "",
      "Lớp": b.grade || "",
      "Môn": b.subject || "",
      "Tập": b.term || "",
      "Số mục": b.items?.length || 0,
    }));
    const ws2 = XLSX.utils.json_to_sheet(list);
    XLSX.utils.book_append_sheet(wb, ws2, "DanhSachSach");
  }

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out;
}

export async function exportTocToExcel(books) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const rows = [];
  for (const b of books) {
    for (const it of b.items || []) {
      rows.push({
        "Mã sách": b.key,
        "Tên sách": b.title,
        "Lớp": b.grade,
        "Môn": b.subject,
        "Tập": b.term,
        "Tiêu đề": it.title,
        "Mô tả": it.sub || "",
        "Trang (PDF)": it.page,
        "Độ sâu": it.depth,
        "Tuần": it.tuann || "",
      });
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Mã sách": "", "Tên sách": "", "Lớp": "", "Môn": "", "Tập": "", "Tiêu đề": "", "Mô tả": "", "Trang (PDF)": "", "Độ sâu": "", "Tuần": "" }]);
  ws["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 6 }, { wch: 16 }, { wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, "MucLuc");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

export async function exportTocSimple(books) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const rows = [];
  // Giữ đủ trường để import lại phục hồi được (trước đây chỉ Tên/Trang → mất sub/depth/tuann/key)
  for (const b of books) {
    for (const it of b.items || []) {
      rows.push({
        "Mã sách": b.key || "",
        "Tên": it.title,
        "Mô tả": it.sub || "",
        "Trang": it.page,
        "Độ sâu": it.depth ?? 0,
        "Tuần": it.tuann || "",
      });
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Mã sách": "", "Tên": "", "Mô tả": "", "Trang": "", "Độ sâu": "", "Tuần": "" }]);
  ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, "MucLuc");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
