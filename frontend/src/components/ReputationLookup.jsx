// This view lets anyone look up a freelancer's full reputation by wallet
// address. It's the demo's "money shot" - showing what platforms would see
// when they query the chain for a freelancer's reputation.
//
// It shows:
//   - The freelancer's name and registered skills (from Registry)
//   - Their aggregate reputation: review count, average rating, endorsement count
//   - The list of individual reviews
//   - The list of skill endorsements

import { useState } from "react";
import { getContracts } from "../contracts";

function ReputationLookup(props) {
  const [addressInput, setAddressInput] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // The data we display once a lookup succeeds.
  // null means "no lookup done yet or it failed"
  const [profile, setProfile] = useState(null);

  async function handleLookup(event) {
    event.preventDefault();

    setErrorMessage(null);
    setProfile(null);

    const trimmedAddress = addressInput.trim();

    // Basic address validation
    if (trimmedAddress === "") {
      setErrorMessage("Please enter a wallet address.");
      return;
    }

    if (trimmedAddress.startsWith("0x") === false || trimmedAddress.length !== 42) {
      setErrorMessage("That doesn't look like a valid Ethereum address.");
      return;
    }

    setIsLoading(true);

    try {
      const contracts = getContracts(props.signer);

      // First check that this address is actually a registered freelancer
      const isFreelancer = await contracts.registry.isFreelancer(trimmedAddress);

      if (isFreelancer === false) {
        setErrorMessage("That address is not registered as a freelancer.");
        setIsLoading(false);
        return;
      }

      // Pull their basic profile info from the Registry
      const freelancerData = await contracts.registry.getFreelancer(trimmedAddress);
      const name = freelancerData[0];
      const skills = freelancerData[1];

      // Pull the aggregate reputation from the Reputation contract.
      // This is the function platforms would actually call to display a score.
      const reputationData = await contracts.reputation.getReputation(trimmedAddress);
      const reviewCount = Number(reputationData[0]);
      const averageRatingX100 = Number(reputationData[1]);
      const endorsementCount = Number(reputationData[2]);

      // Convert the x100 rating back into a real number for display.
      // e.g. 425 means 4.25 stars
      const averageRating = reviewCount === 0 ? 0 : averageRatingX100 / 100;

      // Pull the individual reviews so we can show them
      const reviewsList = [];
      for (let i = 0; i < reviewCount; i++) {
        const reviewData = await contracts.reputation.getReview(trimmedAddress, i);
        reviewsList.push({
          jobId: Number(reviewData[0]),
          client: reviewData[1],
          rating: Number(reviewData[2]),
          comment: reviewData[3],
          timestamp: Number(reviewData[4]),
        });
      }

      // Pull the individual endorsements
      const endorsementsList = [];
      for (let i = 0; i < endorsementCount; i++) {
        const endorsementData = await contracts.reputation.getEndorsement(
          trimmedAddress,
          i
        );
        endorsementsList.push({
          verifier: endorsementData[0],
          skill: endorsementData[1],
          timestamp: Number(endorsementData[2]),
        });
      }

      setProfile({
        address: trimmedAddress,
        name: name,
        skills: skills,
        reviewCount: reviewCount,
        averageRating: averageRating,
        endorsementCount: endorsementCount,
        reviews: reviewsList,
        endorsements: endorsementsList,
      });
    } catch (err) {
      console.error("Lookup failed:", err);

      let displayedError = "Lookup failed.";
      if (err.reason) {
        displayedError = err.reason;
      } else if (err.message) {
        displayedError = err.message;
      }
      setErrorMessage(displayedError);
    } finally {
      setIsLoading(false);
    }
  }

  function formatAddress(address) {
    if (!address) {
      return "—";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  function formatTimestamp(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleString();
  }

  // Convert a numeric rating (1-5) into stars for display
  function renderStars(rating) {
    let starsString = "";
    for (let i = 0; i < 5; i++) {
      if (i < rating) {
        starsString = starsString + "★";
      } else {
        starsString = starsString + "☆";
      }
    }
    return starsString;
  }

  // ----- Render -----

  return (
    <div className="panel">
      <h2>Look Up a Freelancer's Reputation</h2>
      <p>
        Enter any freelancer's wallet address to see their on-chain reputation.
        This is exactly what a platform like Upwork would see when integrating
        with TrustGig.
      </p>

      <form onSubmit={handleLookup}>
        <div className="form-group">
          <label htmlFor="lookup-address">Freelancer wallet address:</label>
          <input
            id="lookup-address"
            type="text"
            value={addressInput}
            onChange={function (e) {
              setAddressInput(e.target.value);
            }}
            placeholder="0x..."
          />
        </div>

        <button type="submit" disabled={isLoading} className="submit-button">
          {isLoading ? "Looking up..." : "Look Up"}
        </button>
      </form>

      {errorMessage !== null && (
        <p className="error-message">{errorMessage}</p>
      )}

      {profile !== null && (
        <div className="profile-display">
          <div className="profile-header">
            <h3>{profile.name}</h3>
            <p className="profile-address">{profile.address}</p>
          </div>

          <div className="profile-summary">
            <div className="profile-stat">
              <div className="stat-value">{profile.averageRating.toFixed(2)}</div>
              <div className="stat-label">
                {renderStars(Math.round(profile.averageRating))}
              </div>
            </div>
            <div className="profile-stat">
              <div className="stat-value">{profile.reviewCount}</div>
              <div className="stat-label">Reviews</div>
            </div>
            <div className="profile-stat">
              <div className="stat-value">{profile.endorsementCount}</div>
              <div className="stat-label">Endorsements</div>
            </div>
          </div>

          <div className="profile-section">
            <h4>Registered Skills</h4>
            {profile.skills.length === 0 ? (
              <p>No skills registered.</p>
            ) : (
              <div className="skill-tags">
                {profile.skills.map(function (skill, index) {
                  return (
                    <span key={index} className="skill-tag">
                      {skill}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="profile-section">
            <h4>Verified Endorsements</h4>
            {profile.endorsements.length === 0 ? (
              <p>No verified endorsements yet.</p>
            ) : (
              <ul className="endorsements-list">
                {profile.endorsements.map(function (endorsement, index) {
                  return (
                    <li key={index}>
                      <strong>{endorsement.skill}</strong> — verified by{" "}
                      {formatAddress(endorsement.verifier)} on{" "}
                      {formatTimestamp(endorsement.timestamp)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="profile-section">
            <h4>Client Reviews</h4>
            {profile.reviews.length === 0 ? (
              <p>No reviews yet.</p>
            ) : (
              <div className="reviews-list">
                {profile.reviews.map(function (review, index) {
                  return (
                    <div key={index} className="review-card">
                      <div className="review-header">
                        <span className="review-rating">
                          {renderStars(review.rating)}
                        </span>
                        <span className="review-meta">
                          Job #{review.jobId} • {formatAddress(review.client)} •{" "}
                          {formatTimestamp(review.timestamp)}
                        </span>
                      </div>
                      <p className="review-comment">"{review.comment}"</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReputationLookup;