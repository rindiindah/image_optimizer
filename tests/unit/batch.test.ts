import { describe, expect, it } from "vitest";
import { canStart, concurrencyFor, type BatchJob } from "../../src/features/process/batch";

const job = (id: string, megapixels: number, heic = false): BatchJob => ({
  id,
  pixels: megapixels * 1_000_000,
  heic,
});

describe("concurrency rule (D23 Q4)", () => {
  it("2 on a desktop with more than 4 cores; 1 on a coarse pointer or ≤ 4 cores", () => {
    expect(concurrencyFor(false, 8)).toBe(2);
    expect(concurrencyFor(false, 5)).toBe(2);
    expect(concurrencyFor(false, 4)).toBe(1);
    expect(concurrencyFor(true, 16)).toBe(1);
    expect(concurrencyFor(false, 0)).toBe(1); // unknown core count
  });
});

describe("which job may start", () => {
  it("one job may always start alone, even a large or HEIC one", () => {
    expect(canStart([], job("a", 50), 2)).toBe(true);
    expect(canStart([], job("h", 50, true), 1)).toBe(true);
  });

  it("never more than the concurrency", () => {
    expect(canStart([job("a", 1)], job("b", 1), 1)).toBe(false);
    expect(canStart([job("a", 1)], job("b", 1), 2)).toBe(true);
    expect(canStart([job("a", 1), job("b", 1)], job("c", 1), 2)).toBe(false);
  });

  it("HEIC runs alone: it doesn't join, and nothing joins it", () => {
    expect(canStart([job("a", 1)], job("h", 1, true), 2)).toBe(false);
    expect(canStart([job("h", 1, true)], job("a", 1), 2)).toBe(false);
  });

  it("the running jobs' pixels together stay within 50 MP", () => {
    expect(canStart([job("a", 24)], job("b", 24), 2)).toBe(true);
    expect(canStart([job("a", 25)], job("b", 25), 2)).toBe(true); // 50 MP: inclusive
    expect(canStart([job("a", 40)], job("b", 24), 2)).toBe(false);
  });
});
