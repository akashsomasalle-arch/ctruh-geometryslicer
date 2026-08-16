export interface HomeOptions {
  onStart?: () => void;
}

export interface HomeApi {
  setActive: (active: boolean) => void;
}

export function initHome(
  root: Element | null = document.querySelector("#home"),
  options: HomeOptions = {}
): HomeApi | null {
  if (!(root instanceof HTMLElement)) return null;

  spawnParticles(root, true);
  playTextLoadAnimation(root);
  playEntranceFades(root);
  bindStartHover(root);
  const parallax = bindParallax(root);

  root.querySelector(".brand")?.addEventListener("click", (event) => {
    if (!(event instanceof MouseEvent) || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.location.reload();
  });

  root.querySelector("#btn-start")?.addEventListener("click", () => {
    options.onStart?.();
  });

  return {
    setActive(active: boolean) {
      parallax?.setActive(active);
    },
  };
}

function splitWords(el: Element | null): HTMLSpanElement[] {
  if (!el) return [];
  const words = (el.textContent ?? "").trim().split(/\s+/);
  el.textContent = "";
  return words.map((text, i) => {
    const word = document.createElement("span");
    word.className = "word";
    word.textContent = text;
    el.append(word);
    if (i < words.length - 1) el.append(document.createTextNode(" "));
    return word;
  });
}

function playTextLoadAnimation(root: HTMLElement): void {
  const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
  const title = root.querySelector("h1");
  const sub = root.querySelector(".hero-content p");

  splitWords(title).forEach((word, i) => {
    word.animate(
      [
        { opacity: 0, transform: "translateY(28px) scale(0.96)", filter: "blur(8px)" },
        { opacity: 1, transform: "none", filter: "blur(0)" },
      ],
      { duration: 800, delay: 180 + i * 120, easing: ease, fill: "both" }
    );
  });

  if (!sub) return;
  const full = (sub.textContent ?? "").trim();
  sub.textContent = "";
  sub.classList.add("is-typing");
  let i = 0;

  const tick = () => {
    i += 1;
    sub.textContent = full.slice(0, i);
    if (i < full.length) {
      window.setTimeout(tick, 22);
    } else {
      sub.classList.remove("is-typing");
    }
  };

  window.setTimeout(tick, 700);
}

function playEntranceFades(root: HTMLElement): void {
  const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
  const brand = root.querySelector(".brand");
  const credit = root.querySelector(".credit");
  const glow = root.querySelector(".hero-glow");
  const start = root.querySelector("#btn-start");

  brand?.animate(
    [
      { opacity: 0, transform: "translateY(-12px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 700, easing: ease, fill: "both" }
  );

  credit?.animate(
    [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 700, delay: 900, easing: ease, fill: "both" }
  );

  glow?.animate(
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
    ],
    { duration: 1100, easing: ease, fill: "both" }
  );

  start?.animate(
    [
      { opacity: 0, transform: "translateY(20px) scale(0.92)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 700, delay: 720, easing: ease, fill: "both" }
  );
}

function bindStartHover(root: HTMLElement): void {
  const start = root.querySelector("#btn-start");
  if (!start) return;
  const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

  start.addEventListener("pointerenter", () => {
    start.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-4px) scale(1.03)" },
      ],
      { duration: 220, fill: "forwards", easing: ease }
    );
  });

  start.addEventListener("pointerleave", () => {
    start.animate(
      [{ transform: "translateY(-4px) scale(1.03)" }, { transform: "none" }],
      { duration: 220, fill: "forwards", easing: ease }
    );
  });

  start.addEventListener("pointerdown", () => {
    start.animate(
      [{ transform: "translateY(-4px) scale(1.03)" }, { transform: "translateY(0) scale(0.97)" }],
      { duration: 90, fill: "forwards", easing: "ease-out" }
    );
  });

  start.addEventListener("pointerup", () => {
    start.animate(
      [{ transform: "translateY(0) scale(0.97)" }, { transform: "translateY(-4px) scale(1.03)" }],
      { duration: 140, fill: "forwards", easing: ease }
    );
  });
}

function bindParallax(root: HTMLElement): HomeApi {
  const glow = root.querySelector(".hero-glow") as HTMLElement | null;
  const content = root.querySelector(".hero-content") as HTMLElement | null;
  const canTrack = window.matchMedia("(pointer: fine)").matches;
  let targetX = 0;
  let targetY = 0;
  let mouseX = 0;
  let mouseY = 0;
  let idleBlend = 0;
  let orbitPhase = 0;
  let wasIdle = false;
  let x = 0;
  let y = 0;
  let last = performance.now();
  let idleSince = performance.now();
  let running = true;
  const idleAfter = 2000;
  const orbitSpeed = 0.28;

  if (canTrack) {
    root.addEventListener("pointermove", (event) => {
      idleSince = performance.now();
      idleBlend = 0;
      wasIdle = false;
      mouseX = (event.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (event.clientY / window.innerHeight - 0.5) * 2;
      targetX = mouseX;
      targetY = mouseY;
    });
  }

  const loop = (time: number) => {
    if (!running) return;
    const dt = Math.min((time - last) / 1000, 0.05);
    last = time;
    const idle = !canTrack || time - idleSince > idleAfter;

    if (idle) {
      if (!wasIdle) {
        orbitPhase = Math.atan2(y, x || 0.001);
        wasIdle = true;
      }
      idleBlend = Math.min(1, idleBlend + dt / 1.4);
      orbitPhase += dt * orbitSpeed;
      const orbitX = Math.cos(orbitPhase) * 0.85;
      const orbitY = Math.sin(orbitPhase) * 0.7;
      targetX = mouseX * (1 - idleBlend) + orbitX * idleBlend;
      targetY = mouseY * (1 - idleBlend) + orbitY * idleBlend;
    }

    const follow = 1 - Math.exp(-dt / 0.22);
    x += (targetX - x) * follow;
    y += (targetY - y) * follow;
    const pulse = 1 + Math.sin(time / 1600) * 0.04;

    if (glow) {
      glow.style.transform = `translate3d(calc(-50% + ${x * 42}px), calc(-50% + ${y * 30}px), 0) scale(${pulse})`;
    }
    if (content) {
      content.style.transform = `translate3d(${x * 18}px, ${y * 14}px, 0)`;
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);

  return {
    setActive(active: boolean) {
      running = active;
      if (active) {
        last = performance.now();
        requestAnimationFrame(loop);
      }
    },
  };
}

function spawnParticles(root: HTMLElement, animate: boolean): void {
  const layer = root.querySelector(".hero-particles");
  if (!layer) return;

  for (let i = 0; i < 36; i += 1) {
    const dot = document.createElement("span");
    const size = 2 + Math.random() * 6;
    dot.className = "particle";
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${4 + Math.random() * 92}%`;
    dot.style.top = `${4 + Math.random() * 92}%`;
    layer.append(dot);

    if (!animate) {
      dot.style.opacity = "0.45";
      continue;
    }

    dot.animate(
      [
        { transform: "translateY(0) scale(1)", opacity: 0.15 },
        { transform: `translateY(${-24 - Math.random() * 40}px) scale(1.25)`, opacity: 0.55 },
        { transform: "translateY(0) scale(1)", opacity: 0.15 },
      ],
      {
        duration: 4200 + Math.random() * 3600,
        delay: Math.random() * 1600,
        iterations: Infinity,
        easing: "ease-in-out",
      }
    );
  }
}
