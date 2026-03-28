const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n══════════════════════════════════════");
  console.log("  Deploying MimicWar to Monad testnet");
  console.log("══════════════════════════════════════");
  console.log("Deployer :", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance  :", ethers.formatEther(balance), "MON");

  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Deployer balance too low — get testnet MON from the Monad faucet first.");
  }

  console.log("\nDeploying...");
  const MimicWar = await ethers.getContractFactory("MimicWar");
  const contract = await MimicWar.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash  = contract.deploymentTransaction().hash;

  console.log("\n✔ MimicWar deployed!");
  console.log("  Contract address :", address);
  console.log("  Tx hash          :", txHash);
  console.log("\nCopy this address into your backend .env as CONTRACT_ADDRESS=", address);
  console.log("══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
