import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { WorkTimerProvider } from "./WorkTimerProvider";
import { StopwatchDial, WorkTimerBar, formatElapsed } from "./WorkTimerBar";

test("compact timer stays accessible before server state is known", () => {
  const html = renderToStaticMarkup(<WorkTimerProvider adminEmail="test@example.com"><WorkTimerBar /></WorkTimerProvider>);
  assert.match(html, /aria-label="作業タイマー"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /確認中/);
  assert.match(html, /fixed bottom-3 right-3/);
  assert.match(html, /lg:sticky lg:top-12/);
});

test("circular stopwatch shows distinct running state and cumulative time", () => {
  const html = renderToStaticMarkup(<StopwatchDial seconds={90061} running />);
  assert.match(html, /<svg/);
  assert.match(html, /circle/);
  assert.match(html, /25:01:01/);
  assert.match(html, /計測中/);
});

test("elapsed time keeps hours beyond a day", () => {
  assert.equal(formatElapsed(90061), "25:01:01");
  assert.equal(formatElapsed(null), "--:--:--");
});
