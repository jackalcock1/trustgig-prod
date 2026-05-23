// This panel is only shown to whitelisted Skill Verifiers.
// It lets them issue a skill endorsement to any freelancer by address.
//
// The contract checks that the caller is a registered verifier and that the
// target is a registered freelancer - we don't double-check that here.

import { useState } from "react";
import { getContracts } from "../contracts";

function EndorseSkillPanel(props) {
  const [freelancerAddressInput, setFreelancerAddressInput] = useState("");
  const [skillNameInput, setSkillNameInput] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    // Basic validation
    if (freelancerAddressInput.trim() === "") {
      setErrorMessage("Please enter the freelancer's wallet address.");
      return;
    }

    if (skillNameInput.trim() === "") {
      setErrorMessage("Please enter a skill name.");
      return;
    }

    // Quick sanity check that the address looks valid before we send
    // (the contract will reject it anyway, but better to fail fast)
    const trimmedAddress = freelancerAddressInput.trim();
    if (trimmedAddress.startsWith("0x") === false || trimmedAddress.length !== 42) {
      setErrorMessage("That doesn't look like a valid Ethereum address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const contracts = getContracts(props.signer);

      const transaction = await contracts.reputation.endorseSkill(
        trimmedAddress,
        skillNameInput.trim()
      );

      await transaction.wait();

      setSuccessMessage(
        "Endorsement issued! " + skillNameInput.trim() + " has been added to their profile."
      );

      // Reset the form
      setFreelancerAddressInput("");
      setSkillNameInput("");

      if (props.onActionComplete) {
        props.onActionComplete();
      }
    } catch (err) {
      console.error("Failed to endorse skill:", err);

      let displayedError = "Failed to issue endorsement.";
      if (err.reason) {
        displayedError = err.reason;
      } else if (err.message) {
        displayedError = err.message;
      }
      setErrorMessage(displayedError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <h2>Endorse a Skill</h2>
      <p>
        As an approved verifier, you can endorse skills on a freelancer's
        profile. The endorsement will be permanently recorded on-chain.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="endorse-address">Freelancer wallet address:</label>
          <input
            id="endorse-address"
            type="text"
            value={freelancerAddressInput}
            onChange={function (e) {
              setFreelancerAddressInput(e.target.value);
            }}
            placeholder="0x..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="endorse-skill">Skill to endorse:</label>
          <input
            id="endorse-skill"
            type="text"
            value={skillNameInput}
            onChange={function (e) {
              setSkillNameInput(e.target.value);
            }}
            placeholder="e.g. Solidity"
          />
        </div>

        <button type="submit" disabled={isSubmitting} className="submit-button">
          {isSubmitting ? "Submitting..." : "Issue Endorsement"}
        </button>
      </form>

      {errorMessage !== null && (
        <p className="error-message">{errorMessage}</p>
      )}

      {successMessage !== null && (
        <p className="success-message">{successMessage}</p>
      )}
    </div>
  );
}

export default EndorseSkillPanel;