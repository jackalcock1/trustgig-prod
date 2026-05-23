// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Registry.sol";
import "./Job.sol";

/// @title TrustGig Reputation
/// @notice Stores reviews and skill endorsements tied to a freelancer's wallet.
///         Reviews can only be submitted for confirmed jobs (gated via the Job contract).
///         Skill endorsements can only be issued by whitelisted Verifiers (gated via Registry).
contract Reputation {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Review {
        uint256 jobId;
        address client;
        address freelancer;
        uint8 rating;        // 1..5
        string comment;
        uint256 timestamp;
    }

    struct Endorsement {
        address verifier;
        string skill;
        uint256 timestamp;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    Registry public immutable registry;
    Job public immutable jobContract;

    // freelancer => list of reviews
    mapping(address => Review[]) private reviews;

    // freelancer => list of endorsements
    mapping(address => Endorsement[]) private endorsements;

    // jobId => has a review been submitted? (one review per job)
    mapping(uint256 => bool) private reviewed;

    // freelancer => running sum of ratings (for cheap average calculation)
    mapping(address => uint256) private ratingSum;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ReviewSubmitted(
        uint256 indexed jobId,
        address indexed freelancer,
        address indexed client,
        uint8 rating
    );

    event SkillEndorsed(
        address indexed freelancer,
        address indexed verifier,
        string skill
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error JobNotConfirmed();
    error NotJobClient();
    error AlreadyReviewed();
    error InvalidRating();
    error EmptyComment();
    error NotVerifier();
    error TargetNotFreelancer();
    error EmptySkill();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address registryAddress, address jobAddress) {
        registry = Registry(registryAddress);
        jobContract = Job(jobAddress);
    }

    // ---------------------------------------------------------------------
    // Reviews
    // ---------------------------------------------------------------------

    /// @notice Submit a review for a confirmed job. Callable only by the job's client,
    ///         once per job.
    function submitReview(uint256 jobId, uint8 rating, string calldata comment)
        external
    {
        if (rating < 1 || rating > 5) revert InvalidRating();
        if (bytes(comment).length == 0) revert EmptyComment();
        if (reviewed[jobId]) revert AlreadyReviewed();

        // Cross-contract check: job must be confirmed.
        if (!jobContract.isConfirmed(jobId)) revert JobNotConfirmed();

        // Cross-contract check: derive the parties from the Job contract so the
        // reviewer can't lie about who they're reviewing.
        (address client, address freelancer) = jobContract.getParties(jobId);
        if (msg.sender != client) revert NotJobClient();

        reviewed[jobId] = true;
        reviews[freelancer].push(Review({
            jobId: jobId,
            client: client,
            freelancer: freelancer,
            rating: rating,
            comment: comment,
            timestamp: block.timestamp
        }));
        ratingSum[freelancer] += rating;

        emit ReviewSubmitted(jobId, freelancer, client, rating);
    }

    // ---------------------------------------------------------------------
    // Endorsements
    // ---------------------------------------------------------------------

    /// @notice A whitelisted verifier endorses a skill on a freelancer's profile.
    function endorseSkill(address freelancer, string calldata skill) external {
        if (!registry.isVerifier(msg.sender)) revert NotVerifier();
        if (!registry.isFreelancer(freelancer)) revert TargetNotFreelancer();
        if (bytes(skill).length == 0) revert EmptySkill();

        endorsements[freelancer].push(Endorsement({
            verifier: msg.sender,
            skill: skill,
            timestamp: block.timestamp
        }));

        emit SkillEndorsed(freelancer, msg.sender, skill);
    }

    // ---------------------------------------------------------------------
    // Public reads (the integration surface for platforms)
    // ---------------------------------------------------------------------

    /// @notice Aggregate reputation summary for a freelancer.
    /// @return reviewCount       total reviews received
    /// @return averageRatingX100 average rating multiplied by 100 (e.g. 425 = 4.25)
    /// @return endorsementCount  total skill endorsements
    function getReputation(address freelancer)
        external
        view
        returns (
            uint256 reviewCount,
            uint256 averageRatingX100,
            uint256 endorsementCount
        )
    {
        reviewCount = reviews[freelancer].length;
        endorsementCount = endorsements[freelancer].length;
        averageRatingX100 = reviewCount == 0
            ? 0
            : (ratingSum[freelancer] * 100) / reviewCount;
    }

    function getReview(address freelancer, uint256 index)
        external
        view
        returns (
            uint256 jobId,
            address client,
            uint8 rating,
            string memory comment,
            uint256 timestamp
        )
    {
        Review storage r = reviews[freelancer][index];
        return (r.jobId, r.client, r.rating, r.comment, r.timestamp);
    }

    function getEndorsement(address freelancer, uint256 index)
        external
        view
        returns (address verifier, string memory skill, uint256 timestamp)
    {
        Endorsement storage e = endorsements[freelancer][index];
        return (e.verifier, e.skill, e.timestamp);
    }

    function getReviewCount(address freelancer) external view returns (uint256) {
        return reviews[freelancer].length;
    }

    function getEndorsementCount(address freelancer) external view returns (uint256) {
        return endorsements[freelancer].length;
    }
}