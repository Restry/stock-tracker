import { describe, it, expect } from "vitest";
import { toSqlVal } from "../db";

describe("toSqlVal", () => {
  it("converts null/undefined to NULL", () => {
    expect(toSqlVal(null)).toBe("NULL");
    expect(toSqlVal(undefined)).toBe("NULL");
  });

  it("converts finite numbers to string representation", () => {
    expect(toSqlVal(42)).toBe("42");
    expect(toSqlVal(3.14)).toBe("3.14");
    expect(toSqlVal(0)).toBe("0");
    expect(toSqlVal(-99.5)).toBe("-99.5");
  });

  it("converts non-finite numbers to NULL", () => {
    expect(toSqlVal(NaN)).toBe("NULL");
    expect(toSqlVal(Infinity)).toBe("NULL");
    expect(toSqlVal(-Infinity)).toBe("NULL");
  });

  it("converts booleans to TRUE/FALSE", () => {
    expect(toSqlVal(true)).toBe("TRUE");
    expect(toSqlVal(false)).toBe("FALSE");
  });

  it("wraps strings in single quotes", () => {
    expect(toSqlVal("hello")).toBe("'hello'");
    expect(toSqlVal("")).toBe("''");
  });

  it("escapes single quotes in strings", () => {
    expect(toSqlVal("it's")).toBe("'it''s'");
    expect(toSqlVal("a''b")).toBe("'a''''b'");
  });

  it("escapes backslashes in strings", () => {
    expect(toSqlVal("path\\to\\file")).toBe("'path\\\\to\\\\file'");
  });

  it("removes null bytes from strings", () => {
    expect(toSqlVal("ab\0cd")).toBe("'abcd'");
  });

  it("converts unicode quotes to escaped SQL quotes", () => {
    // \u2018 → '' (two single quotes via replace), then outer wrapping
    // Result: 'it''s'  (the '' is the escaped apostrophe)
    expect(toSqlVal("it\u2018s")).toBe("'it''s'");
    expect(toSqlVal("it\u2019s")).toBe("'it''s'");
  });

  it("rejects suspicious SQL injection patterns", () => {
    expect(toSqlVal("'; DROP TABLE users; --")).toBe("NULL");
    expect(toSqlVal("something; DELETE FROM data;")).toBe("NULL");
    expect(toSqlVal("x; UPDATE users SET admin=1")).toBe("NULL");
  });

  it("allows normal strings containing SQL keywords", () => {
    // These should NOT be rejected because they don't match the injection pattern
    expect(toSqlVal("description")).toBe("'description'");
    expect(toSqlVal("update about product")).toBe("'update about product'");
    expect(toSqlVal("dropped the ball")).toBe("'dropped the ball'");
  });

  it("converts objects to JSON strings", () => {
    const obj = { key: "value", num: 42 };
    const result = toSqlVal(obj);
    expect(result).toBe(`'${JSON.stringify(obj).replace(/'/g, "''")}'`);
  });

  it("converts arrays to JSON strings", () => {
    const arr = [1, 2, 3];
    const result = toSqlVal(arr);
    expect(result).toBe(`'${JSON.stringify(arr)}'`);
  });
});
