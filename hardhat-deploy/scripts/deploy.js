const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying TrustGig contracts...\n");

  // Deploy Registry
  const Registry = await hre.ethers.getContractFactory("Registry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`Registry deployed to:   ${registryAddress}`);

  // Deploy Job (needs Registry address)
  const Job = await hre.ethers.getContractFactory("Job");
  const job = await Job.deploy(registryAddress);
  await job.waitForDeployment();
  const jobAddress = await job.getAddress();
  console.log(`Job deployed to:        ${jobAddress}`);

  // Deploy Reputation (needs Registry and Job addresses)
  const Reputation = await hre.ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy(registryAddress, jobAddress);
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log(`Reputation deployed to: ${reputationAddress}`);

  // Save addresses for the frontend
  const deployment = {
    network: "ganache",
    chainId: 1337,
    addresses: {
      Registry: registryAddress,
      Job: jobAddress,
      Reputation: reputationAddress,
    },
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "..", "deployments", "ganache.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));

  console.log(`\nDeployment info saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});