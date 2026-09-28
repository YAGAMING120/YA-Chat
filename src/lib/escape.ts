/** HTML escaping used by every string-built HTML helper. */
export const escapeHTML = (str: string): string => {
  if (!str) return '';
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[tag] || tag
  );
};
