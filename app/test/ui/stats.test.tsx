// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { printingOf } from "../helpers-catalog.ts";
import { entry, setViewportWidth, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const owned = [
  entry(printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, 1),
  entry(printingOf("Johnny Silverhand — Rocking Renegade", "wnc-beta", "en", "β168").id, 1),
];

describe("Stats, mobile layout (server rendering)", () => {
  const render = (path: string) => text(renderToString(<TestApp path={path} entries={owned} />));

  it("opens on the release measure, with its rarity breakdown and the counted groups", () => {
    const content = render("/stats");
    expect(content).toMatch(/Set jouable Master set Par tirage/);
    expect(content).toMatch(/Tirage Retail, toutes langues 0 % 1 \/ 168/);
    expect(content).toMatch(/Toutes VF VO/);
    expect(content).toMatch(/Par rareté Commune 0\/60 .*Secrète 1\/4 Iconic 0\/27/);
    expect(content).toMatch(/Groupes comptés Principal \+ Starters Modifier/);
  });

  it("shows the playable set by card type", () => {
    const content = render("/stats?mode=jouable");
    expect(content).toMatch(/Set jouable 0 % 1 \/ 150/);
    expect(content).toContain("Une copie de chaque carte suffit");
    expect(content).toMatch(/Par type de carte .*Légende 1\/26/);
  });

  it("shows the master set by release and language, greying the groups not counted", () => {
    const html = renderToString(<TestApp path="/stats?mode=master" entries={owned} />);
    expect(text(html)).toMatch(/Master set 0 % 2 \/ 588/);
    expect(text(html)).toMatch(/Retail VF 1\/168 Retail VO 0\/168 Beta VO 1\/172 Starters 0\/80 Démos 0\/29 Promos 0\/134/);
    expect(html.split("breakdown-row--muted").length - 1).toBe(2);
  });

  it("counts a release in one language, and offers no VF for Beta", () => {
    expect(render("/stats?langue=fr")).toMatch(/Tirage Retail en VF 0 % 1 \/ 168/);
    const beta = render("/stats?tirage=wnc-beta");
    expect(beta).toMatch(/Tirage Beta, toutes langues 0 % 1 \/ 172/);
    expect(beta).not.toMatch(/Toutes VF VO/);
    expect(render("/stats?tirage=wnc-beta&langue=fr")).toContain("Tirage Beta, toutes langues");
  });
});

describe("Stats, desktop dashboard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    setViewportWidth(1280);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setViewportWidth(1024);
  });

  it("shows the indicators and the three breakdowns, for the chosen release", async () => {
    await act(async () => root.render(<TestApp path="/stats" entries={owned} />));
    const kpis = () => [...container.querySelectorAll(".kpi__label")].map((k) => k.textContent);
    expect(kpis()).toEqual(["Set jouable", "Master set", "Retail en VF", "Retail en VO"]);
    expect([...container.querySelectorAll(".breakdown__title")].map((h) => h.textContent)).toEqual([
      "Par tirage et par langue",
      "Retail par rareté",
      "Set jouable par type",
    ]);

    const select = container.querySelector<HTMLSelectElement>(".stats-select select")!;
    await act(async () => {
      select.value = "wnc-beta";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(kpis()).toEqual(["Set jouable", "Master set", "Beta en VO"]);
    expect(container.textContent).toContain("Beta par rareté");
  });
});
