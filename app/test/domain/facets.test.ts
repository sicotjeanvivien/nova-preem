import { describe, expect, it } from "vitest";
import { activeValueCount, type Facet, facetCounts, filterByFacets, matchesFacets, parseList } from "../../src/domain/facets.ts";

interface Item {
  name: string;
  color: string;
  size: number;
}

const items: Item[] = [
  { name: "a", color: "red", size: 1 },
  { name: "b", color: "red", size: 2 },
  { name: "c", color: "blue", size: 1 },
  { name: "d", color: "green", size: 3 },
];
const facets: Facet<Item>[] = [
  { id: "color", test: (item, value) => item.color === value },
  { id: "size", test: (item, value) => String(item.size) === value },
];
const names = (list: Item[]) => list.map((item) => item.name);

describe("facets", () => {
  it("combines the values of one criterion with OR and the criteria with AND", () => {
    expect(names(filterByFacets(items, facets, { color: ["red", "blue"] }))).toEqual(["a", "b", "c"]);
    expect(names(filterByFacets(items, facets, { color: ["red", "blue"], size: ["1"] }))).toEqual(["a", "c"]);
    expect(names(filterByFacets(items, facets, { color: [], size: undefined }))).toEqual(["a", "b", "c", "d"]);
  });

  it("can skip a criterion", () => {
    expect(matchesFacets(items[3]!, facets, { color: ["red"], size: ["3"] }, "color")).toBe(true);
    expect(matchesFacets(items[3]!, facets, { color: ["red"], size: ["3"] })).toBe(false);
  });

  it("counts each option given the other criteria, not the other values of its own", () => {
    const counts = facetCounts(items, facets, { color: ["red"], size: ["1"] }, { color: ["red", "blue", "green"], size: ["1", "2", "3"] });
    // Colors among size 1: a (red), c (blue).
    expect([...counts.color!]).toEqual([["red", 1], ["blue", 1], ["green", 0]]);
    // Sizes among red: a (1), b (2).
    expect([...counts.size!]).toEqual([["1", 1], ["2", 1], ["3", 0]]);
  });

  it("counts one active filter per value", () => {
    expect(activeValueCount({ color: ["red", "blue"], size: [], other: undefined })).toBe(2);
  });

  it("parses comma-separated URL values", () => {
    expect(parseList("rare,epic,")).toEqual(["rare", "epic"]);
    expect(parseList(undefined)).toEqual([]);
  });
});
