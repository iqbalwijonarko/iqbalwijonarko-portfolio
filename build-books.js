#!/usr/bin/env node
/*
 * build-books.js — turn a Goodreads CSV export into the site's books.json.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   Goodreads shut down its public API in 2020, so there is no way to pull the
 *   reading list live at page load. Instead you export a CSV once in a while
 *   and run this script locally to regenerate books.json. The site itself
 *   stays 100% static: the browser only ever fetches the small books.json —
 *   this script is a local tool and is NEVER shipped to the browser.
 *
 * HOW TO USE
 *   1. Goodreads → Account → My Books → Import/Export → Export Library.
 *   2. Save the file as  goodreads_library_export.csv  in this project root.
 *   3. Run:  node build-books.js
 *   4. It writes books.json (used by bookshelf.html). Commit/upload that file.
 *
 * NO CSV YET?
 *   If goodreads_library_export.csv is missing, this script writes a small
 *   sample books.json (see SAMPLE_BOOKS below) so the page still renders and
 *   you can see the schema. Drop in the real CSV and re-run to replace it.
 *
 * COVERS (automatic, but done at BUILD time — never at page load)
 *   The Goodreads export has no cover URLs, so this script looks each book up
 *   by ISBN in the free Open Library Covers API and downloads the image ONCE
 *   into assets/books/. The site then serves those as local static files
 *   (lazy-loaded, fixed size) — no third-party requests when a visitor loads
 *   the page, so performance, SEO, and hosting cost are unaffected.
 *     - Already-downloaded covers are reused (we don't re-hit Open Library).
 *     - Books with no ISBN, or with no cover on Open Library, keep the text
 *       placeholder tile automatically.
 *     - Run "node build-books.js --no-covers" to skip network entirely
 *       (e.g. offline); existing covers on disk are still linked.
 *   To override a cover by hand, just drop your own image in assets/books/
 *   and set that book's "cover" path in books.json.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "goodreads_library_export.csv");
const OUT_PATH = path.join(__dirname, "books.json");
const COVERS_DIR = path.join(__dirname, "assets", "books");
const COVERS_REL = "assets/books"; // path as referenced from the site root

// Polite, identifying User-Agent (Open Library asks apps to identify themselves).
const USER_AGENT = "iqbalwijonarko-portfolio/1.0 (personal site build; +https://iqbalwijonarko.com)";
const SKIP_COVERS = process.argv.includes("--no-covers");

/* Schema reference — also the fallback data when no CSV is present.
   Each book: title, author, rating (0-5, 0 = unrated), shelf
   ("read" | "currently-reading"), dateRead (YYYY-MM-DD or null),
   year (number or null, derived from dateRead), pages (number or null),
   cover (string path or null — add your own later). */
const SAMPLE_BOOKS = [
  { title: "Atomic Habits", author: "James Clear", rating: 5, shelf: "read", dateRead: "2023-12-22", year: 2023, pages: 319, cover: null },
  { title: "Steve Jobs", author: "Walter Isaacson", rating: 0, shelf: "currently-reading", dateRead: null, year: null, pages: 630, cover: null },
  { title: "The Psychology of Money", author: "Morgan Housel", rating: 4, shelf: "read", dateRead: "2023-12-22", year: 2023, pages: 242, cover: null },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", rating: 0, shelf: "read", dateRead: "2025-10-13", year: 2025, pages: 512, cover: null }
];

/* ---------- tiny, dependency-free CSV parser ----------
   Handles quoted fields, commas inside quotes, escaped "" quotes, and CRLF.
   Returns an array of rows, each row an array of string cells. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Goodreads wraps ISBNs like ="1234567890"; strip that if we ever need them. */
function unwrap(value) {
  const m = String(value).match(/^="?(.*?)"?$/);
  return m ? m[1] : value;
}

