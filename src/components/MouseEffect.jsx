import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function MouseEffect({ active }) {
  const wrapRef = useRef(null);
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    const wrap = wrapRef.current;
    if (!dot || !ring || !wrap) return;

    gsap.set(dot, { xPercent: -50, yPercent: -50 });
    gsap.set(ring, { xPercent: -50, yPercent: -50 });

    const xDot = gsap.quickTo(dot, "x", { duration: 0.35, ease: "power3" });
    const yDot = gsap.quickTo(dot, "y", { duration: 0.35, ease: "power3" });
    const xRing = gsap.quickTo(ring, "x", { duration: 0.7, ease: "power3" });
    const yRing = gsap.quickTo(ring, "y", { duration: 0.7, ease: "power3" });

    let shown = false;

    const onMove = (e) => {
      if (!shown) {
        shown = true;
        gsap.to(wrap, { opacity: 1, duration: 0.3 });
      }
      xDot(e.clientX);
      yDot(e.clientY);
      xRing(e.clientX);
      yRing(e.clientY);
    };

    const onOver = (e) => {
      if (e.target.closest("a, button, .chip, input, textarea, select")) {
        ring.classList.add("grow");
      } else {
        ring.classList.remove("grow");
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
    };
  }, [active]);

  return (
    <div className="mouse-effect" ref={wrapRef} aria-hidden="true">
      <div className="circle" ref={dotRef} />
      <div className="circle-follow" ref={ringRef} />
    </div>
  );
}
