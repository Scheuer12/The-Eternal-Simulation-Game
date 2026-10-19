import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameEngine } from "../../js/engine.js";
import { createInitialState } from "../../js/state.js";
import { createRenderer, renderNewsSection } from "../../js/ui.js";
import {
  DEFAULT_NEWS,
  getNewsItem,
  getRarityClass,
  getRarityLabel,
  selectNextNews,
} from "../../js/news.js";
import { big } from "../../js/numeric.js";

const config = JSON.parse(
  readFileSync(new URL("../../config/game-config.json", import.meta.url), "utf8"),
);

const newsData = JSON.parse(
  readFileSync(new URL("../../content/news.json", import.meta.url), "utf8"),
);

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.innerHTML = "";
    this.style = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

test("News: content/news.json has valid structure, unique ids, and numerical rarity scale", () => {
  assert.ok(Array.isArray(newsData), "news.json should be an array");
  assert.ok(newsData.length >= 10, "news.json should have at least 10 entries");

  const seenIds = new Set();
  for (const item of newsData) {
    assert.ok(typeof item.id === "string" && item.id.length > 0, `Item has invalid id: ${JSON.stringify(item)}`);
    assert.ok(!seenIds.has(item.id), `Duplicate news ID detected: ${item.id}`);
    seenIds.add(item.id);

    assert.ok(typeof item.text === "string" && item.text.length > 0, `Item ${item.id} has empty text`);
    assert.ok(typeof item.category === "string" && item.category.length > 0, `Item ${item.id} has empty category`);
    assert.ok(typeof item.weight === "number" && item.weight > 0, `Item ${item.id} has invalid weight: ${item.weight}`);
    assert.ok(typeof item.rarity === "number" && item.rarity >= 1 && item.rarity <= 5, `Item ${item.id} has invalid rarity: ${item.rarity}`);
  }

  // Ensure headline processing_network_online is present
  assert.ok(seenIds.has("processing_network_online"), "Expected processing_network_online headline");
});

test("News: selectNextNews respects rarity weights and avoids immediate duplicate", () => {
  const testPool = [
    { id: "common", text: "Common news", weight: 100, rarity: 1 },
    { id: "rare", text: "Rare news", weight: 1, rarity: 5 },
  ];

  // When current is "common", it MUST choose "rare" since it avoids immediate duplicate
  const nextFromCommon = selectNextNews(testPool, "common", () => 0.5);
  assert.equal(nextFromCommon.id, "rare");

  // When current is "rare", it MUST choose "common"
  const nextFromRare = selectNextNews(testPool, "rare", () => 0.5);
  assert.equal(nextFromCommon.id, "rare");

  // Statistical distribution test without exclusion:
  // Roll 0 should pick the first item, roll 0.999 should pick the high-roll item
  const lowRoll = selectNextNews(testPool, null, () => 0.01);
  assert.equal(lowRoll.id, "common");

  const highRoll = selectNextNews(testPool, null, () => 0.999);
  assert.equal(highRoll.id, "rare");
});

test("News: getRarityLabel and getRarityClass produce expected labels", () => {
  assert.equal(getRarityLabel(1), "COMMON");
  assert.equal(getRarityLabel(2), "UNCOMMON");
  assert.equal(getRarityLabel(3), "RARE");
  assert.equal(getRarityLabel(4), "VERY RARE");
  assert.equal(getRarityLabel(5), "LEGENDARY");

  assert.equal(getRarityClass(5), "news-rarity--legendary");
  assert.equal(getRarityClass(4), "news-rarity--very-rare");
  assert.equal(getRarityClass(3), "news-rarity--rare");
  assert.equal(getRarityClass(2), "news-rarity--uncommon");
  assert.equal(getRarityClass(1), "news-rarity--common");
});

