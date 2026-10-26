// Temporary: downloads the card list into the cache until `pnpm crawl` exists.
import { NetdeckSource } from "../src/sources/netdeck.ts";

const source = new NetdeckSource({ cacheDir: ".cache/netdeck", refresh: process.argv.includes("--refresh") });
const snapshot = await source.fetchSnapshot();
const printings = snapshot.cards.reduce((sum, card) => sum + card.printings.length, 0);
console.log(`${snapshot.cards.length} cards, ${printings} printings (HTTP requests: ${source.client.requestCount})`);
