/*
 * Bookshelf page: renders book cards from books.json (generated locally by
 * build-books.js from a Goodreads CSV export). Vanilla JS, no libraries, no
 * runtime API calls — it only fetches the static books.json, exactly like the
 * homepage loads content.json. Edit books.json (or re-run build-books.js);
 * never edit this file to change content.
 */

document.addEventListener("DOMContentLoaded", initBookshelf);

let ALL_BOOKS = [];
let activeShelf = "all";
let sortMode = "recent";

async function initBookshelf() {
  try {
    const res = await fetch("books.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    ALL_BOOKS = data.books || [];
  } catch (err) {
    showBooksError();
    return;
  }

  renderShelfFilters();
  renderBooks();

  const sort = document.getElementById("book-sort");
  sort.addEventListener("change", function () {
    sortMode = sort.value;
    renderBooks();
  });

  setupBackToTop();

  // Close any open title popover when tapping elsewhere or pressing Escape.
  document.addEventListener("click", function () { closeAllTips(null); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAllTips(null);
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

const SHELF_LABELS = { read: "Read", "currently-reading": "Currently reading" };

/* Subtle open-book glyph used on the color tile when a book has no cover, so
   the tile reads as an intentional placeholder rather than a missing image. */
const BOOK_ICON =
  '<svg class="book-cover-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M3 5.6c0-.5.4-.9.9-1 2-.4 4.9-.2 8.1 1.5 3.2-1.7 6.1-1.9 8.1-1.5.5.1.9.5.9 1V18c0 .6-.5 1.1-1.2 1-1.9-.3-4.4-.3-6.8 1-2.4-1.3-4.9-1.3-6.8-1C3.5 19.1 3 18.6 3 18V5.6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M12 6.6V19" stroke="currentColor" stroke-width="1.4"/>' +
  "</svg>";

/* Deterministic hue (0-359) from a string, so each placeholder tile keeps the
   same quiet color across reloads. */
function hueFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % 360;
  }
  return h;
}

/* Rating as filled/empty star markers with an accessible label. */
function ratingStars(rating) {
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    stars += '<span class="star' + (i <= rating ? " star--on" : "") + '" aria-hidden="true">' +
      (i <= rating ? "★" : "☆") + "</span>";
  }
  return '<span class="book-rating" role="img" aria-label="Rated ' + rating +
    ' out of 5">' + stars + "</span>";
}

/* ---------- filtering & sorting ---------- */

function shelfCounts() {
  const counts = { all: ALL_BOOKS.length, read: 0, "currently-reading": 0 };
  ALL_BOOKS.forEach(function (b) {
    if (counts[b.shelf] !== undefined) counts[b.shelf]++;
  });
  return counts;
}

function visibleBooks() {
  const list = ALL_BOOKS.filter(function (b) {
    return activeShelf === "all" || b.shelf === activeShelf;
  });

  const byDateDesc = function (a, b) {
    return String(b.dateRead || "").localeCompare(String(a.dateRead || ""));
  };

  list.sort(function (a, b) {
    if (sortMode === "title") {
      return a.title.localeCompare(b.title);
    }
    if (sortMode === "rating") {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return byDateDesc(a, b);
    }
    // "recent": currently-reading (active) first, then most-recently-read.
    if (a.shelf !== b.shelf) return a.shelf === "currently-reading" ? -1 : 1;
    return byDateDesc(a, b);
  });
  return list;
}

/* ---------- rendering ---------- */

function renderShelfFilters() {
  const counts = shelfCounts();
  const shelves = [
    { key: "all", label: "All" },
    { key: "read", label: "Read" },
    { key: "currently-reading", label: "Currently reading" }
  ];

  const html = shelves.map(function (s) {
    const active = s.key === activeShelf ? " filter-pill--active" : "";
    return (
      '<button type="button" class="filter-pill' + active + '" data-shelf="' + s.key + '">' +
        escapeHTML(s.label) + ' <span class="filter-count">(' + (counts[s.key] || 0) + ")</span>" +
      "</button>"
    );
  }).join("");

  const wrap = document.getElementById("book-filters");
  wrap.innerHTML = html;
  wrap.querySelectorAll(".filter-pill").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeShelf = btn.getAttribute("data-shelf");
      renderShelfFilters();
      renderBooks();
    });
  });
}

function renderBooks() {
  const books = visibleBooks();
  const list = document.getElementById("book-list");

  if (!books.length) {
    list.innerHTML = '<li class="book-empty">No books on this shelf yet.</li>';
    return;
  }

  list.innerHTML = books.map(bookCard).join("");
  revealBooks();
  setupTitleTips();
}

