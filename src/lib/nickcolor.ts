// 16 colors readable on a dark background — no pure black/white
const PALETTE = [
	'#e06c75', // soft red
	'#e5c07b', // warm yellow
	'#98c379', // green
	'#56b6c2', // cyan
	'#61afef', // blue
	'#c678dd', // purple
	'#d19a66', // orange
	'#be5046', // dark red
	'#e6db74', // bright yellow
	'#a6e22e', // lime
	'#66d9e8', // light cyan
	'#82aaff', // lavender blue
	'#f78c6c', // coral
	'#ff6ac1', // pink
	'#89ddff', // sky blue
	'#c3e88d', // pale green
];

/**
 * Hash a nick string using djb2 and map to a palette entry.
 * Returns a CSS color string consistently for the same nick.
 */
export function nickColor(nick: string): string {
	// djb2 hash
	let hash = 5381;
	for (let i = 0; i < nick.length; i++) {
		hash = ((hash << 5) + hash + nick.charCodeAt(i)) | 0;
	}
	return PALETTE[Math.abs(hash) % PALETTE.length];
}
