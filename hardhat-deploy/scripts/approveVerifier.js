// This script approves a verifier on the deployed Registry contract.
// Only the contract owner (the account that deployed Registry) can call
// approveVerifier - this script uses whatever account Hardhat's default
// signer is set to, which is the same account that ran the deploy script,
// so it should work without any extra config.
//
// Usage:
//   npx hardhat run scripts/approveVerifier.js --network ganache
//
// Edit the VERIFIER_ADDRESS and VERIFIER_NAME constants below before running.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ----- Edit these before running -----
const VERIFIER_ADDRESS = "0x942140f9E8db603B7e232a084c02df1F8c787832";
const VERIFIER_NAME = "QUT";
// --------------------------------------

async function main() {
  // Load the deployment info to find the Registry address
  const deploymentPath = path.join(__dirname, "..", "deployments", "ganache.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

  const registryAddress = deploymentInfo.addresses.Registry;
  console.log("Using Registry at:", registryAddress);

  // Attach to the already-deployed Registry contract
  const Registry = await hre.ethers.getContractFactory("Registry");
  const registry = Registry.attach(registryAddress);

  // Make sure the address we're approving has a value
  if (VERIFIER_ADDRESS === "PASTE_VERIFIER_ADDRESS_HERE") {
    console.error("ERROR: You need to edit this script and paste the verifier's address.");
    process.exit(1);
  }

  console.log("Approving verifier:");
  console.log("  Address:", VERIFIER_ADDRESS);
  console.log("  Name:   ", VERIFIER_NAME);

  // Send the transaction
  const transaction = await registry.approveVerifier(VERIFIER_ADDRESS, VERIFIER_NAME);
  console.log("Transaction sent, waiting for it to be mined...");

  await transaction.wait();

  console.log("Verifier approved successfully!");
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exitCode = 1;
});