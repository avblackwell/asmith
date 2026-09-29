import React from "react";
import { clamp } from "./sliderModel";

/** Local copy of NumberSliderWidget/use-move's normalized mouse/touch drag. */
export function useSliderMove(onChange: (x: number) => void, onScrubEnd: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  const currentChange = React.useRef(onChange);
  const currentEnd = React.useRef(onScrubEnd);
  const [active, setActive] = React.useState(false);
  currentChange.current = onChange;
  currentEnd.current = onScrubEnd;

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let sliding = false;
    let frame = 0;

    const scrub = (clientX: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        if (rect.width) currentChange.current(clamp((clientX - rect.left) / rect.width, 0, 1));
      });
    };
    const mouseMove = (event: MouseEvent) => scrub(event.clientX);
    const touchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
      if (event.changedTouches[0]) scrub(event.changedTouches[0].clientX);
    };
    const stop = () => {
      if (!sliding) return;
      sliding = false;
      setActive(false);
      document.removeEventListener("mousemove", mouseMove);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", stop);
      requestAnimationFrame(() => currentEnd.current());
    };
    const start = () => {
      if (sliding) return;
      sliding = true;
      setActive(true);
      document.addEventListener("mousemove", mouseMove);
      document.addEventListener("mouseup", stop);
      document.addEventListener("touchmove", touchMove, { passive: false });
      document.addEventListener("touchend", stop);
    };
    const mouseDown = (event: MouseEvent) => { start(); mouseMove(event); };
    const touchStart = (event: TouchEvent) => { start(); touchMove(event); };
    root.addEventListener("mousedown", mouseDown);
    root.addEventListener("touchstart", touchStart, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("mousedown", mouseDown);
      root.removeEventListener("touchstart", touchStart);
      document.removeEventListener("mousemove", mouseMove);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", stop);
    };
  }, []);

  return { ref, active };
}
