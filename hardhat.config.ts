import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          evmVersion: "prague",
          optimizer: { enabled: true, runs: 500 },
        },
      },
    },
  },
  networks: {
    monadTestnet: {
      type: "http",
      chainType: "l1",
      url: "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: [configVariable("MONAD_TESTNET_PRIVATE_KEY")],
    },
  },
});
