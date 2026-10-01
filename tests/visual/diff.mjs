// So sánh 2 thư mục capture (computed-*.json). Bỏ qua trường text (ngày tháng đổi theo giờ).
// Chạy: node tests/visual/diff.mjs <before> <after>  → exit 1 nếu khác computed-style.
import fs from "fs";
import path from "path";

const [before, after] = process.argv.slice(2);
if (!before || !after) { console.error("usage: diff.mjs <before> <after>"); process.exit(2); }
const files = fs.readdirSync(before).filter((f) => f.startsWith("computed-") && f.endsWith(".json"));
let diffs = 0;
for (const f of files) {
  const bPath = path.join(after, f);
  if (!fs.existsSync(bPath)) { console.log(`THIEU FILE: ${f}`); diffs++; continue; }
  const b = JSON.parse(fs.readFileSync(path.join(before, f), "utf8"));
  const a = JSON.parse(fs.readFileSync(bPath, "utf8"));
  const sels = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const sel of sels) {
    const bl = b[sel] || [], al = a[sel] || [];
    if (bl.length !== al.length) { console.log(`KHAC SL: ${f} :: ${sel} (${bl.length}→${al.length})`); diffs++; continue; }
    bl.forEach((be, i) => {
      const ae = al[i] || {};
      const props = new Set([...Object.keys(be), ...Object.keys(ae)]);
      for (const p of props) {
        if (p === "text") continue;
        if ((be[p] ?? "") !== (ae[p] ?? "")) {
          console.log(`KHAC: ${f} :: ${sel}[${i}] :: ${p}: "${(be[p] ?? "").slice(0, 60)}" → "${(ae[p] ?? "").slice(0, 60)}"`);
          diffs++;
        }
      }
    });
  }
}
console.log(diffs === 0 ? "IDENTICAL computed-style" : `TONG ${diffs} diem khac`);
process.exit(diffs === 0 ? 0 : 1);
