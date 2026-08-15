/**
 * One-time init: write synthetic replay fixture to data/replay-fixtures/
 * Run: npm run replay:init-fixture
 */
import { writeSyntheticFixtureToDisk } from "../lib/research/replay/fixtures";

const path = writeSyntheticFixtureToDisk();
console.log(`Replay fixture written: ${path}`);
