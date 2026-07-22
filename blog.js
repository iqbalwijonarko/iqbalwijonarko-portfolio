/*
 * Blog listing page: renders post cards from posts.json,
 * with live search and category filtering. Edit posts.json only.
 */

document.addEventListener("DOMContentLoaded", initBlog);

let ALL_POSTS = [];
let activeCategory = "All";
let searchTerm = "";

async function initBlog() {
  try {
    const res = await fetch("posts.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    ALL_POSTS = (data.posts || []).slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date); // newest first
    });
  } catch (err) {
    showBlogError();
    return;
  }

  renderFilters();
  renderPosts();

  const search = document.getElementById("post-search");
  search.addEventListener("input", function () {
    searchTerm = search.value.trim().toLowerCase();
    renderPosts();
  });
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

function formatDate(iso) {
  // Force local-time parsing for YYYY-MM-DD so the day doesn't shift by timezone.
  const local = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T00:00:00" : iso;
  const d = new Date(local);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/* ---------- filtering ---------- */

function categoryCounts() {
  const counts = {};
  ALL_POSTS.forEach(function (p) {
    const c = p.category || "Uncategorized";
    counts[c] = (counts[c] || 0) + 1;
  });
  return counts;
}

function filteredPosts() {
  return ALL_POSTS.filter(function (p) {
    const inCategory = activeCategory === "All" || p.category === activeCategory;
    if (!inCategory) return false;
    if (!searchTerm) return true;
    const haystack = (p.title + " " + p.excerpt + " " + (p.category || "")).toLowerCase();
    return haystack.indexOf(searchTerm) !== -1;
  });
}

/* ---------- rendering ---------- */

function renderFilters() {
  const counts = categoryCounts();
  const cats = ["All"].concat(Object.keys(counts).sort());
  const total = ALL_POSTS.length;

  const html = cats.map(function (cat) {
    const n = cat === "All" ? total : counts[cat];
    const active = cat === activeCategory ? " filter-pill--active" : "";
    return (
      '<button type="button" class="filter-pill' + active + '" data-cat="' + escapeHTML(cat) + '">' +
        escapeHTML(cat) + ' <span class="filter-count">(' + n + ")</span>" +
      "</button>"
    );
  }).join("");

  const wrap = document.getElementById("post-filters");
  wrap.innerHTML = html;
  wrap.querySelectorAll(".filter-pill").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCategory = btn.getAttribute("data-cat");
      renderFilters();
      renderPosts();
    });
  });
}

function renderPosts() {
  const posts = filteredPosts();
  const list = document.getElementById("post-list");

  if (!posts.length) {
    list.innerHTML = '<p class="post-empty">No posts match your search yet.</p>';
    return;
  }

  list.innerHTML = posts.map(postCard).join("");
}

function postCard(p) {
  const href = "post.html?slug=" + encodeURIComponent(p.slug);
  const img = p.image
    ? '<a class="post-thumb" href="' + escapeHTML(href) + '">' +
        '<img src="' + escapeHTML(p.image) + '" alt="' + escapeHTML(p.title) + '" loading="lazy">' +
      "</a>"
    : "";

  return (
    '<article class="post-card">' +
      img +
      '<div class="post-body">' +
        '<div class="post-meta">' +
          '<span class="post-cat">' + escapeHTML(p.category || "") + "</span>" +
          '<span class="post-date">' + escapeHTML(formatDate(p.date)) + "</span>" +
        "</div>" +
        '<h2 class="post-card-title"><a href="' + escapeHTML(href) + '">' + escapeHTML(p.title) + "</a></h2>" +
        '<p class="post-excerpt">' + escapeHTML(p.excerpt) + "</p>" +
        '<a class="post-readmore" href="' + escapeHTML(href) + '">Read more &rarr;</a>' +
      "</div>" +
    "</article>"
  );
}

function showBlogError() {
  const isFile = window.location.protocol === "file:";
  document.getElementById("post-list").innerHTML =
    '<div class="load-error"><strong>Posts could not be loaded.</strong><br>' +
    (isFile
      ? "Preview with a local server: run <code>python3 -m http.server 8000</code> and open <code>http://localhost:8000/blog.html</code>."
      : "Check that <code>posts.json</code> is present and valid JSON.") +
    "</div>";
}
