// This component shows up when the connected wallet hasn't registered yet.
// It lets the user pick a role (Freelancer or Client) and submit the relevant
// transaction to the Registry contract.
//
// We don't let users self-register as Verifiers - that has to be done by the
// contract owner via approveVerifier(). So we only show Freelancer and Client
// options here.

import { useState } from "react";
import { getContracts } from "../contracts";

function RegistrationPanel(props) {
  // Which role the user has selected from the dropdown
  // Default to "freelancer" so something's always selected
  const [selectedRole, setSelectedRole] = useState("freelancer");

  // The name the user types into the form
  const [nameInput, setNameInput] = useState("");

  // For freelancers - the skills they want to register with.
  // We're storing them as a single comma-separated string for simplicity,
  // and splitting into an array right before sending to the contract.
  const [skillsInput, setSkillsInput] = useState("");

  // Flag to disable the submit button while a transaction is in flight
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Any error we want to show the user
  const [errorMessage, setErrorMessage] = useState(null);

  // A success message after the registration goes through
  const [successMessage, setSuccessMessage] = useState(null);

  async function handleSubmit(event) {
    // Stop the form from reloading the page (default browser behaviour)
    event.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    // Basic validation - name can't be empty
    if (nameInput.trim() === "") {
      setErrorMessage("Please enter a name.");
      return;
    }

    setIsSubmitting(true);

    try {
      const contracts = getContracts(props.signer);

      let transaction;

      if (selectedRole === "freelancer") {
        // Convert the comma-separated string into an array of trimmed skills.
        // Filter out any empty strings that come from things like "Solidity,,React".
        const skillsArray = skillsInput
          .split(",")
          .map(function (skill) {
            return skill.trim();
          })
          .filter(function (skill) {
            return skill.length > 0;
          });

        // Call the registerFreelancer function on the Registry contract.
        // This returns a transaction object, but the transaction hasn't been
        // mined yet - we need to wait for it.
        transaction = await contracts.registry.registerFreelancer(
          nameInput.trim(),
          skillsArray
        );
      } else if (selectedRole === "client") {
        transaction = await contracts.registry.registerClient(nameInput.trim());
      } else {
        // Shouldn't happen but just in case
        setErrorMessage("Unknown role selected.");
        setIsSubmitting(false);
        return;
      }

      // Wait for the transaction to be mined - this is the part that takes a
      // second or two on a real chain (instant on Ganache).
      await transaction.wait();

      setSuccessMessage("Registration successful! Refreshing your role...");

      // Tell the parent component to re-check the role so the UI updates
      if (props.onRegistrationSuccess) {
        props.onRegistrationSuccess();
      }
    } catch (err) {
      console.error("Registration failed:", err);

      // ethers wraps the underlying contract revert message in various ways
      // depending on the error type. We try a few places to find the actual
      // error name from our custom errors.
      let displayedError = "Registration failed.";

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
      <h2>Register</h2>
      <p>Choose how you want to use TrustGig and enter your details.</p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="role-select">I want to register as:</label>
          <select
            id="role-select"
            value={selectedRole}
            onChange={function (e) {
              setSelectedRole(e.target.value);
            }}
          >
            <option value="freelancer">Freelancer</option>
            <option value="client">Client</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="name-input">
            {selectedRole === "freelancer" ? "Your name:" : "Company name:"}
          </label>
          <input
            id="name-input"
            type="text"
            value={nameInput}
            onChange={function (e) {
              setNameInput(e.target.value);
            }}
            placeholder={
              selectedRole === "freelancer" ? "e.g. Alice" : "e.g. Acme Corp"
            }
          />
        </div>

        {/* Only show the skills input if they're registering as a freelancer */}
        {selectedRole === "freelancer" && (
          <div className="form-group">
            <label htmlFor="skills-input">Skills (comma-separated):</label>
            <input
              id="skills-input"
              type="text"
              value={skillsInput}
              onChange={function (e) {
                setSkillsInput(e.target.value);
              }}
              placeholder="e.g. Solidity, React, UI Design"
            />
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="submit-button">
          {isSubmitting ? "Submitting..." : "Register"}
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

export default RegistrationPanel;