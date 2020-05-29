import {EntityManager} from 'typeorm';

export async function cachedWrappedEMTx<T> (em: EntityManager, cb: (em: CachingEntityManager) => Promise<T>): Promise<T> {
  let cem: CachingEntityManager;
  const res = await em.transaction((em) => {
    cem = CachingEntityManager.fromEM(em);
    return cb(cem);
  });
  if (cem) {
    await em.connection.queryResultCache.remove(cem.getDirtyKeys());
  }
  return res;
}

export class CachingEntityManager extends EntityManager {
  private dirtyKeys: Set<string> = new Set<string>();

  markCacheKeyDirty (key: string) {
    this.dirtyKeys.add(key);
  }

  markCacheKeysDirty (...keys: string[]) {
    for (const key of keys) {
      this.dirtyKeys.add(key);
    }
  }

  getDirtyKeys () {
    return Array.from(this.dirtyKeys);
  }

  static fromEM (em: EntityManager) {
    return new CachingEntityManager(em.connection, em.queryRunner);
  }
}