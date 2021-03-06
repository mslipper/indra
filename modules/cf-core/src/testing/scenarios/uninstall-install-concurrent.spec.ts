import { CONVENTION_FOR_ETH_ASSET_ID, InstallMessage, ProposeMessage } from "@connext/types";
import { One } from "ethers/constants";
import { parseEther } from "ethers/utils";

import { CFCore } from "../../cfCore";

import { TestContractAddresses } from "../contracts";
import { toBeLt } from "../bignumber-jest-matcher";

import { setup, SetupContext } from "../setup";
import {
  collateralizeChannel,
  constructUninstallRpc,
  createChannel,
  makeInstallCall,
  makeProposeCall,
} from "../utils";

expect.extend({ toBeLt });

jest.setTimeout(7500);

const { TicTacToeApp } = global["contracts"] as TestContractAddresses;

describe("Node method follows spec when happening concurrently - install / uninstall", () => {
  let multisigAddress: string;
  let nodeA: CFCore;
  let nodeB: CFCore;
  let installedAppIdentityHash: string;
  let installCall;

  describe("NodeA can uninstall and install an app with nodeB concurrently", () => {
    beforeEach(async () => {
      const context: SetupContext = await setup(global);
      nodeA = context["A"].node;
      nodeB = context["B"].node;

      multisigAddress = await createChannel(nodeA, nodeB);

      await collateralizeChannel(
        multisigAddress,
        nodeA,
        nodeB,
        parseEther("2"), // We are depositing in 2 and use 1 for each concurrent app
      );

      installCall = makeProposeCall(
        nodeB,
        TicTacToeApp,
        multisigAddress,
        /* initialState */ undefined,
        One,
        CONVENTION_FOR_ETH_ASSET_ID,
        One,
        CONVENTION_FOR_ETH_ASSET_ID,
      );

      // install the first app
      installedAppIdentityHash = await new Promise(async (resolve) => {
        nodeB.once("PROPOSE_INSTALL_EVENT", (msg: ProposeMessage) => {
          makeInstallCall(nodeB, msg.data.appIdentityHash, multisigAddress);
        });

        nodeA.once("INSTALL_EVENT", (msg: InstallMessage) => {
          // save the first installed appId
          resolve(msg.data.params.appIdentityHash);
        });

        await nodeA.rpcRouter.dispatch(installCall);
      });
    });

    it("install app with ETH then uninstall and install apps simultaneously from the same node", async (done) => {
      let completedActions = 0;

      nodeB.once("PROPOSE_INSTALL_EVENT", (msg: ProposeMessage) =>
        makeInstallCall(nodeB, msg.data.appIdentityHash, multisigAddress),
      );

      nodeA.once("INSTALL_EVENT", () => {
        completedActions += 1;
        if (completedActions === 2) done();
      });

      // if this is on nodeA, test fails
      nodeB.once("UNINSTALL_EVENT", () => {
        completedActions += 1;
        if (completedActions === 2) done();
      });

      const installCall = makeProposeCall(
        nodeB,
        TicTacToeApp,
        multisigAddress,
        /* initialState */ undefined,
        One,
        CONVENTION_FOR_ETH_ASSET_ID,
        One,
        CONVENTION_FOR_ETH_ASSET_ID,
      );

      nodeA.rpcRouter.dispatch(installCall);
      nodeA.rpcRouter.dispatch(constructUninstallRpc(installedAppIdentityHash, multisigAddress));
    });

    it("install app with ETH then uninstall and install apps simultaneously from separate nodes", async (done) => {
      let completedActions = 0;

      nodeB.once("PROPOSE_INSTALL_EVENT", (msg: ProposeMessage) =>
        makeInstallCall(nodeB, msg.data.appIdentityHash, multisigAddress),
      );

      nodeA.once("INSTALL_EVENT", () => {
        completedActions += 1;
        if (completedActions === 2) done();
      });

      // if this is on nodeB, test fails
      nodeA.once("UNINSTALL_EVENT", () => {
        completedActions += 1;
        if (completedActions === 2) done();
      });

      const installCall = makeProposeCall(
        nodeB,
        TicTacToeApp,
        multisigAddress,
        /* initialState */ undefined,
        One,
        CONVENTION_FOR_ETH_ASSET_ID,
        One,
        CONVENTION_FOR_ETH_ASSET_ID,
      );

      nodeA.rpcRouter.dispatch(installCall);
      nodeB.rpcRouter.dispatch(constructUninstallRpc(installedAppIdentityHash, multisigAddress));
    });
  });
});
