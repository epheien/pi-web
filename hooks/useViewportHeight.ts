"use client";

import { useEffect } from "react";

interface ViewportHeightState {
  hasFocusedEditable: boolean;
  innerHeight: number;
  viewportHeight: number;
  viewportScale: number;
}

const VIEWPORT_TRACKING_MS = 750;

export function shouldUseVisualViewportHeight({
  hasFocusedEditable,
  innerHeight,
  viewportHeight,
  viewportScale,
}: ViewportHeightState): boolean {
  const isUnscaled = Math.abs(viewportScale - 1) < 0.01;
  return hasFocusedEditable && isUnscaled && innerHeight - viewportHeight > 1;
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
 * is open. Only resize the app here: forcing the layout viewport back to the
 * origin while WebKit is animating its visual viewport causes visible jumps.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frameId: number | null = null;
    let trackUntil = 0;

    const clearHeight = () => {
      root.style.removeProperty("--app-viewport-height");
    };

    const update = (timestamp: number) => {
      frameId = null;
      const useVisualViewport = shouldUseVisualViewportHeight({
        // Stop constraining the app on the first frame after focus leaves an
        // editor. Safari can report the reduced visual viewport for another
        // 0.5–1s, but keeping that stale height makes the composer feel stuck.
        hasFocusedEditable: hasFocusedEditableElement(),
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportScale: viewport.scale,
      });

      if (useVisualViewport) {
        root.style.setProperty("--app-viewport-height", `${viewport.height}px`);
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
  }, []);
}
