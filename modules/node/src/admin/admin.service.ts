import { ConnextNodeStorePrefix, StateChannelJSON } from "@connext/types";
import { Injectable } from "@nestjs/common";

import { CFCoreRecordRepository } from "../cfCore/cfCore.repository";
import { CFCoreService } from "../cfCore/cfCore.service";
import { Channel } from "../channel/channel.entity";
import { ChannelService } from "../channel/channel.service";
import { ConfigService } from "../config/config.service";
import { LinkedTransfer } from "../transfer/transfer.entity";
import { TransferService } from "../transfer/transfer.service";
import { CLogger, getCreate2MultisigAddress } from "../util";

const logger = new CLogger("AdminService");

const HISTORICAL_PROXY_FACTORY_ADDRESSES = {
  1: [
    "0x90Bf287B6870A99E32130CED0Da8b02302a8a4dE",
    "0xA16d9511C743d6D6177A65892DC2Eafd417BfD7A",
    "0xc756Bf6A685573C6879D4363401940f02B4E27a1",
    "0x6CF0c4Ab3F1e66913c0983DC0bb1202d958ABb8f",
    "0x711C655e08aaA9081e0BDc431920507CCD96b7a0",
    "0xF9015aA98BeBaE3e43945c48dc3fB6c0a5281986",
  ],
  4: [
    "0x49f2eCa045B2372C334B6CcBB9232C48f9acA097",
    "0x8A49B435cc3D2176B67e0D26170387EeDf135669",
    "0xD891F41c4ba30b1FF4f604e30F64ae387DD85b4F",
    "0x6CF0c4Ab3F1e66913c0983DC0bb1202d958ABb8f",
    "0xc8d7Cf5638dfa5b79A070c5aC983716575bEF4B0",
    "0xc40E9B210363163a143f454fa505ACeAA28Cd475",
    "0x8eb543b35DE94B0E636402C7cA32947b22853eDF",
    "0xc8d7Cf5638dfa5b79A070c5aC983716575bEF4B0",
    "0x8eb543b35DE94B0E636402C7cA32947b22853eDF",
  ],
};

export interface FixProxyFactoryAddressesResponse {
  fixedChannels: string[];
  stillBrokenChannels: string[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly cfCoreService: CFCoreService,
    private readonly channelService: ChannelService,
    private readonly configService: ConfigService,
    private readonly transferService: TransferService,
    private readonly cfCoreRepository: CFCoreRecordRepository,
  ) {}

  /////////////////////////////////////////
  ///// GENERAL PURPOSE ADMIN FNS

  /**  Get channels by xpub */
  async getStateChannelByUserPublicIdentifier(
    userPublicIdentifier: string,
  ): Promise<StateChannelJSON> {
    return await this.channelService.getStateChannel(userPublicIdentifier);
  }

  /**  Get channels by multisig */
  async getStateChannelByMultisig(multisigAddress: string): Promise<StateChannelJSON> {
    return await this.channelService.getStateChannelByMultisig(multisigAddress);
  }

  /** Get all channels */
  async getAllChannels(): Promise<Channel[]> {
    return await this.channelService.getAllChannels();
  }

  /** Get all transfers */
  // @hunter -- see notes in transfer service fns
  async getAllLinkedTransfers(): Promise<LinkedTransfer[]> {
    return await this.transferService.getAllLinkedTransfers();
  }

  /** Get transfer */
  // @hunter -- see notes in transfer service fns
  async getLinkedTransferByPaymentId(paymentId: string): Promise<LinkedTransfer | undefined> {
    return await this.transferService.getLinkedTransferByPaymentId(paymentId);
  }

  /////////////////////////////////////////
  ///// PURPOSE BUILT ADMIN FNS

