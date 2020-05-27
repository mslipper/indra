import {EntityManager} from 'typeorm';

export async function cachedWrappedEMTx<T> (em: EntityManager, cb: (em: CachingEntityManager) => Promise<T>): Promise<T> {
  let cem: CachingEntityManager;
  const res = await em.transaction((em) => {
    cem = CachingEntityManager.fromEM(em);
    return cb(cem);
  });
  if (cem) {
    await em.connection.queryResultCache.remove(cem.getDirtyKeys());
    console.log('purged keys', cem.getDirtyKeys());
  }
  return res;
}

export class CachingEntityManager extends EntityManager {
  private dirtyKeys: string[] = [];

  markCacheKeyDirty (key: string) {
    this.dirtyKeys.push(key);
  }

  markCacheKeysDirty (...keys: string[]) {
    this.dirtyKeys = this.dirtyKeys.concat(keys);
  }

  getDirtyKeys () {
    return this.dirtyKeys;
  }

  static fromEM (em: EntityManager) {
    return new CachingEntityManager(em.connection, em.queryRunner);
  }
}