"use client";

import { useEffect, type RefObject } from "react";

interface KeyboardViewportState {
  hasFocusedEditable: boolean;
  keepTrackingAfterFocusLoss: boolean;
  keyboardTracking: boolean;
  innerHeight: number;
  viewportHeight: number;
  viewportScale: number;
}

interface KeyboardViewportGeometry {
  height: number;
  newSessionCenterOffset: number;
}

const VIEWPORT_TRACKING_MS = 750;
const KEYBOARD_VIEWPORT_THRESHOLD = 1;

export function shouldTrackKeyboardViewportHeight({
  hasFocusedEditable,
  keepTrackingAfterFocusLoss,
  keyboardTracking,
  innerHeight,
  viewportHeight,
  viewportScale,
}: KeyboardViewportState): boolean {
  const isUnscaled = Math.abs(viewportScale - 1) < 0.01;
  const viewportIsReduced = innerHeight - viewportHeight > KEYBOARD_VIEWPORT_THRESHOLD;
  return isUnscaled
    && viewportIsReduced
    && (hasFocusedEditable || (keepTrackingAfterFocusLoss && keyboardTracking));
}

export function getKeyboardViewportGeometry(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
): KeyboardViewportGeometry {
  const offsetTop = Math.max(0, viewportOffsetTop);
  const keyboardInset = Math.max(0, innerHeight - viewportHeight);

  return {
    height: viewportHeight + offsetTop,
    // WebKit can report the shrinking height before it reports the visual
    // viewport's top offset. Compensate both values so a vertically centered
    // fresh-session composer stays at the same screen position throughout.
    newSessionCenterOffset: keyboardInset + offsetTop,
  };
}

function hasFocusedEditableElement(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;

  return activeElement.isContentEditable
    || activeElement.tagName === "INPUT"
    || activeElement.tagName === "SELECT"
    || activeElement.tagName === "TEXTAREA";
}

function isStandaloneDisplayMode(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches
    || iosNavigator.standalone === true;
}

/**
 * Keep the app height aligned with the visual viewport while a mobile keyboard
 * is opening or closing. The shell follows WebKit's measured height directly;
 * an independent easing animation can leave the focused composer below the
 * keyboard and cause iOS to pan the layout viewport.
 */
export function useViewportHeight(viewportRootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const viewportRoot = viewportRootRef.current;
    if (!viewport || !viewportRoot) return;

    let frameId: number | null = null;
    let trackUntil = 0;
    let keyboardViewportActive = false;
    const keepTrackingAfterFocusLoss = isStandaloneDisplayMode();

    const clearViewportGeometry = () => {
      viewportRoot.style.removeProperty("--app-viewport-height");
      viewportRoot.style.removeProperty("--app-new-session-center-offset");
    };

    const update = (timestamp: number) => {
      frameId = null;
      const trackKeyboardViewport = shouldTrackKeyboardViewportHeight({
        hasFocusedEditable: hasFocusedEditableElement(),
        // Standalone WebKit can leave the reduced viewport behind after focus
        // exits, so keep following it through dismissal there. Browser mode
        // restores its chrome independently; retaining a stale offset after
        // focusout visibly drags the top bar down before it settles.
        keepTrackingAfterFocusLoss,
        keyboardTracking: keyboardViewportActive,
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportScale: viewport.scale,
      });

      keyboardViewportActive = trackKeyboardViewport;
      if (trackKeyboardViewport) {
        const geometry = getKeyboardViewportGeometry(
          window.innerHeight,
          viewport.height,
          viewport.offsetTop,
        );
        // Keep the shell at the layout viewport origin, matching normal chat
        // sessions, but extend it through the bottom of the panned visual
        // viewport. Moving the shell itself makes Safari's briefly stale
        // offsetTop move the top bar after the keyboard has already vanished.
        viewportRoot.style.setProperty(
          "--app-viewport-height",
          `${geometry.height}px`,
        );
        viewportRoot.style.setProperty(
          "--app-new-session-center-offset",
          `${geometry.newSessionCenterOffset}px`,
        );
      } else {
        clearViewportGeometry();
      }

      if (timestamp < trackUntil) {
        frameId = window.requestAnimationFrame(update);
      }
    };

    // Do not cancel an already queued frame: WebKit can emit resize events
    // faster than animation frames during the keyboard transition, and
    // debounce-by-cancellation would postpone all layout work until it ends.
    const scheduleUpdate = () => {
      trackUntil = Math.max(trackUntil, performance.now() + VIEWPORT_TRACKING_MS);
      if (frameId === null) frameId = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("focusin", scheduleUpdate);
    window.addEventListener("focusout", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);

    return () => {
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("focusin", scheduleUpdate);
      window.removeEventListener("focusout", scheduleUpdate);
      window.removeEventListener("pageshow", scheduleUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      clearViewportGeometry();
    };
  }, [viewportRootRef]);
}
