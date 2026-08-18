import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { shouldTrackKeyboardViewportHeight } = await jiti.import("./useViewportHeight.ts");

test("uses the visual viewport for a focused editor when the keyboard shrinks it", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: true,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), true);
});

test("does not keep the keyboard height after the visual viewport restores", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keyboardTracking: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("keeps tracking the reduced viewport while the keyboard dismisses", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keyboardTracking: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), true);
});

test("does not mistake pinch zoom for an open keyboard", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: true,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 422,
    viewportScale: 2,
  }), false);
});

test("keeps the dynamic viewport height when the visual viewport is not reduced", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: true,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("does not start keyboard tracking merely because an unfocused viewport is reduced", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), false);
});

test("keeps one viewport-tracking lifecycle across rapid blur and refocus", () => {
  let keyboardTracking = false;
  const transition = (hasFocusedEditable, viewportHeight) => {
    keyboardTracking = shouldTrackKeyboardViewportHeight({
      hasFocusedEditable,
      keyboardTracking,
      innerHeight: 844,
      viewportHeight,
      viewportScale: 1,
    });
    return keyboardTracking;
  };

  assert.equal(transition(true, 510), true, "keyboard opened");
  assert.equal(transition(false, 510), true, "focus left before dismissal started");
  assert.equal(transition(false, 620), true, "keyboard is partway through dismissal");
  assert.equal(transition(true, 590), true, "editor refocused while keyboard reverses");
  assert.equal(transition(false, 700), true, "second dismissal remains tracked");
  assert.equal(transition(false, 844), false, "tracking ends only at the resting viewport");
});
