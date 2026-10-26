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
const addJohnny = "Ajouter un exemplaire VF : Johnny Silverhand — Rock'n'Rebelle, numéro 003";

describe("quick entry", () => {
  it("adds one copy per tap, writes it, and shows the undo banner", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc", store });

    await click(button(addJohnny));
    await click(button(addJohnny));
    expect(toast()).toContain("+1 Johnny Silverhand — Rock'n'Rebelle · VF");
    expect(container.textContent).toContain("VF 2");
    await act(async () => {});
    expect(store.writes).toEqual([`put ${johnnyFr.id} 1`, `put ${johnnyFr.id} 2`]);
    expect(store.entries.get(johnnyFr.id)?.quantity).toBe(2);
  });

  it("undoes exactly the last action", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc", store });

    await click(button(addJohnny));
    await click(button("Annuler"));
    await act(async () => {});
    expect(toast()).toBeNull();
    expect(store.entries.has(johnnyFr.id)).toBe(false);
    expect(store.writes).toEqual([`put ${johnnyFr.id} 1`, `remove ${johnnyFr.id}`]);
  });

  it("removes in remove mode, never below zero", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc", store });

    await click(button(addJohnny));
    await click(button("Mode ajout"));
    const remove = button("Retirer un exemplaire VF : Johnny Silverhand — Rock'n'Rebelle, numéro 003");
    await click(remove);
    expect(toast()).toContain("−1 Johnny Silverhand");
    await click(remove);
    await act(async () => {});
    expect(store.entries.has(johnnyFr.id)).toBe(false);
    expect(store.writes).toEqual([`put ${johnnyFr.id} 1`, `remove ${johnnyFr.id}`]);
  });

  it("enters a whole booster of 12 cards, one tap each", async () => {
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc", store });
    const tiles = [...container.querySelectorAll<HTMLButtonElement>(".tile__main")].slice(20, 32);
    for (const tile of tiles) await click(tile);
    await act(async () => {});
    expect(store.entries.size).toBe(12);
    expect([...store.entries.values()].every((e) => e.quantity === 1)).toBe(true);
  });
});
