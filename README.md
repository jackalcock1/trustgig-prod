# TrustGig

A blockchain-based decentralised reputation system for freelance and gig economy workers. Built for QUT IFB452 (Blockchain Technology), 2026.

TrustGig lets freelancers build a portable, tamper-proof professional reputation that isn't owned or controlled by any single platform. Completed jobs, client reviews, and verified skills are recorded on-chain, so freelancers can carry their reputation across platforms like Upwork, Airtasker, and Fiverr.

## What's in this repo

Three Solidity smart contracts in `contracts/trustgig/`:

- **Registry.sol** — Onboards freelancers, clients, and skill verifiers
- **Job.sol** — Manages the lifecycle of a gig (created → accepted → completed → confirmed)
- **Reputation.sol** — Stores reviews and skill endorsements tied to a freelancer's wallet

---

## Getting set up (first time only)

You only need **Remix Desktop** to test this project — no wallet, no MetaMask, no real or test crypto required. Remix has a built-in simulated blockchain ("Remix VM") that gives you 10 fake accounts each loaded with 100 fake ETH.

### 1. Install Remix Desktop

1. Go to https://github.com/remix-project-org/remix-desktop/releases
2. Download the latest macOS or Windows installer (whichever matches your machine)
3. Install it like any normal app
4. Open Remix Desktop

You'll see a Home tab inside Remix once it's running.

### 2. Clone this repo

Open Terminal (Mac) or Command Prompt / PowerShell (Windows) and run:

```bash
cd ~/Documents
git clone https://github.com/jackalcock1/trustgig-prod.git
```

This downloads the project into `~/Documents/trustgig-prod`. You can pick a different folder if you prefer — just `cd` to wherever you want it.

### 3. Open the project in Remix Desktop

1. In Remix Desktop, click the **File Explorer** icon (top-left, looks like two pages)
2. Click the workspace dropdown at the top and choose **Create a new workspace** → or use **File → Open Folder** from the top menu
3. Navigate to the cloned `trustgig-prod` folder and open it

You should now see `contracts/trustgig/` containing the three `.sol` files.

---

## Compiling the contracts

1. Open `Registry.sol` by clicking it in the File Explorer
2. Click the **Solidity Compiler** icon in the left sidebar (looks like an "S")
3. Set the compiler version to **0.8.20** or higher
4. (Optional, but recommended) Under **Advanced Configurations**, set the EVM version to **`london`** for maximum compatibility
5. Click **Compile Registry.sol** (or just press Cmd+S / Ctrl+S — auto-compile is on by default)

You should see a green tick. Compiling one file pulls in the other two automatically because they import each other.

---

## Deploying the contracts

This is the only tricky bit. The contracts depend on each other, so they **must be deployed in the order: Registry → Job → Reputation**. Each one needs the address of the contracts before it.

1. Click the **Deploy & Run Transactions** icon in the left sidebar (looks like an Ethereum logo)
2. In the **Environment** dropdown at the top, select **Remix VM (Cancun)** or similar — anything starting with "Remix VM" is fine
3. Confirm 10 accounts appear in the **Account** dropdown, each with 100 ETH

### Deploy Registry

1. In the **Contract** dropdown (above the orange Deploy button), select `Registry - contracts/trustgig/Registry.sol`
2. Leave the constructor field next to Deploy empty (Registry has no constructor arguments)
3. Click **Deploy**
4. In the **Deployed Contracts** section that appears at the bottom-left, you'll see `REGISTRY AT 0x...`. **Copy this address** — click the small copy icon next to it. You'll need it next.

### Deploy Job

1. Change the **Contract** dropdown to `Job`
2. **Paste the Registry address** into the constructor field next to the orange Deploy button
3. Click **Deploy**
4. **Copy the new Job address** from the Deployed Contracts list

### Deploy Reputation

1. Change the **Contract** dropdown to `Reputation`
2. In the constructor field, paste **both** addresses separated by a comma (Registry first, then Job):
   ```
   <RegistryAddress>,<JobAddress>
   ```
   Example: `0xd91...39138,0xd8b...33fa8`
3. Click **Deploy**

You should now see all three contracts in the Deployed Contracts panel.

---

