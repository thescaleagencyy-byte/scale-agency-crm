import { describe, expect, it } from "vitest";
import { limitsForPlan, PLAN_LIMITS, UNLIMITED } from "./plans";

describe("limitsForPlan", () => {
  it("returns the matching tier's limits", () => {
    expect(limitsForPlan("starter")).toEqual(PLAN_LIMITS.starter);
    expect(limitsForPlan("growth")).toEqual(PLAN_LIMITS.growth);
  });

  it("falls back to free's limits for an unrecognized plan name", () => {
    expect(limitsForPlan("typo'd-plan")).toEqual(PLAN_LIMITS.free);
  });

  it("enterprise has no cap", () => {
    expect(PLAN_LIMITS.enterprise.seats).toBe(UNLIMITED);
    expect(PLAN_LIMITS.enterprise.monthlyMessages).toBe(UNLIMITED);
  });
});
