'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Unified ambient background for the landing page.
 *
 * Replaces the per-section fills (hero vignette, card surfaces, footer slab)
 * with one continuous surface that runs from the hero through to the footer.
 * Two fixed layers sit behind the content:
 *
 *  1. A scroll-driven gradient. The colour ramp is painted once onto a strip
 *     three viewports tall and then moved with a single composited transform.
 *     Scrolling therefore costs one `translate3d` per frame rather than a
 *     repaint per section, and because the strip is oversized the gradient can
 *     never run out before the last section.
 *  2. A cursor-following radial glow, carried on its own small element and
 *     moved with `translate3d`. Animating a full-viewport `radial-gradient`
 *     through a CSS custom property would repaint the entire viewport on every
 *     pointer move; translating a pre-painted element does not.
 *
 * Both scroll progress and pointer position are damped with a lerp toward
 * their targets rather than being applied raw. That lag is the "scroll
 * physics" — the light trails the page slightly instead of snapping to it.
 *
 * Every DOM write goes through a ref; none of this touches React state, so
 * scrolling never re-renders the tree. All updates are coalesced into a single
 * rAF, and the loop stops itself once both values have settled.
 */

/** Edge of the glow element in px. Also used to centre it on the pointer. */
const GLOW_SIZE = 560;

/** Lerp factors, expressed per 60fps frame. Lower = heavier/more trailing. */
const SCROLL_EASE = 0.12;
const POINTER_EASE = 0.09;

/** Below these deltas we consider a value settled and stop the loop. */
const SCROLL_EPSILON = 0.0005;
const POINTER_EPSILON = 0.4;

/**
 * Rescale a per-60fps-frame lerp factor for however many frames actually
 * elapsed, so the trail takes the same wall-clock time to settle on a 30Hz
 * panel as on a 144Hz one. A fixed per-frame factor would make the scroll
 * physics refresh-rate dependent.
 */
function easeFor(perFrame: number, frames: number) {
  return 1 - Math.pow(1 - perFrame, frames);
}

/**
 * Obsidian -> slate -> teal -> deep emerald.
 *
 * Stops are placed inside the first two thirds of the strip because that is
 * the range the viewport actually travels across as the strip is translated
 * from 0 to -200vh. Everything past 66.6% holds the final colour so the
 * overscroll region below the footer stays smooth.
 */
const AMBIENT_GRADIENT = [
  'linear-gradient(180deg,',
  '#08090c 0%,', /* obsidian */
  '#0a0e12 11%,',
  '#0b1317 22%,', /* slate */
  '#0c1a1d 33%,', /* teal */
  '#0c1e1c 44%,',
  '#0b1e19 55%,',
  '#0a1714 66.6%,', /* deep emerald */
  '#0a1714 100%)',
].join(' ');

/** Spec colour: rgba(16, 185, 129, 0.15), faded out toward the rim. */
const GLOW_BACKGROUND = [
  'radial-gradient(circle,',
  'rgba(16, 185, 129, 0.15) 0%,',
  'rgba(16, 185, 129, 0.075) 38%,',
  'rgba(16, 185, 129, 0) 70%)',
].join(' ');

export function AmbientBackdrop() {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  const stripRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLanding) return;

    const strip = stripRef.current;
    const glow = glowRef.current;
    if (!strip) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    // Touch devices have no hover, so the glow would just sit parked.
    const glowEnabled = () => !reducedMotion.matches && finePointer.matches;

    let targetScroll = 0;
    let easedScroll = 0;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let easedX = pointerX;
    let easedY = pointerY;
    let pointerSeen = false;

    // Vertical travel available to the gradient, i.e. strip height minus one
    // viewport. Recomputed on resize only.
    let travel = 1;
    let frame = 0;
    let lastTime = 0;

    const readScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      targetScroll = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      kick();
    };

    const measure = () => {
      travel = Math.max(1, strip.offsetHeight - window.innerHeight);
      readScroll();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerSeen = true;
      kick();
    };

    const tick = (now: number) => {
      frame = 0;

      // Cap the step at ~6 frames so a backgrounded tab that resumes does not
      // snap straight to the target and lose the easing entirely.
      const frames = Math.min(6, ((now - lastTime) / 1000) * 60);
      lastTime = now;

      easedScroll += (targetScroll - easedScroll) * easeFor(SCROLL_EASE, frames);
      easedX += (pointerX - easedX) * easeFor(POINTER_EASE, frames);
      easedY += (pointerY - easedY) * easeFor(POINTER_EASE, frames);

      strip.style.transform = `translate3d(0, ${(-easedScroll * travel).toFixed(2)}px, 0)`;

      if (glow) {
        if (glowEnabled() && pointerSeen) {
          glow.style.opacity = '1';
          glow.style.transform =
            `translate3d(${(easedX - GLOW_SIZE / 2).toFixed(2)}px, ` +
            `${(easedY - GLOW_SIZE / 2).toFixed(2)}px, 0)`;
        } else {
          glow.style.opacity = '0';
        }
      }

      const scrollSettled = Math.abs(targetScroll - easedScroll) < SCROLL_EPSILON;
      const pointerSettled =
        !glowEnabled() ||
        !pointerSeen ||
        (Math.abs(pointerX - easedX) < POINTER_EPSILON &&
          Math.abs(pointerY - easedY) < POINTER_EPSILON);

      // Keep going only while something is still visibly moving.
      if (!scrollSettled || !pointerSettled) kick();
    };

    function kick() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    measure();
    // Place the gradient correctly before the first eased frame lands.
    strip.style.transform = `translate3d(0, ${(-targetScroll * travel).toFixed(2)}px, 0)`;
    lastTime = performance.now();
    kick();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [isLanding]);

  if (!isLanding) return null;

  return (
    <div
      data-ambient-root
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div
        ref={stripRef}
        className="absolute inset-x-0 top-0 h-[300%] will-change-transform"
        style={{ backgroundImage: AMBIENT_GRADIENT }}
      />
      <div
        ref={glowRef}
        className="absolute top-0 left-0 opacity-0 transition-opacity duration-500 will-change-transform"
        style={{ width: GLOW_SIZE, height: GLOW_SIZE, background: GLOW_BACKGROUND }}
      />
    </div>
  );
}