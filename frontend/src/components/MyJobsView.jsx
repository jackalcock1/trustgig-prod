// This view shows the jobs that the connected user is involved in.
// What "involved" means depends on their role:
//   - Clients see jobs they created
//   - Freelancers see jobs they accepted
//
// The actions available on each job also depend on role and current status:
//   - Freelancer + Accepted -> can mark complete
//   - Client + Completed -> can confirm completion
//   - Client + Confirmed -> can submit review (if they haven't already)

import { useState, useEffect } from "react";
import {
  getContracts,
  getStatusLabel,
  STATUS_ACCEPTED,
  STATUS_COMPLETED,
  STATUS_CONFIRMED,
  ROLE_FREELANCER,
  ROLE_CLIENT,
} from "../contracts";

function MyJobsView(props) {
  const [myJobs, setMyJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Track which job has an action in flight
  const [actionJobId, setActionJobId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // The review modal state - which job ID we're reviewing, and the form inputs
  const [reviewingJobId, setReviewingJobId] = useState(null);
  const [ratingInput, setRatingInput] = useState("5");
  const [commentInput, setCommentInput] = useState("");

  // Track which jobs already have a review so we can hide the review button
  const [reviewedJobIds, setReviewedJobIds] = useState([]);

  useEffect(() => {
    if (props.signer === null || props.account === null) {
      return;
    }

    async function fetchMyJobs() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const contracts = getContracts(props.signer);

        const nextJobIdBigInt = await contracts.job.nextJobId();
        const nextJobId = Number(nextJobIdBigInt);

        const relevantJobs = [];
        const jobsWithReviews = [];

        // Iterate all jobs and keep ones the user is involved in
        for (let jobId = 1; jobId < nextJobId; jobId++) {
          const jobData = await contracts.job.getJob(jobId);

          const clientAddress = jobData[0];
          const freelancerAddress = jobData[1];
          const description = jobData[2];
          const payment = jobData[3];
          const status = Number(jobData[4]);
          const createdAt = jobData[5];

          // Check if this job involves the connected user.
          // Compare addresses in lowercase to be safe since case can vary.
          const userAddressLower = props.account.toLowerCase();
          const isMyClientJob = clientAddress.toLowerCase() === userAddressLower;
          const isMyFreelancerJob =
            freelancerAddress.toLowerCase() === userAddressLower;

          if (isMyClientJob || isMyFreelancerJob) {
            relevantJobs.push({
              id: jobId,
              client: clientAddress,
              freelancer: freelancerAddress,
              description: description,
              payment: payment.toString(),
              status: status,
              createdAt: Number(createdAt),
              userIsClient: isMyClientJob,
              userIsFreelancer: isMyFreelancerJob,
            });

            // If this is a confirmed job and the user is the client, we want
            // to know whether a review has already been submitted - so we
            // hide the review button if so.
            // We check this by looking at the freelancer's reputation reviews
            // and seeing if any of them reference this job ID.
            // (Not the most efficient but works for the demo)
            if (status === STATUS_CONFIRMED && isMyClientJob) {
              try {
                const reviewCountBigInt = await contracts.reputation.getReviewCount(
                  freelancerAddress
                );
                const reviewCount = Number(reviewCountBigInt);

                for (let i = 0; i < reviewCount; i++) {
                  const reviewData = await contracts.reputation.getReview(
                    freelancerAddress,
                    i
                  );
                  // reviewData[0] is the jobId on the review
                  const reviewedJobIdNum = Number(reviewData[0]);
                  if (reviewedJobIdNum === jobId) {
                    jobsWithReviews.push(jobId);
                    break;
                  }
                }
              } catch (err) {
                // Non-fatal - just means we couldn't check, will show the button
                console.warn("Could not check review status for job", jobId, err);
              }
            }
          }
        }

        setMyJobs(relevantJobs);
        setReviewedJobIds(jobsWithReviews);
      } catch (err) {
        console.error("Failed to fetch my jobs:", err);
        setFetchError("Failed to load your jobs. " + (err.message || ""));
      } finally {
        setIsLoading(false);
      }
    }

    fetchMyJobs();
  }, [props.signer, props.account, props.refreshCounter]);

  async function handleCompleteJob(jobId) {
    setActionError(null);
    setActionJobId(jobId);

    try {
      const contracts = getContracts(props.signer);
      const transaction = await contracts.job.completeJob(jobId);
      await transaction.wait();

      if (props.onActionComplete) {
        props.onActionComplete();
      }
    } catch (err) {
      console.error("Failed to mark job complete:", err);
      setActionError(err.reason || err.message || "Failed to mark complete.");
    } finally {
      setActionJobId(null);
    }
  }

  async function handleConfirmCompletion(jobId) {
    setActionError(null);
    setActionJobId(jobId);

    try {
      const contracts = getContracts(props.signer);
      const transaction = await contracts.job.confirmCompletion(jobId);
      await transaction.wait();

      if (props.onActionComplete) {
        props.onActionComplete();
      }
    } catch (err) {
      console.error("Failed to confirm completion:", err);
      setActionError(err.reason || err.message || "Failed to confirm.");
    } finally {
      setActionJobId(null);
    }
  }

  function openReviewForm(jobId) {
    setReviewingJobId(jobId);
    setRatingInput("5");
    setCommentInput("");
    setActionError(null);
  }

  function closeReviewForm() {
    setReviewingJobId(null);
    setRatingInput("5");
    setCommentInput("");
  }

  async function handleSubmitReview() {
    if (commentInput.trim() === "") {
      setActionError("Please enter a comment for the review.");
      return;
    }

    const ratingAsNumber = parseInt(ratingInput, 10);
    if (ratingAsNumber < 1 || ratingAsNumber > 5) {
      setActionError("Rating must be between 1 and 5.");
      return;
    }

    setActionError(null);
    setActionJobId(reviewingJobId);

    try {
      const contracts = getContracts(props.signer);
      const transaction = await contracts.reputation.submitReview(
        reviewingJobId,
        ratingAsNumber,
        commentInput.trim()
      );
      await transaction.wait();

      closeReviewForm();

      if (props.onActionComplete) {
        props.onActionComplete();
      }
    } catch (err) {
      console.error("Failed to submit review:", err);
      setActionError(err.reason || err.message || "Failed to submit review.");
    } finally {
      setActionJobId(null);
    }
  }

  function formatTimestamp(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleString();
  }

  function formatAddress(address) {
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      return "—";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  // Decide which action button(s) to show for a given job based on role + status
  function renderJobActions(job) {
    const isBusy = actionJobId === job.id;

    // Freelancer can mark an accepted job as complete
    if (
      job.userIsFreelancer &&
      job.status === STATUS_ACCEPTED &&
      props.currentRole === ROLE_FREELANCER
    ) {
      return (
        <button
          onClick={function () {
            handleCompleteJob(job.id);
          }}
          disabled={isBusy}
          className="submit-button"
        >
          {isBusy ? "Submitting..." : "Mark Complete"}
        </button>
      );
    }

    // Client can confirm a completed job
    if (
      job.userIsClient &&
      job.status === STATUS_COMPLETED &&
      props.currentRole === ROLE_CLIENT
    ) {
      return (
        <button
          onClick={function () {
            handleConfirmCompletion(job.id);
          }}
          disabled={isBusy}
          className="submit-button"
        >
          {isBusy ? "Submitting..." : "Confirm Completion"}
        </button>
      );
    }

    // Client can submit a review on a confirmed job (if not already reviewed)
    if (
      job.userIsClient &&
      job.status === STATUS_CONFIRMED &&
      props.currentRole === ROLE_CLIENT &&
      reviewedJobIds.indexOf(job.id) === -1
    ) {
      return (
        <button
          onClick={function () {
            openReviewForm(job.id);
          }}
          disabled={isBusy}
          className="submit-button"
        >
          Leave a Review
        </button>
      );
    }

    // Otherwise no action available right now
    return null;
  }

  // ----- Render -----

  if (isLoading) {
    return (
      <div className="panel">
        <h2>My Jobs</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (fetchError !== null) {
    return (
      <div className="panel">
        <h2>My Jobs</h2>
        <p className="error-message">{fetchError}</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>My Jobs</h2>

      {myJobs.length === 0 ? (
        <p>You don't have any jobs yet.</p>
      ) : (
        <div className="jobs-list">
          {myJobs.map(function (job) {
            return (
              <div key={job.id} className="job-card">
                <div className="job-card-header">
                  <h3>Job #{job.id}</h3>
                  <span className="status-badge">{getStatusLabel(job.status)}</span>
                </div>
                <p className="job-description">{job.description}</p>
                <div className="job-meta">
                  <span>
                    <strong>Payment:</strong> {job.payment} wei
                  </span>
                  <span>
                    <strong>Client:</strong> {formatAddress(job.client)}
                  </span>
                  <span>
                    <strong>Freelancer:</strong> {formatAddress(job.freelancer)}
                  </span>
                  <span>
                    <strong>Created:</strong> {formatTimestamp(job.createdAt)}
                  </span>
                </div>

                {renderJobActions(job)}
              </div>
            );
          })}
        </div>
      )}

      {/* Review modal - shown inline when a review is in progress */}
      {reviewingJobId !== null && (
        <div className="review-form-overlay">
          <div className="review-form">
            <h3>Leave a Review for Job #{reviewingJobId}</h3>

            <div className="form-group">
              <label htmlFor="rating-input">Rating (1-5):</label>
              <select
                id="rating-input"
                value={ratingInput}
                onChange={function (e) {
                  setRatingInput(e.target.value);
                }}
              >
                <option value="1">1 - Poor</option>
                <option value="2">2 - Fair</option>
                <option value="3">3 - Good</option>
                <option value="4">4 - Very Good</option>
                <option value="5">5 - Excellent</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="comment-input">Comment:</label>
              <textarea
                id="comment-input"
                value={commentInput}
                onChange={function (e) {
                  setCommentInput(e.target.value);
                }}
                placeholder="What was it like working with this freelancer?"
                rows="3"
              />
            </div>

            <div className="form-buttons">
              <button
                onClick={handleSubmitReview}
                disabled={actionJobId === reviewingJobId}
                className="submit-button"
              >
                {actionJobId === reviewingJobId
                  ? "Submitting..."
                  : "Submit Review"}
              </button>
              <button
                onClick={closeReviewForm}
                disabled={actionJobId === reviewingJobId}
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError !== null && (
        <p className="error-message">{actionError}</p>
      )}
    </div>
  );
}

export default MyJobsView;