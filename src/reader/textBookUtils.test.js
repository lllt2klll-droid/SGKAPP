import assert from "node:assert/strict";
import test from "node:test";
import {
  countWordsFromHtml,
  estimatePages,
  htmlToPlainText,
  mdLikeToHtmlIfNeeded,
  plainToHtml,
} from "./textBookUtils.js";

test("htmlToPlainText removes markup and trims surrounding whitespace", () => {
  assert.equal(htmlToPlainText(" <p>Xin chào</p> "), "Xin chào");
});

test("word and page estimates use visible text", () => {
  assert.equal(countWordsFromHtml("<p>Ba từ trong đây</p>"), 4);
  assert.equal(estimatePages(""), 1);
  assert.equal(estimatePages("a".repeat(1801)), 2);
});

test("plainToHtml escapes text and preserves paragraph and line breaks", () => {
  assert.equal(
    plainToHtml("Một <hai>\ndòng\n\nĐoạn & hai"),
    "<p>Một &lt;hai&gt;<br>dòng</p><p>Đoạn &amp; hai</p>",
  );
});

test("mdLikeToHtmlIfNeeded keeps HTML, converts Markdown, and wraps plain text", () => {
  assert.equal(mdLikeToHtmlIfNeeded("<p>Đã có HTML</p>", "html"), "<p>Đã có HTML</p>");
  assert.equal(
    mdLikeToHtmlIfNeeded("# Tiêu đề\n**đậm**", "md"),
    "<p><h1>Tiêu đề</h1></p>\n<p><strong>đậm</strong></p>",
  );
  assert.equal(mdLikeToHtmlIfNeeded("Văn bản", "txt"), "<p>Văn bản</p>");
});
