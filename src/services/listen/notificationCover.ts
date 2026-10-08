import {
  CHAPTER_READER_SETTINGS,
  type ChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { isMissingCoverUri } from '@utils/novelCover';

/** The cover to show in the playback notification, if the user wants one. */
export const notificationCoverUri = (
  cover?: string | null,
): string | undefined => {
  const tts = getMMKVObject<ChapterReaderSettings>(
    CHAPTER_READER_SETTINGS,
  )?.tts;
  if (tts?.notificationCover === false || isMissingCoverUri(cover)) {
    return undefined;
  }
  return cover?.trim();
};
