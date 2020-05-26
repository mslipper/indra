import { BigNumber, solidityPack, keccak256 } from "ethers/utils";
import { AppIdentity, CommitmentTarget } from "@connext/types";

const cache: {[k:string]: string} = {};

export const appIdentityToHash = (appIdentity: AppIdentity): string => {
  const ck = `${appIdentity.multisigAddress}${appIdentity.channelNonce.toString()}${appIdentity.participants.join(',')}${appIdentity.appDefinition}${appIdentity.defaultTimeout}`;

  if (cache[ck]) {
    return cache[ck];
  }

  const val = keccak256(
    solidityPack(
      ["address", "uint256", "bytes32", "address", "uint256"],
      [
        appIdentity.multisigAddress,
        appIdentity.channelNonce,
        keccak256(solidityPack(["address[]"], [appIdentity.participants])),
        appIdentity.appDefinition,
        appIdentity.defaultTimeout,
      ],
    ),
  );

  cache[ck] = val;
  return val;
};

// TS version of MChallengeRegistryCore::computeCancelDisputeHash
export const computeCancelDisputeHash = (identityHash: string, versionNumber: BigNumber) =>
  keccak256(
    solidityPack(
      ["uint8", "bytes32", "uint256"],
      [CommitmentTarget.CANCEL_DISPUTE, identityHash, versionNumber],
    ),
  );

// TS version of MChallengeRegistryCore::appStateToHash
export const appStateToHash = (state: string) => keccak256(state);

// TS version of MChallengeRegistryCore::computeAppChallengeHash
export const computeAppChallengeHash = (
  id: string,
  appStateHash: string,
  versionNumber: BigNumber,
  timeout: BigNumber,
) =>
  keccak256(
    solidityPack(
      ["uint8", "bytes32", "bytes32", "uint256", "uint256"],
      [CommitmentTarget.SET_STATE, id, appStateHash, versionNumber, timeout],
    ),
  );