/* Goodreads dates are YYYY/MM/DD. Return YYYY-MM-DD (ISO-ish) or null. */
function toISODate(gr) {
  if (!gr) return null;
  const parts = gr.split("/");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function buildFromCSV(csvText) {
  const rows = parseCSV(csvText).filter(function (r) {
    return r.length > 1 || (r.length === 1 && r[0].trim() !== "");
  });
  if (!rows.length) return [];

  const header = rows[0].map(function (h) { return h.trim(); });
  const idx = function (name) { return header.indexOf(name); };

  const iTitle = idx("Title");
  const iAuthor = idx("Author");
  const iRating = idx("My Rating");
  const iShelf = idx("Exclusive Shelf");
  const iDateRead = idx("Date Read");
  const iDateAdded = idx("Date Added");
  const iPages = idx("Number of Pages");
  const iISBN13 = idx("ISBN13");
  const iISBN = idx("ISBN");

  const books = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const title = (cells[iTitle] || "").trim();
    if (!title) continue;

    const shelf = (cells[iShelf] || "").trim() || "read";
    // Only surface books actually read or in progress; skip to-read / DNF etc.
    if (shelf !== "read" && shelf !== "currently-reading") continue;

    const rating = parseInt(cells[iRating], 10) || 0;

    // Effective read date: prefer Date Read; if the shelf is "read" but the
    // date is blank (common in old imports), fall back to Date Added so the
    // card can still show a year. Currently-reading books get no date.
    let dateRead = null;
    if (shelf === "read") {
      dateRead = toISODate((cells[iDateRead] || "").trim()) ||
                 toISODate((cells[iDateAdded] || "").trim());
    }
    const year = dateRead ? parseInt(dateRead.slice(0, 4), 10) : null;
    const pages = parseInt(cells[iPages], 10) || null;

    // Both ISBNs are kept as cover-lookup candidates (some editions only have
    // art under one of them). Build-time only; dropped from the output.
    const isbns = [cells[iISBN13], cells[iISBN]]
      .map(function (v) { return unwrap((v || "").trim()).replace(/[^0-9Xx]/g, ""); })
      .filter(function (v) { return v.length >= 10; });

    books.push({
      title: title,
      author: (cells[iAuthor] || "").trim(),
      rating: rating,
      shelf: shelf,
      dateRead: dateRead,
      year: year,
      pages: pages,
      cover: null, // set by fetchCovers() when a cover is found, else stays null
      _isbns: isbns // internal only; removed before writing books.json
    });
  }

  // Default order: currently-reading first, then most-recently-read.
  books.sort(function (a, b) {
    if (a.shelf !== b.shelf) return a.shelf === "currently-reading" ? -1 : 1;
    return (b.dateRead || "").localeCompare(a.dateRead || "");
  });
  return books;
}

/* URL/file-safe slug from a title, kept unique across the run. */
function makeSlugger() {
  const used = {};
  return function (title) {
    let base = String(title).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "book";
    let slug = base;
    let n = 2;
    while (used[slug]) { slug = base + "-" + n++; }
    used[slug] = true;
    return slug;
  };
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Download one cover by ISBN into assets/books/, returning the site-relative
   path or null. Cached: if the file already exists we reuse it and skip the
   network. Uses ?default=false so missing covers 404 instead of returning a
   blank placeholder image. */
/* Save one image to assets/books/<slug>.jpg. Returns true on success.
   Tiny responses are rejected: Open Library answers some misses with a
   1x1/blank image rather than a 404. */
async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) return false;
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.writeFileSync(dest, buf);
  await sleep(150); // gentle pacing between live requests
  return true;
}

/* Normalised title key used to sanity-check a loose search hit, so a fuzzy
   query can't attach some unrelated book's art to this entry. */
function titleKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function searchDocs(params) {
  const url = "https://openlibrary.org/search.json?" + params + "&limit=5&fields=title,author_name,cover_i";
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  await sleep(150);
  if (!res.ok) return [];
  const data = await res.json();
  return data.docs || [];
}

/* Look the book up in Open Library's search API and return a cover id.
   The Goodreads title carries subtitles and parentheticals ("Atomic Habits:
   An Easy & Proven Way to...") which rarely match, so we search on the main
   title plus author. If that finds nothing we retry as one loose query, which
   rescues edition/author-name mismatches (Goodreads' "Case in Point 12th
   Edition" by "Marc Cosentino" vs Open Library's "Case in point" by "Marc
   Patrick Cosentino"). Loose hits must still agree on the start of the title. */
