"use client";

import { useEffect, type RefObject } from "react";

interface KeyboardViewportState {
  hasFocusedEditable: boolean;
  keyboardTracking: boolean;
  innerHeight: number;
  viewportHeight: number;
  viewportScale: number;
}

const VIEWPORT_TRACKING_MS = 750;
const KEYBOARD_VIEWPORT_THRESHOLD = 1;

export function shouldTrackKeyboardViewportHeight({
  hasFocusedEditable,
  keyboardTracking,
  innerHeight,
  viewportHeight,
  viewportScale,
}: KeyboardViewportState): boolean {
  const isUnscaled = Math.abs(viewportScale - 1) < 0.01;
  const viewportIsReduced = innerHeight - viewportHeight > KEYBOARD_VIEWPORT_THRESHOLD;
  return isUnscaled
    && viewportIsReduced
    && (hasFocusedEditable || keyboardTracking);
}

function hasFocusedEditableElement(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;

  return activeElement.isContentEditable
    || activeElement.tagName === "INPUT"
    || activeElement.tagName === "SELECT"
    || activeElement.tagName === "TEXTAREA";
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

    const clearHeight = () => {
      viewportRoot.style.removeProperty("--app-viewport-height");
    };

    const update = (timestamp: number) => {
      frameId = null;
      const trackKeyboardViewport = shouldTrackKeyboardViewportHeight({
        hasFocusedEditable: hasFocusedEditableElement(),
        // Keep following visualViewport after focusout. On iOS, focus leaves
        // before the keyboard starts expanding the viewport; restoring the
        // full shell at that point puts the composer behind the still-visible
        // keyboard and makes rapid blur/refocus transitions race each other.
        keyboardTracking: keyboardViewportActive,
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportScale: viewport.scale,
      });

      keyboardViewportActive = trackKeyboardViewport;
      if (trackKeyboardViewport) {
        // visualViewport already reports WebKit's keyboard animation frame by
        // frame. Mirroring it keeps the composer inside the visible geometry
        // instead of creating a second animation that can lag or reverse.
        viewportRoot.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      } else {
        clearHeight();
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
      clearHeight();
    };
  }, [viewportRootRef]);
}