  /**
   * October 30, 2019
   *
   * Some channels do not have a `freeBalanceAppInstance` key stored in their
   * state channel object at the path:
   * `{prefix}/{nodeXpub}/channel/{multisigAddress}`, meaning any attempts that
   * rely on checking the free balance (read: all app protocols) will fail.
   *
   * Additionally, any `restoreState` or state migration methods will fail
   * since they will be migrating corrupted states.
   *
   * This method will return the userXpub and the multisig address for all
   * channels that fit this description.
   */
  async getNoFreeBalance(): Promise<{ multisigAddress: string; userXpub: string; error: any }[]> {
    // get all available channels, meaning theyre deployed
    const channels = await this.channelService.findAll();
    const corrupted = [];
    for (const channel of channels) {
      // try to get the free balance of eth
      const { id, multisigAddress, userPublicIdentifier: userXpub } = channel;
      try {
        await this.cfCoreService.getFreeBalance(userXpub, multisigAddress);
      } catch (error) {
        corrupted.push({
          error: error.message,
          id,
          multisigAddress,
          userXpub,
        });
      }
    }
    return corrupted;
  }

  /**
   * October 31, 2019
   *
   * For some as of yet unidentified reason, the multisig address for some
   * channels has changed. This results in 2 channel entries for affected
   * channels. The first was generated around channel creation in from the
   * event data. The second was used to store any subsequent updates.
   *
   * The store entry for `channel/{multisigAddr1}` will have a free balance
   * instance, while the store entry for `channel/{multisigAddr2}` will have
   * all subsequent information regarding channel updates (i.e proposed apps).
   *
   * While this may not be a problem for the functioning of *all* channels,
   * it will be a problem for *any* channel that is restored from the hub.
   * This is because the channels restored by the hub search for the outdated
   * channel state stored under the path `channel/{multisigAddr1}`. It is likely
   * that other, older channels are also affected by this bug.
   *
   * This method will pull out any channel that has a multisigAddress in the
   * channel table, that is different from the expected multisigAddress.
   *
   * Related to bug described in `getNoFreeBalance`.
   */
  async getIncorrectMultisigAddresses(): Promise<
    {
      oldMultisigAddress: string;
      expectedMultisigAddress: string;
      userXpub: string;
      channelId: number;
    }[]
  > {
    const channels = await this.channelService.findAll();
    const ans = [];
    for (const channel of channels) {
      const {
        multisigAddress: oldMultisigAddress,
        userPublicIdentifier: userXpub,
        id: channelId,
      } = channel;
      // calculate the expected multsig address
      const getMultisig = this.cfCoreService.getExpectedMultisigAddressFromUserXpub;
      const expectedMultisigAddress = await getMultisig(userXpub);

      // if it matches, return
      if (expectedMultisigAddress === oldMultisigAddress) {
        continue;
      }

      // otherwise, has incorrect channel addr. from proxy redeployment
      ans.push({
        channelId,
        expectedMultisigAddress,
        oldMultisigAddress,
        userXpub,
      });
    }
    return ans;
  }

  /**
   * November 4, 2019
   *
   * Figure out how many channels that have the ProxyFactory/prefix bug have
   * been updated and need manual channel state merging.
   *
   * There are three cases to merge together:
   *
   * 1. Incorrect prefix, incorrect multisig address
   * 2. Correct prefix, incorrect multisig address
   * 3. Correct prefix, correct multisig address
   *
   * (3) would be the latest `/channel/` entry for the state channel object.
   *
   * There is no reason there would be an incorrect prefix and a correct
   * multisig address since the prefix was changed before the proxy factory
   * was redeployed.
   */
  async getChannelsForMerging(): Promise<any[]> {
    const channels = await this.channelService.findAll();
    // for each of the channels, search for the entries to merge based on
    // outlined possibilities
    const toMerge = [];
    for (const chan of channels) {
      // if the channel has the expected multisig address, assume it
      // will have the correct prefix and will not need to be merged
      // because it was created after latest ProxyFactory deployment
      const expectedMultisig = await this.cfCoreService.getExpectedMultisigAddressFromUserXpub(
        chan.userPublicIdentifier,
      );
      if (expectedMultisig === chan.multisigAddress) {
        continue;
      }
      // otherwise, check to see if there is a channel record with
      // the old prefix
      const oldPrefix = await this.cfCoreService.getChannelRecord(
        chan.multisigAddress,
        "ConnextHub",
      );

      const currPrefix = await this.cfCoreService.getChannelRecord(chan.multisigAddress);

      const latestEntry = await this.cfCoreService.getChannelRecord(expectedMultisig);

      const mergeInfo = {
        channelId: chan.id,
        records: { oldPrefix, currPrefix, latestEntry },
        userXpub: chan.userPublicIdentifier,
      };

      toMerge.push(mergeInfo);
    }

    return toMerge;
  }

