import { xkeyKthAddress } from "@connext/cf-core";
import {
  CFCoreTypes,
  CoinTransferBigNumber,
  bigNumberifyObj,
  WithdrawAppState,
  recoverAddressWithEthers,
} from "@connext/types";

import { unidirectionalCoinTransferValidation } from "../shared";
import { convertWithrawAppState } from "./convert";
import { BigNumber } from "ethers/utils";
import { HashZero, Zero } from "ethers/constants";

export const validateWithdrawApp = async (
  params: CFCoreTypes.ProposeInstallParams,
  initiatorPublicIdentifier: string,
  responderPublicIdentifier: string,
) => {
  const { responderDeposit, initiatorDeposit, initialState: initialStateBadType } = bigNumberifyObj(
    params,
  );

  const initiatorFreeBalanceAddress = xkeyKthAddress(initiatorPublicIdentifier);
  const responderFreeBalanceAddress = xkeyKthAddress(responderPublicIdentifier);

  const initialState: WithdrawAppState<BigNumber> = convertWithrawAppState(
    "bignumber",
    initialStateBadType,
  );

  initialState.transfers = initialState.transfers.map((transfer: CoinTransferBigNumber) =>
    bigNumberifyObj(transfer),
  ) as any;

  const initiatorTransfer = initialState.transfers[0];
  const responderTransfer = initialState.transfers[1];

  unidirectionalCoinTransferValidation(
    initiatorDeposit,
    responderDeposit,
    initiatorTransfer,
    responderTransfer,
  );

  if (initialState.finalized) {
    throw new Error(`Cannot install a withdraw app with a finalized state. State: ${initialState}`);
  }

  if (initialState.signatures[1] !== HashZero) {
    throw new Error(
      `Cannot install a withdraw app with a populated signatures[1] field. Signatures[1]: ${initialState.signatures[1]}`,
    );
  }

  if (
    initialState.signers[0] !== initiatorFreeBalanceAddress ||
    initialState.signers[1] !== responderFreeBalanceAddress
  ) {
    throw new Error(
      `Cannot install a withdraw app if signers[] do not match multisig participant addresses. Signers[]: ${initialState.signers}`,
    );
  }

  if (!initialState.transfers[1].amount.eq(Zero)) {
    throw new Error(
      `Cannot install a withdraw app with nonzero recipient amount. ${initialState.transfers[1].amount.toString()}`,
    );
  }

  let recovered = await recoverAddressWithEthers(initialState.data, initialState.signatures[0]);

  if (recovered !== initialState.signers[0]) {
    throw new Error(
      `Cannot install withdraw app - incorrect signer recovered from initiator sig on data. 
         Recovered: ${recovered}, Expected: ${initialState.signers[0]}`,
    );
  }
};