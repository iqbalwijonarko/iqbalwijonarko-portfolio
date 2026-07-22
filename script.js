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
      "#site-header, .about-photo, .about-text, .section-heading, .exp-card, .project-card, .contact-item"
    )
  );
  revealEls.forEach(function (el) { el.classList.add("reveal"); });

  // Stagger cards within each grid row for a soft cascade.
  document.querySelectorAll(".card-grid").forEach(function (grid) {
    Array.prototype.slice.call(grid.children).forEach(function (card, i) {
      card.style.transitionDelay = (i % 3) * 0.07 + "s";
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
  document.getElementById("site-tagline").textContent = site.tagline;
  document.title = site.title + " | From Technology to Strategy";
}

function renderAbout(about) {
  const photoBox = document.querySelector(".about-photo");
  const img = document.createElement("img");
  img.src = about.photo;
  img.alt = "Portrait of Iqbal Wijonarko";
  img.width = 300;
  photoBox.appendChild(img);

  const textBox = document.querySelector(".about-text");
  let html = "<h2>About</h2>";
  html += '<p class="about-greeting">' + withHighlights(about.greeting) + "</p>";
  about.paragraphs.forEach(function (p) {
    html += "<p>" + withHighlights(p) + "</p>";
  });
  textBox.innerHTML = html;
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