  async fixProxyFactoryAddresses(): Promise<FixProxyFactoryAddressesResponse> {
    const fixProxyFactoryInCfCoreRecord = async (
      repoPath: string,
      pfAddress: string,
    ): Promise<void> => {
      logger.log(`Multisig address is as expected, adding correct proxyFactory address`);
      const cfCoreRecord = await this.cfCoreRepository.get(repoPath);
      cfCoreRecord["proxyFactoryAddress"] = pfAddress;
      await this.cfCoreRepository.set([
        {
          path: repoPath,
          value: cfCoreRecord,
        },
      ]);
    };

    const fixedChannels = [];
    const stillBrokenChannels = [];
    const channels = await this.channelService.findAll();

    for (const channel of channels) {
      const { data: stateChannel } = await this.cfCoreService.getStateChannel(
        channel.multisigAddress,
      );
      const contractAddresses = await this.configService.getContractAddresses();

      if (stateChannel.multisigAddress !== channel.multisigAddress) {
        // things will be very weird if this happens, so just dont allow this to happen
        logger.error(
          `This should never happen! stateChannel.multisigAddress ${stateChannel.multisigAddress} !== channel.multisigAddress ${channel.multisigAddress}`,
        );
        continue;
      }

      let fixed = false;
      const repoPath = `${ConnextNodeStorePrefix}/${this.cfCoreService.cfCore.publicIdentifier}/channel/${stateChannel.multisigAddress}`;

      if (!stateChannel.proxyFactoryAddress) {
        console.log("stateChannel: ", stateChannel);
        logger.log(
          `Found a state channel without a proxyFactory address: ${stateChannel.multisigAddress}`,
        );
        const expectedMultisigAddress = await getCreate2MultisigAddress(
          stateChannel.userNeuteredExtendedKeys,
          contractAddresses.ProxyFactory,
          contractAddresses.MinimumViableMultisig,
          this.configService.getEthProvider(),
        );
        if (expectedMultisigAddress === stateChannel.multisigAddress) {
          await fixProxyFactoryInCfCoreRecord(repoPath, contractAddresses.ProxyFactory);
          fixed = true;
        } else {
          // try old multisig addresses
          const network = await this.configService.getEthNetwork();
          const historicalPfAddresses = HISTORICAL_PROXY_FACTORY_ADDRESSES[network.chainId] || [];
          for (const pfAddress of historicalPfAddresses) {
            const expectedMultisigAddress = await getCreate2MultisigAddress(
              stateChannel.userNeuteredExtendedKeys,
              pfAddress,
              contractAddresses.MinimumViableMultisig,
              this.configService.getEthProvider(),
            );
            if (expectedMultisigAddress === stateChannel.multisigAddress) {
              await fixProxyFactoryInCfCoreRecord(pfAddress, contractAddresses.ProxyFactory);
              fixed = true;
              break;
            }
          }
        }
        if (fixed) {
          logger.log(`Fixed channel ${stateChannel.multisigAddress}`);
          fixedChannels.push(stateChannel.multisigAddress);
        } else {
          logger.error(`Unable to fix state channel ${stateChannel.multisigAddress}`);
          stillBrokenChannels.push(stateChannel.multisigAddress);
        }
      }
    }

    return {
      fixedChannels,
      stillBrokenChannels,
    };
  }
}
