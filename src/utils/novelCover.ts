import { defaultCover } from '@plugins/helpers/constants';

/**
 * True when a novel has no usable cover: none at all, the old "no cover"
 * placeholder, or a local "cover" that is really a folder (an imported EPUB
 * without a cover was saved as ".../Novels/local/6"; loading that crashed).
 */
export const isMissingCoverUri = (uri?: string | null): boolean => {
  const normalizedUri = uri?.trim();
  if (!normalizedUri || normalizedUri === defaultCover) return true;
  if (normalizedUri.startsWith('file://') || normalizedUri.startsWith('/')) {
    const last = normalizedUri.split(/[?#]/)[0].split('/').pop() ?? '';
    return !last || last === 'undefined' || !last.includes('.');
  }
  return false;
};
