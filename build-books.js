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

    // ISBN13 preferred, ISBN10 fallback; used only at build time to fetch a
    // cover, then dropped from the output (the page doesn't need it).
    const isbn = (unwrap((cells[iISBN13] || "").trim()) ||
                  unwrap((cells[iISBN] || "").trim())).replace(/[^0-9Xx]/g, "");

    books.push({
      title: title,
      author: (cells[iAuthor] || "").trim(),
      rating: rating,
      shelf: shelf,
      dateRead: dateRead,
      year: year,
      pages: pages,
      cover: null, // set by fetchCovers() when a cover is found, else stays null
      _isbn: isbn || null // internal only; removed before writing books.json
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
async function fetchCover(isbn, slug) {
  const dest = path.join(COVERS_DIR, slug + ".jpg");
  const rel = COVERS_REL + "/" + slug + ".jpg";

  if (fs.existsSync(dest)) return rel; // already have it — be kind to Open Library

  if (SKIP_COVERS || typeof fetch !== "function") return null;

  const url = "https://covers.openlibrary.org/b/isbn/" + isbn + "-M.jpg?default=false";
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // guard against tiny/blank responses
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    fs.writeFileSync(dest, buf);
    await sleep(150); // gentle pacing between live downloads
    return rel;
  } catch (e) {
    return null; // network/offline issues shouldn't break the build
  }
}

/* Fill in book.cover for every book with an ISBN. */
async function fetchCovers(books) {
  const slugFor = makeSlugger();
  let got = 0;
  for (const b of books) {
    if (b._isbn) {
      const rel = await fetchCover(b._isbn, slugFor(b.title));
      if (rel) { b.cover = rel; got++; }
    }
    delete b._isbn; // never ship the ISBN — the page doesn't use it
  }
  return got;
}

async function main() {
  let books;
  let source;

  if (fs.existsSync(CSV_PATH)) {
    const csv = fs.readFileSync(CSV_PATH, "utf8");
    books = buildFromCSV(csv);
    source = "goodreads_library_export.csv (" + books.length + " books)";
  } else {
    books = SAMPLE_BOOKS.map(function (b) { return Object.assign({ _isbn: null }, b); });
    source = "sample data (no CSV found — add goodreads_library_export.csv and re-run)";
  }

  const covers = await fetchCovers(books);

  const json = JSON.stringify({ books: books }, null, 2) + "\n";
  fs.writeFileSync(OUT_PATH, json, "utf8");
  console.log("Wrote " + path.basename(OUT_PATH) + " from " + source + ".");
  console.log(covers + " of " + books.length + " books have a local cover" +
    (SKIP_COVERS ? " (covers skipped: --no-covers)" : "") + "; the rest use text placeholders.");
}

main();