test("News: GameEngine manages news lifecycle, timer cycling, and dismissal", () => {
  const state = createInitialState(config);
  state.introState = "active";
  const engine = new GameEngine({ state, config, news: newsData });

  assert.ok(state.ui.currentNewsId, "Initial news item should be assigned");
  assert.equal(state.ui.newsDismissed, false);

  const initialNewsId = state.ui.currentNewsId;

  // Cycle news
  engine.cycleNews(true);
  assert.notEqual(state.ui.currentNewsId, initialNewsId, "News cycle should select a different headline");

  // Dismiss news
  engine.dismissNewsSection();
  assert.equal(state.ui.newsDismissed, true, "Dismiss should set newsDismissed to true");

  // Restore news
  engine.restoreNewsSection();
  assert.equal(state.ui.newsDismissed, false, "Restore should set newsDismissed to false");

  // Toggle news
  engine.toggleNewsSection();
  assert.equal(state.ui.newsDismissed, true, "Toggle should invert newsDismissed");
});

test("News: purchasing first processor triggers processing network online headline", () => {
  const state = createInitialState(config);
  state.introState = "active";
  state.energy = big(1e12); // sufficient energy
  const engine = new GameEngine({ state, config, news: newsData });

  assert.equal(state.prototypeComplete, false);

  const purchased = engine.purchaseProcessor();
  assert.ok(purchased, "Processor purchase should succeed");
  assert.equal(state.prototypeComplete, true);
  assert.equal(state.ui.currentNewsId, "processing_network_online", "First processor should display processing_network_online");
  assert.equal(state.ui.newsDismissed, false, "News should not be dismissed on milestone");
});

test("News: UI renders News Section when prototypeComplete is true and hides when dismissed", () => {
  const container = new MockElement("div");
  const state = createInitialState(config);
  state.introState = "active";
  state.prototypeComplete = true;
  state.ui.currentNewsId = "processing_network_online";
  state.ui.newsDismissed = false;

  const renderer = createRenderer(container, config, false, () => [], newsData);
  renderer(state);

  assert.ok(container.innerHTML.includes('class="news-section"'), "News section should be rendered");
  assert.ok(container.innerHTML.includes("NEWS FEED"), "News Feed badge should be rendered");
  assert.ok(container.innerHTML.includes('data-action="dismiss-news-section"'), "Close button should be present");
  assert.ok(container.innerHTML.includes("PROCESSING NETWORK ONLINE"), "Headline text should be present");

  // Dismiss news
  state.ui.newsDismissed = true;
  renderer(state);

  assert.ok(!container.innerHTML.includes('class="news-section"'), "News section should NOT be rendered when dismissed");
  assert.ok(container.innerHTML.includes('data-action="restore-news-section"'), "Restore News Feed button should be present in topbar");
});

test("News: auto-advances every 6 seconds and pauses while hovered", () => {
  const state = createInitialState(config);
  state.introState = "active";
  state.prototypeComplete = true;
  const engine = new GameEngine({ state, config, news: newsData });

  const initialId = state.ui.currentNewsId;
  assert.equal(state.ui.newsTimer, 0);

  // Tick 3 seconds unhovered (1s each tick due to maximumTickSeconds)
  for (let i = 0; i < 3; i++) engine.tick(1);
  assert.equal(state.ui.newsTimer, 3);
  assert.equal(state.ui.currentNewsId, initialId);

  // Hover over news section
  engine.setNewsHovered(true);
  assert.equal(state.ui.newsHovered, true);

  // Tick 5 seconds while hovered - timer must pause
  for (let i = 0; i < 5; i++) engine.tick(1);
  assert.equal(state.ui.newsTimer, 3, "Timer should remain paused while hovered");
  assert.equal(state.ui.currentNewsId, initialId, "Headline should not change while hovered");

  // Unhover
  engine.setNewsHovered(false);
  assert.equal(state.ui.newsHovered, false);

  // Tick 3 more seconds to reach 6s cycle threshold
  for (let i = 0; i < 3; i++) engine.tick(1);
  assert.notEqual(state.ui.currentNewsId, initialId, "Headline should cycle after 6s of unhovered playback");
  assert.ok(state.ui.newsTimer < 1, "Timer should reset after cycling");
});

