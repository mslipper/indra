import { MultisigTransaction } from "@connext/types";
import { getRandomAddress, getRandomChannelSigner } from "@connext/utils";
import { utils } from "ethers";
import { TransactionDescription } from "@ethersproject/abi";

import { generateRandomNetworkContext } from "../testing/mocks";

import { ConditionalTransactionDelegateTarget } from "../contracts";
import { StateChannel } from "../models";
import { Context } from "../types";
import { appIdentityToHash } from "../utils";

import { getSetupCommitment } from "./setup-commitment";

/**
 * This test suite decodes a constructed SetupCommitment transaction object according
 * to the specifications defined by Counterfactual as can be found here:
 * https://specs.counterfactual.com/04-setup-protocol#commitments
 *
 */
describe("SetupCommitment", () => {
  let tx: MultisigTransaction;

  // Dummy network context
  const context = {
    network: generateRandomNetworkContext(),
  } as Context;

  // General interaction testing values
  const interaction = {
    sender: getRandomChannelSigner(),
    receiver: getRandomChannelSigner(),
  };
  const initiatorId = interaction.sender.publicIdentifier;
  const responderId = interaction.receiver.publicIdentifier;

  // State channel testing values
  const stateChannel = StateChannel.setupChannel(
    context.network.IdentityApp,
    {
      proxyFactory: context.network.ProxyFactory,
      multisigMastercopy: context.network.MinimumViableMultisig,
    },
    utils.getAddress(getRandomAddress()),
    initiatorId,
    responderId,
  );

  const freeBalance = stateChannel.freeBalance;

  beforeAll(() => {
    tx = getSetupCommitment(context, stateChannel).getTransactionDetails();
  });

  it("should be to ConditionalTransactionDelegateTarget", () => {
    expect(tx.to).toBe(context.network.ConditionalTransactionDelegateTarget);
  });

  it("should have no value", () => {
    expect(tx.value).toBe(0);
  });

  describe("the calldata", () => {
    const iface = new utils.Interface(ConditionalTransactionDelegateTarget.abi);
    let desc: TransactionDescription;

    beforeAll(() => {
      const { data } = tx;
      desc = iface.parseTransaction({ data });
    });

    it("should be to the executeEffectOfFreeBalance method", () => {
      expect(desc.sighash).toBe(
        utils.Interface.getSighash(iface.functions.executeEffectOfFreeBalance),
      );
    });

    it("should contain expected arguments", () => {
      const [appRegistry, appIdentityHash, interpreterAddress] = desc.args;
      expect(appRegistry).toBe(context.network.ChallengeRegistry);
      expect(appIdentityHash).toBe(appIdentityToHash(freeBalance.identity));
      expect(interpreterAddress).toBe(context.network.MultiAssetMultiPartyCoinTransferInterpreter);
    });
  });
});