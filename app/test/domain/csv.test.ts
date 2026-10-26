import { describe, expect, it } from "vitest";
import { collectionCsv } from "../../src/domain/csv.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const entry = (printingId: string, quantity: number) => ({ printingId, quantity, firstAddedAt: "2026-10-20T10:00:00.000Z", lastAddedAt: "2026-10-26T10:00:00.000Z" });

describe("CSV export (spec §4.4)", () => {
  const csv = collectionCsv(
    index,
    [
      entry(printingOf("Johnny Silverhand — Rocking Renegade", "wnc-beta", "en", "β168").id, 1),
      entry(printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, 2),
      entry(printingOf("Chrome Fang", "wnc-retail", "en").id, 1),
    ],
    "fr",
    (code) => (code === "fr" ? "VF" : "VO"),
  );
  const lines = csv.split("\r\n");

  it("starts with a BOM and the header, separated by semicolons", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("﻿set;tirage;numero;langue;nom;rarete;quantite;ajoute_le");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("writes one line per entry, in catalog order, names in the printing's language", () => {
    expect(lines.slice(1, 4)).toEqual([
      "Welcome to Night City;Welcome to Night City — Retail;003;VF;Johnny Silverhand — Rock'n'Rebelle;Secrète;2;2026-10-20",
      "Welcome to Night City;Welcome to Night City — Retail;008;VO;Chrome Fang;Commune;1;2026-10-20",
      "Welcome to Night City;Welcome to Night City — Beta;β168;VO;Johnny Silverhand — Rocking Renegade;Iconic Secrète;1;2026-10-20",
    ]);
  });

  it("quotes cells containing a separator or a quote", () => {
    const quoted = collectionCsv(index, [entry("id;with \"quote\"", 1)], "fr", (code) => code);
    expect(quoted.split("\r\n")[1]).toBe(';;;;"id;with ""quote""";;1;2026-10-20');
  });
});
