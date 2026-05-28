// This script seeds the chain with our demo personas:
//   - Alice (Freelancer)
//   - Acme Corp (Client)
//   - Four Skill Verifiers: AWS, GCP, QUT, UQ
//
// We use Hardhat's default signers (derived from Ganache's mnemonic) to
// register Alice and Acme Corp because they self-register, so we need their
// signing keys. For the verifiers, we don't need their private keys at all
// because the contract owner (signer[0]) is the one calling approveVerifier
// on each verifier's address - we just need the addresses themselves.
//
// Run AFTER deploy.js. Usage:
//   npx hardhat run scripts/seed.js --network ganache

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ----- Hardcoded verifier addresses for the demo -----
// these are the wallets we've already imported into MetaMask as the four
// verifier organisations. they don't need to be in any particular order
// in Ganache - we just approve them by address.
const VERIFIER_ADDRESSES = {
  AWS: "0x3C7D7059204b1382Ea6A5d60CD7FE555F1fB86DD",
  GCP: "0xC404abcC46c521a2D2BCE785fB9dF222030Dfe90",
  QUT: "0x5Df7640952eEf654dfAdE1dcfd860C50E71BB5c6",
  UQ:  "0xD209642b8215ce3c8570EF65BB3fD4c25532913b",
};

async function main() {
  // Load the deployment info to find the Registry address
  const deploymentPath = path.join(__dirname, "..", "deployments", "ganache.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const registryAddress = deploymentInfo.addresses.Registry;

  // Grab signers - we only need the first three for Alice/Acme/Owner.
  // The verifiers don't need to be in signers[] because we approve them
  // by address rather than calling from them.
  const signers = await hre.ethers.getSigners();
  const ownerSigner = signers[0];
  const aliceSigner = signers[1];
  const acmeCorpSigner = signers[2];

  console.log("Seeding demo personas to Registry at:", registryAddress);
  console.log("");

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

  // ----- Approve all four verifiers -----
  // We loop through the verifier addresses and call approveVerifier on each.
  // The owner does this so the same registry instance works (it's already
  // connected to signer[0] by default).
  console.log("Approving the four Skill Verifiers...");
  const registryAsOwner = registry.connect(ownerSigner);

  for (const verifierName of Object.keys(VERIFIER_ADDRESSES)) {
    const verifierAddress = VERIFIER_ADDRESSES[verifierName];
    const tx = await registryAsOwner.approveVerifier(verifierAddress, verifierName);
    await tx.wait();
    console.log(`  ${verifierName} approved at:`, verifierAddress);
  }

  console.log("");
  console.log("Seed complete. Demo personas ready.");
  console.log("");
  console.log("Account addresses for MetaMask:");
  console.log("  Owner:        ", ownerSigner.address);
  console.log("  Alice:        ", aliceSigner.address);
  console.log("  Acme Corp:    ", acmeCorpSigner.address);
  console.log("  AWS verifier: ", VERIFIER_ADDRESSES.AWS);
  console.log("  GCP verifier: ", VERIFIER_ADDRESSES.GCP);
  console.log("  QUT verifier: ", VERIFIER_ADDRESSES.QUT);
  console.log("  UQ verifier:  ", VERIFIER_ADDRESSES.UQ);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});