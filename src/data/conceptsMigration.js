// ── Migration 1 lần: Sổ khái niệm (sgk_concepts) → Sổ tay từ vựng (sgk_vocab) ──
// Lý do: module "Khái niệm" bị gộp vào "Từ vựng" (tags = phân loại cũ).
// An toàn: dedupe theo (word, file, page); chỉ xóa concept sau khi đã thêm vào
// vocab thành công; chạy lại nhiều lần không nhân đôi (cờ FLAG + dedupe).
import { getConcepts, deleteConcept } from "./researchDB.js";
import { getVocab, addVocabEntry } from "./userdata.js";

const FLAG = "sgk_concepts_migrated_v1";

function makeKey(word, file, page) {
  return `${String(word || "").trim().toLowerCase()}|${file || ""}|${Number(page) || 0}`;
}

/**
 * @param {Array} books - danh sách sách hiện có (để nối bookTitle/grade); optional
 * @returns {Promise<number>} số entry đã chuyển sang sổ tay từ vựng
 */
export async function migrateConceptsToVocabOnce(books = []) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(FLAG)) return 0;
    const concepts = await getConcepts();
    if (!Array.isArray(concepts) || !concepts.length) {
      try { localStorage.setItem(FLAG, "1"); } catch {}
      return 0;
    }
    const byFilename = new Map(
      (Array.isArray(books) ? books : []).map((b) => [b?.filename, b]),
    );
    const existing = getVocab();
    const seen = new Set(
      existing.map((e) => makeKey(e?.word, e?.file, e?.page)),
    );
    let moved = 0;
    for (const c of concepts) {
      const word = String(c?.term || "").trim();
      if (!word) {
        // concept rác thiếu thuật ngữ — dọn luôn
        try { await deleteConcept(c.id); } catch {}
        continue;
      }
      const key = makeKey(word, c.file, c.page);
      if (seen.has(key)) {
        // đã có trong sổ tay (trùng từ+sách+trang) — chỉ dọn bản cũ
        try { await deleteConcept(c.id); } catch {}
        continue;
      }
      seen.add(key);
      const book = c.file ? byFilename.get(c.file) : null;
      const tags = String(c.category || "").trim();
      try {
        addVocabEntry({
          word,
          meaning: String(c.definition || ""),
          file: c.file || "",
          bookTitle: book?.title || "",
          grade: book?.grade ?? null,
          page: c.page || null,
          tags: tags ? [tags] : [],
        });
        moved += 1;
        await deleteConcept(c.id);
      } catch (e) {
        console.warn("[conceptsMigration] bỏ qua concept", c?.id, e);
      }
    }
    try { localStorage.setItem(FLAG, "1"); } catch {}
    if (moved > 0) {
      console.info(`[conceptsMigration] đã chuyển ${moved} khái niệm → sổ tay từ vựng`);
    }
    return moved;
  } catch (e) {
    console.warn("[conceptsMigration] failed (sẽ thử lại lần sau):", e);
    return 0;
  }
}
