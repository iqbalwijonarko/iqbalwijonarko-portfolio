/*
 * Renders every section of the site from content.json.
 * All content edits happen in content.json only — this file just displays it.
 */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  let content;
  try {
    const res = await fetch("content.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    content = await res.json();
  } catch (err) {
    showLoadError();
    return;
  }

  renderHeader(content.site);
  renderAbout(content.about);
  renderCards("experience-grid", content.experience, function (item) {
    return expCard(item.logo, item.company, item.logoBackground, item.title, item.dates, item.url);
  });
  renderCards("education-grid", content.education, function (item) {
    return expCard(item.logo, item.school, item.logoBackground, item.degree, item.detail, item.url);
  });
  renderCards("projects-grid", content.projects, projectCard);
  renderContact(content.contact);

  setupReveal();
  setupPhotoTilt();
  setupCountUp();
  setupBackToTop();
  setupCarouselControls();
}

/* Apple-style prev/next buttons under each mobile carousel. Adds a control pair
   below every .card-grid; scrolls one card per click and disables at each end.
   Hidden on desktop via CSS (the grid isn't a scroller there). */
function setupCarouselControls() {
  const CHEVRON_LEFT =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEVRON_RIGHT =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 6l6 6-6 6" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  document.querySelectorAll(".card-grid").forEach(function (grid) {
    const nav = document.createElement("div");
    nav.className = "carousel-nav";
    nav.setAttribute("aria-hidden", "true"); // swiping is the primary control; buttons are an aid
    nav.innerHTML =
      '<button type="button" class="carousel-btn" data-dir="prev" aria-label="Previous">' + CHEVRON_LEFT + "</button>" +
      '<button type="button" class="carousel-btn" data-dir="next" aria-label="Next">' + CHEVRON_RIGHT + "</button>";
    grid.insertAdjacentElement("afterend", nav);

    const prev = nav.querySelector('[data-dir="prev"]');
    const next = nav.querySelector('[data-dir="next"]');

    function step() {
      const card = grid.firstElementChild;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 14;
      return card ? card.getBoundingClientRect().width + gap : grid.clientWidth * 0.8;
    }

    function update() {
      const max = grid.scrollWidth - grid.clientWidth;
      prev.disabled = grid.scrollLeft <= 2;
      next.disabled = grid.scrollLeft >= max - 2;
    }

    prev.addEventListener("click", function () { grid.scrollBy({ left: -step(), behavior: "smooth" }); });
    next.addEventListener("click", function () { grid.scrollBy({ left: step(), behavior: "smooth" }); });

    let ticking = false;
    grid.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(function () { update(); ticking = false; }); ticking = true; }
    }, { passive: true });

    window.addEventListener("resize", update);
    update();
  });
}

/* Count-up: metric figures tick from 0 up to their value the first time the
   row scrolls into view. Prefix/suffix ($, ×, %, B) are preserved — only the
   number animates. Skipped for reduced-motion / no IntersectionObserver, in
   which case the final values (already in the DOM) simply stay put. */
function setupCountUp() {
  const els = Array.prototype.slice.call(document.querySelectorAll(".metric-value"));
  if (!els.length) return;

  const items = els.map(function (el) {
    const raw = el.textContent.trim();
    const m = raw.match(/^([^\d]*)([\d.,]+)(.*)$/);
    if (!m) return { el: el, animate: false };
    const numStr = m[2].replace(/,/g, "");
    const dot = numStr.indexOf(".");
    return {
      el: el,
      animate: true,
      prefix: m[1],
      target: parseFloat(numStr),
      decimals: dot === -1 ? 0 : numStr.length - dot - 1,
      suffix: m[3],
    };
  });

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  function fmt(item, val) {
    const num = item.decimals
      ? val.toFixed(item.decimals)
      : Math.round(val).toLocaleString("en-US");
    return item.prefix + num + item.suffix;
  }

  // Reset to zero so the final figure isn't flashed before it animates.
  items.forEach(function (item) { if (item.animate) item.el.textContent = fmt(item, 0); });

  const DURATION = 1400;
  function run(item) {
    let start = null;
    function step(now) {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick then settle
      item.el.textContent = fmt(item, item.target * eased);
      if (t < 1) requestAnimationFrame(step);
      else item.el.textContent = fmt(item, item.target);
    }
    requestAnimationFrame(step);
  }

  const obs = new IntersectionObserver(function (entries, o) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      const item = items.filter(function (it) { return it.el === entry.target; })[0];
      if (item && item.animate) run(item);
      o.unobserve(entry.target);
    });
  }, { threshold: 0.6 });
  items.forEach(function (item) { obs.observe(item.el); });
}