async function findCoverId(title, author) {
  const mainTitle = String(title).split(":")[0].replace(/\([^)]*\)/g, "").trim();

  const exact = await searchDocs(
    "title=" + encodeURIComponent(mainTitle) + "&author=" + encodeURIComponent(author)
  );
  const hit = exact.find(function (d) { return d.cover_i; });
  if (hit) return hit.cover_i;

  // Edition/ordinal noise ("12th Edition", trailing volume numbers) makes the
  // general query return nothing, so drop it for the loose attempt. The guard
  // below still compares against the ORIGINAL title, so this only widens the
  // search, it can't loosen the match check.
  const looseTitle = mainTitle
    .replace(/\b\d+(st|nd|rd|th)\b/gi, " ")
    .replace(/\bedition\b/gi, " ")
    .replace(/\s+\d+\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();

  const want = titleKey(mainTitle).slice(0, 10);
  const loose = await searchDocs("q=" + encodeURIComponent(looseTitle + " " + author));
  const near = loose.find(function (d) {
    return d.cover_i && want && titleKey(d.title || "").slice(0, 10) === want;
  });
  return near ? near.cover_i : null;
}

/* Deterministic hue from a string, mirroring the colouring the page uses for
   its placeholder tiles so a generated cover looks native to the shelf. */
function hueFromString(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h * 31 + String(str).charCodeAt(i)) % 360;
  }
  return h;
}

function escapeXML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* Greedy word-wrap; SVG has no auto-wrapping so lines are measured here. */
function wrapLines(text, maxChars, maxLines) {
  const words = String(text).trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  let truncated = false;
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length <= maxChars || !cur) {
      cur = next;
    } else if (lines.length + 1 < maxLines) {
      lines.push(cur);
      cur = w;
    } else {
      truncated = true;
      break;
    }
  }
  if (cur) lines.push(cur);
  if (truncated) lines[lines.length - 1] = lines[lines.length - 1] + "…";
  return lines;
}

/* GUARANTEED last resort: draw a typographic cover ourselves.
   Some books simply have no art in any free source (niche or non-English
   titles), so relying on lookups alone can never reach 100%. Generating the
   cover means every book — today and every future export — ends up with a
   real <img>, on the same lazy-loaded, fixed-ratio path as a photographed
   cover, so nothing about performance, layout stability or SEO changes.
   SVG is used deliberately: ~1 KB, sharp at any size, and it needs no image
   library, keeping the build dependency-free and portable. */
function writeGeneratedCover(book, slug) {
  const rel = COVERS_REL + "/" + slug + ".svg";
  const dest = path.join(COVERS_DIR, slug + ".svg");
  if (fs.existsSync(dest)) return rel;

  const Q = String.fromCharCode(39); // single quote, used to delimit SVG attributes
  const h = hueFromString(book.title + book.author);
  const bg = "hsl(" + h + ", 30%, 94%)";
  const ink = "hsl(" + h + ", 32%, 26%)";
  const soft = "hsl(" + h + ", 20%, 45%)";
  const rule = "hsl(" + h + ", 26%, 80%)";

  const titleLines = wrapLines(book.title, 17, 5);
  const authorLines = wrapLines(book.author || "", 22, 2);

  const LH = 42;
  // Centre the whole text block vertically in the 600-tall cover.
  const blockH = titleLines.length * LH + (authorLines.length ? 26 + authorLines.length * 26 : 0);
  let y = Math.round((600 - blockH) / 2) + 30;

  let text = "";
  titleLines.forEach(function (l, i) {
    text += "<text x=" + Q + "200" + Q + " y=" + Q + (y + i * LH) + Q +
      " text-anchor=" + Q + "middle" + Q + " font-size=" + Q + "34" + Q +
      " font-weight=" + Q + "700" + Q + " fill=" + Q + ink + Q + ">" + escapeXML(l) + "</text>";
  });
  const aY = y + titleLines.length * LH + 20;
  authorLines.forEach(function (l, i) {
    text += "<text x=" + Q + "200" + Q + " y=" + Q + (aY + i * 26) + Q +
      " text-anchor=" + Q + "middle" + Q + " font-size=" + Q + "20" + Q +
      " fill=" + Q + soft + Q + ">" + escapeXML(l) + "</text>";
  });

  const label = escapeXML(book.title + (book.author ? " by " + book.author : ""));
  // Unquoted family names: the attribute itself is single-quoted, so inner
  // quotes would end it early. CSS allows multi-word names unquoted.
  const font = "Inter, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif";
  const svg =
    "<svg xmlns=" + Q + "http://www.w3.org/2000/svg" + Q +
      " viewBox=" + Q + "0 0 400 600" + Q + " width=" + Q + "400" + Q + " height=" + Q + "600" + Q +
      " role=" + Q + "img" + Q + " aria-label=" + Q + label + Q + ">" +
      "<rect width=" + Q + "400" + Q + " height=" + Q + "600" + Q + " fill=" + Q + bg + Q + "/>" +
      "<rect x=" + Q + "26" + Q + " y=" + Q + "26" + Q + " width=" + Q + "348" + Q + " height=" + Q + "548" + Q +
        " fill=" + Q + "none" + Q + " stroke=" + Q + rule + Q + " stroke-width=" + Q + "1.5" + Q + "/>" +
      "<g font-family=" + Q + font + Q + ">" + text + "</g>" +
    "</svg>";

  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.writeFileSync(dest, svg, "utf8");
  return rel;
}

