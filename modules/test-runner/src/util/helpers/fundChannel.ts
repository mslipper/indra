import { AssetId, CONVENTION_FOR_ETH_ASSET_ID, EventNames, IConnextClient, RebalanceProfile } from "@connext/types";
import { ColorfulLogger, getAddressFromAssetId, delayAndThrow, toBN } from "@connext/utils";
import { BigNumber, parseEther } from "ethers/utils";

import { env, expect, getNatsClient } from "../";
import { AddressZero } from "ethers/constants";
import { addRebalanceProfile } from "./rebalanceProfile";

export const fundChannel = async (
  client: IConnextClient,
  amount: BigNumber,
  assetId: AssetId = CONVENTION_FOR_ETH_ASSET_ID,
): Promise<void> => {
  const log = new ColorfulLogger("FundChannel", env.logLevel);
  const tokenAddress = getAddressFromAssetId(assetId);
  const prevFreeBalance = await client.getFreeBalance(tokenAddress);
  await new Promise(async (resolve, reject) => {
    client.once(EventNames.DEPOSIT_CONFIRMED_EVENT, async () => {
      const freeBalance = await client.getFreeBalance(tokenAddress);
      // verify free balance increased as expected
      const expected = prevFreeBalance[client.signerAddress].add(amount);
      expect(freeBalance[client.signerAddress]).to.equal(expected);
      log.info(`Got deposit confirmed event, helper wrapper is returning`);
      resolve();
    });
    client.once(EventNames.DEPOSIT_FAILED_EVENT, async (msg: any) => {
      reject(new Error(JSON.stringify(msg)));
    });

    try {
      // FYI this function returns after fundChannel has returned (at resolve above)
      log.debug(`client.deposit() called`);
      const start = Date.now();
      await client.deposit({ amount: amount.toString(), assetId });
      log.info(`client.deposit() returned in ${Date.now() - start}`);
    } catch (e) {
      return reject(new Error(e.stack || e.message));
    }
  });

  return;
};

export const requestCollateral = async (
  client: IConnextClient,
  assetId: AssetId = CONVENTION_FOR_ETH_ASSET_ID,
  enforce: boolean = false,
): Promise<void> => {
  const log = new ColorfulLogger("RequestCollateral", env.logLevel);
  let rebalanceProfile;
  const nats = getNatsClient();
  if(assetId == CONVENTION_FOR_ETH_ASSET_ID) {
     rebalanceProfile = {
      assetId: assetId,
      collateralizeThreshold: parseEther("0.1"),
      target: parseEther("0.2"),
      reclaimThreshold: parseEther("0.5"),
    };
  } else {
    rebalanceProfile = {
      assetId: assetId,
      collateralizeThreshold: parseEther("10"),
      target: parseEther("20"),
      reclaimThreshold: parseEther("50"),
    };
  }
  await addRebalanceProfile(nats, client, rebalanceProfile, false);
  const tokenAddress = getAddressFromAssetId(assetId);
  const preCollateralBal = await client.getFreeBalance(tokenAddress);
  log.debug(`client.requestCollateral() called`);
  const start = Date.now();
  if (!enforce) {
    await client.requestCollateral(assetId);
    log.info(`client.requestCollateral() returned in ${Date.now() - start}`);
    return;
  }
  return new Promise(async (resolve, reject) => {
    log.debug(`client.requestCollateral() called`);
    const start = Date.now();
    // watch for balance change on uninstall
    try {
      await Promise.race([
        delayAndThrow(20_000, `Could not detect increase in node free balance within 20s`),
        new Promise(async (res) => {
          client.on(EventNames.UNINSTALL_EVENT, async () => {
            const currBal = await client.getFreeBalance(tokenAddress);
            if (currBal[client.nodeSignerAddress].lte(preCollateralBal[client.nodeSignerAddress])) {
              // no increase in bal
              return;
            }
            // otherwise resolve
            return res();
          });
          await client.requestCollateral(assetId);
        }),
      ]);
      log.info(`client.requestCollateral() returned in ${Date.now() - start}`);
      resolve();
    } catch (e) {
      return reject(e);
    }
  });
};
