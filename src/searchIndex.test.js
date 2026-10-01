// ─── Test for normMap() Vietnamese search mapping fix ─────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normMap } from "./searchIndex.js";

globalThis.__SGK_TEST__ = true;

function checkNormMap(input, expectedNorm) {
  const { norm, map } = normMap(input);
  assert.equal(norm, expectedNorm);
  assert.equal(map.length, input.length, `map length for '${input}'`);
  assert.equal(map[0], 0, "map[0] should be 0");
  return { norm, map };
}

describe("searchIndex — normMap Vietnamese", () => {
  it("sách -> sach, map đủ 4", () => {
    checkNormMap("sách", "sach");
  });

  it("Tiếng Việt -> tieng viet, map đủ 10", () => {
    const { norm, map } = normMap("Tiếng Việt");
    assert.equal(norm, "tieng viet");
    assert.equal(map.length, "Tiếng Việt".length);
    assert.equal(map[0], 0);
  });

  it("nghiên cứu -> nghien cuu, map đủ 10", () => {
    const { norm, map } = normMap("nghiên cứu");
    assert.equal(norm, "nghien cuu");
    assert.equal(map.length, "nghiên cứu".length);
  });

  it("combining marks không tạo entry thừa (ế -> e, map 1)", () => {
    const { norm, map } = normMap("ế");
    assert.equal(norm, "e");
    assert.equal(map.length, 1);
  });
});

export function testNormMap() {
  // Giữ API cũ cho caller trực tiếp — chạy assert im lặng, không console.log spam.
  for (const [input, expected] of [["sách", "sach"], ["Tiếng Việt", "tieng viet"], ["nghiên cứu", "nghien cuu"], ["ế", "e"]]) {
    const { norm, map } = normMap(input);
    assert.equal(norm, expected);
    assert.equal(map.length, input.length === 1 && input === "ế" ? 1 : input.length);
  }
  return true;
}
