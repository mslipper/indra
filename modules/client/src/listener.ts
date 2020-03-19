import {
  ILoggerService,
  WithdrawAppState,
  BigNumber,
  WithdrawApp,
  CoinBalanceRefundApp,
  SimpleLinkedTransferApp,
  CreateTransferEventData,
  FastSignedTransferApp,
  HashLockTransferApp,
} from "@connext/types";
import {
  commonAppProposalValidation,
  SupportedApplication,
  validateSimpleLinkedTransferApp,
  validateWithdrawApp,
  validateFastSignedTransferApp,
  validateHashLockTransferApp,
} from "@connext/apps";

import { ConnextClient } from "./connext";
import { stringify } from "./lib";
import {
  CFCoreTypes,
  CreateChannelMessage,
  ConnextEventEmitter,
  DefaultApp,
  DepositConfirmationMessage,
  DepositFailedMessage,
  DepositStartedMessage,
  IChannelProvider,
  InstallMessage,
  InstallVirtualMessage,
  NodeMessageWrappedProtocolMessage,
  ProposeMessage,
  RejectProposalMessage,
  UninstallMessage,
  UninstallVirtualMessage,
  UpdateStateMessage,
} from "./types";
import {
  ProtocolTypes,
  CREATE_CHANNEL_EVENT,
  DEPOSIT_CONFIRMED_EVENT,
  DEPOSIT_FAILED_EVENT,
  DEPOSIT_STARTED_EVENT,
  INSTALL_EVENT,
  INSTALL_VIRTUAL_EVENT,
  PROPOSE_INSTALL_EVENT,
  PROTOCOL_MESSAGE_EVENT,
  REJECT_INSTALL_EVENT,
  UNINSTALL_EVENT,
  UNINSTALL_VIRTUAL_EVENT,
  UPDATE_STATE_EVENT,
} from "@connext/types";

// TODO: index of connext events only?
type CallbackStruct = {
  [index in CFCoreTypes.EventName]: (data: any) => Promise<any> | void;
};

export class ConnextListener extends ConnextEventEmitter {
  private log: ILoggerService;
  private channelProvider: IChannelProvider;
  private connext: ConnextClient;

  // TODO: add custom parsing functions here to convert event data
  // to something more usable? -- OR JUST FIX THE EVENT DATA! :p
  private defaultCallbacks: CallbackStruct = {
    CREATE_CHANNEL_EVENT: (msg: CreateChannelMessage): void => {
      this.emitAndLog(CREATE_CHANNEL_EVENT, msg.data);
    },
    DEPOSIT_CONFIRMED_EVENT: async (msg: DepositConfirmationMessage): Promise<void> => {
      this.emitAndLog(DEPOSIT_CONFIRMED_EVENT, msg.data);
    },
    DEPOSIT_FAILED_EVENT: (msg: DepositFailedMessage): void => {
      this.emitAndLog(DEPOSIT_FAILED_EVENT, msg.data);
    },
    DEPOSIT_STARTED_EVENT: (msg: DepositStartedMessage): void => {
      this.log.info(`Deposit transaction: ${msg.data.txHash}`);
      this.emitAndLog(DEPOSIT_STARTED_EVENT, msg.data);
    },
    INSTALL_EVENT: (msg: InstallMessage): void => {
      this.emitAndLog(INSTALL_EVENT, msg.data);
    },
    // TODO: make cf return app instance id and app def?
    INSTALL_VIRTUAL_EVENT: (msg: InstallVirtualMessage): void => {
      this.emitAndLog(INSTALL_VIRTUAL_EVENT, msg.data);
    },
    PROPOSE_INSTALL_EVENT: async (msg: ProposeMessage): Promise<void> => {
      const {
        data: { params, appInstanceId },
        from,
      } = msg;
      // return if its from us
      const start = Date.now();
      const time = () => `in ${Date.now() - start} ms`;
      if (from === this.connext.publicIdentifier) {
        this.log.debug(`Received proposal from our own node, doing nothing ${time()}`);
        return;
      }
      // validate and automatically install for the known and supported
      // applications
      this.emitAndLog(PROPOSE_INSTALL_EVENT, msg.data);
      this.handleAppProposal(params, appInstanceId, from);
      this.log.info(`Done processing propose install event ${time()}`);
    },
    PROTOCOL_MESSAGE_EVENT: (msg: NodeMessageWrappedProtocolMessage): void => {
      this.emitAndLog(PROTOCOL_MESSAGE_EVENT, msg.data);
    },
    REJECT_INSTALL_EVENT: (msg: RejectProposalMessage): void => {
      this.emitAndLog(REJECT_INSTALL_EVENT, msg.data);
    },
    UNINSTALL_EVENT: (msg: UninstallMessage): void => {
      this.emitAndLog(UNINSTALL_EVENT, msg.data);
    },
    UNINSTALL_VIRTUAL_EVENT: (msg: UninstallVirtualMessage): void => {
      this.emitAndLog(UNINSTALL_VIRTUAL_EVENT, msg.data);
    },
    UPDATE_STATE_EVENT: async (msg: UpdateStateMessage): Promise<void> => {
      this.emitAndLog(UPDATE_STATE_EVENT, msg.data);
      const appInstance = (await this.connext.getAppInstanceDetails(msg.data.appInstanceId))
        .appInstance;
      const state = msg.data.newState as WithdrawAppState<BigNumber>;
      const registryAppInfo = this.connext.appRegistry.find((app: DefaultApp): boolean => {
        return app.appDefinitionAddress === appInstance.appInterface.addr;
      });
      if (registryAppInfo.name === WithdrawApp) {
        const params = {
          amount: state.transfers[0][1],
          recipient: state.transfers[0][0],
          assetId: appInstance.singleAssetTwoPartyCoinTransferInterpreterParams.tokenAddress,
        };
        await this.connext.saveWithdrawCommitmentToStore(params, state.signatures);
      }
    },
  };

