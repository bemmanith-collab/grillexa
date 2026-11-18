import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { festiveToday, festiveCopy, festiveYear, indiaDate } from '../lib/festive';

// Christmas Eve, Christmas Day, New Year's Eve and New Year's Day: the day's
// look switches on by itself (India time) and off at the next midnight.
//
// Two pieces. The colours, buttons and banner are plain CSS keyed off
// <html data-festive="…"> (festive.css). This component draws what CSS
// cannot: the mascot's hat, the string of lights, and snow / fireworks /
// sunrise light on a canvas. All of it ignores the pointer, so nothing here
// can ever sit between someone and a button.
//
// It renders into <body> through a portal, beside #root rather than inside
// it, so it sits in the same layer as the wallpaper (body::before) whatever
// stacking the app's own wrappers create.

export function applyFestive(day) {
  if (day) document.documentElement.dataset.festive = day;
  else delete document.documentElement.dataset.festive;
}

export function useFestive() {
  const [day, setDay] = useState(() => festiveToday());
  useEffect(() => {
    // Re-checked every minute so an app left open turns festive at midnight
    // and back to normal at the next one.
    const timer = setInterval(() => setDay(festiveToday()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => applyFestive(day), [day]);
  return day;
}

const SANTA = (
  <svg viewBox="0 0 200 150" aria-hidden="true">
    <path d="M18 112 C40 40 110 6 168 28 C150 40 146 70 150 110 Z" fill="#c0262d" />
    <path d="M168 28 C182 34 190 52 186 66" stroke="#c0262d" strokeWidth="16" fill="none" strokeLinecap="round" />
    <circle cx="186" cy="72" r="14" fill="#fff" />
    <rect x="6" y="104" width="160" height="30" rx="15" fill="#fff" />
    <path d="M40 70 C70 50 110 40 140 44" stroke="rgba(255,255,255,.18)" strokeWidth="6" fill="none" strokeLinecap="round" />
  </svg>
);

const PARTY = (
  <svg viewBox="0 0 120 150" aria-hidden="true">
    <defs>
      <clipPath id="festive-cone">
        <path d="M60 8 L104 132 L16 132 Z" />
      </clipPath>
    </defs>
    <path d="M60 8 L104 132 L16 132 Z" fill="#f2c14e" />
    <g clipPath="url(#festive-cone)" fill="#e2551b">
      <rect x="-20" y="40" width="160" height="14" transform="rotate(-18 60 47)" />
      <rect x="-20" y="80" width="160" height="14" transform="rotate(-18 60 87)" />
      <rect x="-20" y="120" width="160" height="14" transform="rotate(-18 60 127)" />
    </g>
    <circle cx="60" cy="10" r="10" fill="#fff" />
    <path d="M12 134 Q60 146 108 134" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" />
  </svg>
);

const BULBS = ['#f2c14e', '#ff6b5e', '#7fd6a4', '#79c7ff', '#ffb36b'];

function Lights() {
  let path = 'M0 4 ';
  for (let x = 0; x <= 1000; x += 50) path += `Q ${x + 25} 16 ${x + 50} 4 `;
  return (
    <div className="festive-lights" aria-hidden="true">
      <svg viewBox="0 0 1000 24" preserveAspectRatio="none">
        <path d={path} stroke="#2b3f46" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: 20 }, (_, i) => (
          <ellipse
            key={i}
            className="festive-bulb"
            cx={25 + i * 50}
            cy="14"
            rx="4"
            ry="6"
            fill={BULBS[i % BULBS.length]}
            style={{ animationDelay: `${(i % 5) * 0.45}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

const MODE = { 'xmas-eve': 'snow', xmas: 'heavy', nye: 'fireworks', ny: 'dawn' };
const FIRE = ['#f2c14e', '#ff8a4c', '#ffffff', '#c9a7ff', '#79c7ff'];

// Snow, fireworks or rising specks of morning light. Fewer particles on a
// small screen; one still frame for anyone who asked for reduced motion; and
// nothing at all is drawn while the app is in the background.
function Sky({ mode }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let parts = [];
    let raf = 0;

    function size() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function burst(anyAge) {
      const cx = w * (0.15 + Math.random() * 0.7);
      const cy = h * (0.08 + Math.random() * 0.35);
      const c = FIRE[(Math.random() * FIRE.length) | 0];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2;
        const sp = 1 + Math.random() * 1.8;
        // Born as a small ring, not a dot: a burst read as a blob for its
        // first few frames.
        parts.push({
          x: cx + Math.cos(a) * sp * 6,
          y: cy + Math.sin(a) * sp * 6,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: anyAge ? 30 + Math.random() * 40 : 70,
          c,
        });
      }
    }
    function seed() {
      size();
      const area = (w * h) / (1280 * 800);
      const base = { snow: 70, heavy: 150, dawn: 50 }[mode] || 0;
      const n = Math.round(base * Math.min(1, Math.max(0.35, area)));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 2.4,
        s: 0.3 + Math.random() * 0.9,
        wob: Math.random() * Math.PI * 2,
      }));
      if (mode === 'fireworks') for (let i = 0; i < 3; i++) burst(true);
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      if (mode === 'fireworks') {
        if (!still && Math.random() < 0.022) burst(false);
        parts = parts.filter((p) => p.life > 0);
        for (const p of parts) {
          if (!still) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.02;
            p.vx *= 0.985;
            p.life -= 1;
          }
          ctx.globalAlpha = Math.min(1, p.life / 40);
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        for (const p of parts) {
          if (!still) {
            p.wob += 0.02;
            p.x += Math.sin(p.wob) * 0.3;
            if (mode === 'dawn') {
              p.y -= p.s * 0.35;
              if (p.y < -6) {
                p.y = h + 6;
                p.x = Math.random() * w;
              }
            } else {
              p.y += p.s;
              if (p.y > h + 6) {
                p.y = -6;
                p.x = Math.random() * w;
              }
            }
          }
          ctx.fillStyle = mode === 'dawn'
            ? `rgba(255,226,180,${0.25 + 0.45 * Math.abs(Math.sin(p.wob))})`
            : 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, mode === 'dawn' ? p.r * 1.1 : p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!still && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function wake() {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    }

    // A resize clears the canvas; a running loop repaints it next frame, a
    // still one has to be repainted here. (Never start a second loop.)
    function onResize() {
      seed();
      if (still) frame();
    }

    seed();
    frame();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', wake);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [mode]);
  return <canvas ref={ref} className="festive-sky" aria-hidden="true" />;
}

// Today's words, or null on an ordinary day. The year is India's, like the day.
export function useFestiveCopy() {
  const day = useFestive();
  return day ? { day, ...festiveCopy(day, festiveYear(day, indiaDate())) } : null;
}

const STAR = (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 4l7.6 17.4L58 23l-14 12.4L48 54 32 44.6 16 54l4-18.6L6 23l18.4-1.6z" fill="#f2c14e" />
  </svg>
);

const GIFT = (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="8" y="24" width="48" height="34" rx="4" fill="#fff" />
    <rect x="4" y="16" width="56" height="12" rx="3" fill="#ffe7e0" />
    <rect x="28" y="16" width="8" height="42" fill="#f2c14e" />
    <path d="M32 16c-6-10-18-10-16-2 2 5 12 2 16 2zm0 0c6-10 18-10 16-2-2 5-12 2-16 2z" fill="#f2c14e" />
  </svg>
);

// The banner at the top of My Dashboard on a festive day.
export function FestiveBanner() {
  const copy = useFestiveCopy();
  if (!copy) return null;
  const mark = copy.day === 'xmas-eve' ? STAR : copy.day === 'xmas' ? GIFT : copy.year;
  return (
    <div className={`festive-banner ${copy.day}`} role="note">
      <div className="festive-banner-text">
        <div className="festive-banner-title">{copy.title}</div>
        <div className="festive-banner-detail">{copy.detail}</div>
      </div>
      <div className="festive-banner-mark">{mark}</div>
    </div>
  );
}

export default function FestiveLayer({ day }) {
  if (!day) return null;
  const christmas = day === 'xmas-eve' || day === 'xmas';
  return createPortal(
    <>
      <div className="festive-layer" aria-hidden="true">
        <Sky mode={MODE[day]} />
        {(christmas || day === 'nye') && (
          <div className="festive-mascot">
            <div className={christmas ? 'festive-hat festive-hat-santa' : 'festive-hat festive-hat-party'}>
              {christmas ? SANTA : PARTY}
            </div>
          </div>
        )}
      </div>
      {christmas && <Lights />}
    </>,
    document.body
  );
}
