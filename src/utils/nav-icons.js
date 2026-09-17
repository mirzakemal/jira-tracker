/**
 * Icons for the top tab bar.
 *
 * Inline SVG rather than emoji: they tint with `currentColor` so the active
 * tab reads in the accent colour, they render identically on every OS, and
 * they scale cleanly. Each is drawn for a 24×24 box, stroke only, and chosen
 * to say what the page is at a glance — the label lives in the tooltip.
 */

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

export const NAV_ICONS = {
  /** Product Board — a kanban: three columns of differing height. */
  product: svg(
    '<rect x="3" y="4" width="5" height="16" rx="1"/>' +
    '<rect x="9.5" y="4" width="5" height="10" rx="1"/>' +
    '<rect x="16" y="4" width="5" height="13" rx="1"/>'
  ),

  /** Customer Card Dashboard — an ID card: portrait and two text lines. */
  customers: svg(
    '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
    '<circle cx="8.5" cy="11" r="2"/>' +
    '<path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4"/>' +
    '<path d="M14 10h4M14 13.5h4"/>'
  ),

  /** Standup — three people, the middle one forward. */
  standup: svg(
    '<circle cx="12" cy="7" r="2.6"/>' +
    '<circle cx="5.5" cy="9" r="2.1"/>' +
    '<circle cx="18.5" cy="9" r="2.1"/>' +
    '<path d="M7.5 19v-1.5a4.5 4.5 0 0 1 9 0V19"/>' +
    '<path d="M2.5 17.5v-1a3 3 0 0 1 3.6-2.9M21.5 17.5v-1a3 3 0 0 0-3.6-2.9"/>'
  ),

  /** Product Radar — concentric rings with a blip. */
  radar: svg(
    '<circle cx="12" cy="12" r="9"/>' +
    '<circle cx="12" cy="12" r="5"/>' +
    '<circle cx="12" cy="12" r="1.2" fill="currentColor"/>' +
    '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'
  ),

  /** Bug Patterns — a bug: body, head, legs, antennae. */
  bugs: svg(
    '<path d="M8 10.5a4 4 0 0 1 8 0V15a4 4 0 0 1-8 0z"/>' +
    '<path d="M12 10.5V19"/>' +
    '<path d="M9.2 7.2 8 5M14.8 7.2 16 5"/>' +
    '<path d="M8 12H4.5M8 15.5l-3 1.5M16 12h3.5M16 15.5l3 1.5M9 18.5 7 21M15 18.5l2 2.5"/>'
  ),

  /** Traceability — two chain links. */
  trace: svg(
    '<path d="M10 13.5a3.5 3.5 0 0 0 4.95 0l2.55-2.55a3.5 3.5 0 0 0-4.95-4.95L11.3 7.25"/>' +
    '<path d="M14 10.5a3.5 3.5 0 0 0-4.95 0L6.5 13.05a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25"/>'
  ),

  /** Brand — a compass. Product management is direction. */
  brand: svg(
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M12 5.5 14.3 12 12 10.6 9.7 12z" fill="currentColor" stroke="none"/>' +
    '<path d="M12 18.5 9.7 12 12 13.4 14.3 12z" fill="currentColor" stroke="none" opacity=".45"/>' +
    '<path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21"/>'
  ),

  /** Theme toggle — a half moon. */
  theme: svg(
    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>'
  )
};
