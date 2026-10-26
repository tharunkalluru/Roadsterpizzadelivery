// Curated roadside sayings, not a measured popularity ranking. Source quality,
// excerpts and translations are recorded in docs/street-life-sources.md.
export const AUTO_QUOTES = [
  { id: 'amma', lines: ['అమ్మ దీవెన'], source: 'https://www.dishadaily.com/telangana/quotation-on-the-back-of-an-auto-with-cm-revanth-reddys-photo-goes-viral-426325' },
  { id: 'nanna', lines: ['నాన్న బహుమతి'], source: 'https://www.dishadaily.com/telangana/quotation-on-the-back-of-an-auto-with-cm-revanth-reddys-photo-goes-viral-426325' },
  { id: 'slow', lines: ['వేగం వద్దు', 'ప్రాణం ముద్దు'], source: 'https://www.indiastudychannel.com/forum/148869-Thought-provoking-road-safety-slogans-quotes-and-sayings.aspx' },
  { id: 'youth', lines: ['యువతా మేలుకో', 'వేగం ఆపుకో', 'ప్రాణం కాపాడుకో'], source: 'https://www.indiastudychannel.com/forum/148869-Thought-provoking-road-safety-slogans-quotes-and-sayings.aspx' },
  { id: 'envy', lines: ['నన్ను చూసి ఏడవకు'], source: 'https://www.indiastudychannel.com/forum/148869-Thought-provoking-road-safety-slogans-quotes-and-sayings.aspx' },
  { id: 'fare', lines: ['వీలైతే నాలుగు టికెట్లు', 'కుదిరితే ఒక కిరాయి'], source: 'https://www.chaibisket.com/blogs/blog/autowala-quotes' },
  { id: 'speed', lines: ['స్పీడ్ ఎక్కువైతే', 'పాడెక్కుతావ్'], source: 'https://www.chaibisket.com/blogs/blog/autowala-quotes' },
  { id: 'hospital', lines: ['వేగంగా వెళ్తుంటే ఉంటుంది థ్రిల్లు', 'ఆ తరువాత నువ్వు కట్టాలి', 'హాస్పిటల్ బిల్లు'], source: 'https://www.chaibisket.com/blogs/blog/autowala-quotes' },
  { id: 'tree', lines: ['మనం ఒక మొక్క నాటితేనే', 'ఒక చుక్క వర్షం పడుతుంది'], source: 'https://www.dishadaily.com/telangana/autowalas-quote-on-environment-is-going-viral-317345' },
  { id: 'story', lines: ['విషాద కథ — రూ.1000', 'ఏడవాలంటే — రూ.2000'], source: 'https://www.andhrajyothy.com/2024/prathyekam/if-you-want-to-tell-a-sad-story-then-it-is-rs-1000-if-you-want-to-cry-along-with-it-then-it-is-rs-2000-sgr-spl-1324651.html' },
] as const;

export function autoQuote(index: number) { return AUTO_QUOTES[((Math.trunc(index) % AUTO_QUOTES.length) + AUTO_QUOTES.length) % AUTO_QUOTES.length]; }
