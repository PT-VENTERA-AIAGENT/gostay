import { useEffect, useState } from "react";

export function useAnimatedCounter(target: number, duration: number = 1200) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const startTime = performance.now();
    let rafId: number;
    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) { rafId = requestAnimationFrame(step); }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return count;
}

export function useAnimatedValue(targetStr: string, duration: number = 1200): string {
  // Extract numeric portion from strings like "$123,980", "82%", "IDR 18.5M"
  const match = targetStr.match(/([\d,.]+)/);
  if (!match) return targetStr;

  const numStr = match[1];
  const numValue = parseFloat(numStr.replace(/,/g, ""));
  const hasDecimals = numStr.includes(".");
  const decimalPlaces = hasDecimals ? (numStr.split(".")[1]?.length || 0) : 0;

  const animatedNum = useAnimatedCounter(Math.round(numValue * Math.pow(10, decimalPlaces)), duration);
  const actualNum = animatedNum / Math.pow(10, decimalPlaces);

  const formattedNum = hasDecimals
    ? actualNum.toFixed(decimalPlaces)
    : actualNum.toLocaleString();

  return targetStr.replace(numStr, formattedNum);
}
