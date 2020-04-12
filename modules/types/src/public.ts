import { TransactionResponse } from "ethers/providers";
import { BigNumberish } from "ethers/utils";

import { Address, BigNumber, Bytes32, HexString, Xpub } from "./basic";
import { ConditionalTransferTypes } from "./transfers";
import { MethodResults, MethodParams } from "./methods";

////////////////////////////////////////
// deposit

type DepositParameters = {
  amount: BigNumberish;
  assetId?: Address; // if not provided, will default to 0x0 (Eth)
};

type DepositResponse = {
  freeBalance: {
    [s: string]: BigNumber;
  };
};

type CheckDepositRightsParameters = {
  assetId?: Address;
};

type CheckDepositRightsResponse = {
  appIdentityHash: Bytes32;
};

type RequestDepositRightsParameters = MethodParams.RequestDepositRights;
type RequestDepositRightsResponse = MethodResults.RequestDepositRights;

type RescindDepositRightsParameters = MethodParams.RescindDepositRights;
type RescindDepositRightsResponse = MethodResults.RescindDepositRights;

////////////////////////////////////////
// hashlock

type HashLockTransferParameters = {
  conditionType: typeof ConditionalTransferTypes.HashLockTransfer;
  amount: BigNumberish;
  timelock: BigNumberish;
  lockHash: Bytes32;
  recipient: Xpub;
  assetId?: Address;
  meta?: object;
};

type HashLockTransferResponse = {
  appIdentityHash: Bytes32;
};

type ResolveHashLockTransferParameters = {
  conditionType: typeof ConditionalTransferTypes.HashLockTransfer;
  preImage: Bytes32;
};

type ResolveHashLockTransferResponse = {
  appIdentityHash: Bytes32;
  sender: Xpub;
  amount: BigNumber;
  assetId: Address;
  meta?: object;
};

////////////////////////////////////////
// linked transfer

type LinkedTransferParameters = {
  conditionType: typeof ConditionalTransferTypes.LinkedTransfer;
  amount: BigNumberish;
  assetId?: Address;
  paymentId: Bytes32;
  preImage: Bytes32;
  recipient?: Xpub;
  meta?: object;
};

type LinkedTransferResponse = {
  appIdentityHash: Bytes32;
  paymentId: Bytes32;
  preImage: Bytes32;
};

type ResolveLinkedTransferParameters = {
  conditionType: typeof ConditionalTransferTypes.LinkedTransfer;
  paymentId: Bytes32;
  preImage: Bytes32;
}

type ResolveLinkedTransferResponse = {
  appIdentityHash: Bytes32;
  sender: Xpub;
  paymentId: Bytes32;
  amount: BigNumber;
  assetId: Address;
  meta?: object;
};

////////////////////////////////////////
// signed transfer

type SignedTransferParameters = {
  conditionType: typeof ConditionalTransferTypes.SignedTransfer;
  amount: BigNumber;
  assetId: Address;
  paymentId: Bytes32;
  signer: Address;
  recipient?: Xpub;
  meta?: any;
};

type SignedTransferResponse = {
  appIdentityHash: Bytes32;
  paymentId: Bytes32;
};

type ResolveSignedTransferParameters = {
  conditionType: typeof ConditionalTransferTypes.SignedTransfer;
  paymentId: Bytes32;
  data: Bytes32;
  signature: HexString;
};

type ResolveSignedTransferResponse = {
  appIdentityHash: Bytes32;
  assetId: Address;
  amount: BigNumber;
  sender: Xpub;
  meta?: any;
};

////////////////////////////////////////
// conditional transfer

type ConditionalTransferParameters =
  | LinkedTransferParameters
  | HashLockTransferParameters
  | SignedTransferParameters;

type ConditionalTransferResponse =
  | LinkedTransferResponse
  | HashLockTransferResponse
  | SignedTransferResponse;

////////////////////////////////////////
// resolve condition

type ResolveConditionParameters =
  | ResolveHashLockTransferParameters
  | ResolveLinkedTransferParameters
  | ResolveSignedTransferParameters;

