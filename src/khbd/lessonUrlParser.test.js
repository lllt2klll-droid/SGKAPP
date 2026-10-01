import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLessonHtml, parsePastedLesson, buildLessonPromptFromUrl, splitSourceMarkers } from "./lessonUrlParser.js";

const SAMPLE = `
<html><head><title>Giáo án Toán 5 Kết nối bài 7: Hỗn số | Kenhgiaovien.com</title></head>
<body><div class="noidung_3"><h1>Giáo án Toán 5 Kết nối bài 7: Hỗn số</h1>
<p>Ngày soạn: …/…/…</p>
<h2>BÀI 7: HỖN SỐ (2 tiết)</h2>
<h3>I. YÊU CẦU CẦN ĐẠT</h3>
<p>Nhận biết được hỗn số gồm hai phần: phần nguyên và phần phân số.</p>
<img src="https://s3.fiduta.com/ck5_kgv/2024-07/08/image_262df1ec130.png" />
<table><tr><td>GV nêu câu hỏi</td><td>HS trả lời</td></tr></table>
<img src="https://s3.fiduta.com/ck5_kgv/2024-07/08/image_3bdf375d070.png" />
<img src="/sites/all/themes/my_app/logo.png" />
<p>--------------- Còn tiếp ---------------</p>
</div></body></html>`;

describe("lessonUrlParser", () => {
  it("parseLessonHtml bóc title + text y hệt, giữ hàng bảng GV/HS", () => {
    const out = parseLessonHtml(SAMPLE, "https://kenhgiaovien.com/tai-lieu/giao-toan-5-ket-noi-bai-7-hon-so");
    assert.match(out.title, /Hỗn số/);
    assert.match(out.text, /YÊU CẦU CẦN ĐẠT/);
    assert.match(out.text, /GV nêu câu hỏi/);
    assert.match(out.text, /HS trả lời/);
    assert.equal(out.isPaywalled, true);
    assert.equal(out.sourceSite, "kenhgiaovien.com");
    assert.ok(out.chars > 60);
  });
  it("parseLessonHtml loại menu/header/footer khỏi bản y hệt", () => {
    const html = "<html><body><nav>Menu lớp 1 2 3</nav><header>Logo kênh</header>"
      + SAMPLE
      + "<footer>Xem toàn bộ</footer></body></html>";
    const out = parseLessonHtml(html, "https://kenhgiaovien.com/tai-lieu/x");
    assert.ok(!out.text.includes("Menu lớp"), "không lẫn nav");
    assert.ok(!out.text.includes("Xem toàn bộ"), "không lẫn footer");
    assert.match(out.text, /YÊU CẦU CẦN ĐẠT/);
  });
  it("parseLessonHtml giữ marker [ảnh N] đúng vị trí, bỏ logo", () => {
    const out = parseLessonHtml(SAMPLE, "https://kenhgiaovien.com/tai-lieu/x");
    assert.equal(out.images.length, 2);
    assert.ok(out.images[0].includes("fiduta"), "giữ ảnh nội dung");
    assert.ok(!out.images.some((u) => u.includes("logo")), "bỏ logo");
    assert.match(out.text, /\[ảnh 1\]/);
    assert.match(out.text, /\[ảnh 2\]/);
    assert.ok(out.text.indexOf("[ảnh 1]") < out.text.indexOf("GV nêu câu hỏi"), "ảnh 1 trước bảng");
    assert.ok(out.text.indexOf("[ảnh 2]") > out.text.indexOf("HS trả lời"), "ảnh 2 sau bảng");
  });
  it("splitSourceMarkers tách chữ/ảnh đúng thứ tự", () => {
    const parts = splitSourceMarkers("Mở đầu\n[ảnh 1]\nGiữa\n[ảnh 2]\nKết");
    assert.deepEqual(parts.map((p) => p.kind), ["text", "img", "text", "img", "text"]);
    assert.deepEqual(parts.filter((p) => p.kind === "img").map((p) => p.n), [1, 2]);
  });
  it("parseLessonHtml báo lỗi khi trang không có nội dung", () => {
    assert.throws(() => parseLessonHtml("<html><body><p>abc</p></body></html>", "https://example.com"), /Không tìm thấy/);
  });
  it("parsePastedLesson chấp nhận text thuần", () => {
    const out = parsePastedLesson("BÀI 7: HỖN SỐ\n".repeat(20) + "Nội dung chi tiết ".repeat(30));
    assert.ok(out.text.length > 100);
  });
  it("parsePastedLesson chấp nhận HTML dán", () => {
    const out = parsePastedLesson(SAMPLE);
    assert.match(out.text, /YÊU CẦU CẦN ĐẠT/);
  });
  it("buildLessonPromptFromUrl bám bản gốc + đúng schema khóa", () => {
    const p = buildLessonPromptFromUrl({ title: "Bài 7: Hỗn số", sourceText: "Nội dung gốc", duration: "35", sourceUrl: "https://kenhgiaovien.com/x" });
    assert.match(p, /GIÁO ÁN GỐC/);
    assert.match(p, /hoatDong/);
    assert.match(p, /section/);
  });
});
