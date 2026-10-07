import { MMKVStorage } from '@utils/mmkv/mmkv';

import {
  createRepository,
  getRepositoriesFromDb,
} from './queries/RepositoryQueries';

/** The official LNReader source list (Royal Road, NovelFire and the rest). */
export const DEFAULT_REPOSITORY_URL =
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json';
const SEEDED_KEY = 'lnl.defaultRepositorySeeded';

/**
 * Adds the official source repository once, on a fresh install, so the Browse
 * tab has sources straight away. Never re-added if the user later removes it.
 */
export const seedDefaultRepository = async () => {
  if (MMKVStorage.getBoolean(SEEDED_KEY)) return;
  MMKVStorage.set(SEEDED_KEY, true);
  const existing = await getRepositoriesFromDb();
  if (existing.length === 0) await createRepository(DEFAULT_REPOSITORY_URL);
};
