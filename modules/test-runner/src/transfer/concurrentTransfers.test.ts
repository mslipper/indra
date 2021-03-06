import PQueue from "p-queue";
import * as utils from "ethers/utils";
import { ConditionalTransferTypes, IConnextClient, BigNumber } from "@connext/types";
import { delay, ColorfulLogger } from "@connext/utils";
import { AddressZero } from "ethers/constants";
import { before } from "mocha";

import { createClient, fundChannel } from "../util";

const generatePaymentId = () => utils.hexlify(utils.randomBytes(32));

const TRANSFER_AMOUNT = utils.parseEther("0.00001");
const DEPOSIT_AMOUNT = utils.parseEther("0.1");

describe("Concurrent transfers", async () => {
  let channel: IConnextClient;
  let indexerA: IConnextClient;
  let indexerB: IConnextClient;
  let subgraphChannels: { signer: string; publicIdentifier: string }[];

  before(async () => {
    // let wallet = Wallet.fromMnemonic(
    //   "favorite plunge fatigue crucial decorate bottom hour veteran embark gravity devote business",
    // );
    // privateKey = wallet.privateKey;

    channel = await createClient({
      // signer: privateKey,
      loggerService: new ColorfulLogger("Client", 1, true, "Gateway"),
    });
    indexerA = await createClient();
    indexerB = await createClient();

    console.log("Signer address:", channel.signerAddress);

    console.log("Deposit into state channel");
    await fundChannel(channel, DEPOSIT_AMOUNT, AddressZero);
    const balance: BigNumber = (await channel.getFreeBalance())[channel.signerAddress];
    console.log("Free balance:", balance.toString());
    console.log(
      "Total # of payments possible: ",
      balance.div(utils.parseEther("0.00001")).toString(),
    );

    subgraphChannels = [
      {
        signer: indexerA.signerAddress,
        publicIdentifier: indexerA.publicIdentifier,
      },
      {
        signer: indexerB.signerAddress,
        publicIdentifier: indexerB.publicIdentifier,
      },
    ];
  });

  it.skip("Can handle many concurrent transfers", async function () {
    this.timeout(0); // disable timeout
    let count = 0;
    indexerA.on("CONDITIONAL_TRANSFER_CREATED_EVENT", (data) => {
      count++;
      console.log(`${data.paymentId} Payment created: ${count}`);
    });
    indexerB.on("CONDITIONAL_TRANSFER_CREATED_EVENT", (data) => {
      count++;
      console.log(`${data.paymentId} Payment created: ${count}`);
    });
    let queue = new PQueue({ concurrency: 10 });
    let sendLoop = async () => {
      while (true) {
        for (let subgraphChannel of subgraphChannels) {
          let recipient = subgraphChannel.publicIdentifier;
          let paymentId = generatePaymentId();

          // Send payment and query
          queue.add(async () => {
            console.log(paymentId, "Send payment");
            try {
              await channel.conditionalTransfer({
                paymentId,
                amount: TRANSFER_AMOUNT,
                conditionType: ConditionalTransferTypes.SignedTransfer,
                signer: subgraphChannel.signer,
                recipient,
                assetId: AddressZero,
                meta: { info: "Query payment" },
              });
            } catch (e) {
              console.error(`Failed to send payment: ${e}`);
            }
            console.log(`${paymentId} Payment sent`);
          });
        }
        await delay(100);
      }
    };

    sendLoop();

    await queue.onIdle();
  });
});
