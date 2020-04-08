import { DEFAULT_APP_TIMEOUT, WITHDRAW_STATE_TIMEOUT, WithdrawCommitment } from "@connext/apps";
import {
  AppInstanceJson,
  ChannelMethods,
  EventNames,
  MethodParams,
  MinimalTransaction,
  PublicParams,
  PublicResults,
  toBN,
  WithdrawAppAction,
  WithdrawAppName,
  WithdrawAppState,
} from "@connext/types";
import { xkeyKthAddress as xpubToAddress } from "@connext/cf-core";
import { AddressZero, Zero, HashZero } from "ethers/constants";
import { TransactionResponse } from "ethers/providers";
import { formatEther, getAddress, hexlify, randomBytes } from "ethers/utils";

import { stringify } from "../lib";
import { invalidAddress, validate } from "../validation";

import { AbstractController } from "./AbstractController";
import { verifyChannelMessage } from "@connext/crypto";

export class WithdrawalController extends AbstractController {
  public async withdraw(params: PublicParams.Withdraw): Promise<PublicResults.Withdraw> {
    //Set defaults
    if (!params.assetId) {
      params.assetId = AddressZero;
    }
    params.assetId = getAddress(params.assetId);

    if (!params.recipient) {
      params.recipient = this.connext.freeBalanceAddress;
    }
    params.recipient = getAddress(params.recipient);

    if (!params.nonce) {
      params.nonce = hexlify(randomBytes(32));
    }

    const amount = toBN(params.amount);
    const { assetId, recipient } = params;
    let transaction: TransactionResponse | undefined;

    if (recipient) {
      validate(invalidAddress(recipient));
    }

    this.log.info(
      `Withdrawing ${formatEther(amount)} ${
        assetId === AddressZero ? "ETH" : "Tokens"
      } from multisig to ${recipient}`,
    );

    // TODO: try to remove this with deposit redesign
    await this.cleanupPendingDeposit(assetId);

    const withdrawCommitment = await this.createWithdrawCommitment(params);
    const hash = withdrawCommitment.hashToSign();
    const withdrawerSignatureOnWithdrawCommitment = await this.connext.channelProvider.signMessage(
      hash,
    );

    await this.proposeWithdrawApp(params, hash, withdrawerSignatureOnWithdrawCommitment);

    this.connext.listener.emit(EventNames.WITHDRAWAL_STARTED_EVENT, {
      params,
      withdrawCommitment,
      withdrawerSignatureOnWithdrawCommitment,
    });

    transaction = await this.connext.watchForUserWithdrawal();
    this.log.info(`Node put withdrawal onchain: ${transaction.hash}`);
    this.log.debug(`Transaction details: ${stringify(transaction)}`);

    this.connext.listener.emit(EventNames.WITHDRAWAL_CONFIRMED_EVENT, { transaction });

    // Note that we listen for the signed commitment and save it to store only in listener.ts

    return { transaction };
  }

  public async respondToNodeWithdraw(appInstance: AppInstanceJson) {
    const state = appInstance.latestState as WithdrawAppState;

    const generatedCommitment = await this.createWithdrawCommitment({
      amount: state.transfers[0].amount,
      assetId: appInstance.singleAssetTwoPartyCoinTransferInterpreterParams.tokenAddress,
      recipient: state.transfers[0].to,
      nonce: state.nonce,
    } as PublicParams.Withdraw);
    const hash = generatedCommitment.hashToSign();

    // Dont need to validate anything because we already did it during the propose flow
    const counterpartySignatureOnWithdrawCommitment = await this
      .connext.channelProvider.signMessage(hash);
    await this.connext.takeAction(appInstance.identityHash, {
      signature: counterpartySignatureOnWithdrawCommitment,
    } as WithdrawAppAction);
    await this.connext.uninstallApp(appInstance.identityHash);
  }

  private async cleanupPendingDeposit(assetId: string) {
    /*
      TODO: We should find some way to avoid this case completely if possible.
            Otherwise, it's too easy for collisions between deposits and withdraws
            to occur, which would completely fuck up a user channel.
            Circle back after deposit redesign is done.
    */
    this.log.info(`Rescinding deposit rights before withdrawal`);
    await this.connext.rescindDepositRights({ assetId });
  }

  private async createWithdrawCommitment(
    params: PublicParams.Withdraw,
  ): Promise<WithdrawCommitment> {
    const { assetId, amount, nonce, recipient } = params;
    const { data: channel } = await this.connext.getStateChannel();
    return new WithdrawCommitment(
      this.connext.config.contractAddresses,
      channel.multisigAddress,
      [
        channel.freeBalanceAppInstance.initiator,
        channel.freeBalanceAppInstance.responder,
      ],
      recipient,
      assetId,
      amount,
      nonce,
    );
  }

  private async proposeWithdrawApp(
    params: PublicParams.Withdraw,
    withdrawCommitmentHash: string,
    withdrawerSignatureOnWithdrawCommitment: string,
  ): Promise<string> {
    const amount = toBN(params.amount);
    const { assetId, nonce, recipient } = params;
    const appInfo = this.connext.getRegisteredAppDetails(WithdrawAppName);
    const {
      appDefinitionAddress: appDefinition,
      outcomeType,
      stateEncoding,
      actionEncoding,
    } = appInfo;
    const initialState: WithdrawAppState = {
      transfers: [
        { amount: amount, to: recipient },
        { amount: Zero, to: xpubToAddress(this.connext.nodePublicIdentifier) },
      ],
      signatures: [withdrawerSignatureOnWithdrawCommitment, HashZero],
      signers: [
        this.connext.freeBalanceAddress,
        this.connext.nodeFreeBalanceAddress,
      ],
      data: withdrawCommitmentHash,
      nonce,
      finalized: false,
    };
    const installParams: MethodParams.ProposeInstall = {
      abiEncodings: {
        actionEncoding,
        stateEncoding,
      },
      appDefinition,
      initialState,
      initiatorDeposit: amount,
      initiatorDepositTokenAddress: assetId,
      outcomeType,
      proposedToIdentifier: this.connext.nodePublicIdentifier,
      responderDeposit: Zero,
      responderDepositTokenAddress: assetId,
      defaultTimeout: DEFAULT_APP_TIMEOUT,
      stateTimeout: WITHDRAW_STATE_TIMEOUT,
    };
    return await this.proposeAndInstallLedgerApp(installParams);
  }

  public async saveWithdrawCommitmentToStore(
    params: PublicParams.Withdraw,
    signatures: string[],
  ): Promise<void> {
    // set the withdrawal tx in the store
    const commitment = await this.createWithdrawCommitment(params);
    await commitment.addSignatures(...signatures);
    const minTx: MinimalTransaction = await commitment.getSignedTransaction();
    const value = { tx: minTx, retry: 0 };
    await this.connext.channelProvider.send(ChannelMethods.chan_setUserWithdrawal, { ...value });
    await this.connext.channelProvider.send(ChannelMethods.chan_setUserWithdrawal, {
      withdrawalObject: value,
    });
    return;
  }
}
