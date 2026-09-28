/** Strip markdown/HTML noise so the voice doesn't read syntax aloud (ported from js/tts.js). */

export const TTS_MAX_CHARS = 4000;

export const toSpeechText = (raw: string | null | undefined): string =>
  String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s{0,3}>\s?/gm, '') // quotes
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/^\s*\d+\.\s+/gm, '') // ordered lists
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/~~([^~]+)~~/g, '$1') // strikethrough
    .replace(/^\s{0,3}[-=_*]{3,}\s*$/gm, ' ') // hr
    .replace(/\s+/g, ' ')
    .trim();
