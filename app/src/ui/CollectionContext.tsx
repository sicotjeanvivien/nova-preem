import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { changeQuantity, type CollectionEntry } from "../domain/collection.ts";
import type { CollectionStore } from "../domain/stores.ts";
import type { Quantities } from "../domain/variants.ts";

/** One quantity change, enough to undo it exactly (spec §5.1). */
export interface QuantityChange {
  printingId: string;
  delta: number;
  before: CollectionEntry | undefined;
  after: CollectionEntry | undefined;
}

interface CollectionContextValue {
  quantities: Quantities;
  /** Every entry, with its dates (Collection tab). */
  entries: ReadonlyMap<string, CollectionEntry>;
  /** Adds `delta` copies; returns null when nothing changed (removing from 0). */
  change(printingId: string, delta: number): QuantityChange | null;
  undo(change: QuantityChange): void;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

/**
 * The collection in memory, written to the store after every change. Changes
 * apply instantly (a booster is entered at tap speed); writes are queued so
 * that they reach the store in the order of the taps.
 */
export function CollectionProvider({ store, initial, children }: { store: CollectionStore; initial: CollectionEntry[]; children: ReactNode }) {
  const entries = useRef(new Map(initial.map((entry) => [entry.printingId, entry])));
  const [snapshot, setSnapshot] = useState(() => ({ entries: new Map(entries.current), quantities: toQuantities(entries.current) }));
  const writes = useRef(Promise.resolve());

  const apply = useCallback(
    (printingId: string, entry: CollectionEntry | undefined) => {
      if (entry) entries.current.set(printingId, entry);
      else entries.current.delete(printingId);
      setSnapshot({ entries: new Map(entries.current), quantities: toQuantities(entries.current) });
      writes.current = writes.current
        .then(() => (entry ? store.put(entry) : store.remove(printingId)))
        .catch((error: unknown) => console.error("Collection write failed", error));
    },
    [store],
  );

  const change = useCallback(
    (printingId: string, delta: number): QuantityChange | null => {
      const before = entries.current.get(printingId);
      const after = changeQuantity(before, printingId, delta, new Date().toISOString());
      if (before?.quantity === after?.quantity) return null;
      apply(printingId, after);
      return { printingId, delta, before, after };
    },
    [apply],
  );

  const undo = useCallback((change: QuantityChange) => apply(change.printingId, change.before), [apply]);

  const value = useMemo(() => ({ ...snapshot, change, undo }), [snapshot, change, undo]);
  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const value = useContext(CollectionContext);
  if (!value) throw new Error("useCollection must be used inside CollectionProvider");
  return value;
}

function toQuantities(entries: Map<string, CollectionEntry>): Quantities {
  return new Map([...entries].map(([id, entry]) => [id, entry.quantity]));
}