/* Floating "back to top" button — a minimal frosted circle (matches the nav's
   glass treatment) that fades in once you've scrolled down from the top and
   smooth-scrolls back up when clicked. */
function setupBackToTop() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "to-top";
  btn.setAttribute("aria-label", "Back to top");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M6 14l6-6 6 6" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";
  document.body.appendChild(btn);

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const THRESHOLD = 400; // px scrolled from top before the button appears
  let ticking = false;

  function update() {
    btn.classList.toggle("is-shown", window.scrollY > THRESHOLD);
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();

  btn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
}

/* Subtle 3D tilt: the headshot leans toward the cursor with a light-source
   shadow. Mouse only, and skipped entirely for reduced-motion / touch. */
function setupPhotoTilt() {
  const wrap = document.querySelector(".about-photo");
  const img = wrap && wrap.querySelector("img");
  if (!img) return;

  const mq = window.matchMedia;
  const reduce = mq && mq("(prefers-reduced-motion: reduce)").matches;
  const canHover = mq && mq("(hover: hover) and (pointer: fine)").matches;
  if (reduce || !canHover) return;

  const MAX = 6;      // max tilt, degrees
  const SCALE = 1.02; // subtle grow

  wrap.addEventListener("pointerenter", function () {
    img.style.transition = "transform 0.12s ease-out, filter 0.12s ease-out";
  });

  wrap.addEventListener("pointermove", function (e) {
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1 across
    const py = (e.clientY - r.top) / r.height;   // 0..1 down
    const ry = (px - 0.5) * 2 * MAX;             // horizontal -> rotateY
    const rx = -(py - 0.5) * 2 * MAX;            // vertical -> rotateX
    img.style.transform =
      "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) +
      "deg) scale(" + SCALE + ")";
    // drop-shadow hugs the photo's shape; offset opposite the tilt for a light source.
    const sx = -(px - 0.5) * 16;
    const sy = -(py - 0.5) * 16;
    img.style.filter =
      "drop-shadow(" + sx.toFixed(0) + "px " + (sy + 12).toFixed(0) + "px 22px rgba(0, 0, 0, 0.26))";
  });

  wrap.addEventListener("pointerleave", function () {
    img.style.transition =
      "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), filter 0.6s cubic-bezier(0.22, 1, 0.36, 1)";
    img.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
    img.style.filter = "drop-shadow(0 6px 14px rgba(0, 0, 0, 0.16))";
  });
}

/* Gentle scroll-in reveals (fade/rise) + highlighter sweep on the <mark> spans.
   Purely additive: if IntersectionObserver is missing or the visitor prefers
   reduced motion, everything is simply shown in its final state. */
function setupReveal() {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const revealEls = Array.prototype.slice.call(
    document.querySelectorAll(
      "#site-header, .about-photo, .about-intro, .metrics-eyebrow, .run-sub, .metric, .run-hero, .run-stat, .section-heading, .exp-card, .project-card, .contact-item"
    )
  );
  revealEls.forEach(function (el) { el.classList.add("reveal"); });

  // Stagger cards within each grid row for a soft cascade.
  document.querySelectorAll(".card-grid").forEach(function (grid) {
    Array.prototype.slice.call(grid.children).forEach(function (card, i) {
      card.style.transitionDelay = (i % 3) * 0.07 + "s";
    });
  });

  // Same soft cascade across the About metrics row.
  document.querySelectorAll(".about-metrics").forEach(function (row) {
    Array.prototype.slice.call(row.children).forEach(function (metric, i) {
      metric.style.transitionDelay = i * 0.07 + "s";
    });
  });

  const marks = document.querySelectorAll("mark");

  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    marks.forEach(function (m) { m.classList.add("is-visible"); });
    return;
  }

  const reveal = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  revealEls.forEach(function (el) { reveal.observe(el); });

  const sweep = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  marks.forEach(function (m) { sweep.observe(m); });
}

