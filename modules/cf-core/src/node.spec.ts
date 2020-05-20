import { getMemoryStore } from "@connext/store";
import { getRandomChannelSigner } from "@connext/utils";
import { providers } from "ethers";
import { MemoryLockService } from "./testing/services/memory-lock-service";

import { Node } from "./node";
import { memoryMessagingService } from "./testing/services";

describe("Node", () => {
  it("is defined", () => {
    expect(Node).toBeDefined();
  });

  it("can be created", async () => {
    const provider = new providers.JsonRpcProvider(global["network"].provider.connection.url);
    const store = getMemoryStore();
    await store.init();
    const node = await Node.create(
      memoryMessagingService,
      store,
      global["network"],
      { STORE_KEY_PREFIX: "./node.spec.ts-test-file" },
      provider,
      getRandomChannelSigner(),
      new MemoryLockService(),
    );

    expect(node).toBeDefined();
  });
});
