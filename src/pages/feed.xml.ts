import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog');

  return rss({
    title: 'Alexandro Netto',
    description: 'Writing about mechanism design, public goods, governance, and the Ethereum ecosystem.',
    site: context.site!,
    items: posts
      .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.description || '',
        link: `/blog/${post.id}`,
      })),
  });
}
