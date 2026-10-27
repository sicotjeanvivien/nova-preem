// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { printingOf } from "../helpers-catalog.ts";
import { MemoryCollectionStore, TestApp } from "./harness.tsx";

// Quick entry on the set page (spec §5.1), in a simulated DOM.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(props: Parameters<typeof TestApp>[0]) {
  await act(async () => root.render(<TestApp {...props} />));
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

const toast = () => container.querySelector(".toast")?.textContent ?? null;
const johnnyFr = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
const add = "Ajouter un exemplaire VF : Johnny Silverhand — Rock'n'Rebelle";
const remove = "Retirer un exemplaire VF : Johnny Silverhand — Rock'n'Rebelle";

describe("entry with − and + (spec §5.1)", () => {
  it("adds one copy per +, writes it, and shows the undo banner, without leaving the page", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc/wnc-retail", store });

    await click(button(add));
    await click(button(add));
    expect(toast()).toContain("+1 Johnny Silverhand — Rock'n'Rebelle · VF");
    expect(container.querySelector("h1")?.textContent).toBe("Retail");
    expect(button(add).parentElement?.textContent).toBe("−2+");
    await act(async () => {});
    expect(store.writes).toEqual([`put ${johnnyFr.id} 1`, `put ${johnnyFr.id} 2`]);
  });

  it("undoes exactly the last action", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc/wnc-retail", store });

    await click(button(add));
    await click(button("Annuler"));
    await act(async () => {});
    expect(toast()).toBeNull();
    expect(store.entries.has(johnnyFr.id)).toBe(false);
    expect(store.writes).toEqual([`put ${johnnyFr.id} 1`, `remove ${johnnyFr.id}`]);
  });

  it("removes with −, never below zero (− is disabled at 0)", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc/wnc-retail", store });

    expect(button(remove).disabled).toBe(true);
    await click(button(add));
    await click(button(remove));
    expect(toast()).toContain("−1 Johnny Silverhand");
    expect(button(remove).disabled).toBe(true);
    await act(async () => {});
    expect(store.entries.has(johnnyFr.id)).toBe(false);
  });

  it("changes the quantities of the language chosen, and shows the other one as a badge", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc/wnc-retail", store });
    await click(button(add));
    await click(button("VO"));
    await click(button("Ajouter un exemplaire VO : Johnny Silverhand — Rocking Renegade"));
    const tile = button("Ajouter un exemplaire VO : Johnny Silverhand — Rocking Renegade").closest(".tile")!;
    expect(tile.querySelector(".tile__other")?.textContent).toBe("VF 1");
    await act(async () => {});
    expect(store.entries.size).toBe(2);
  });

  it("enters a whole booster of 12 cards, one + each", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc/wnc-retail", store });
    const plus = [...container.querySelectorAll<HTMLButtonElement>(".tile__plus")].slice(20, 32);
    for (const button of plus) await click(button);
    await act(async () => {});
    expect(store.entries.size).toBe(12);
    expect([...store.entries.values()].every((e) => e.quantity === 1)).toBe(true);
  });

  it("opens the card page from the image or the name", async () => {
    await mount({ path: "/sets/wnc/wnc-retail" });
    await click(container.querySelector<HTMLElement>('[aria-label="Ouvrir la carte Johnny Silverhand — Rock\'n\'Rebelle, numéro 003"]')!);
    expect(container.querySelector("h1")?.textContent).toBe("Johnny Silverhand");
  });

  it("leads the links of the former tabbed page to the cards of the release", async () => {
    await mount({ path: "/sets/wnc?tirage=wnc-beta" });
    expect(container.querySelector("h1")?.textContent).toBe("Beta");
  });
});
