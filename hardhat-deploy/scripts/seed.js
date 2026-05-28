// seeds the chain with some test data so the teaching team (or anyone) can
// poke around without having to register everything by hand.
//
// creates:
//   - 3 freelancers (Sanjay, Nalin, Ferdinand)
//   - 2 clients (EvilCorp, The Boring Company)
//   - approves 4 verifiers (AWS, GCP, QUT, UQ)
//
// the freelancers and clients self-register so we just use the ganache
// accounts hardhat already knows about (signers 1-5). the verifiers get
// approved by address - and those 4 addresses come in from environment
// variables so whoever runs this can point them at their own ganache
// accounts without editing this file.
//
// run AFTER deploy.js, like this:
//   VERIFIER_AWS=0x... VERIFIER_GCP=0x... VERIFIER_QUT=0x... VERIFIER_UQ=0x... \
//     npx hardhat run scripts/seed.js --network ganache
//
// (or just put those in a .env file and use the npm script we set up)

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // grab the verifier addresses from env vars. if any are missing we bail
  // out early rather than approving a load of undefined addresses
  const verifierAddresses = {
    AWS: process.env.VERIFIER_AWS,
    GCP: process.env.VERIFIER_GCP,
    QUT: process.env.VERIFIER_QUT,
    UQ: process.env.VERIFIER_UQ,
  };

  for (const name of Object.keys(verifierAddresses)) {
    if (!verifierAddresses[name]) {
      console.error("ERROR: missing the " + name + " verifier address.");
      console.error("you need to set VERIFIER_AWS, VERIFIER_GCP, VERIFIER_QUT and VERIFIER_UQ.");
      console.error("easiest way is to fill them into your .env file - see .env.example");
      process.exit(1);
    }
  }

  // load the deployment info to find where Registry got deployed
  const deploymentPath = path.join(__dirname, "..", "deployments", "ganache.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const registryAddress = deploymentInfo.addresses.Registry;

  // get the accounts ganache handed us. signer 0 is the owner/deployer,
  // 1-3 are our freelancers, 4-5 are our clients.
  const signers = await hre.ethers.getSigners();
  const ownerSigner = signers[0];

  const freelancerSigners = [signers[1], signers[2], signers[3]];
  const clientSigners = [signers[4], signers[5]];

  // the actual data we want to seed
  const freelancers = [
    { signer: freelancerSigners[0], name: "Sanjay", skills: ["Solidity", "React"] },
    { signer: freelancerSigners[1], name: "Nalin", skills: ["Python", "Data Analytics"] },
    { signer: freelancerSigners[2], name: "Ferdinand", skills: ["UI Design", "Figma"] },
  ];

  const clients = [
    { signer: clientSigners[0], name: "EvilCorp" },
    { signer: clientSigners[1], name: "The Boring Company" },
  ];

  console.log("Seeding test data to Registry at:", registryAddress);
  console.log("");

  const Registry = await hre.ethers.getContractFactory("Registry");
  const registry = Registry.attach(registryAddress);

  // ----- register the freelancers -----
  console.log("Registering freelancers...");
  for (const f of freelancers) {
    const registryAsFreelancer = registry.connect(f.signer);
    const tx = await registryAsFreelancer.registerFreelancer(f.name, f.skills);
    await tx.wait();
    console.log("  " + f.name + " registered at:", f.signer.address);
  }

  // ----- register the clients -----
  console.log("Registering clients...");
  for (const c of clients) {
    const registryAsClient = registry.connect(c.signer);
    const tx = await registryAsClient.registerClient(c.name);
    await tx.wait();
    console.log("  " + c.name + " registered at:", c.signer.address);
  }

  // ----- approve the verifiers (owner does this) -----
  console.log("Approving verifiers...");
  const registryAsOwner = registry.connect(ownerSigner);
  for (const name of Object.keys(verifierAddresses)) {
    const addr = verifierAddresses[name];
    const tx = await registryAsOwner.approveVerifier(addr, name);
    await tx.wait();
    console.log("  " + name + " approved at:", addr);
  }

  console.log("");
  console.log("Seed complete!");
  console.log("");
  console.log("Quick reference - who's who:");
  console.log("  Owner:      ", ownerSigner.address);
  for (const f of freelancers) {
    console.log("  " + f.name + " (freelancer):", f.signer.address);
  }
  for (const c of clients) {
    console.log("  " + c.name + " (client):", c.signer.address);
  }
  for (const name of Object.keys(verifierAddresses)) {
    console.log("  " + name + " (verifier):", verifierAddresses[name]);
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});