/* Find a cover for one book, most-exact source first:
     1. ISBN13, 2. ISBN10   -> /b/isbn/...
     3. title + author search -> cover id -> /b/id/...
   Step 3 is what rescues the ~10 books Goodreads exports with no ISBN at all,
   plus editions whose ISBN simply has no art. Looking up by cover id is also
   the route Open Library does NOT rate-limit. Anything still not found keeps
   the text placeholder tile, so the page degrades gracefully. */
async function fetchCover(book, slug) {
  const dest = path.join(COVERS_DIR, slug + ".jpg");
  const rel = COVERS_REL + "/" + slug + ".jpg";

  if (fs.existsSync(dest)) return rel; // already have it — be kind to Open Library
  if (SKIP_COVERS || typeof fetch !== "function") return null;

  try {
    for (const isbn of book._isbns || []) {
      if (await download("https://covers.openlibrary.org/b/isbn/" + isbn + "-M.jpg?default=false", dest)) {
        return rel;
      }
    }
    const id = await findCoverId(book.title, book.author);
    if (id && await download("https://covers.openlibrary.org/b/id/" + id + "-M.jpg?default=false", dest)) {
      return rel;
    }
  } catch (e) {
    // A lookup failure must never break the build, but stay loud about it so
    // a missing cover is diagnosable instead of silently shrugged off.
    console.warn("  ! cover lookup failed for " + book.title + ": " + e.message);
  }
  return null;
}

/* Give EVERY book a cover: look for real artwork first, and draw one when
   none exists anywhere. Returns counts so the build can report both. */
async function fetchCovers(books) {
  const slugFor = makeSlugger();
  let found = 0;
  let drawn = 0;
  for (const b of books) {
    const slug = slugFor(b.title);
    const rel = await fetchCover(b, slug);
    if (rel) {
      b.cover = rel;
      found++;
      // Real artwork supersedes a cover we drew on an earlier run.
      const stale = path.join(COVERS_DIR, slug + ".svg");
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    } else {
      b.cover = writeGeneratedCover(b, slug);
      drawn++;
    }
    delete b._isbns; // never ship ISBNs — the page doesn't use them
  }
  return { found: found, drawn: drawn };
}

async function main() {
  let books;
  let source;

  if (fs.existsSync(CSV_PATH)) {
    const csv = fs.readFileSync(CSV_PATH, "utf8");
    books = buildFromCSV(csv);
    source = "goodreads_library_export.csv (" + books.length + " books)";
  } else {
    books = SAMPLE_BOOKS.map(function (b) { return Object.assign({ _isbns: [] }, b); });
    source = "sample data (no CSV found — add goodreads_library_export.csv and re-run)";
  }

  const covers = await fetchCovers(books);

  const json = JSON.stringify({ books: books }, null, 2) + "\n";
  fs.writeFileSync(OUT_PATH, json, "utf8");
  console.log("Wrote " + path.basename(OUT_PATH) + " from " + source + ".");
  console.log(
    books.length + "/" + books.length + " books have a cover: " +
    covers.found + " real" + (SKIP_COVERS ? " (lookups skipped)" : "") +
    ", " + covers.drawn + " generated."
  );
}

main();