type ResolveConditionResponse =
  | ResolveHashLockTransferResponse
  | ResolveLinkedTransferResponse
  | ResolveSignedTransferResponse;

////////////////////////////////////////
// swap

type SwapParameters = {
  amount: BigNumberish;
  fromAssetId: Address;
  swapRate: string; // DecString?
  toAssetId: Address;
}

type SwapResponse = {
  id: number;
  nodePublicIdentifier: Xpub;
  userPublicIdentifier: Xpub;
  multisigAddress: Address;
  available: boolean;
  activeCollateralizations: { [assetId: string]: boolean };
}

////////////////////////////////////////
// withdraw

type WithdrawParameters = {
  amount: BigNumberish;
  assetId?: Address; // if not provided, will default to 0x0 (Eth)
  recipient?: Address; // if not provided, will default to signer addr
  nonce?: HexString; // generated internally, end user doesn't need to provide it
};

type WithdrawResponse = {
  transaction: TransactionResponse;
};

////////////////////////////////////////
// transfer

type TransferParameters = MethodParams.Deposit & {
  recipient: Address;
  meta?: object;
  paymentId?: Bytes32;
};

type TransferResponse = LinkedTransferResponse;

////////////////////////////////////////
// exports

export namespace PublicParams {
  export type CheckDepositRights = CheckDepositRightsParameters;
  export type ConditionalTransfer = ConditionalTransferParameters;
  export type Deposit = DepositParameters;
  export type HashLockTransfer = HashLockTransferParameters;
  export type LinkedTransfer = LinkedTransferParameters;
  export type RequestDepositRights = RequestDepositRightsParameters;
  export type RescindDepositRights = RescindDepositRightsParameters;
  export type ResolveCondition = ResolveConditionParameters;
  export type ResolveHashLockTransfer = ResolveHashLockTransferParameters;
  export type ResolveLinkedTransfer = ResolveLinkedTransferParameters;
  export type ResolveSignedTransfer = ResolveSignedTransferParameters;
  export type SignedTransfer = SignedTransferParameters;
  export type Swap = SwapParameters;
  export type Transfer = TransferParameters;
  export type Withdraw = WithdrawParameters;
}

export type PublicParam = 
  | CheckDepositRightsParameters
  | ConditionalTransferParameters
  | DepositParameters
  | HashLockTransferParameters
  | LinkedTransferParameters
  | RequestDepositRightsParameters
  | RescindDepositRightsParameters
  | ResolveConditionParameters
  | ResolveHashLockTransferParameters
  | ResolveLinkedTransferParameters
  | ResolveSignedTransferParameters
  | SignedTransferParameters
  | SwapParameters
  | TransferParameters
  | WithdrawParameters;

export namespace PublicResults {
  export type CheckDepositRights = CheckDepositRightsResponse;
  export type ConditionalTransfer = ConditionalTransferResponse;
  export type Deposit = DepositResponse;
  export type HashLockTransfer = HashLockTransferResponse;
  export type LinkedTransfer = LinkedTransferResponse;
  export type RequestDepositRights = RequestDepositRightsResponse;
  export type RescindDepositRights = RescindDepositRightsResponse;
  export type ResolveCondition = ResolveConditionResponse;
  export type ResolveHashLockTransfer = ResolveHashLockTransferResponse;
  export type ResolveLinkedTransfer = ResolveLinkedTransferResponse;
  export type ResolveSignedTransfer = ResolveSignedTransferResponse;
  export type SignedTransfer = SignedTransferResponse;
  export type Swap = SwapResponse;
  export type Transfer = TransferResponse;
  export type Withdraw = WithdrawResponse;
}

export type PublicResult = 
  | CheckDepositRightsResponse
  | ConditionalTransferResponse
  | DepositResponse
  | HashLockTransferResponse
  | LinkedTransferResponse
  | RequestDepositRightsResponse
  | RescindDepositRightsResponse
  | ResolveConditionResponse
  | ResolveHashLockTransferResponse
  | ResolveLinkedTransferResponse
  | ResolveSignedTransferResponse
  | SignedTransferResponse
  | SwapResponse
  | TransferResponse
  | WithdrawResponse;