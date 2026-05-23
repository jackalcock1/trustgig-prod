// This component shows up on the Browse Jobs view when the connected user is
// a Client. It lets them post a new job with a description and payment amount.
//
// Note: the payment is just a number stored on-chain - we're not actually
// transferring any ETH. In a full production version this would be escrow,
// but we kept it simple for the project scope.

import { useState } from "react";
import { getContracts } from "../contracts";

function CreateJobPanel(props) {
  // Form inputs
  const [descriptionInput, setDescriptionInput] = useState("");
  const [paymentInput, setPaymentInput] = useState("");

  // Status flags
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    if (descriptionInput.trim() === "") {
      setErrorMessage("Please enter a job description.");
      return;
    }

    const paymentAsNumber = parseInt(paymentInput, 10);
    if (isNaN(paymentAsNumber) || paymentAsNumber < 0) {
      setErrorMessage("Please enter a valid payment amount (number of wei).");
      return;
    }

    setIsSubmitting(true);

    try {
      const contracts = getContracts(props.signer);

      const transaction = await contracts.job.createJob(
        descriptionInput.trim(),
        paymentAsNumber
      );

      // Wait for the transaction to be mined
      await transaction.wait();

      setSuccessMessage("Job posted successfully!");

      // Reset the form so they can post another
      setDescriptionInput("");
      setPaymentInput("");

      // Tell the parent to refresh the job list
      if (props.onActionComplete) {
        props.onActionComplete();
      }
    } catch (err) {
      console.error("Failed to create job:", err);

      let displayedError = "Failed to create job.";
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
    <div className="panel create-job-panel">
      <h2>Post a New Job</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="job-description">Job description:</label>
          <textarea
            id="job-description"
            value={descriptionInput}
            onChange={function (e) {
              setDescriptionInput(e.target.value);
            }}
            placeholder="e.g. Build a landing page in React with a hero section and contact form"
            rows="3"
          />
        </div>

        <div className="form-group">
          <label htmlFor="job-payment">Payment (in wei):</label>
          <input
            id="job-payment"
            type="number"
            value={paymentInput}
            onChange={function (e) {
              setPaymentInput(e.target.value);
            }}
            placeholder="e.g. 1000"
            min="0"
          />
        </div>

        <button type="submit" disabled={isSubmitting} className="submit-button">
          {isSubmitting ? "Posting..." : "Post Job"}
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

export default CreateJobPanel;