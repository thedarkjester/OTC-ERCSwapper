import { ethers, AbstractSigner } from "ethers";
import {
  contractName,
  abi,
  bytecode,
} from "../build/contracts/NonCancunTokenSwapper.sol/NonCancunTokenSwapper.json";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  console.log(`Deploying tokenSwapper`);
  const tokenSwapperAddress = await deployTokenSwapper(wallet);
  console.log(
    `tokenSwapper Deployed at tokenSwapperAddress=${tokenSwapperAddress}`,
  );
}

async function deployTokenSwapper(wallet: ethers.Wallet): Promise<string> {
  const walletNonce = await wallet.getNonce();

  const tokenSwapper = await deployContractFromArtifacts(
    contractName,
    abi,
    bytecode,
    wallet,
    {
      nonce: walletNonce,
    },
  );

  const tokenSwapperAddress = await tokenSwapper.getAddress();

  return tokenSwapperAddress;
}

async function deployContractFromArtifacts(
  contractName: string,
  abi: ethers.InterfaceAbi,
  bytecode: ethers.BytesLike,
  wallet: AbstractSigner,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: ethers.ContractMethodArgs<any[]>
) {
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);

  return contract;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});