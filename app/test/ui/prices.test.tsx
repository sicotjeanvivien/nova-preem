// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import type { StoredPrices } from "../../src/domain/stores.ts";
import type { PriceServices } from "../../src/platform/services.ts";
import { fakePriceSource, MemoryPriceStore, PRICES_FILE } from "../helpers-prices.ts";
import { setOnline, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-11-18T12:00:00.000Z");
const stored = (downloadedAt: string, file = PRICES_FILE): StoredPrices => ({ file, downloadedAt });

describe("Indicative prices: loading and setting", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    setOnline(true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    setOnline(true);
  });

  const toggle = () => container.querySelector<HTMLElement>('[aria-label="Prix indicatifs"]');
  const row = () => toggle()?.closest(".settings-row")?.textContent?.replace(/\s+/g, " ") ?? null;
  const show = (prices: PriceServices | null, settings = DEFAULT_SETTINGS) =>
    act(async () => root.render(<TestApp path="/reglages" services={{ prices }} settings={settings} />));

  it("is absent from a build without a prices URL", async () => {
    await show(null);
    expect(toggle()).toBeNull();
    expect(text(renderToString(<TestApp path="/reglages" />))).not.toContain("Prix indicatifs");
  });

  it("downloads the prices at the first launch online, and shows their date", async () => {
    const store = new MemoryPriceStore();
    const source = fakePriceSource();
    await show({ store, source });
    expect(source.downloads).toBe(1);
    expect(store.stored).toEqual(stored(NOW.toISOString()));
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(row()).toBe("Prix indicatifsValeur estimée (Cardmarket, toutes langues), mise à jour chaque nuit · prix du 17/11");
  });

  it("keeps prices downloaded less than 12 hours ago", async () => {
    const store = new MemoryPriceStore(stored("2026-11-18T00:30:00.000Z"));
    const source = fakePriceSource();
    await show({ store, source });
    expect(source.downloads).toBe(0);
    expect(row()).toContain("prix du 17/11");
  });

  it("downloads again prices more than 12 hours old", async () => {
    const store = new MemoryPriceStore(stored("2026-11-17T23:59:00.000Z", { ...PRICES_FILE, sourceDate: "2026-11-16T02:50:00+01:00" }));
    const source = fakePriceSource();
    await show({ store, source });
    expect(source.downloads).toBe(1);
    expect(row()).toContain("prix du 17/11");
  });

  it("uses the last prices known offline, without downloading", async () => {
    setOnline(false);
    const store = new MemoryPriceStore(stored("2026-11-10T00:00:00.000Z"));
    const source = fakePriceSource();
    await show({ store, source });
    expect(source.downloads).toBe(0);
    expect(row()).toContain("prix du 17/11");
  });

  it("keeps the last prices when the file is invalid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryPriceStore(stored("2026-11-10T00:00:00.000Z"));
    await show({ store, source: fakePriceSource({ ...PRICES_FILE, prices: { x: "1" } }) });
    expect(store.saves).toBe(0);
    expect(row()).toContain("prix du 17/11");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("shows prices of more than 7 days as old", async () => {
    setOnline(false);
    const store = new MemoryPriceStore(stored("2026-11-10T00:00:00.000Z", { ...PRICES_FILE, sourceDate: "2026-11-09T02:50:00+01:00" }));
    await show({ store, source: fakePriceSource() });
    expect(row()).toContain("prix du 09/11 · Prix anciens");
    expect(container.querySelector(".prices-old")?.textContent).toBe("prix du 09/11 · Prix anciens");
  });

  it("is on by default; off, nothing is downloaded", async () => {
    const store = new MemoryPriceStore();
    const source = fakePriceSource();
    await show({ store, source }, { ...DEFAULT_SETTINGS, indicativePrices: false });
    expect(source.downloads).toBe(0);
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    expect(row()).toContain("mise à jour chaque nuit · désactivés");

    await act(async () => toggle()!.click());
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(source.downloads).toBe(1);
    expect(row()).toContain("prix du 17/11");

    await act(async () => toggle()!.click());
    expect(row()).toContain("désactivés");
  });

  it("says when no prices are known yet", async () => {
    setOnline(false);
    await show({ store: new MemoryPriceStore(), source: fakePriceSource() });
    expect(row()).toContain("· pas encore de prix");
  });

  it("is translated", async () => {
    await act(async () =>
      root.render(<TestApp path="/reglages" language="en" services={{ prices: { store: new MemoryPriceStore(), source: fakePriceSource() } }} />),
    );
    expect(container.querySelector('[aria-label="Indicative prices"]')?.closest(".settings-row")?.textContent).toBe(
      "Indicative pricesEstimated value (Cardmarket, all languages), updated every night · prices of 11/17",
    );
  });
});
