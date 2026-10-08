import { isMissingNovelCover } from '../NovelCoverImage';

describe('isMissingNovelCover', () => {
  it('treats a local folder path (EPUB without a cover) as missing', () => {
    expect(
      isMissingNovelCover(
        'file:///storage/emulated/0/Android/data/x/files/Novels/local/6/',
      ),
    ).toBe(true);
    expect(isMissingNovelCover('file:///data/Novels/local/6/undefined')).toBe(
      true,
    );
    expect(isMissingNovelCover('/data/Novels/local/6')).toBe(true);
  });

  it('keeps real covers', () => {
    expect(isMissingNovelCover('file:///data/Novels/local/6/cover.jpg')).toBe(
      false,
    );
    expect(isMissingNovelCover('https://site.com/covers/123')).toBe(false);
  });
});
