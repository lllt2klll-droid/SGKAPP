import test from "node:test";
import assert from "node:assert/strict";
import { parseGoogleBookLink } from "./bookLinks.js";

test("parses Google Drive file sharing links", () => {
  assert.deepEqual(
    parseGoogleBookLink("https://drive.google.com/file/d/abc_123-xyz/view?usp=sharing"),
    {
      id: "abc_123-xyz",
      sourceUrl: "https://drive.google.com/file/d/abc_123-xyz/view?usp=sharing",
      previewUrl: "https://drive.google.com/file/d/abc_123-xyz/preview",
      sourceLabel: "Google Drive",
    },
  );
});

test("parses Google Docs sharing links", () => {
  const link = parseGoogleBookLink("https://docs.google.com/document/u/0/d/doc_12345/edit");
  assert.equal(link.id, "doc_12345");
  assert.equal(link.previewUrl, "https://docs.google.com/document/d/doc_12345/preview");
  assert.equal(link.sourceLabel, "Google Docs");
});

test("supports Drive open links and rejects non-Google or malformed links", () => {
  assert.equal(
    parseGoogleBookLink("https://drive.google.com/open?id=drive_12345").id,
    "drive_12345",
  );
  assert.throws(() => parseGoogleBookLink("https://drive.google.com.evil.example/file/d/abcde/view"));
  assert.throws(() => parseGoogleBookLink("http://drive.google.com/file/d/abcde/view"));
  assert.throws(() => parseGoogleBookLink("https://drive.google.com/drive/my-drive"));
});
