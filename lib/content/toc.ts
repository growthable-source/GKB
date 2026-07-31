import { htmlToText } from './html'
import { slugify, uniqueSlug } from './slug'

export type Heading = { id: string; text: string; level: 2 | 3 }

const HEADING_PATTERN = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi

/** Headings for the article table of contents, with stable unique ids. */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = []
  const taken: string[] = []

  for (const match of html.matchAll(HEADING_PATTERN)) {
    const text = htmlToText(match[2])
    if (!text) continue

    const id = uniqueSlug(slugify(text), taken)
    taken.push(id)
    headings.push({ id, text, level: Number(match[1]) as 2 | 3 })
  }

  return headings
}

/** Adds matching ids to h2 and h3 tags so anchors resolve. */
export function addHeadingIds(html: string, headings: Heading[]): string {
  let index = 0
  return html.replace(HEADING_PATTERN, (full, level: string, inner: string) => {
    const heading = headings[index]
    if (!heading || htmlToText(inner) !== heading.text) return full
    index++
    return `<h${level} id="${heading.id}">${inner}</h${level}>`
  })
}
