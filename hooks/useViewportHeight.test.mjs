import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  getKeyboardViewportGeometry,
  shouldTrackKeyboardViewportHeight,
} = await jiti.import("./useViewportHeight.ts");

test("compensates the new-session center as the keyboard first shrinks the viewport", () => {
  assert.deepEqual(getKeyboardViewportGeometry(844, 510, 0), {
    height: 510,
    newSessionCenterOffset: 334,
  });
});

test("keeps the new-session screen center stable when WebKit later pans the viewport", () => {
  const offsetTop = 120;
  const geometry = getKeyboardViewportGeometry(844, 510, offsetTop);
  const screenCenter = geometry.height / 2
    - offsetTop
    + geometry.newSessionCenterOffset / 2;

  assert.deepEqual(geometry, {
    height: 630,
    newSessionCenterOffset: 454,
  });
  assert.equal(screenCenter, 844 / 2);
});

test("uses the visual viewport for a focused editor when the keyboard shrinks it", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: true,
    keepTrackingAfterFocusLoss: false,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), true);
});

test("does not keep the keyboard height after the visual viewport restores", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keepTrackingAfterFocusLoss: true,
    keyboardTracking: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("keeps tracking the reduced viewport while the keyboard dismisses", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keepTrackingAfterFocusLoss: true,
    keyboardTracking: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), true);
});

test("does not mistake pinch zoom for an open keyboard", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: true,
    keepTrackingAfterFocusLoss: false,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 422,
    viewportScale: 2,
  }), false);
});

test("keeps the dynamic viewport height when the visual viewport is not reduced", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: true,
    keepTrackingAfterFocusLoss: false,
    keyboardTracking: false,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("does not start keyboard tracking merely because an unfocused viewport is reduced", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keepTrackingAfterFocusLoss: false,
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
      keepTrackingAfterFocusLoss: true,
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

test("browser mode stops using a stale keyboard viewport as soon as focus leaves", () => {
  assert.equal(shouldTrackKeyboardViewportHeight({
    hasFocusedEditable: false,
    keepTrackingAfterFocusLoss: false,
    keyboardTracking: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), false);
});
