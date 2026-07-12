// Per-nick tint palette — theme-aware by CONSTRUCTION.
//
// DarkBear has 19 hand-authored-hex themes whose message grounds span the full
// range: near-black on the dark themes (darkbear gray-950 #000005) up to pure
// white on `light` (gray-950 #ffffff, gray-900 #f9fafb). A fixed palette tuned
// only for dark grounds vanishes on the light theme. There is NO OKLCH factory
// here, so instead of deriving per-theme we pin every entry's WCAG relative
// luminance into the narrow band that clears the contrast floor on BOTH extreme
// grounds at once:
//
//   vs white (L=1.00): ratio = 1.05 / (L + 0.05)  >= 3  ->  L <= 0.30
//   vs black (L~0.00): ratio = (L + 0.05) / 0.05  >= 3  ->  L >= 0.10
//
// Targeting L ~= 0.185 (the midpoint that maximises the smaller of the two
// ratios) yields ~4.5:1 against both grounds — above even the 4.5:1 body-text
// floor, not just the 3:1 UI floor — while keeping every hue fully saturated
// and mutually distinct. Values are static hex (offline-computed by the WCAG
// luminance formula, verified in nickcolor.test.ts); no runtime generation.
//
// Per-entry worst-case contrast (min over {white #ffffff, near-black #000005}):
//   #ee0000 4.53  #c75300 4.50  #977100 4.49  #7b7b00 4.49
//   #438600 4.52  #008a00 4.53  #008944 4.50  #00866f 4.53
//   #0080aa 4.50  #046dff 4.53  #6161ff 4.50  #9448ff 4.54
//   #c600ee 4.53  #dd00a6 4.54  #e70073 4.52  #ed0027 4.54
// Worst entry overall: 4.49:1 — clears the AA large/UI 3:1 floor with margin.
const PALETTE = [
	'#ee0000', // red
	'#c75300', // orange
	'#977100', // amber
	'#7b7b00', // olive
	'#438600', // green
	'#008a00', // emerald
	'#008944', // spring
	'#00866f', // teal
	'#0080aa', // cyan
	'#046dff', // blue
	'#6161ff', // indigo
	'#9448ff', // violet
	'#c600ee', // magenta
	'#dd00a6', // fuchsia
	'#e70073', // rose
	'#ed0027', // crimson
];

/**
 * Hash a nick string using djb2 and map to a palette entry.
 *
 * Deterministic: the same nick always yields the same color (contractual — the
 * hash is never changed). Every palette entry is legible on every theme by
 * construction (>= 4.49:1 on both the darkest and lightest theme grounds).
 */
export function nickColor(nick: string): string {
	// djb2 hash
	let hash = 5381;
	for (let i = 0; i < nick.length; i++) {
		hash = ((hash << 5) + hash + nick.charCodeAt(i)) | 0;
	}
	return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

// Exposed for the co-located contrast test; not part of the render API.
export const NICK_PALETTE: readonly string[] = PALETTE;
