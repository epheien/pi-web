"use client";

import { useEffect } from "react";

interface ViewportHeightState {
  hasFocusedEditable: boolean;
  innerHeight: number;
  viewportHeight: number;
  viewportScale: number;
}

const VIEWPORT_TRACKING_MS = 750;
const VIEWPORT_SMOOTHING_TIME_CONSTANT_MS = 40;
const VIEWPORT_HEIGHT_SNAP_EPSILON = 0.5;

export function getSmoothedViewportHeight(
  currentHeight: number,
  targetHeight: number,
  elapsedMs: number,
  reduceMotion = false,
): number {
  if (reduceMotion || Math.abs(targetHeight - currentHeight) <= VIEWPORT_HEIGHT_SNAP_EPSILON) {
    return targetHeight;
  }

  // Exponential easing stays continuous when WebKit changes its target height
  // during the keyboard animation. A 40ms time constant settles a typical
  // phone keyboard transition in roughly 240–280ms.
  const boundedElapsed = Math.max(0, Math.min(elapsedMs, 64));
  const progress = 1 - Math.exp(-boundedElapsed / VIEWPORT_SMOOTHING_TIME_CONSTANT_MS);
  const nextHeight = currentHeight + (targetHeight - currentHeight) * progress;
  return Math.abs(targetHeight - nextHeight) <= VIEWPORT_HEIGHT_SNAP_EPSILON
    ? targetHeight
    : nextHeight;
}

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
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId: number | null = null;
    let trackUntil = 0;
    let renderedHeight: number | null = null;
    let lastFrameTimestamp: number | null = null;
    // Read the CSS-sized shell rather than innerHeight. In an iOS standalone
    // app the stylesheet deliberately uses 100vh because innerHeight/100dvh
    // can omit the status-bar strip while still laying the page out from y=0.
    let restingHeight = root.getBoundingClientRect().height || window.innerHeight;

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

      const isUnscaled = Math.abs(viewport.scale - 1) < 0.01;
      let heightIsSettled = true;
      if (!isUnscaled) {
        renderedHeight = null;
        lastFrameTimestamp = null;
        clearHeight();
        restingHeight = root.getBoundingClientRect().height || window.innerHeight;
      } else if (useVisualViewport || renderedHeight !== null) {
        const targetHeight = useVisualViewport ? viewport.height : restingHeight;
        const currentHeight = renderedHeight ?? restingHeight;
        const elapsedSinceLastFrame = lastFrameTimestamp === null
          ? 16
          : timestamp - lastFrameTimestamp;
        // Treat a new animation after an idle period as its first frame. Using
        // the full idle duration would make the blur transition jump almost
        // directly to its final height before the next frame is painted.
        const elapsedMs = elapsedSinceLastFrame > 64 ? 16 : elapsedSinceLastFrame;
        renderedHeight = getSmoothedViewportHeight(
          currentHeight,
          targetHeight,
          elapsedMs,
          reducedMotionQuery.matches,
        );
        lastFrameTimestamp = timestamp;
        heightIsSettled = renderedHeight === targetHeight;

        if (!useVisualViewport && heightIsSettled) {
          renderedHeight = null;
          lastFrameTimestamp = null;
          clearHeight();
        } else {
          root.style.setProperty("--app-viewport-height", `${renderedHeight}px`);
        }
      } else {
        lastFrameTimestamp = null;
        clearHeight();
        restingHeight = root.getBoundingClientRect().height || window.innerHeight;
      }

      if (timestamp < trackUntil || !heightIsSettled) {
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
