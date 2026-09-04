<div align="center">
<br>

<img src="assets/iqbal-illustration.jpg" alt="Iqbal Wijonarko" width="190">

# Iqbal Wijonarko

### From Technology to Strategy

Digital Transformation Specialist &nbsp;·&nbsp; Questrom (Boston University) MiM &nbsp;·&nbsp; Boston, MA

<br>

[**Website**](https://iqbalwijonarko.com) &nbsp;·&nbsp; [**LinkedIn**](https://www.linkedin.com/in/iqbalwijonarko/) &nbsp;·&nbsp; [**Email**](mailto:iqbal@bu.edu)

<br>
</div>

---

## The site

This is the source for my personal website and blog at **[iqbalwijonarko.com](https://iqbalwijonarko.com)**.

A fully static site — plain HTML, CSS, and vanilla JavaScript. No frameworks, no build step, no dependencies. All content lives in JSON files (`content.json`, `posts.json`, `books.json`), so updating it never means touching code. Hosted free on GitHub Pages, with the domain at IONOS. Everything is flat files, so it can equally be uploaded to IONOS webspace over SFTP.

<br>

<details>
<summary><strong>&nbsp;Editing the homepage</strong></summary>

<br>

Everything on the homepage comes from **`content.json`** — edit that one file and refresh.

- `site` — your name and the tagline beneath it.
- `about` — the greeting and paragraphs. Wrap a phrase in `{{double braces}}` to give it a yellow marker highlight.
- `experience` / `education` — one entry per card. Add a `"url"` to any entry to make its card clickable (opens in a new tab). Add `"logoBackground": "#000000"` for logos that need a dark backing.
- `projects` — one entry per project card.
- `contact` — email and LinkedIn.

**Adding an experience card** — paste into the `experience` list and edit:

```json
{
  "company": "New Company",
  "logo": "assets/new-company.png",
  "title": "Your Job Title",
  "dates": "January 2027 - Present",
  "url": "https://newcompany.com"
}
```

**Swapping a logo or the headshot** — drop the image into `assets/`, then point the relevant `logo` (or the `about.photo`) path at it. Logos auto-fit; ~400–600px wide is plenty.

</details>

<details>
<summary><strong>&nbsp;Writing a blog post</strong></summary>

<br>

Every post is one entry in **`posts.json`**. Posts sort newest-first automatically, and any new `category` becomes a filter button on its own.

```json
{
  "slug": "a-short-url-name",
  "title": "Your Post Title",
  "category": "Tech",
  "date": "2026-07-25",
  "image": "assets/blog/a-short-url-name.svg",
  "excerpt": "One or two sentences shown on the listing page.",
  "body": [
    "A paragraph is just a string.",
    { "type": "heading", "text": "A section heading" },
    { "type": "list", "items": ["First point", "Second point"] },
    { "type": "quote", "text": "A pull quote." },
    { "type": "image", "src": "assets/blog/picture.jpg", "alt": "describe it", "caption": "optional" }
  ]
}
```

- `slug` — lowercase, dashes, no spaces. Becomes the URL: `post.html?slug=a-short-url-name`.
- `image` — thumbnail on the listing and hero on the post. Put images in `assets/blog/`. Optional.

After adding a post, add its URL to `sitemap.xml` so Google finds it.

</details>

<details>
<summary><strong>&nbsp;Updating the Bookshelf</strong></summary>

<br>

The Bookshelf page (`bookshelf.html`) lists what I've read. Goodreads shut down its public API in 2020, so there's no live pull — instead the list is generated once from a Goodreads CSV export and shipped as a static `books.json`. The page fetches only that JSON; nothing hits Goodreads at page load.

**1. Export from Goodreads** — go to **Goodreads → Account → My Books → Import/Export → Export Library**. Download the CSV and save it in the project root as `goodreads_library_export.csv`. (This file is git-ignored; only the generated `books.json` is committed/deployed.)

**2. Regenerate `books.json`** — run the local build script:

```
node build-books.js
```

It reads the CSV, keeps only the fields the page needs (title, author, rating, shelf, date/year read, pages), fetches book covers (see below), and writes `books.json`. If no CSV is present it writes a small **sample** `books.json` instead, so the page always renders. `build-books.js` is a local tool — it is never loaded by the browser.

**3. Every book gets a cover, automatically (at build time, not at page load)** — the Goodreads export has no cover URLs, so the build script resolves each one against the free [Open Library](https://openlibrary.org/dev/docs/api/covers) API and downloads the image **once** into `assets/books/`. It tries, in order: the book's ISBNs; then the Open Library *work*, reading **edition-level** data so it picks an **English** edition and prefers the **newest** printing (this is what keeps a French reprint or a 1950s cover from winning). If nothing is found, it draws a small SVG cover from the title and author, so the grid is never ragged. The site serves all of it as **local static files**, lazy-loaded with fixed dimensions — no third-party requests on page load, and no hit to performance, SEO, or hosting cost (the whole set is under 500 KB).

- **Bad images are rejected automatically.** Open Library takes community uploads, so a "cover" is sometimes a phone photo of a paperback on a desk, a square crop with the title sliced off, or an audiobook's disc art. Real cover files are consistently portrait, near 2:3, so the build reads each candidate's dimensions from its own file header (no image library needed) and skips anything outside 0.60-0.78, anything under 120px wide, and any edition whose format is an audiobook. A rejected candidate falls through to the next one, and every rejection is printed with its measured aspect ratio.
- Re-running is safe: already-downloaded covers are reused (Open Library isn't re-hit) but are re-checked against the gate first, so a bad cover saved by an older build gets replaced instead of living forever.
- Offline? Run `node build-books.js --no-covers` to skip the network; any covers already on disk are still linked.
- **Check the result after every update:** `node build-books.js --audit` also writes `.covaudit/audit.html`, a local sheet of every cover beside its title and author. Open it and skim — a wrong image is obvious in seconds. The sheet is git-ignored and never ships.
- **Fixing a wrong cover:** Open Library is community-catalogued, so an edition record occasionally has the wrong artwork attached (a "summary" book filed under the real title, for instance). No heuristic can detect that, so add the book to **`cover-overrides.json`** — key is the exact title from `books.json`, value is an Open Library cover id, an image URL, or a local file path — then re-run the build. An override always wins, and it survives future rebuilds.
- `books.sample.json` is a checked-in reference of the schema.

**Deploying** — `bookshelf.html`, `bookshelf.js`, `books.json`, and the `assets/books/` covers are flat files like everything else: commit and push (GitHub Pages) or upload them over SFTP to IONOS, the same way you deploy the rest of the site. `build-books.js`, `cover-overrides.json`, and the raw CSV stay local and are not uploaded.

</details>

<details>
<summary><strong>&nbsp;Running & deploying</strong></summary>

<br>

**Preview locally** — browsers block reading JSON from `file://`, so use a tiny server:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

**Publish a change** — the site auto-deploys from the `main` branch:

```
git add -A
git commit -m "Update content"
git push
```

GitHub Pages redeploys within a minute or two. You can also edit any file directly on github.com.

**Custom domain** — `CNAME` holds the domain; `.nojekyll` tells Pages to serve files as-is. The IONOS DNS points to GitHub Pages with four `A` records for `@` (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` for `www` → `iqbalwijonarko.github.io`.

**Cost** — hosting, the HTTPS certificate, and all tooling are free. The only recurring cost is the IONOS domain, renewed annually.

</details>

<details>
<summary><strong>&nbsp;SEO</strong></summary>

<br>

Built in: a `Person` structured-data block (JSON-LD with `sameAs` links to LinkedIn / GitHub / Instagram), `robots.txt`, `sitemap.xml`, a canonical URL, and name-forward meta tags.

To get indexed and rank for your name:

1. **Google Search Console** — add `https://iqbalwijonarko.com`, verify, submit `sitemap.xml`, then use URL Inspection → **Request indexing**.
2. **Link your site from your profiles** — LinkedIn, GitHub, and Instagram all accept a website link. Each one is a free backlink that confirms the same person.

</details>

---

<div align="center">
<sub>Static site · Hosted on GitHub Pages · © Iqbal Wijonarko</sub>
</div>
