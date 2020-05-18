// import { MinimalTransaction, CommitmentTarget } from "@connext/types";
// import { createRandomAddress } from "@connext/utils";
// import { BigNumber, utils, constants } from "ethers";
// import { TransactionDescription } from "@ethersproject/abi";

// import { createAppInstanceForTest } from "../../../cf-core/src/testing/utils";
// import { generateRandomNetworkContext } from "../../../cf-core/src/testing/mocks";

// import { ChallengeRegistry } from "../../../cf-core/src/contracts";
// import { Context } from "../../../cf-core/src/types";
// import { appIdentityToHash } from "../../../cf-core/src/utils";

// import { getSetStateCommitment, SetStateCommitment } from "./set-state-commitment";
// import { StateChannel, FreeBalanceClass } from "../../../cf-core/src/models";
// import { getRandomChannelSigners } from "../../../cf-core/src/testing/random-signing-keys";

// const { getAddress, Interface, keccak256, solidityPack } = utils;
// const { WeiPerEther, AddressZero } = constants;

// /**
//  * This test suite decodes a constructed SetState Commitment transaction object
//  * to the specifications defined by Counterfactual as can be found here:
//  * https://specs.counterfactual.com/06-update-protocol#commitments
//  */
// describe("Set State Commitment", () => {
//   let commitment: SetStateCommitment;
//   let tx: MinimalTransaction;

//   const context = { network: generateRandomNetworkContext() } as Context;

//   const [initiator, responder] = getRandomChannelSigners(2);

//   // State channel testing values
//   let stateChannel = StateChannel.setupChannel(
//     context.network.IdentityApp,
//     {
//       proxyFactory: context.network.ProxyFactory,
//       multisigMastercopy: context.network.MinimumViableMultisig,
//     },
//     getAddress(createRandomAddress()),
//     initiator.publicIdentifier,
//     responder.publicIdentifier,
//   );

//   expect(stateChannel.userIdentifiers[0]).toEqual(initiator.publicIdentifier);
//   expect(stateChannel.userIdentifiers[1]).toEqual(responder.publicIdentifier);

//   // Set the state to some test values
//   stateChannel = stateChannel.setFreeBalance(
//     FreeBalanceClass.createWithFundedTokenAmounts(stateChannel.multisigOwners, WeiPerEther, [
//       AddressZero,
//     ]),
//   );

//   const appInstance = createAppInstanceForTest(stateChannel);

//   const signWithEphemeralKey = async (hash: string) => {
//     const initiatorSig = await initiator.signMessage(hash);
//     const responderSig = await responder.signMessage(hash);
//     return [initiatorSig, responderSig];
//   };

//   beforeAll(async () => {
//     commitment = getSetStateCommitment(context, appInstance);
//     const [initiatorSig, responderSig] = await signWithEphemeralKey(commitment.hashToSign());
//     await commitment.addSignatures(initiatorSig, responderSig);
//     // TODO: (question) Should there be a way to retrieve the version
//     //       of this transaction sent to the multisig vs sent
//     //       directly to the app registry?
//     tx = await commitment.getSignedTransaction();
//   });

//   it("should be to ChallengeRegistry", () => {
//     expect(tx.to).toBe(context.network.ChallengeRegistry);
//   });

//   it("should have no value", () => {
//     expect(tx.value).toBe(0);
//   });

//   describe("the calldata", () => {
//     const iface = new Interface(ChallengeRegistry.abi);
//     let desc: TransactionDescription;

//     beforeAll(() => {
//       const { data } = tx;
//       desc = iface.parseTransaction({ data });
//     });

//     it("should be to the setState method", () => {
//       expect(desc.sighash).toBe(iface.getSighash(iface.getFunctio("setState")));
//     });

//     it("should contain expected AppIdentity argument", () => {
//       const [
//         multisigAddress,
//         channelNonce,
//         participants,
//         appDefinition,
//         defaultTimeout,
//       ] = desc.args[0];

//       expect(channelNonce).toEqual(BigNumber.from(appInstance.identity.channelNonce));
//       expect(participants).toEqual(appInstance.identity.participants);
//       expect(multisigAddress).toBe(appInstance.multisigAddress);
//       expect(appDefinition).toBe(appInstance.identity.appDefinition);
//       expect(defaultTimeout).toEqual(BigNumber.from(appInstance.identity.defaultTimeout));
//     });

//     it("should contain expected SignedAppChallengeUpdate argument", () => {
//       const [stateHash, versionNumber, timeout, []] = desc.args[1];
//       expect(stateHash).toBe(appInstance.hashOfLatestState);
//       expect(versionNumber).toEqual(BigNumber.from(appInstance.versionNumber));
//       expect(timeout).toEqual(BigNumber.from(appInstance.timeout));
//     });
//   });

//   it("should produce the correct hash to sign", () => {
//     const hashToSign = commitment.hashToSign();

//     // Based on MChallengeRegistryCore::computeStateHash
//     // TODO: Probably should be able to compute this from some helper
//     //       function ... maybe an ChallengeRegistry class or something
//     const expectedHashToSign = keccak256(
//       solidityPack(
//         ["uint8", "bytes32", "bytes32", "uint256", "uint256"],
//         [
//           CommitmentTarget.SET_STATE,
//           appIdentityToHash(appInstance.identity),
//           appInstance.hashOfLatestState,
//           appInstance.versionNumber,
//           appInstance.timeout,
//         ],
//       ),
//     );

//     expect(hashToSign).toBe(expectedHashToSign);
//   });
// });