  constructor(channelProvider: IChannelProvider, connext: ConnextClient) {
    super();
    this.channelProvider = channelProvider;
    this.connext = connext;
    this.log = connext.log.newContext("ConnextListener");
  }

  public register = async (): Promise<void> => {
    await this.registerAvailabilitySubscription();
    this.registerDefaultListeners();
    await this.registerLinkedTransferSubscription();
    return;
  };

  public registerCfListener = (event: CFCoreTypes.EventName, cb: Function): void => {
    // replace with new fn
    this.log.debug(`Registering listener for ${event}`);
    this.channelProvider.on(
      event,
      async (res: any): Promise<void> => {
        await cb(res);
        this.emit(event, res);
      },
    );
  };

  public removeCfListener = (event: CFCoreTypes.EventName, cb: Function): boolean => {
    this.log.debug(`Removing listener for ${event}`);
    try {
      this.removeListener(event, cb as any);
      return true;
    } catch (e) {
      this.log.error(
        `Error trying to remove registered listener from event ${event}: ${e.stack || e.message}`,
      );
      return false;
    }
  };

  public registerDefaultListeners = (): void => {
    Object.entries(this.defaultCallbacks).forEach(([event, callback]: any): any => {
      this.channelProvider.on(event, callback);
    });

    this.channelProvider.on(
      ProtocolTypes.chan_uninstall,
      async (data: any): Promise<any> => {
        const result = data.result.result;
        this.log.debug(`Emitting ProtocolTypes.chan_uninstall event`);
        await this.connext.messaging.publish(
          `${this.connext.publicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.${result.appInstanceId}.uninstall`,
          stringify(result),
        );
      },
    );
  };

  private emitAndLog = (event: CFCoreTypes.EventName, data: any): void => {
    const protocol =
      event === PROTOCOL_MESSAGE_EVENT ? (data.data ? data.data.protocol : data.protocol) : "";
    this.log.debug(`Received ${event}${protocol ? ` for ${protocol} protocol` : ""}`);
    this.emit(event, data);
  };

