import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://alexnet.to',
  // Static pages; only /api/lead (contact form) runs as a Vercel function.
  output: 'static',
  adapter: vercel(),
  // /links is the hidden link-in-bio page: no sitemap entry, noindex.
  integrations: [sitemap({ filter: (page) => !/\/links\/?$/.test(page) })],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
