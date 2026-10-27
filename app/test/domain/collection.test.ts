import { describe, expect, it } from "vitest";
import { changeQuantity } from "../../src/domain/collection.ts";
import { formatMissingList } from "../../src/domain/missingList.ts";

const T1 = "2026-10-26T10:00:00.000Z";
const T2 = "2026-10-26T11:00:00.000Z";

describe("changeQuantity (spec §5.1)", () => {
  it("creates an entry on the first copy", () => {
    expect(changeQuantity(undefined, "p", 1, T1)).toEqual({ printingId: "p", quantity: 1, firstAddedAt: T1, lastAddedAt: T1 });
  });

  it("only moves lastAddedAt when the quantity increases", () => {
    const one = changeQuantity(undefined, "p", 1, T1)!;
    expect(changeQuantity(one, "p", 1, T2)).toEqual({ printingId: "p", quantity: 2, firstAddedAt: T1, lastAddedAt: T2 });
    const two = { ...one, quantity: 2 };
    expect(changeQuantity(two, "p", -1, T2)).toEqual({ ...one, quantity: 1 });
  });

  it("deletes the entry at 0 and never goes below", () => {
    expect(changeQuantity({ printingId: "p", quantity: 1, firstAddedAt: T1, lastAddedAt: T1 }, "p", -1, T2)).toBeUndefined();
    expect(changeQuantity(undefined, "p", -1, T2)).toBeUndefined();
  });
});

describe("formatMissingList (spec §5.4)", () => {
  it("produces the Discord-ready text", () => {
    expect(
      formatMissingList("Manques — Welcome to Night City · Retail · VF", [
        { number: "015", name: "Octant", rarity: "C" },
        { number: "035", name: "Souvenirs en Lambeaux", rarity: "R", note: "en VO" },
      ]),
    ).toBe("Manques — Welcome to Night City · Retail · VF (2)\n#015 Octant (C)\n#035 Souvenirs en Lambeaux (R) · en VO");
  });
});
