import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getSmoothedViewportHeight, shouldUseVisualViewportHeight } = await jiti.import("./useViewportHeight.ts");

test("smooths a viewport height jump over multiple frames", () => {
  const first = getSmoothedViewportHeight(844, 524, 16);
  const second = getSmoothedViewportHeight(first, 524, 16);

  assert.ok(first < 844 && first > 524);
  assert.ok(second < first && second > 524);
});

test("snaps viewport height at the target and when motion is reduced", () => {
  assert.equal(getSmoothedViewportHeight(524.4, 524, 16), 524);
  assert.equal(getSmoothedViewportHeight(844, 524, 16, true), 524);
});

test("uses the visual viewport for a focused editor when the keyboard shrinks it", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), true);
});

test("does not keep the keyboard height after the visual viewport restores", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("restores the dynamic height as soon as the editor loses focus", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: false,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), false);
});

test("does not mistake pinch zoom for an open keyboard", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 422,
    viewportScale: 2,
  }), false);
});

test("keeps the dynamic viewport height when the visual viewport is not reduced", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});
