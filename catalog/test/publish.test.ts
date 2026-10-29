import { describe, expect, it } from "vitest";
import type { Catalog, Printing } from "../src/model.ts";
import { HEADERS, publishedFiles } from "../src/publish.ts";

function catalogWith(images: (Printing["image"])[]): Catalog {
  return { printings: images.map((image) => ({ image }) as Printing) } as Catalog;
}

describe("publishedFiles", () => {
  it("lists the JSON files, then each referenced image and thumbnail once", () => {
    const image = { path: "a.webp", thumbPath: "thumbs/a.webp", width: 733, height: 1024 };
    expect(publishedFiles(catalogWith([image, null, image]))).toEqual([
      "manifest.json", "catalog.json", "images/a.webp", "images/thumbs/a.webp",
    ]);
  });
});

describe("HEADERS", () => {
  it("allows the app, on another origin, to fetch every file", () => {
    expect(HEADERS).toMatch(/^\/\*\n {2}Access-Control-Allow-Origin: \*$/m);
  });
});
