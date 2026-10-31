import * as React from "react";

import { cn } from "./utils";

type AutoGrowTextareaProps = React.ComponentProps<"textarea"> & {
  /** Tallest the box gets (px) before it scrolls instead of growing. */
  maxHeight?: number;
};

/**
 * A textarea that grows with its content up to `maxHeight`, then scrolls.
 * Done in JS rather than `field-sizing: content` because Safari and Firefox
 * don't support that yet.
 */
function AutoGrowTextarea({ className, maxHeight = 200, value, style, ...props }: AutoGrowTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight excludes borders; height (border-box) includes them.
    const borders = el.offsetHeight - el.clientHeight;
    const full = el.scrollHeight + borders;
    el.style.height = `${Math.min(full, maxHeight)}px`;
    el.style.overflowY = full > maxHeight ? "auto" : "hidden";
  }, [maxHeight]);

  React.useLayoutEffect(resize, [value, resize]);

  React.useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      style={style}
      className={cn("resize-none", className)}
      {...props}
    />
  );
}

export { AutoGrowTextarea };
