// import markdownit from "markdown-it";

// import { readMarkdownFile } from "./utils";

// const file = readMarkdownFile("./src/index.md");
// const md = markdownit();
// const result = md.render(file);
// console.log(result);

import fs from "fs/promises";
import path from "path";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt();

async function generateBlog() {
  const postsDir = path.join(process.cwd(), "src", "posts");
  const outputDir = path.join(process.cwd(), "dist");
  const postsOutputDir = path.join(outputDir, "posts");
  const stylesOutputDir = path.join(outputDir, "styles");

  // Ensure output directories exist
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(postsOutputDir, { recursive: true });
  await fs.mkdir(stylesOutputDir, { recursive: true });

  // Read all markdown files
  const files = await fs.readdir(postsDir);
  const posts = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const content = await fs.readFile(path.join(postsDir, file), "utf-8");
        const html = md.render(content);
        const title = content.split("\n")[0].replace("#", "").trim();
        return { title, html, file: file.replace(".md", ".html") };
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
      .replace("{{content}}", post.html);
    await fs.writeFile(path.join(postsOutputDir, post.file), postHtml);
  }

  // Generate index page
  const indexTemplate = await fs.readFile(
    path.join(process.cwd(), "src", "templates", "index.html"),
    "utf-8"
  );
  const postLinks = posts
    .map((post) => `<li><a href="posts/${post.file}">${post.title}</a></li>`)
    .join("");
  const indexHtml = indexTemplate.replace("{{posts}}", postLinks);
  await fs.writeFile(path.join(outputDir, "index.html"), indexHtml);

  // Copy CSS file
  await fs.copyFile(
    path.join(process.cwd(), "src", "styles", "main.css"),
    path.join(stylesOutputDir, "main.css")
  );

  console.log("Blog generated successfully!");
}

generateBlog().catch(console.error);
