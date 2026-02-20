export function bootAll() {
  // Wait for jQuery + plugin
  // @ts-ignore
  const ready = !!(window.jQuery && window.jQuery.fn && window.jQuery.fn.ripples);
  if (!ready) { requestAnimationFrame(bootAll); return; }

  const $ = (window as any).jQuery;

  document.querySelectorAll<HTMLElement>(".ripple-tile").forEach((el) => {
    if (el.dataset.ripplesInit) return;
    el.dataset.ripplesInit = "1";

    const url = el.getAttribute("data-img") || "";

    // Initialize with imageUrl (so the canvas is the ONLY source)
    const $el = $(el);
    $el.ripples({
      imageUrl: url,
      resolution: 256,
      dropRadius: 10,
      perturbance: 0.016,   // fast settle
      interactive: true,
      crossOrigin: ""       // okay to keep; helps if CDN sends CORS headers
    });

    // Make sure no CSS background remains
    el.style.background = "none";

    // Optional: extra “trail” drops for that water-drag feel
    let last = 0, rate = 28;
    el.addEventListener("pointermove", (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < rate) return;
      last = now;
      const r = el.getBoundingClientRect();
      $el.ripples("drop", e.clientX - r.left, e.clientY - r.top, 7, 0.012);
    }, { passive: true });

    el.addEventListener("pointerenter", (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      $el.ripples("drop", e.clientX - r.left, e.clientY - r.top, 12, 0.024);
    }, { passive: true });
  });
}
