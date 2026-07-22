/*
 * Single-post page: reads ?slug= from the URL and renders that post
 * from posts.json. Supports body blocks: plain string (paragraph),
 * { type: "heading" | "quote" | "list" | "image" }.
 */

document.addEventListener("DOMContentLoaded", initPost);

async function initPost() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  let post = null;

  try {
    const res = await fetch("posts.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    post = (data.posts || []).find(function (p) { return p.slug === slug; });
  } catch (err) {
    renderMissing("Could not load posts. If previewing locally, use a local server (see README).");
    return;
  }

  if (!post) {
    renderMissing("That post could not be found.");
    return;
  }

  renderPost(post);
}

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

function renderBlock(block) {
  if (typeof block === "string") {
    return "<p>" + escapeHTML(block) + "</p>";
  }
  switch (block.type) {
    case "heading":
      return "<h2>" + escapeHTML(block.text) + "</h2>";
    case "quote":
      return "<blockquote>" + escapeHTML(block.text) + "</blockquote>";
    case "list":
      return "<ul>" + (block.items || []).map(function (i) {
        return "<li>" + escapeHTML(i) + "</li>";
      }).join("") + "</ul>";
    case "image":
      return '<figure><img src="' + escapeHTML(block.src) + '" alt="' + escapeHTML(block.alt || "") + '">' +
        (block.caption ? "<figcaption>" + escapeHTML(block.caption) + "</figcaption>" : "") +
        "</figure>";
    default:
      return "";
  }
}

function renderPost(post) {
  // SEO / sharing: reflect the post in the tab title and meta tags.
  document.title = post.title + " | Iqbal Wijonarko";
  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute("content", post.excerpt || post.title);

  const article = document.getElementById("post-article");
  const bodyHTML = (post.body || []).map(renderBlock).join("");
  const hero = post.image
    ? '<img class="post-hero" src="' + escapeHTML(post.image) + '" alt="' + escapeHTML(post.title) + '">'
    : "";

  article.innerHTML =
    '<div class="post-meta">' +
      '<span class="post-cat">' + escapeHTML(post.category || "") + "</span>" +
      '<span class="post-date">' + escapeHTML(formatDate(post.date)) + "</span>" +
    "</div>" +
    '<h1 class="post-title">' + escapeHTML(post.title) + "</h1>" +
    hero +
    '<div class="post-content">' + bodyHTML + "</div>";
}

function renderMissing(message) {
  document.title = "Post not found | Iqbal Wijonarko";
  document.getElementById("post-article").innerHTML =
    '<h1 class="post-title">Post not found</h1>' +
    '<p class="post-excerpt">' + escapeHTML(message) + "</p>" +
    '<p><a class="post-readmore" href="blog.html">&larr; Back to all posts</a></p>';
}
