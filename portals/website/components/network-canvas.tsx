"use client";

import { useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

function tokenToRgb(value: string) {
  const token = value.trim();
  if (!token) return "";
  if (token.startsWith("#")) {
    let hex = token.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((part) => part + part)
        .join("");
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ].join(", ");
    }
  }
  const match = token.match(/rgba?\(([^)]+)\)/);
  return match ? match[1].split(",").slice(0, 3).join(",") : "";
}

export function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const surface = canvas;
    const context = ctx;

    let points: Point[] = [];
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function seed() {
      const count = window.innerWidth < 720 ? 34 : 58;
      points = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
      }));
    }

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.floor(window.innerWidth * ratio);
      surface.height = Math.floor(window.innerHeight * ratio);
      surface.style.width = `${window.innerWidth}px`;
      surface.style.height = `${window.innerHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed();
    }

    function color(alpha: number) {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue("--vx-color-primary")
        .trim();
      const rgb = tokenToRgb(token) || "30, 81, 255";
      // canvas 2D API needs a literal rgba string built from the --vx-color-primary token
      return `rgba(${rgb}, ${alpha})`; // ds-allow
    }

    function draw() {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -20) p.x = window.innerWidth + 20;
          if (p.x > window.innerWidth + 20) p.x = -20;
          if (p.y < -20) p.y = window.innerHeight + 20;
          if (p.y > window.innerHeight + 20) p.y = -20;
        }
        context.fillStyle = color(0.58);
        context.fillRect(p.x, p.y, 2, 2);

        for (let j = i + 1; j < points.length; j += 1) {
          const q = points[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 138) {
            context.strokeStyle = color((1 - distance / 138) * 0.22);
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.stroke();
          }
        }
      }
      if (!reduce) frame = requestAnimationFrame(draw);
    }

    window.addEventListener("resize", resize);
    resize();
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="ruyin-network" aria-hidden="true" />;
}
