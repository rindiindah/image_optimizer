import { describe, expect, it } from "vitest";
import { formatSize, parseSize } from "../../src/utils/file-size";

describe("parseSize (decimal units, D4)", () => {
  it.each([
    ["1", "MB", 1_000_000],
    ["1.5", "MB", 1_500_000],
    ["500", "KB", 500_000],
    ["1,000", "KB", 1_000_000],
    [" 250 ", "KB", 250_000],
    [".5", "MB", 500_000],
  ] as const)("parses %s %s as %d bytes", (input, unit, bytes) => {
    expect(parseSize(input, unit)).toEqual({ ok: true, bytes });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["abc", "not_a_number"],
    ["1e3", "not_a_number"],
    ["12abc", "not_a_number"],
    ["0", "not_positive"],
    ["-5", "not_positive"],
    ["0.0001", "too_small"],
    ["2000", "too_large"],
  ] as const)("rejects %j as %s", (input, reason) => {
    expect(parseSize(input, input === "2000" ? "MB" : "KB")).toEqual({ ok: false, reason });
  });
});

describe("formatSize (KB below 1 MB, MB with 2 decimals from 1 MB)", () => {
  it.each([
    [0, "0 KB"],
    [42_000, "42 KB"],
    [950_000, "950 KB"],
    [949_499, "949 KB"],
    [949_500, "950 KB"],
    [999_600, "1,000 KB"],
    [1_000_000, "1.00 MB"],
    [1_150_000, "1.15 MB"],
    [1_234_567_890, "1,234.57 MB"],
  ])("formats %d bytes as %s", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });

  it("rounds a size above a target or limit up, never onto the limit", () => {
    const limit = { kind: "upper", bytes: 1_000_000 } as const;
    expect(formatSize(1_000_400, limit)).toBe("1.01 MB");
    expect(formatSize(500_400, { kind: "upper", bytes: 500_000 })).toBe("501 KB");
    expect(formatSize(1_000_000, limit)).toBe("1.00 MB");
  });

  it("uses normal rounding for sizes at or below an upper bound", () => {
    expect(formatSize(999_600, { kind: "upper", bytes: 1_000_000 })).toBe("1,000 KB");
    expect(formatSize(950_400, { kind: "upper", bytes: 1_000_000 })).toBe("950 KB");
  });

  it("rounds a size below a Range minimum down, never onto the minimum", () => {
    const minimum = { kind: "lower", bytes: 500_000 } as const;
    expect(formatSize(499_600, minimum)).toBe("499 KB");
    expect(formatSize(500_600, minimum)).toBe("501 KB");
  });

  it("rejects non-integer or negative byte counts", () => {
    expect(() => formatSize(1.5)).toThrow(RangeError);
    expect(() => formatSize(-1)).toThrow(RangeError);
  });
});