  private registerAvailabilitySubscription = async (): Promise<void> => {
    const subject = `${this.connext.publicIdentifier}.online`;
    await this.connext.messaging.subscribe(
      subject,
      async (msg: any): Promise<any> => {
        if (!msg.reply) {
          this.log.warn(`No reply found for msg: ${msg}`);
          return;
        }

        const response = true;
        this.connext.messaging.publish(msg.reply, {
          err: null,
          response,
        });
      },
    );
    this.log.debug(`Connected message pattern "${subject}"`);
  };

  private registerLinkedTransferSubscription = async (): Promise<void> => {
    const subject = `*.channel.*.transfer.linked.to.${this.connext.publicIdentifier}`;
    await this.connext.messaging.subscribe(subject, async (msg: any) => {
      this.log.debug(`Received message for ${subject} subscription`);
      if (!msg.paymentId && !msg.data) {
        throw new Error(`Could not parse data from message: ${stringify(msg)}`);
      }
      let data = msg.paymentId ? msg : msg.data;
      if (typeof data === `string`) {
        data = JSON.parse(data);
      }
      this.log.debug(`Message data: ${stringify(data)}`);
      const {
        paymentId,
        transferMeta: { encryptedPreImage },
        amount,
        assetId,
      }: CreateTransferEventData<"LINKED_TRANSFER_TO_RECIPIENT"> = data;
      if (!paymentId || !encryptedPreImage || !amount || !assetId) {
        throw new Error(`Unable to parse transfer details from message ${stringify(data)}`);
      }
      await this.connext.reclaimPendingAsyncTransfer(paymentId, encryptedPreImage);
      this.log.info(`Successfully redeemed transfer with paymentId: ${paymentId}`);
    });
  };

  private handleAppProposal = async (
    params: ProtocolTypes.ProposeInstallParams,
    appInstanceId: string,
    from: string,
  ): Promise<void> => {
    try {
      // check based on supported applications
      const registryAppInfo = this.connext.appRegistry.find((app: DefaultApp): boolean => {
        return app.appDefinitionAddress === params.appDefinition;
      });
      if (!registryAppInfo) {
        throw new Error(`Could not find registry info for app ${params.appDefinition}`);
      }
      commonAppProposalValidation(
        params,
        // types weirdness
        { ...registryAppInfo, name: registryAppInfo.name as SupportedApplication },
        this.connext.config.supportedTokenAddresses,
      );
      switch (registryAppInfo.name) {
        case CoinBalanceRefundApp: {
          const subject = `${this.connext.publicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.${appInstanceId}.proposal.accept`;
          this.log.debug(`Sending acceptance message to: ${subject}`);
          await this.connext.messaging.publish(subject, stringify(params));
          return;
        }
        case SimpleLinkedTransferApp: {
          validateSimpleLinkedTransferApp(params, from, this.connext.publicIdentifier);
          break;
        }
        case WithdrawApp: {
          validateWithdrawApp(params, from, this.connext.publicIdentifier);
          break;
        }
        case FastSignedTransferApp: {
          validateFastSignedTransferApp(params, from, this.connext.publicIdentifier);
          break;
        }
        case HashLockTransferApp: {
          validateHashLockTransferApp(params, from, this.connext.publicIdentifier);
          break;
        }
        default: {
          throw new Error(
            `Not installing app without configured validation: ${registryAppInfo.name}`,
          );
        }
      }
      await this.connext.installApp(appInstanceId);
      await this.runPostInstallTasks(appInstanceId, registryAppInfo);
      const appInstance = this.connext.getAppInstanceDetails(appInstanceId);
      await this.connext.messaging.publish(
        `${this.connext.publicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.${appInstanceId}.install`,
        stringify(appInstance),
      );
    } catch (e) {
      this.log.error(`Caught error: ${e.toString()}`);
      await this.connext.rejectInstallApp(appInstanceId);
    }
  };

  private runPostInstallTasks = async (
    appInstanceId: string,
    registryAppInfo: DefaultApp,
  ): Promise<void> => {
    switch (registryAppInfo.name) {
      case WithdrawApp: {
        const appInstance = (await this.connext.getAppInstanceDetails(appInstanceId)).appInstance;
        this.connext.respondToNodeWithdraw(appInstance);
        break;
      }
    }
  };
}