## Testing the contracts

To exercise every function and every cross-contract interaction, run through this happy-path scenario. You'll need 4 different accounts — use the **Account** dropdown at the top of the Deploy panel to switch between them.

Mentally assign:
- **Account 0** (the first one, currently selected) — Owner (deployed the contracts)
- **Account 1** — Freelancer
- **Account 2** — Client
- **Account 3** — Verifier

For functions that take complex inputs, click the small **▼ down-arrow** next to the function name to expand it into separate input fields.

### Setup (3 transactions)

1. **Switch to Account 1.** In the Registry contract panel, call `registerFreelancer`:
   - `name`: `"Alice"`
   - `skills`: `["Solidity","React"]`

2. **Switch to Account 2.** Call `Registry.registerClient`:
   - `name`: `"Acme Corp"`

3. **Switch back to Account 0** (the Owner). Call `Registry.approveVerifier`:
   - `wallet`: paste Account 3's full address (use the copy icon in the Account dropdown)
   - `name`: `"QUT"`

### Sanity checks (free reads — any account)

4. `Registry.isFreelancer(<Account 1 address>)` → should return `true`
5. `Registry.isClient(<Account 2 address>)` → should return `true`
6. `Registry.isVerifier(<Account 3 address>)` → should return `true`

### Job lifecycle (4 transactions, exercises all roles)

7. **Switch to Account 2 (Client).** Call `Job.createJob`:
   - `description`: `"Build a landing page"`
   - `payment`: `1000`
   - Look in the log for a `JobCreated` event with `jobId: 1`

8. **Switch to Account 1 (Freelancer).** Call `Job.acceptJob`:
   - `jobId`: `1`

9. **Stay on Account 1.** Call `Job.completeJob`:
   - `jobId`: `1`

10. **Switch to Account 2 (Client).** Call `Job.confirmCompletion`:
    - `jobId`: `1`

11. Call `Job.isConfirmed(1)` → should return `true`

### Review and endorsement

12. **Stay on Account 2 (Client).** Call `Reputation.submitReview`:
    - `jobId`: `1`
    - `rating`: `5`
    - `comment`: `"Excellent work"`

13. Call `Reputation.getReputation(<Account 1 address>)` → should return `(1, 500, 0)` meaning 1 review, average rating 5.00 (stored as 500 = 5.00 × 100), 0 endorsements.

14. **Switch to Account 3 (Verifier).** Call `Reputation.endorseSkill`:
    - `freelancer`: paste Account 1's address
    - `skill`: `"Solidity"`

15. Call `Reputation.getReputation(<Account 1 address>)` again → should now return `(1, 500, 1)`.

### Negative tests (these MUST revert — they prove the access control works)

These are useful for showing the contracts properly enforce their rules. Try each one and confirm Remix shows a red error in the console with the expected custom error name.

16. **As Account 1 (Freelancer)**, try `Job.createJob(...)` → reverts with `NotRegisteredClient`
17. **As Account 2**, try `Reputation.submitReview(1, 5, "...")` a second time → reverts with `AlreadyReviewed`
18. **As Account 1**, try `Reputation.endorseSkill(<self>, "Solidity")` → reverts with `NotVerifier`
19. **As Account 2**, try `Job.completeJob(1)` after it's already been confirmed → reverts with `WrongStatus(expected=Accepted, actual=Confirmed)`

---

## Troubleshooting

**"Repository not found" when cloning**: the repo is public, so no auth is needed. Double-check you copied the URL correctly: `https://github.com/jackalcock1/trustgig-prod.git`

**"Pragma version" compile error**: make sure your Solidity compiler is set to 0.8.20 or higher.

**Deployment fails with EVM version error**: change EVM version to `london` in the Solidity Compiler tab → Advanced Configurations.

**"Gas estimation failed" when calling a function**: usually means a `require`/`revert` will trigger. Check you're calling from the right account — most errors come from wrong-role access.

---

## Project context

This is the technical deliverable for QUT IFB452 Blockchain Technology, Semester 1 2026. The full design rationale, BPMN business process model, and architectural justification are in the accompanying presentation.

**Contributors**:
- Jack Alcock (n11024640)
- [Partner name + student number]