/* ---------- helpers ---------- */

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* {{text}} → <mark>text</mark> (escape first, then swap the braces) */
function withHighlights(str) {
  return escapeHTML(str).replace(/\{\{(.+?)\}\}/g, "<mark>$1</mark>");
}

/* ---------- sections ---------- */

function renderHeader(site) {
  document.getElementById("site-title").textContent = site.title;

  // Split the tagline on "|" into parts so mobile can stack them (and drop the
  // pipe). On desktop the parts render inline with the separator, unchanged.
  const parts = String(site.tagline).split("|").map(function (s) { return s.trim(); });
  document.getElementById("site-tagline").innerHTML = parts
    .map(function (p) { return '<span class="tagline-part">' + escapeHTML(p) + "</span>"; })
    .join('<span class="tagline-sep"> | </span>');

  document.title = site.title + " | From Technology to Strategy";
}

/* Build one About call-to-action link. External (http) links open in a new
   tab; mailto / in-page anchors stay in place. */
function ctaLink(cta, cls) {
  const external = /^https?:/i.test(cta.href);
  const target = external ? ' target="_blank" rel="noopener noreferrer"' : "";
  return (
    '<a class="' + cls + '" href="' + escapeHTML(cta.href) + '"' + target + ">" +
      escapeHTML(cta.text) +
      '<span class="about-cta-arrow" aria-hidden="true">→</span>' +
    "</a>"
  );
}

function renderAbout(about) {
  const photoBox = document.querySelector(".about-photo");
  const img = document.createElement("img");
  img.src = about.photo;
  img.alt = "Portrait of Iqbal Wijonarko";
  img.width = 300;
  photoBox.appendChild(img);

  const intro = document.querySelector(".about-intro");
  let html = '<p class="about-eyebrow">' + escapeHTML(about.eyebrow) + "</p>";
  html += '<h2 class="about-headline">' + escapeHTML(about.headline) + "</h2>";
  html += '<p class="about-lead">' + escapeHTML(about.lead) + "</p>";
  const ctas = [];
  if (about.cta && about.cta.href) ctas.push(ctaLink(about.cta, "about-cta"));
  if (about.ctaSecondary && about.ctaSecondary.href) {
    ctas.push(ctaLink(about.ctaSecondary, "about-cta about-cta--secondary"));
  }
  if (ctas.length) html += '<div class="about-ctas">' + ctas.join("") + "</div>";
  intro.innerHTML = html;

  const metricsEyebrow = document.getElementById("metrics-eyebrow");
  if (metricsEyebrow && about.metricsTitle) {
    metricsEyebrow.textContent = about.metricsTitle;
    metricsEyebrow.hidden = false;
  }

  const metricsBox = document.getElementById("about-metrics");
  metricsBox.innerHTML = (about.metrics || []).map(metricCard).join("");

  // "On the run" — a featured achievement (hero number + lighter supporting
  // stats). Values are in the static HTML (no-JS/SEO); re-render from
  // content.json so they stay editable. The shared count-up animates them.
  const runEyebrow = document.getElementById("run-eyebrow");
  if (runEyebrow && about.runTitle) runEyebrow.textContent = about.runTitle;

  const runSub = document.getElementById("run-sub");
  if (runSub && about.runSubtitle) runSub.textContent = about.runSubtitle;

  const runBox = document.getElementById("run");
  const rh = about.runHighlight;
  if (runBox && rh) {
    const stats = (rh.stats || []).map(function (s) {
      return (
        '<div class="run-stat">' +
          '<div class="metric-value run-stat-value">' + escapeHTML(s.value) + "</div>" +
          '<div class="metric-label">' + escapeHTML(s.label) + "</div>" +
        "</div>"
      );
    }).join("");
    runBox.innerHTML =
      '<div class="run-hero">' +
        '<div class="metric-value run-hero-value">' + escapeHTML(rh.value) + "</div>" +
        '<div class="metric-label">' + escapeHTML(rh.caption) + "</div>" +
      "</div>" +
      stats;
  }
}

