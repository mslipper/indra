import {
  DepositAppState,
  CONVENTION_FOR_ETH_ASSET_ID,
  ProtocolParams,
  StateChannelJSON,
} from "@connext/types";
import {
  getAddressFromAssetId,
  getSignerAddressFromPublicIdentifier,
  stringify,
} from "@connext/utils";
import { MinimumViableMultisig, ERC20 } from "@connext/contracts";
import { Contract } from "ethers";
import { Zero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";

import { baseCoinTransferValidation } from "../shared";

export const validateDepositApp = async (
  params: ProtocolParams.Propose,
  channel: StateChannelJSON,
  provider: JsonRpcProvider,
) => {
  const { responderDeposit, initiatorDeposit, initiatorIdentifier, responderIdentifier } = params;
  const { multisigAddress } = channel;
  const initialState = params.initialState as DepositAppState;

  const initiatorSignerAddress = getSignerAddressFromPublicIdentifier(initiatorIdentifier);
  const responderSignerAddress = getSignerAddressFromPublicIdentifier(responderIdentifier);

  const initiatorTransfer = initialState.transfers[0];
  const responderTransfer = initialState.transfers[1];

  baseCoinTransferValidation(
    initiatorDeposit,
    responderDeposit,
    initiatorTransfer,
    responderTransfer,
  );

  if (initiatorSignerAddress !== initiatorTransfer.to) {
    throw new Error(
      `Cannot install deposit app with incorrect initiator transfer to address: Expected ${initiatorSignerAddress}, got ${initiatorTransfer.to}`,
    );
  }

  if (responderSignerAddress !== responderTransfer.to) {
    throw new Error(
      `Cannot install deposit app with incorrect responder transfer to address: Expected ${responderSignerAddress}, got ${responderTransfer.to}`,
    );
  }

  if (!initialState.transfers[0].amount.isZero() || !initialState.transfers[1].amount.isZero()) {
    throw new Error(
      `Cannot install deposit app with nonzero initial balance: ${stringify(
        initialState.transfers,
      )}`,
    );
  }

  if (initialState.multisigAddress !== multisigAddress) {
    throw new Error(
      `Cannot install deposit app with invalid multisig address. Expected ${multisigAddress}, got ${initialState.multisigAddress}`,
    );
  }

  if (
    initialState.assetId !== getAddressFromAssetId(params.initiatorDepositAssetId) ||
    initialState.assetId !== getAddressFromAssetId(params.responderDepositAssetId)
  ) {
    throw new Error(
      `Cannot install deposit app with invalid token address. Expected ${getAddressFromAssetId(
        params.initiatorDepositAssetId,
      )}, got ${initialState.assetId}`,
    );
  }

  const startingMultisigBalance =
    initialState.assetId === CONVENTION_FOR_ETH_ASSET_ID
      ? await provider.getBalance(multisigAddress)
      : await new Contract(initialState.assetId, ERC20.abi as any, provider).functions.balanceOf(
          multisigAddress,
        );

  const multisig = new Contract(multisigAddress, MinimumViableMultisig.abi as any, provider);
  let startingTotalAmountWithdrawn;
  try {
    startingTotalAmountWithdrawn = await multisig.functions.totalAmountWithdrawn(
      initialState.assetId,
    );
  } catch (e) {
    const NOT_DEPLOYED_ERR = `contract not deployed (contractAddress="${multisigAddress}"`;
    if (!e.message.includes(NOT_DEPLOYED_ERR)) {
      throw new Error(e);
    }
    // multisig is deployed on withdrawal, if not
    // deployed withdrawal amount is 0
    startingTotalAmountWithdrawn = Zero;
  }

  if (!initialState.startingTotalAmountWithdrawn.eq(startingTotalAmountWithdrawn)) {
    throw new Error(
      `Cannot install deposit app with invalid totalAmountWithdrawn. Expected ${startingTotalAmountWithdrawn}, got ${initialState.startingTotalAmountWithdrawn}`,
    );
  }

  if (!initialState.startingMultisigBalance.eq(startingMultisigBalance)) {
    throw new Error(
      `Cannot install deposit app with invalid startingMultisigBalance. Expected ${startingMultisigBalance}, got ${initialState.startingMultisigBalance}`,
    );
  }
};
