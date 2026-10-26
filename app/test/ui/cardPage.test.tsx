// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { printingOf } from "../helpers-catalog.ts";
import { entry, MemoryCollectionStore, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOHNNY = "/cartes/johnny-silverhand-rocking-renegade";

describe("card page content (§5.9)", () => {
  const html = renderToString(<TestApp path={JOHNNY} entries={[entry(printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, 2)]} />);
  const content = text(html);

  it("shows the names, characteristics and rules text in the display language", () => {
    expect(content).toContain("Johnny Silverhand Rock'n'Rebelle VO : Johnny Silverhand — Rocking Renegade");
    expect(content).toMatch(/Légende Rouge RAM 2 Merc · Rocker · Samurai/);
    expect(content).toContain("Texte de règles · VF");
    expect(content).toContain("Une Unité alliée peut attaquer");
  });

  it("lists every printing with its quantity, rarity, artist and exclusivity", () => {
    expect(content).toContain("2 exemplaires");
    expect(content).toMatch(/Retail # 003 Illustration : Daniel Valaisis Secrète VF Français − 2 \+ VO Anglais − 0 \+/);
    expect(content).toContain("Beta # β168 exclusive Beta");
    expect(content).toContain("Exclusive au tirage Beta : pas d'équivalent en Retail");
    expect(content).toContain("Illustration : Divebound Studio");
    expect(html).toContain('aria-label="Ajouter Retail 003 VF"');
    expect(html).toContain('aria-label="Afficher Beta β168 VO"');
  });

  it("returns to the set of the card when opened from a direct link, without previous / next", () => {
    expect(html).toContain('aria-label="Retour à Welcome to Night City"');
    expect(html).not.toContain("Carte suivante");
  });

  it("shows the text printed on the selected printing when it differs (Iconic without reminder text)", () => {
    const iconic = printingOf("V — Streetkid", "wnc-retail", "fr", "144");
    const regular = text(renderToString(<TestApp path="/cartes/v-streetkid?langue=fr" />));
    const shown = text(renderToString(<TestApp path={`/cartes/v-streetkid?langue=fr&impression=${iconic.id}`} />));
    expect(regular).toContain("(Payez le coût de cette Légende");
    expect(shown).not.toContain("(Payez le coût de cette Légende");
  });
});

describe("browsing from a set page (step 3 criterion)", () => {
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

  const byLabel = (label: string) => {
    const found = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    if (!found) throw new Error(`nothing labelled "${label}"`);
    return found;
  };
  const click = (element: HTMLElement) => act(async () => element.click());
  const heading = () => container.querySelector("h1")?.textContent;

  it("opens a missing card, goes to the next one, and comes back to the same tab and filter", async () => {
    const store = new MemoryCollectionStore();
    await act(async () => root.render(<TestApp path="/sets/wnc?tirage=wnc-retail&filtre=manquantes" store={store} />));

    await click(byLabel("Afficher la carte Johnny Silverhand — Rock'n'Rebelle"));
    expect(heading()).toBe("Johnny Silverhand");
    expect(byLabel("Retour à Welcome to Night City · Retail")).toBeTruthy();

    // Adding it from the card page: it leaves the "missing" filter, but browsing goes on.
    await click(byLabel("Ajouter Retail 003 VF"));
    await click(byLabel("Carte suivante : 004 Royce — Psychoverdose"));
    expect(heading()).toBe("Royce");
    await click(byLabel("Carte précédente : 002 Dexter DeShawn — Indétectable"));
    expect(heading()).toBe("Dexter DeShawn");

    await click(byLabel("Retour à Welcome to Night City · Retail"));
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toMatch(/^Retail/);
    expect(container.querySelector('.filter-pill[aria-pressed="true"]')?.textContent).toBe("Manquantes");
    expect(container.textContent).toContain("167 variantes manquantes dans ce tirage");
    await act(async () => {});
    expect(store.entries.get(printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id)?.quantity).toBe(1);
  });
});
