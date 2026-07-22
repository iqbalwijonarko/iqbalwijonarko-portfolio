# iqbalwijonarko.com — Personal Portfolio

A fully static site: plain HTML, CSS, and vanilla JavaScript. No frameworks, no build step, no dependencies. Everything you see on the page comes from **`content.json`** — to change any text, you only ever edit that one file.

## Files

| File | What it is |
|---|---|
| `index.html` | The page skeleton (don't edit for content changes) |
| `style.css` | All styling |
| `script.js` | Reads `content.json` and fills in the page |
| `content.json` | **All site content — the only file you edit** |
| `assets/` | Your headshot and all logos |
| `favicon.svg` | The "IW" browser-tab icon |
| `CNAME` | Custom domain for GitHub Pages — don't delete |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Editing content

Open `content.json` in any text editor. Every section of the site maps to a block in this file:

- `site` — your name (big heading) and the gray tagline under it.
- `about` — the greeting line and paragraphs. Wrap any phrase in double braces, like `{{152%}}`, and it renders with a yellow marker highlight.
- `experience` — one entry per job card.
- `education` — one entry per school card.
- `projects` — one entry per project card.
- `contact` — email address and LinkedIn URL.

Save the file, refresh the browser, done. **Careful with JSON syntax:** every entry except the last in a list needs a trailing comma, and all text goes in double quotes. If the page suddenly shows nothing, you likely have a JSON typo — paste the file into https://jsonlint.com to find it.

### Adding a new Experience card

Copy this block, paste it into the `"experience"` list (order in the file = order on the page), and edit:

```json
{
  "company": "New Company",
  "logo": "assets/new-company.png",
  "title": "Your Job Title",
  "dates": "January 2027 - Present",
  "url": "https://newcompany.com"
}
```

Optional fields:
- `"url"` makes the whole card clickable, opening that link in a new tab. Leave it out (or remove the line) and the card simply isn't clickable.
- `"logoBackground": "#000000"` if the logo is white/light and needs a dark background (like Wisery Labs).

Education cards work the same way — each `education` entry also accepts a `"url"`.

### Adding a new Project card

Copy this into the `"projects"` list and edit:

```json
{
  "emoji": "🚀",
  "name": "Project Name",
  "tags": ["tag one", "tag two"],
  "description": "One or two sentences about what you did and the impact.",
  "url": "https://example.com/"
}
```

If the project has no link, use `"url": null` and the link line is left out automatically.

### Swapping or adding a logo

1. Save the logo image (PNG with transparent background looks best) into the `assets/` folder, e.g. `assets/acme.png`.
2. Point the card's `"logo"` field at it: `"logo": "assets/acme.png"`.
3. Logos are auto-fitted into the card, so any reasonable size works — roughly 400–600px wide is plenty.

To swap your headshot, replace `assets/iqbal.png` with a new image of the same name (or change the `"photo"` path in `content.json`).

## Previewing locally

Browsers block pages opened as a plain file (`file://`) from reading `content.json`, so preview with a tiny local server instead:

1. Open Terminal and `cd` into this folder.
2. Run:
   ```
   python3 -m http.server 8000
   ```
3. Open http://localhost:8000 in your browser.
4. `Ctrl+C` in the Terminal stops the server.

(If you open `index.html` directly by double-clicking, the page shows a note reminding you of these steps. On the real web host this is not an issue — the site just works.)

## Hosting: GitHub Pages + IONOS domain

The site is hosted **free on GitHub Pages**, and the `iqbalwijonarko.com` domain (registered at IONOS) points to it. Two files in this folder make that work:

- `CNAME` — tells GitHub Pages the custom domain is `iqbalwijonarko.com`. Don't delete it.
- `.nojekyll` — tells GitHub Pages to serve the files as-is (no Jekyll processing).

### First-time setup

1. **Create the GitHub repository.** Sign in at https://github.com and create a new repository (any name, e.g. `iqbalwijonarko-portfolio`). Leave it empty — no README, no `.gitignore`.
2. **Push this folder.** In Terminal, from this folder:
   ```
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```
   (See "Authentication" below if the push asks for a password.)
3. **Turn on Pages.** In the repo on GitHub: **Settings → Pages**. Under "Build and deployment", set **Source = Deploy from a branch**, **Branch = main**, **Folder = / (root)**, then **Save**.
4. **Set the custom domain.** Still on the Pages screen, the **Custom domain** box should already show `iqbalwijonarko.com` (from the `CNAME` file). If not, type it in and Save. Once DNS is live, tick **Enforce HTTPS** — GitHub issues a free certificate automatically.
5. **Point the domain (IONOS DNS).** In IONOS → the domain → **Adjust destination → DNS**, set these records for `iqbalwijonarko.com`:
   - Four `A` records for `@`, pointing to GitHub's IPs:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One `CNAME` record for `www` → `<your-username>.github.io`
   - Remove the old Webflow records: the `A @ 198.202.211.1`, the `www` CNAME to `cdn.webflow.com`, and the `_webflow` TXT.
   - **Leave MX / SPF / DKIM / DMARC records alone** — your email depends on them.

   DNS changes can take up to an hour. Then `https://iqbalwijonarko.com` serves this site.

### Authentication for `git push`

GitHub no longer accepts your account password on the command line. Easiest option (macOS with Homebrew):
```
brew install gh
gh auth login
```
Choose GitHub.com → HTTPS → "Login with a web browser", and paste the one-time code. After that, `git push` just works. (Alternatively, create a Personal Access Token at github.com → Settings → Developer settings → Tokens, and use it as the password when git prompts.)

### Updating the live site later

Edit `content.json` (or swap an image in `assets/`), then publish the change:
```
git add -A
git commit -m "Update content"
git push
```
GitHub Pages redeploys automatically within a minute or two. You can also edit `content.json` directly on github.com (pencil icon → commit) if you're not at your Mac.

## SEO — ranking for "Iqbal Wijonarko"

The site is built to rank for your name. What's already in place (in code):

- **`index.html`** has a `Person` structured-data block (JSON-LD) that tells Google your site, LinkedIn, GitHub, and Instagram are all the same person — the strongest free signal for a name query. If any profile URL changes, edit the `sameAs` list in `index.html`.
- **`robots.txt`** allows all crawlers and points to the sitemap.
- **`sitemap.xml`** lists the homepage. If you ever add pages, add them here.
- Canonical URL, name-forward `<title>`/description, Open Graph tags, mobile-friendly + HTTPS — all set.

Two free steps only you can do (these are what actually get you indexed and ranked):

1. **Google Search Console** — https://search.google.com/search-console
   - Add property → **URL prefix** → `https://iqbalwijonarko.com`
   - Verify via the **HTML tag** method (copy the `<meta name="google-site-verification" ...>` it gives you; add it in `index.html` right under the other meta tags, commit, push, then click Verify). Or verify by **DNS TXT record** at IONOS.
   - Once verified: **Sitemaps** → submit `sitemap.xml`; then **URL Inspection** → paste `https://iqbalwijonarko.com` → **Request indexing**. This is the fastest way to get Google to notice a brand-new site.
2. **Link your site from your profiles** (each is a free backlink + confirms the entity):
   - LinkedIn → Edit profile → Contact info → Website → `https://iqbalwijonarko.com`
   - GitHub → Profile settings → Website field
   - Instagram → Edit profile → Website field

Optional: repeat step 1 at **Bing Webmaster Tools** (free) to cover Bing/DuckDuckGo. Expect a few days to get indexed and up to ~2–3 months to settle at the top for your name.
