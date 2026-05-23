// This view shows all currently-open jobs that any freelancer can accept.
// We iterate through job IDs from 1 to nextJobId-1, fetch each one, and
// filter for those still in the "Open" status.
//
// In a real production app you'd want a much better way to do this - probably
// indexing events with something like The Graph, because iterating client-side
// gets slow with thousands of jobs. For our demo with a handful of jobs this
// is fine.

import { useState, useEffect } from "react";
import {
  getContracts,
  getStatusLabel,
  STATUS_OPEN,
  ROLE_FREELANCER,
  ROLE_CLIENT,
} from "../contracts";
import CreateJobPanel from "./CreateJobPanel";

function BrowseJobsView(props) {
  const [jobsList, setJobsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [acceptingJobId, setAcceptingJobId] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (props.signer === null) {
      return;
    }

    async function fetchOpenJobs() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const contracts = getContracts(props.signer);

        const nextJobIdBigInt = await contracts.job.nextJobId();
        const nextJobId = Number(nextJobIdBigInt);

        const foundJobs = [];

        for (let jobId = 1; jobId < nextJobId; jobId++) {
          const jobData = await contracts.job.getJob(jobId);

          const clientAddress = jobData[0];
          const freelancerAddress = jobData[1];
          const description = jobData[2];
          const payment = jobData[3];
          const status = Number(jobData[4]);
          const createdAt = jobData[5];

          if (status === STATUS_OPEN) {
            foundJobs.push({
              id: jobId,
              client: clientAddress,
              freelancer: freelancerAddress,
              description: description,
              payment: payment.toString(),
              status: status,
              createdAt: Number(createdAt),
            });
          }
        }

        setJobsList(foundJobs);
      } catch (err) {
        console.error("Failed to fetch open jobs:", err);
        setFetchError("Failed to load jobs. " + (err.message || ""));
      } finally {
        setIsLoading(false);
      }
    }

    fetchOpenJobs();
  }, [props.signer, props.refreshCounter]);

  async function handleAcceptJob(jobId) {
    setActionError(null);
    setAcceptingJobId(jobId);

    try {
      const contracts = getContracts(props.signer);
      const transaction = await contracts.job.acceptJob(jobId);
      await transaction.wait();

      if (props.onActionComplete) {
        props.onActionComplete();
      }
    } catch (err) {
      console.error("Failed to accept job:", err);

      let displayedError = "Failed to accept job.";
      if (err.reason) {
        displayedError = err.reason;
      } else if (err.message) {
        displayedError = err.message;
      }
      setActionError(displayedError);
    } finally {
      setAcceptingJobId(null);
    }
  }

  function formatTimestamp(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleString();
  }

  function formatAddress(address) {
    if (!address) {
      return "—";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  // ----- Render -----

  if (isLoading) {
    return (
      <div className="panel">
        <h2>Browse Open Jobs</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (fetchError !== null) {
    return (
      <div className="panel">
        <h2>Browse Open Jobs</h2>
        <p className="error-message">{fetchError}</p>
      </div>
    );
  }

  return (
    <div className="browse-jobs-wrapper">
      {/* Clients see a "post a new job" panel at the top of this view */}
      {props.currentRole === ROLE_CLIENT && (
        <CreateJobPanel
          signer={props.signer}
          onActionComplete={props.onActionComplete}
        />
      )}

      <div className="panel">
        <h2>Browse Open Jobs</h2>

        {jobsList.length === 0 ? (
          <p>No open jobs at the moment. Check back later!</p>
        ) : (
          <div className="jobs-list">
            {jobsList.map(function (job) {
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
                      <strong>Posted by:</strong> {formatAddress(job.client)}
                    </span>
                    <span>
                      <strong>Created:</strong> {formatTimestamp(job.createdAt)}
                    </span>
                  </div>

                  {props.currentRole === ROLE_FREELANCER && (
                    <button
                      onClick={function () {
                        handleAcceptJob(job.id);
                      }}
                      disabled={acceptingJobId === job.id}
                      className="submit-button"
                    >
                      {acceptingJobId === job.id ? "Accepting..." : "Accept Job"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {actionError !== null && (
          <p className="error-message">{actionError}</p>
        )}
      </div>
    </div>
  );
}

export default BrowseJobsView;