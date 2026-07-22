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
