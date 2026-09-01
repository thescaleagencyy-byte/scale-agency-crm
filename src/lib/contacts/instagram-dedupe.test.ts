import { describe, expect, it, vi } from "vitest";
import { findExistingInstagramContact } from "./instagram-dedupe";

function fakeSupabase(returnData: unknown, returnError: unknown = null) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
  } as never;
}

describe("findExistingInstagramContact", () => {
  it("returns the matching contact when found", async () => {
    const contact = { id: "c1", phone: null, instagram_id: "179847374527", name: "Zara" };
    const db = fakeSupabase(contact);
    const result = await findExistingInstagramContact(db, "acct1", "179847374527");
    expect(result).toEqual(contact);
  });

  it("returns null when no contact matches", async () => {
    const db = fakeSupabase(null);
    const result = await findExistingInstagramContact(db, "acct1", "179847374527");
    expect(result).toBeNull();
  });

  it("returns null on a query error rather than throwing", async () => {
    const db = fakeSupabase(null, { message: "boom" });
    const result = await findExistingInstagramContact(db, "acct1", "179847374527");
    expect(result).toBeNull();
  });

  it("returns null for an empty instagramId without querying", async () => {
    const db = fakeSupabase(null);
    const result = await findExistingInstagramContact(db, "acct1", "");
    expect(result).toBeNull();
  });
});
