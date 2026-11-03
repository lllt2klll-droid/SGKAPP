import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { importDocxToHtml } from "./wordDocx.js";

async function createDocx(bodyContent) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyContent}<w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

function asDocxFile(bytes, name = "test.docx") {
  return {
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test("Word import rejects a document containing only whitespace", async () => {
  const bytes = await createDocx("<w:p><w:r><w:t xml:space=\"preserve\">   </w:t></w:r></w:p>");
  await assert.rejects(
    importDocxToHtml(asDocxFile(bytes)),
    /không có nội dung văn bản hoặc ảnh/i,
  );
});

test("Word import keeps non-empty document text", async () => {
  const bytes = await createDocx("<w:p><w:r><w:t>Bài học Tiếng Việt</w:t></w:r></w:p>");
  const result = await importDocxToHtml(asDocxFile(bytes));
  assert.match(result.html, /Bài học Tiếng Việt/);
});

test("Word run formatting can turn off styles inherited from the paragraph", async () => {
  const content = [
    "<w:p><w:pPr><w:pStyle w:val=\"Emphasis\"/></w:pPr>",
    "<w:r><w:t>Bold</w:t></w:r>",
    "<w:r><w:rPr><w:b w:val=\"0\"/><w:i w:val=\"false\"/><w:u w:val=\"none\"/></w:rPr><w:t>Normal</w:t></w:r>",
    "</w:p>",
  ].join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr/></w:body></w:document>`,
  );
  zip.file(
    "word/styles.xml",
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Emphasis"><w:rPr><w:b/><w:i/></w:rPr></w:style></w:styles>',
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const result = await importDocxToHtml(asDocxFile(bytes));
  assert.match(result.html, /<span style="font-weight:bold;font-style:italic">Bold<\/span>/);
  assert.match(result.html, /<span style="font-weight:normal;font-style:normal;text-decoration:none">Normal<\/span>/);
});

test("Word import keeps long content wrapped in custom XML across all pages", async () => {
  const paragraph = (index) => `<w:p><w:r><w:t>Long paragraph ${index}: ${"nội dung tài liệu ".repeat(5)}</w:t></w:r></w:p>`;
  const content = [
    paragraph(0),
    `<w:customXml><w:customXmlPr/><w:customXml>${Array.from({ length: 140 }, (_, i) => paragraph(i + 1)).join("")}</w:customXml></w:customXml>`,
    paragraph(141),
  ].join("");
  const bytes = await createDocx(content);
  const result = await importDocxToHtml(asDocxFile(bytes));
  assert.equal((result.html.match(/Long paragraph \d+:/g) || []).length, 142);
  assert.match(result.html, /Long paragraph 141:/);
});
