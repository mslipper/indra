import {EntityRepository, Repository} from 'typeorm';
import {ConditionalTransactionCommitment} from './conditionalCommitment.entity';
import {ConditionalTransactionCommitmentJSON, ContractAddresses} from '@connext/types';
import {AppInstance, AppType} from '../appInstance/appInstance.entity';
import {CachingEntityManager} from '../database/CachingEntityManager';

export const convertConditionalCommitmentToJson = (
  commitment: ConditionalTransactionCommitment,
  contractAddresses: ContractAddresses,
): ConditionalTransactionCommitmentJSON => {
  return {
    appIdentityHash: commitment.app.identityHash,
    freeBalanceAppIdentityHash: commitment.freeBalanceAppIdentityHash,
    contractAddresses,
    signatures: commitment.signatures,
    interpreterAddr: commitment.interpreterAddr,
    interpreterParams: commitment.interpreterParams,
    multisigAddress: commitment.multisigAddress,
    multisigOwners: commitment.multisigOwners,
  };
};

@EntityRepository(ConditionalTransactionCommitment)
export class ConditionalTransactionCommitmentRepository extends Repository<
  ConditionalTransactionCommitment
> {
  findByAppIdentityHash(
    appIdentityHash: string,
  ): Promise<ConditionalTransactionCommitment | undefined> {
    return this.createQueryBuilder("conditional")
      .leftJoinAndSelect("conditional.app", "app")
      .where("app.identityHash = :appIdentityHash", { appIdentityHash })
      .cache(`ctc:${appIdentityHash}`, 60000)
      .getOne();
  }

  findByMultisigAddress(multisigAddress: string): Promise<ConditionalTransactionCommitment[]> {
    return this.find({
      where: {
        multisigAddress,
      },
    });
  }

  async findAllActiveCommitmentsByMultisig(
    multisigAddress: string,
  ): Promise<ConditionalTransactionCommitment[]> {
    return this.createQueryBuilder("conditional")
      .leftJoinAndSelect("conditional.app", "app")
      .where(
        "app.type <> :rejected", { rejected: AppType.REJECTED },
      )
      .andWhere("app.type <> :uninstalled", { uninstalled: AppType.UNINSTALLED })
      .leftJoinAndSelect("app.channel", "channel")
      .where(
        "channel.multisigAddress = :multisigAddress", { multisigAddress },
      )
      .getMany();
  }

  async upsertConditionalTx (tx: CachingEntityManager, identityHash: string, ctc: ConditionalTransactionCommitmentJSON, proposal: AppInstance) {
    const subQuery = tx.createQueryBuilder()
      .select('id')
      .from(ConditionalTransactionCommitment, 'ctc')
      .innerJoin('ctc.app', 'app')
      .where('app.identityHash = $1')
      .getQuery();
    const [{exists}] = await tx.query(`SELECT EXISTS(${subQuery}) as "exists"`, [
      identityHash,
    ]);
    if (exists) {
      tx.markCacheKeyDirty(`ctc:${identityHash}`);
      return tx.createQueryBuilder()
        .update(ConditionalTransactionCommitment)
        .set({
          freeBalanceAppIdentityHash: ctc.freeBalanceAppIdentityHash,
          multisigAddress: ctc.multisigAddress,
          multisigOwners: ctc.multisigOwners,
          interpreterAddr: ctc.interpreterAddr,
          interpreterParams: ctc.interpreterParams,
          signatures: ctc.signatures,
          app: proposal,
        })
        .where('"appIdentityHash" = :appIdentityHash', {
          appIdentityHash: identityHash,
        })
        .execute();
    }

    return tx.createQueryBuilder()
      .insert()
      .into(ConditionalTransactionCommitment)
      .values({
        freeBalanceAppIdentityHash: ctc.freeBalanceAppIdentityHash,
        multisigAddress: ctc.multisigAddress,
        multisigOwners: ctc.multisigOwners,
        interpreterAddr: ctc.interpreterAddr,
        interpreterParams: ctc.interpreterParams,
        signatures: ctc.signatures,
        app: proposal,
      })
      .execute();
  }
}
