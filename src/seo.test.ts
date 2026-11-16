// What search engines and shared links read from index.html (owner, 2026-11-16, 1.0.2): a title
// and description that say what the app does, the share picture, and the JSON-LD
// WebApplication. index.html is the same page at every address of the app.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOURCE_CODE_REPOSITORY } from './ui/app/config';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function meta(attr: 'name' | 'property', key: string): string | undefined {
  const tag = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 's').exec(html);
  return tag?.[1]?.replace(/\s+/g, ' ').trim();
}

describe('index.html for search and sharing', () => {
  it('has a title and description that say what the app does, in English and Thai', () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
    expect(title).toMatch(/Chess by me/);
    expect(title).toMatch(/free/i);
    expect(title).toMatch(/review/i);
    expect(title).toMatch(/รีวิวเกมหมากรุก/);
    const description = meta('name', 'description') ?? '';
    for (const word of [
      /free/i,
      /unlimited/i,
      /Lichess/,
      /Chess\.com/,
      /device/i,
      /ฟรี/,
      /ไม่จำกัด/,
    ]) {
      expect(description).toMatch(word);
    }
  });

  it('shares a 1200x630 picture on Open Graph and as a large Twitter card', () => {
    expect(meta('property', 'og:image')).toBe('https://chessby.me/og.png');
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBe('https://chessby.me/og.png');
    expect(meta('property', 'og:locale')).toBe('en_US');
    expect(meta('property', 'og:locale:alternate')).toBe('th_TH');
  });

  it('describes the app as a free WebApplication with its source code', () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(block).toBeDefined();
    const data = JSON.parse(block ?? '{}') as Record<string, unknown>;
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebApplication');
    expect(data.name).toBe('Chess by me');
    expect(data.url).toBe('https://chessby.me/');
    expect(typeof data.description).toBe('string');
    expect(data.offers).toMatchObject({ '@type': 'Offer', price: '0' });
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.codeRepository ?? (data as { sameAs?: unknown }).sameAs).toBe(
      SOURCE_CODE_REPOSITORY,
    );
  });

  it('loads no tracker', () => {
    expect(html).not.toMatch(
      /googletagmanager|google-analytics|gtag\(|plausible|cloudflareinsights/i,
    );
    const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1] ?? '');
    for (const attrs of scripts) {
      expect(attrs).toMatch(/type="(module|application\/ld\+json)"/);
      expect(attrs).not.toMatch(/src="https?:/);
    }
  });
});
