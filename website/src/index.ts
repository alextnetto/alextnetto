import fs from "fs/promises";
import path from "path";
import MarkdownIt from "markdown-it";
import MarkdownItAnchor from "markdown-it-anchor";
import MarkdownItTocDoneRight from "markdown-it-toc-done-right";
import MarkdownItEmoji from "markdown-it-emoji";
import MarkdownItFootnote from "markdown-it-footnote";
import MarkdownItTaskLists from "markdown-it-task-lists";
import MarkdownItImsize from "markdown-it-imsize";
import MarkdownItAbbr from "markdown-it-abbr";
import MarkdownItSup from "markdown-it-sup";
import MarkdownItSub from "markdown-it-sub";
import MarkdownItKatex from "markdown-it-katex";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

md.use(MarkdownItAnchor, {
  permalink: true,
  permalinkClass: "header-link",
  permalinkSymbol: "🔗",
  permalinkBefore: true,
  permalinkAttrs: () => ({ "aria-hidden": "true" }),
});

let tocHtml = "";

md.use(MarkdownItTocDoneRight, {
  containerClass: "toc",
  containerId: "table-of-contents",
  level: [1, 2, 3],
  callback: function (html) {
    tocHtml = html;
  },
});

md.use(MarkdownItKatex, {
  throwOnError: false,
  errorColor: "#cc0000",
});

md.use(MarkdownItEmoji);
md.use(MarkdownItFootnote);
md.use(MarkdownItTaskLists, { label: true, labelAfter: true });
md.use(MarkdownItImsize);
md.use(MarkdownItAbbr);
md.use(MarkdownItSub);
md.use(MarkdownItSup);

// Custom renderer for abbreviation opening tag
md.renderer.rules.abbr_open = (tokens, idx) => {
  const content = tokens[idx].attrGet("title");
  return `<abbr class="custom-abbr" data-title="${content}">`;
};

// Add this custom renderer for links
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex("href");
  if (hrefIndex >= 0) {
    const href = token.attrs[hrefIndex][1];
    const isExternal = /^https?:\/\//.test(href);
    if (isExternal) {
      token.attrPush(["target", "_blank"]);
      token.attrPush(["rel", "noopener noreferrer"]);
    }
  }
  return self.renderToken(tokens, idx, options);
};

async function generateBlog() {
  const postsDir = path.join(process.cwd(), "src", "posts");
  const outputDir = path.join(process.cwd(), "dist");
  const postsOutputDir = path.join(outputDir, "posts");
  const stylesOutputDir = path.join(outputDir, "styles");

  // Ensure output directories exist
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(postsOutputDir, { recursive: true });
  await fs.mkdir(stylesOutputDir, { recursive: true });

  // Read and process index.md
  const indexMdPath = path.join(process.cwd(), "src", "index.md");
  const indexMdContent = await fs.readFile(indexMdPath, "utf-8");
  tocHtml = ""; // Reset TOC HTML
  const indexHtmlContent = md.render(indexMdContent);
  const indexToc = tocHtml; // Store TOC for index.md

  // Read all markdown files
  const files = await fs.readdir(postsDir);
  const posts = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const content = await fs.readFile(path.join(postsDir, file), "utf-8");
        tocHtml = ""; // Reset TOC HTML
        const htmlContent = md.render(content);
        const title = content.split("\n")[0].replace("#", "").trim();
        return {
          title,
          html: htmlContent,
          toc: tocHtml,
          filename: file.replace(".md", ".html"),
        };
      })
  );

  // Generate individual post pages
  const postTemplate = await fs.readFile(
    path.join(process.cwd(), "src", "templates", "post.html"),
    "utf-8"
  );
  for (const post of posts) {
    const postHtml = postTemplate
      .replace("{{title}}", post.title)
      .replace("{{content}}", post.html)
      .replace("<!-- The TOC will be inserted here -->", post.toc);
    await fs.writeFile(path.join(postsOutputDir, post.filename), postHtml);
  }

  const postLinks = posts
    .map(
      (post) => `<li><a href="posts/${post.filename}">${post.title}</a></li>`
    )
    .join("\n");

  // Generate combined TOC for index page
  const combinedToc =
    indexToc +
    '<h2 id="blog-posts">Blog Posts</h2>\n<ul>\n' +
    posts
      .map(
        (post) => `<li><a href="posts/${post.filename}">${post.title}</a></li>`
      )
      .join("\n") +
    "\n</ul>";

  // Generate index page
  const indexTemplate = await fs.readFile(
    path.join(process.cwd(), "src", "templates", "index.html"),
    "utf-8"
  );
  const indexHtml = indexTemplate
    .replace(
      "{{content}}",
      indexHtmlContent + "\n<h2>Blog Posts</h2>\n<ul>" + postLinks + "</ul>"
    )
    .replace("{{toc}}", combinedToc);
  await fs.writeFile(path.join(outputDir, "index.html"), indexHtml);

  // Copy CSS file
  await fs.copyFile(
    path.join(process.cwd(), "src", "styles", "main.css"),
    path.join(stylesOutputDir, "main.css")
  );

  console.log("Blog generated successfully!");
}

generateBlog().catch(console.error);
