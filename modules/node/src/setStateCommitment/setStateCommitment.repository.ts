import { SetStateCommitmentJSON } from "@connext/types";
import { toBNJson } from "@connext/utils";
import { EntityRepository, Repository, EntityManager } from "typeorm";

import { SetStateCommitment } from "./setStateCommitment.entity";
import { AppType } from "../appInstance/appInstance.entity";
import { BigNumber } from "ethers/utils";
import {toBN} from '@connext/utils';

export const setStateToJson = (entity: SetStateCommitment): SetStateCommitmentJSON => {
  return {
    appIdentity: entity.appIdentity as any,
    appIdentityHash: entity.app.identityHash,
    appStateHash: entity.appStateHash,
    challengeRegistryAddress: entity.challengeRegistryAddress,
    signatures: entity.signatures as any,
    stateTimeout: toBNJson(entity.stateTimeout),
    versionNumber: toBNJson(entity.versionNumber),
  };
};

@EntityRepository(SetStateCommitment)
export class SetStateCommitmentRepository extends Repository<SetStateCommitment> {
  findByAppIdentityHash(appIdentityHash: string): Promise<SetStateCommitment[]> {
    return this.createQueryBuilder("set_state")
      .leftJoinAndSelect("set_state.app", "app")
      .where("app.identityHash = :appIdentityHash", { appIdentityHash })
      .getMany();
  }

  findByMultisigAddress(multisigAddress: string): Promise<SetStateCommitment[]> {
    return this.createQueryBuilder("set_state")
      .leftJoinAndSelect("set_state.app", "app")
      .where("app.channel.multisigAddress = :multisigAddress", { multisigAddress })
      .getMany();
  }

  findByAppStateHash(appStateHash: string): Promise<SetStateCommitment | undefined> {
    return this.findOne({
      where: {
        appStateHash,
      },
    });
  }

  findByAppIdentityHashAndVersionNumber(
    appIdentityHash: string,
    versionNumber: BigNumber,
  ): Promise<SetStateCommitment | undefined> {
    return this.createQueryBuilder("set_state")
      .leftJoinAndSelect("set_state.app", "app")
      .where("app.identityHash = :appIdentityHash", { appIdentityHash })
      .andWhere("set_state.versionNumber = :versionNumber", {
        versionNumber: versionNumber.toNumber(),
      })
      .cache('state_commitment_identity_hash_version_number',60000)
      .getOne();
  }

  async getLatestSetStateCommitment(
    appIdentityHash: string,
  ): Promise<SetStateCommitmentJSON | undefined> {
    const commitments = await this.findByAppIdentityHash(appIdentityHash);
    if (commitments.length === 0) {
      return undefined;
    }
    return setStateToJson(commitments.sort((a, b) => b.versionNumber - a.versionNumber)[0]);
  }

  async findAllActiveCommitmentsByMultisig(multisigAddress: string): Promise<SetStateCommitment[]> {
    return this.createQueryBuilder("set_state")
      .leftJoinAndSelect("set_state.app", "app")
      .where("app.type <> :rejected", { rejected: AppType.REJECTED })
      .andWhere("app.type <> :uninstalled", { uninstalled: AppType.UNINSTALLED })
      .leftJoinAndSelect("app.channel", "channel")
      .where("channel.multisigAddress = :multisigAddress", { multisigAddress })
      .getMany();
  }

  async updateStateCommitment(tx: EntityManager, identityHash: string, update: SetStateCommitmentJSON) {
    return tx.createQueryBuilder()
      .update(SetStateCommitment)
      .set({
        appIdentity: update.appIdentity,
        appStateHash: update.appStateHash,
        challengeRegistryAddress: update.challengeRegistryAddress,
        signatures: update.signatures,
        stateTimeout: toBN(update.stateTimeout).toString(),
        versionNumber: toBN(update.versionNumber).toNumber(),
      })
      .where('"appIdentityHash" = :appIdentityHash', {
        appIdentityHash: identityHash,
      })
      .execute();
  }
}
