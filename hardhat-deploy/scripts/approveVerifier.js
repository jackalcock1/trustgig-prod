// Approves a new verifier on the deployed Registry contract.
// Only the contract owner can do this - which is whoever the default Hardhat
// signer is, i.e. the same account that ran the deploy script.
//
// Pass the verifier address and name as environment variables. This way we
// don't have to edit the script every time we want to approve a new one.
//
// Usage:
//   VERIFIER_ADDRESS=0x... VERIFIER_NAME="QUT" \
//     npx hardhat run scripts/approveVerifier.js --network ganache

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Pull the values from environment variables - if either is missing, bail out
  // with a friendly error so we don't accidentally send a busted transaction
  const verifierAddress = process.env.VERIFIER_ADDRESS;
  const verifierName = process.env.VERIFIER_NAME;

  if (!verifierAddress) {
    console.error("ERROR: VERIFIER_ADDRESS environment variable is required.");
    console.error("Example usage:");
    console.error("  VERIFIER_ADDRESS=0x... VERIFIER_NAME=\"QUT\" npx hardhat run scripts/approveVerifier.js --network ganache");
    process.exit(1);
  }

  if (!verifierName) {
    console.error("ERROR: VERIFIER_NAME environment variable is required.");
    console.error("Example usage:");
    console.error("  VERIFIER_ADDRESS=0x... VERIFIER_NAME=\"QUT\" npx hardhat run scripts/approveVerifier.js --network ganache");
    process.exit(1);
  }

  // Sanity check the address looks vaguely valid before we send it
  if (verifierAddress.startsWith("0x") === false || verifierAddress.length !== 42) {
    console.error("ERROR: That doesn't look like a valid Ethereum address.");
    console.error("  Got:", verifierAddress);
    process.exit(1);
  }

  // Load the deployment info to find the Registry address
  const deploymentPath = path.join(__dirname, "..", "deployments", "ganache.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const registryAddress = deploymentInfo.addresses.Registry;

  console.log("Using Registry at:", registryAddress);

  // Attach to the already-deployed Registry contract
  const Registry = await hre.ethers.getContractFactory("Registry");
  const registry = Registry.attach(registryAddress);

  console.log("Approving verifier:");
  console.log("  Address:", verifierAddress);
  console.log("  Name:   ", verifierName);

  // Send the transaction
  const transaction = await registry.approveVerifier(verifierAddress, verifierName);
  console.log("Transaction sent, waiting for it to be mined...");

  await transaction.wait();

  console.log("Verifier approved successfully!");
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exitCode = 1;
});