// This script seeds the chain with our demo personas: Alice (Freelancer),
// Acme Corp (Client), and QUT (Verifier).
//
// It uses Hardhat's default signers, which are derived from Ganache's mnemonic.
// On a fresh Ganache workspace, this gives us:
//   signers[0] = Owner (the deployer)
//   signers[1] = Alice
//   signers[2] = Acme Corp
//   signers[3] = QUT
//
// Run this AFTER deploy.js and before doing any demo.
//
// Usage:
//   npx hardhat run scripts/seed.js --network ganache

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load the deployment info to find the Registry address
  const deploymentPath = path.join(__dirname, "..", "deployments", "ganache.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const registryAddress = deploymentInfo.addresses.Registry;

  // Grab all the signers (accounts) Hardhat knows about.
  // These are derived from the Ganache mnemonic and match the order
  // of accounts shown in the Ganache desktop app.
  const signers = await hre.ethers.getSigners();
  const ownerSigner = signers[0];
  const aliceSigner = signers[1];
  const acmeCorpSigner = signers[2];
  const qutSigner = signers[3];

  console.log("Seeding demo personas to Registry at:", registryAddress);
  console.log("");

  // Get the Registry contract
  const Registry = await hre.ethers.getContractFactory("Registry");
  const registry = Registry.attach(registryAddress);

  // ----- Alice: Freelancer -----
  console.log("Registering Alice as a Freelancer...");
  const registryAsAlice = registry.connect(aliceSigner);
  const aliceTx = await registryAsAlice.registerFreelancer(
    "Alice",
    ["Solidity", "React"]
  );
  await aliceTx.wait();
  console.log("  Alice registered at:", aliceSigner.address);

  // ----- Acme Corp: Client -----
  console.log("Registering Acme Corp as a Client...");
  const registryAsAcme = registry.connect(acmeCorpSigner);
  const acmeTx = await registryAsAcme.registerClient("Acme Corp");
  await acmeTx.wait();
  console.log("  Acme Corp registered at:", acmeCorpSigner.address);

  // ----- QUT: Verifier (called by Owner) -----
  console.log("Approving QUT as a Verifier (called by Owner)...");
  const registryAsOwner = registry.connect(ownerSigner);
  const qutTx = await registryAsOwner.approveVerifier(qutSigner.address, "QUT");
  await qutTx.wait();
  console.log("  QUT approved at:", qutSigner.address);

  console.log("");
  console.log("Seed complete. Demo personas ready.");
  console.log("");
  console.log("Account addresses for MetaMask import:");
  console.log("  Owner:      ", ownerSigner.address);
  console.log("  Alice:      ", aliceSigner.address);
  console.log("  Acme Corp:  ", acmeCorpSigner.address);
  console.log("  QUT:        ", qutSigner.address);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});