function closeAllTips(except) {
  document.querySelectorAll(".book-title.is-open").forEach(function (t) {
    if (t !== except) {
      t.classList.remove("is-open");
      t.setAttribute("aria-expanded", "false");
    }
  });
}

/* Titles are clamped to two lines. Where one is actually cut off, make it
   reveal the full text in a small frosted popover — on hover / keyboard focus
   (desktop) and on tap (touch/mobile, which has no hover). Screen readers get
   the full title from the heading regardless, so this is a purely visual aid. */
function setupTitleTips() {
  document.querySelectorAll(".book-title").forEach(function (t) {
    if (t.scrollHeight - t.clientHeight <= 2) return; // not actually truncated

    const full = t.textContent;
    t.classList.add("is-clamped");
    t.setAttribute("tabindex", "0");
    t.setAttribute("role", "button");
    t.setAttribute("aria-expanded", "false");

    const tip = document.createElement("span");
    tip.className = "book-title-tip";
    tip.setAttribute("aria-hidden", "true");
    tip.textContent = full;
    t.insertAdjacentElement("afterend", tip);

    t.addEventListener("click", function (e) {
      e.stopPropagation(); // don't let the document handler close it immediately
      const willOpen = !t.classList.contains("is-open");
      closeAllTips(t);
      t.classList.toggle("is-open", willOpen);
      t.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    t.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t.click(); }
    });
  });
}

function bookCard(b) {
  const title = escapeHTML(b.title);
  const author = escapeHTML(b.author || "");

  // Meta: reading badge for in-progress; stars + year for finished books.
  let meta;
  if (b.shelf === "currently-reading") {
    meta = '<span class="book-badge">Currently reading</span>';
  } else {
    const stars = b.rating > 0
      ? ratingStars(b.rating)
      : '<span class="book-unrated">Unrated</span>';
    const year = b.year ? '<span class="book-year">' + escapeHTML(String(b.year)) + "</span>" : "";
    meta = stars + year;
  }

  // Cover tile: a real image, or a quiet color panel with a subtle book icon
  // when there's no cover. Either way the caption below is identical, so every
  // card has the same white footer and the meta rows line up.
  let cover;
  if (b.cover) {
    cover =
      '<div class="book-cover">' +
        '<img src="' + escapeHTML(b.cover) + '" alt="Cover of ' + title + '" ' +
          'loading="lazy" width="200" height="300">' +
      "</div>";
  } else {
    const hue = hueFromString(b.title + b.author);
    cover =
      '<div class="book-cover book-cover--placeholder" style="--tile-h:' + hue + '" aria-hidden="true">' +
        BOOK_ICON +
      "</div>";
  }

  return (
    '<li class="book-card">' +
      cover +
      '<div class="book-info">' +
        '<h2 class="book-title">' + title + "</h2>" +
        (author ? '<p class="book-author">' + author + "</p>" : "") +
        '<div class="book-meta">' + meta + "</div>" +
      "</div>" +
    "</li>"
  );
}

/* Gentle scroll-in reveal + stagger, mirroring the homepage's motion. */
function revealBooks() {
  const cards = Array.prototype.slice.call(document.querySelectorAll(".book-card"));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  cards.forEach(function (card, i) {
    card.classList.add("reveal");
    card.style.transitionDelay = (i % 4) * 0.06 + "s";
  });

  if (reduce || !("IntersectionObserver" in window)) {
    cards.forEach(function (c) { c.classList.add("is-visible"); });
    return;
  }

  const obs = new IntersectionObserver(function (entries, o) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        o.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  cards.forEach(function (c) { obs.observe(c); });
}

/* Floating back-to-top button — same behavior as the homepage (a 32-book grid
   gets long). Hidden at top, fades in past 400px, smooth-scrolls up. */
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
  let ticking = false;
  function update() {
    btn.classList.toggle("is-shown", window.scrollY > 400);
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

function showBooksError() {
  const isFile = window.location.protocol === "file:";
  document.getElementById("book-list").innerHTML =
    '<li class="load-error"><strong>Books could not be loaded.</strong><br>' +
    (isFile
      ? "Preview with a local server: run <code>python3 -m http.server 8000</code> and open <code>http://localhost:8000/bookshelf.html</code>."
      : "Run <code>node build-books.js</code> to generate <code>books.json</code>, and check it is valid JSON.") +
    "</li>";
}
