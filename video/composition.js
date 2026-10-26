// Deterministic motion engine for the showcase video.
// window.__render(t) draws the frame at time t (seconds); window.__cues() lists
// the sound cues the renderer mixes in. Everything is a pure function of t, so
// any frame can be rendered alone (see preview.mjs).
(() => {
  const SB = window.STORYBOARD;
  const W = SB.width, H = SB.height;
  let META = {};

  // ------------------------------------------------------------------ helpers
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const outCubic = (k) => 1 - Math.pow(1 - k, 3);
  const outBack = (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const ramp = (t, t0, dur) => clamp((t - t0) / dur);
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; parent?.appendChild(e); return e; };
  const css = (e, styles) => Object.assign(e.style, styles);
  /** Fade in over `inDur` after t0, fade out over `outDur` before t1. */
  const window01 = (t, t0, t1, inDur = 0.35, outDur = 0.3) => Math.min(outCubic(ramp(t, t0, inDur)), 1 - ramp(t, t1 - outDur, outDur));

  function rectOf(scene, ref) {
    if (!ref) return null;
    if (typeof ref === "object") return ref;
    const shot = META[scene.shotNow ?? scene.shot] ?? META[scene.shot];
    return shot?.rects?.[ref] ?? META[scene.swap?.shot]?.rects?.[ref] ?? null;
  }
  const centerOf = (r) => [r.x + r.w / 2, r.y + r.h / 2];

  // ------------------------------------------------------------------ camera
  /** Camera keyframe → { s, cx, cy } in screenshot coordinates. */
  function camKey(scene, k) {
    if (k.rect) {
      const r = rectOf(scene, k.rect);
      if (!r) return { s: 1, cx: W / 2, cy: H / 2 };
      const s = Math.min(W / (r.w * 1.18), H / (r.h * 1.5)) * (k.zoom ?? 1);
      const [cx, cy] = centerOf(r);
      return { s: clamp(s, 1, 2.6), cx, cy };
    }
    return { s: k.scale ?? 1, cx: W / 2, cy: H / 2 };
  }
  function camera(scene, lt) {
    const keys = (scene.camera ?? [{ t: 0, scale: 1 }]).map((k) => ({ t: k.t, ...camKey(scene, k) }));
    let a = keys[0], b = keys[0];
    for (let i = 0; i < keys.length; i++) { if (keys[i].t <= lt) { a = keys[i]; b = keys[i + 1] ?? keys[i]; } }
    const span = Math.max(0.001, b.t - a.t);
    const k = a === b ? 0 : inOut(clamp((lt - a.t) / Math.min(span, 1.4)));
    let s = lerp(a.s, b.s, k), cx = lerp(a.cx, b.cx, k), cy = lerp(a.cy, b.cy, k);
    s *= 1 + lt * 0.004; // gentle continuous push-in
    let tx = W / 2 - cx * s, ty = H / 2 - cy * s;
    if (s >= 1) { tx = clamp(tx, W - W * s, 0); ty = clamp(ty, H - H * s, 0); }
    return { s, tx, ty };
  }

  // ------------------------------------------------------------------ cursor
  function cursorAt(scene, lt) {
    const keys = (scene.cursor ?? []).map((k) => ({ t: k.t, at: Array.isArray(k.at) ? k.at : centerOf(rectOf(scene, k.at.rect) ?? { x: 960, y: 540, w: 0, h: 0 }) }));
    if (!keys.length || lt < keys[0].t - 0.25) return null;
    let a = keys[0], b = keys[0];
    for (let i = 0; i < keys.length; i++) if (keys[i].t <= lt) { a = keys[i]; b = keys[i + 1] ?? keys[i]; }
    const k = a === b ? 0 : inOut(clamp((lt - a.t) / Math.max(0.001, Math.min(b.t - a.t, 0.9))));
    return { x: lerp(a.at[0], b.at[0], k), y: lerp(a.at[1], b.at[1], k), appear: outCubic(ramp(lt, keys[0].t - 0.25, 0.25)) };
  }

  const CURSOR_SVG = `<svg viewBox="0 0 34 44" width="34" height="44"><path d="M3 2 L3 34 L11 27 L17 41 L23 38 L17 25 L28 25 Z" fill="#fff" stroke="#1f1b2e" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
  const LOGO_SVG = `<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M10 26 32 14l22 12-22 12z" fill="rgb(255 255 255 / .22)"/><path d="M10 26v16l22 12 22-12V26"/><path d="M32 38v16"/><path d="M20 33v7m8-3v7m16-11v7"/></svg>`;

  // ------------------------------------------------------------------ build
  const frame = document.getElementById("frame");
  const bg = el("div", "bg", frame);
  const blobs = [el("div", "blob a", bg), el("div", "blob b", bg), el("div", "blob c", bg)];
  const dotsA = el("div", "dots", bg), dotsB = el("div", "dots", bg);
  const built = [];

  function buildShot(scene, root) {
    const stage = el("div", "stage", root);
    const imgA = el("img", "shot-img", stage); imgA.src = `assets/shots/${scene.shot}.png`;
    let imgB = null;
    if (scene.swap) { imgB = el("img", "shot-img", stage); imgB.src = `assets/shots/${scene.swap.shot}.png`; }
    const hls = (scene.highlights ?? []).map((h) => { const box = el("div", "hl", stage); const label = h.label ? el("div", "hl-label", box, h.label) : null; return { h, box, label }; });
    const ripples = (scene.clicks ?? []).map(() => el("div", "ripple", stage));
    const cursor = el("div", "cursor", stage, CURSOR_SVG);
    let caption = null;
    if (scene.caption) {
      caption = el("div", `caption${scene.captionPos === "top" ? " top" : ""}`, root);
      if (scene.step) el("div", "step", caption, `<b>${scene.step}</b>STEP`);
      el("h2", "", caption, scene.caption.title);
      el("p", "", caption, scene.caption.body);
    }
    const toasts = (scene.toasts ?? []).map((tt) => { const box = el("div", `toast${scene.captionPos === "top" ? " right" : ""}`, root); el("i", "", box, tt.icon); el("div", "", box, `<strong>${tt.text}</strong><span>${tt.sub ?? ""}</span>`); return { tt, box }; });
    return { stage, imgA, imgB, hls, ripples, cursor, caption, toasts };
  }

  function buildProblem(scene, root) {
    const lines = el("div", "p-lines", root);
    const ls = scene.lines.map((txt, i) => el("div", i === scene.lines.length - 1 ? "accent" : "", lines, txt));
    const colors = ["#fff1b8", "#d9f2e6", "#ffe0d6", "#e5e0ff", "#dbeeff"];
    const spots = [[1180, 170, -7], [1500, 300, 6], [1130, 520, 4], [1480, 640, -5], [1260, 820, 8]];
    const notes = scene.notes.map((txt, i) => { const n = el("div", "note", root, txt); css(n, { background: colors[i % colors.length], left: `${spots[i][0]}px`, top: `${spots[i][1]}px` }); return { n, spot: spots[i] }; });
    const q = el("div", "qmark", root, "?");
    return { ls, notes, q };
  }

  function buildBrand(scene, root) {
    const rings = [el("div", "ring", root), el("div", "ring", root)];
    const logo = el("div", "logo", root, LOGO_SVG);
    const title = el("div", "center-title brand-title", root, scene.title.replace("3D", "<span>3D</span>"));
    const sub = el("div", "center-title brand-sub", root, scene.subtitle);
    return { rings, logo, title, sub };
  }

  function buildDevices(scene, root) {
    const title = el("div", "d-title", root, `<h2>${scene.title}</h2><p>${scene.body}</p>`);
    const laptop = el("div", "laptop", root, `<img src="assets/shots/${scene.desk}.png">`);
    const phone = el("div", "phone", root, `<img src="assets/shots/${scene.phone}.png">`);
    return { title, laptop, phone };
  }

  function buildOutro(scene, root) {
    const logo = el("div", "logo", root, LOGO_SVG);
    const title = el("div", "center-title brand-title", root, scene.title);
    css(title, { fontSize: "78px" });
    const chips = el("div", "chips", root);
    const cs = scene.chips.map((c) => el("div", "chip", chips, `<b>✓</b>${c}`));
    const brand = el("div", "center-title brand-sub", root, `<strong style="color:#1f1b2e;font-weight:800">${scene.brand}</strong>`);
    const foot = el("div", "center-title foot", root, scene.footnote);
    return { logo, title, chips, cs, brand, foot };
  }

  function build() {
    for (const scene of SB.scenes) {
      const root = el("div", `scene ${scene.type}`, frame);
      const parts = scene.type === "shot" ? buildShot(scene, root) : scene.type === "problem" ? buildProblem(scene, root)
        : scene.type === "brand" ? buildBrand(scene, root) : scene.type === "devices" ? buildDevices(scene, root) : buildOutro(scene, root);
      built.push({ scene, root, parts });
    }
  }

  // ------------------------------------------------------------------ draw
  function drawShot(b, lt, len) {
    const { scene, parts } = b;
    const swapK = scene.swap ? inOut(ramp(lt, scene.swap.t - 0.3, 0.6)) : 0;
    scene.shotNow = swapK > 0.5 ? scene.swap.shot : scene.shot;
    const cam = camera(scene, lt);
    css(parts.stage, { transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` });
    if (parts.imgB) { parts.imgA.style.opacity = String(1 - swapK); parts.imgB.style.opacity = String(swapK); }
    for (const { h, box, label } of parts.hls) {
      const r = rectOf(scene, h.rect);
      const v = r ? window01(lt, h.t0, h.t1, 0.35, 0.3) : 0;
      const pad = 10;
      css(box, { display: v > 0.001 ? "block" : "none", left: `${(r?.x ?? 0) - pad}px`, top: `${(r?.y ?? 0) - pad}px`, width: `${(r?.w ?? 0) + pad * 2}px`, height: `${(r?.h ?? 0) + pad * 2}px`,
        opacity: String(v), transform: `scale(${lerp(1.04, 1, outCubic(clamp(v)))})` });
      if (label) css(label, { fontSize: `${24 / cam.s}px`, transform: `translateY(${(1 - v) * 10}px)` });
    }
    const cur = cursorAt(scene, lt);
    const press = (scene.clicks ?? []).reduce((p, c) => (lt >= c && lt < c + 0.16 ? 0.82 : p), 1);
    if (cur) css(parts.cursor, { display: "block", opacity: String(cur.appear * (1 - ramp(lt, len - 0.35, 0.3))), transform: `translate(${cur.x - 4}px, ${cur.y - 2}px) scale(${press / cam.s})` });
    else parts.cursor.style.display = "none";
    (scene.clicks ?? []).forEach((c, i) => {
      const k = ramp(lt, c, 0.5);
      const at = cursorAt(scene, c) ?? { x: 0, y: 0 };
      const on = lt >= c && k < 1;
      const r = (12 + 60 * outCubic(k)) / cam.s;
      css(parts.ripples[i], { display: on ? "block" : "none", left: `${at.x}px`, top: `${at.y}px`, width: `${r * 2}px`, height: `${r * 2}px`, margin: `${-r}px 0 0 ${-r}px`, opacity: String(1 - k), borderWidth: `${4 / cam.s}px` });
    });
    if (parts.caption) {
      const v = window01(lt, 0.45, len, 0.55, 0.35);
      css(parts.caption, { opacity: String(v), transform: `translateY(${(1 - outCubic(clamp(v))) * (parts.caption.classList.contains("top") ? -36 : 36)}px)` });
    }
    for (const { tt, box } of parts.toasts) {
      const k = ramp(lt, tt.t, 0.42);
      const v = lt < tt.t ? 0 : Math.min(1, 1 - ramp(lt, tt.t + 1.9, 0.3));
      css(box, { display: v > 0 ? "flex" : "none", opacity: String(v), transform: `${box.classList.contains("right") ? "" : "translateX(-50%) "}scale(${lerp(0.6, 1, outBack(k))})` });
    }
  }

  function drawProblem(b, lt) {
    const { parts } = b;
    parts.ls.forEach((l, i) => { const k = outCubic(ramp(lt, 0.2 + i * 0.7, 0.6)); css(l, { opacity: String(k), transform: `translateY(${(1 - k) * 40}px)`, filter: `blur(${(1 - k) * 8}px)` }); });
    parts.notes.forEach(({ n, spot }, i) => {
      const pop = outBack(ramp(lt, 0.55 + i * 0.32, 0.38));
      const fall = inOut(ramp(lt, 3.5 + i * 0.07, 1.0));
      css(n, { opacity: String(Math.min(clamp(pop * 1.4), 1 - fall)), transform: `translate(${fall * (i % 2 ? 60 : -40)}px, ${fall * 420}px) rotate(${spot[2] + fall * (i % 2 ? 40 : -35)}deg) scale(${clamp(pop, 0, 1.2)})` });
    });
    const q = outBack(ramp(lt, 3.9, 0.5));
    css(parts.q, { opacity: String(clamp(q)), transform: `scale(${lerp(0.4, 1, q)}) rotate(${(1 - q) * -20}deg)` });
  }

  function drawBrand(b, lt) {
    const { parts } = b;
    const k = outBack(ramp(lt, 0.15, 0.7));
    css(parts.logo, { left: `${W / 2 - 95}px`, top: "250px", transform: `scale(${lerp(0.3, 1, k)}) rotate(${(1 - k) * -18}deg)`, opacity: String(clamp(k * 1.5)) });
    parts.rings.forEach((r, i) => {
      const rk = ramp(lt, 0.3 + i * 0.35, 1.6);
      const size = 200 + rk * 520;
      css(r, { left: `${W / 2 - size / 2}px`, top: `${345 - size / 2}px`, width: `${size}px`, height: `${size}px`, opacity: String((1 - rk) * 0.9) });
    });
    const tk = outCubic(ramp(lt, 0.75, 0.7));
    css(parts.title, { top: "500px", opacity: String(tk), transform: `translateY(${(1 - tk) * 40}px)` });
    const sk = outCubic(ramp(lt, 1.25, 0.7));
    css(parts.sub, { top: "650px", opacity: String(sk), transform: `translateY(${(1 - sk) * 30}px)` });
  }

  function drawDevices(b, lt) {
    const { parts } = b;
    const tk = outCubic(ramp(lt, 0.1, 0.6));
    css(parts.title, { opacity: String(tk), transform: `translateY(${(1 - tk) * 30}px)` });
    const lk = outCubic(ramp(lt, 0.35, 0.8));
    css(parts.laptop, { left: `${700 + (1 - lk) * 160}px`, top: "360px", opacity: String(lk), transform: `scale(${1 + lt * 0.006})` });
    const pk = outBack(ramp(lt, 0.55, 0.8));
    css(parts.phone, { left: "250px", top: `${250 + (1 - clamp(pk)) * 300}px`, opacity: String(clamp(pk * 1.3)), transform: `rotate(${-4 + (1 - clamp(pk)) * -6}deg)` });
  }

  function drawOutro(b, lt) {
    const { parts } = b;
    const k = outBack(ramp(lt, 0.1, 0.7));
    css(parts.logo, { left: `${W / 2 - 95}px`, top: "170px", transform: `scale(${lerp(0.3, 1, k)})`, opacity: String(clamp(k * 1.5)) });
    const tk = outCubic(ramp(lt, 0.5, 0.7));
    css(parts.title, { top: "410px", opacity: String(tk), transform: `translateY(${(1 - tk) * 40}px)` });
    css(parts.chips, { top: "560px" });
    parts.cs.forEach((c, i) => { const ck = outBack(ramp(lt, 1.1 + i * 0.28, 0.5)); css(c, { opacity: String(clamp(ck * 1.3)), transform: `translateY(${(1 - clamp(ck)) * 30}px) scale(${lerp(0.7, 1, ck)})` }); });
    const bk = outCubic(ramp(lt, 2.2, 0.6));
    css(parts.brand, { top: "720px", fontSize: "54px", opacity: String(bk) });
    css(parts.foot, { top: "960px", opacity: String(outCubic(ramp(lt, 2.6, 0.6))) });
  }

  window.__render = (t) => {
    // Background drifts slowly for life between scenes.
    css(blobs[0], { left: `${-120 + Math.sin(t * 0.35) * 60}px`, top: `${-140 + Math.cos(t * 0.3) * 40}px` });
    css(blobs[1], { left: `${1380 + Math.cos(t * 0.28) * 70}px`, top: `${600 + Math.sin(t * 0.33) * 50}px` });
    css(blobs[2], { left: `${980 + Math.sin(t * 0.22) * 80}px`, top: `${-200 + Math.cos(t * 0.25) * 40}px` });
    css(dotsA, { left: `${-180 + t * 2}px`, top: "560px", transform: "rotate(180deg)" });
    css(dotsB, { left: `${1480 - t * 2}px`, top: "-260px" });
    for (const b of built) {
      const { scene, root } = b;
      const len = scene.end - scene.start;
      const lt = t - scene.start;
      // Each scene zooms in slightly as it arrives and eases out as it leaves.
      const vin = outCubic(ramp(lt, 0, 0.5)), vout = 1 - ramp(lt, len - 0.4, 0.4);
      const visible = t >= scene.start - 0.001 && t < scene.end;
      root.style.display = visible ? "block" : "none";
      if (!visible) continue;
      css(root, { opacity: String(Math.min(vin, vout)), transform: `scale(${lerp(1.035, 1, vin) * lerp(0.985, 1, vout)})`, filter: `blur(${(1 - Math.min(vin, vout)) * 6}px)` });
      if (scene.type === "shot") drawShot(b, lt, len);
      else if (scene.type === "problem") drawProblem(b, lt);
      else if (scene.type === "brand") drawBrand(b, lt);
      else if (scene.type === "devices") drawDevices(b, lt);
      else drawOutro(b, lt);
    }
  };

  /** Sound cues derived from the storyboard. */
  window.__cues = () => {
    const cues = [];
    for (const s of SB.scenes) {
      if (s.start > 0) cues.push({ sfx: "swoosh", t: Math.max(0, s.start - 0.25) });
      for (const c of s.clicks ?? []) cues.push({ sfx: "click", t: s.start + c });
      for (const tt of s.toasts ?? []) cues.push({ sfx: "pop", t: s.start + tt.t });
      for (const ty of s.typing ?? []) cues.push({ sfx: "typing", t: s.start + ty.t, dur: ty.dur });
      if (s.type === "problem") s.notes.forEach((_, i) => cues.push({ sfx: "pop", t: s.start + 0.55 + i * 0.32, gain: 0.7 }));
      if (s.type === "brand") cues.push({ sfx: "pop", t: s.start + 0.2 });
      if (s.type === "devices") cues.push({ sfx: "pop", t: s.start + 0.6 });
      if (s.type === "outro") { cues.push({ sfx: "pop", t: s.start + 0.15 }); s.chips.forEach((_, i) => cues.push({ sfx: "pop", t: s.start + 1.1 + i * 0.28, gain: 0.6 })); }
    }
    return cues.sort((a, b) => a.t - b.t);
  };

  window.__ready = (async () => {
    try { META = await (await fetch("assets/shots.json")).json(); } catch { META = {}; }
    build();
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    window.__render(0);
    return true;
  })();
})();