/* Shared markup for one metric (numeral + caption), used by both the work
   "By the numbers" row and the "On the run" row. */
function metricCard(m) {
  return (
    '<div class="metric">' +
      '<div class="metric-value">' + escapeHTML(m.value) + "</div>" +
      '<div class="metric-label">' + escapeHTML(m.label) + "</div>" +
    "</div>"
  );
}

function renderCards(gridId, items, toHTML) {
  document.getElementById(gridId).innerHTML = items.map(toHTML).join("");
}

/* Shared card for Experience and Education.
   Renders as a link (new tab) when the entry has a url, otherwise a plain card. */
function expCard(logo, logoAlt, logoBackground, boldLine, subLine, url) {
  const bg = logoBackground ? ' style="background:' + escapeHTML(logoBackground) + '"' : "";
  const inner =
    '<div class="logo-area"' + bg + ">" +
      '<img src="' + escapeHTML(logo) + '" alt="' + escapeHTML(logoAlt) + ' logo">' +
    "</div>" +
    '<div class="card-footer">' +
      '<div class="card-title">' + escapeHTML(boldLine) + "</div>" +
      '<div class="card-sub">' + escapeHTML(subLine) + "</div>" +
    "</div>";

  if (url) {
    return (
      '<a class="exp-card exp-card--link" href="' + escapeHTML(url) +
        '" target="_blank" rel="noopener noreferrer">' + inner + "</a>"
    );
  }
  return '<div class="exp-card">' + inner + "</div>";
}

function projectCard(project) {
  const tags = project.tags
    .map(function (t) { return '<span class="tag">' + escapeHTML(t) + "</span>"; })
    .join("");

  const link = project.url
    ? '<a class="project-link" href="' + escapeHTML(project.url) + '" target="_blank" rel="noopener noreferrer">(URL)</a>'
    : "";

  return (
    '<div class="project-card">' +
      '<div class="project-title">' + escapeHTML(project.emoji) + " " + escapeHTML(project.name) + "</div>" +
      '<div class="project-tags">' + tags + "</div>" +
      '<p class="project-desc">' + escapeHTML(project.description) + "</p>" +
      link +
    "</div>"
  );
}

/* Contact: the first word of each text becomes the link ("email …", "connect …") */
function linkFirstWord(text, href, newTab) {
  const parts = String(text).split(" ");
  const first = parts.shift();
  const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : "";
  return (
    '<a href="' + escapeHTML(href) + '"' + target + ">" + escapeHTML(first) + "</a> " +
    escapeHTML(parts.join(" "))
  );
}

function renderContact(contact) {
  document.getElementById("contact-items").innerHTML =
    '<div class="contact-item">📧 ' +
      linkFirstWord(contact.emailText, "mailto:" + contact.email, false) +
    "</div>" +
    '<div class="contact-item">💼 ' +
      linkFirstWord(contact.linkedinText, contact.linkedin, true) +
    "</div>";
}

/* ---------- file:// fallback ---------- */

function showLoadError() {
  const isFileProtocol = window.location.protocol === "file:";
  const main = document.querySelector("main");
  main.innerHTML =
    '<div class="load-error">' +
      "<strong>Content could not be loaded.</strong><br>" +
      (isFileProtocol
        ? "You opened this page directly from a file, and browsers block reading " +
          "<code>content.json</code> over <code>file://</code>. Preview it with a tiny local server instead:<br>" +
          "1. Open Terminal in this folder.<br>" +
          "2. Run <code>python3 -m http.server 8000</code><br>" +
          "3. Open <code>http://localhost:8000</code> in your browser.<br>" +
          "(Once uploaded to your web host, the site works normally — this only affects local file previews.)"
        : "Make sure <code>content.json</code> sits in the same folder as <code>index.html</code> and is valid JSON.") +
    "</div>";
}
