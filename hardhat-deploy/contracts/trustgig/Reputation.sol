// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Registry.sol";
import "./Job.sol";

// ---------------------------------------------------------------------
// Reputation.sol
// ---------------------------------------------------------------------
// this is the contract that stores the actual outcomes - reviews and skill
// endorsements per freelancer. it's the bit that platforms (Upwork, Fiverr,
// whoever) would actually read from when displaying a freelancer's track
// record.
//
// this contract is where most of the interesting cross-contract stuff lives.
// it calls into Registry to check whether the caller is a whitelisted
// verifier, and it calls into Job to verify that a job is actually confirmed
// AND to pull the freelancer's address straight from the Job record. that
// last bit is important - it means a reviewer can't lie about who they're
// reviewing, because the freelancer is identified by the Job contract, not
// by what the caller types in. small detail but it's the kind of safety
// thing you can only do when contracts can call each other directly.
//
// once data goes in here it's permanent. no edit, no delete. we acknowledge
// that as a limitation in the design (no dispute mechanism for unfair reviews)
// but immutability is a feature for the trust story.
// ---------------------------------------------------------------------

contract Reputation {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    // each review is tied to a specific job and contains the rating + comment
    // plus a timestamp so platforms can show "reviewed 2 weeks ago" etc
    struct Review {
        uint256 jobId;
        address client;
        address freelancer;
        uint8 rating;        // 1..5 (a uint8 is fine, ratings are tiny)
        string comment;
        uint256 timestamp;
    }

    // endorsements are simpler - just a verifier vouching for a skill
    struct Endorsement {
        address verifier;
        string skill;
        uint256 timestamp;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    // we store the addresses of the other two contracts as immutable so they
    // get baked into the bytecode at deploy time. cheaper to read AND it means
    // nobody (not even us) can swap them out later. once Reputation is wired
    // up to a specific Registry and Job, it's wired up forever.
    Registry public immutable registry;
    Job public immutable jobContract;

    // each freelancer has a list of reviews
    mapping(address => Review[]) private reviews;

    // and a separate list of endorsements
    mapping(address => Endorsement[]) private endorsements;

    // tracks whether a given jobId has been reviewed already. used to stop
    // a client from leaving multiple reviews on the same job. jobIds are
    // unique across the whole Job contract so this works as a global flag.
    mapping(uint256 => bool) private reviewed;

    // we keep a running total of all ratings per freelancer so we can work
    // out the average cheaply later. way better than iterating the whole
    // reviews array every time someone wants to see an average.
    mapping(address => uint256) private ratingSum;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    // emitted when a review goes through. note the three indexed fields -
    // we can filter logs by job, freelancer, OR client which is dead handy.
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
    // again using custom errors not require strings - cheaper on gas and
    // easier for the frontend to react to specific failures.

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

    // wires this contract up to the deployed Registry and Job contracts.
    // takes their addresses as parameters - we deploy Registry first, then
    // Job (with Registry's address), then Reputation with both addresses.
    constructor(address registryAddress, address jobAddress) {
        registry = Registry(registryAddress);
        jobContract = Job(jobAddress);
    }

    // ---------------------------------------------------------------------
    // Reviews
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // submitReview
    // ---------------------------------------------------------------------
    // the most interesting function in the whole project, honestly. when a
    // client wants to leave a review, this does a bunch of checks - the
    // important ones being two separate cross-contract calls into the Job
    // contract. one to confirm the job actually happened and got marked
    // complete by the client, and one to figure out WHO the freelancer was
    // so we can attach the review to the right person.
    //
    // we don't trust the caller to tell us who the freelancer is - we ask
    // the Job contract because that's the source of truth for it.
    // ---------------------------------------------------------------------
    function submitReview(uint256 jobId, uint8 rating, string calldata comment)
        external
    {
        // basic input validation first - cheaper to fail fast on stuff that
        // doesn't need any contract calls
        if (rating < 1 || rating > 5) revert InvalidRating();
        if (bytes(comment).length == 0) revert EmptyComment();
        if (reviewed[jobId]) revert AlreadyReviewed();

        // cross-contract call 1: ask the Job contract if the job is actually
        // confirmed. if it isn't, reviewing it makes no sense and we bail.
        if (!jobContract.isConfirmed(jobId)) revert JobNotConfirmed();

        // cross-contract call 2: pull the client + freelancer addresses
        // straight out of the Job record. this is the bit that stops the
        // caller from lying about who they're reviewing.
        (address client, address freelancer) = jobContract.getParties(jobId);

        // and now we check the caller is actually the client on this job.
        // can't review someone else's job.
        if (msg.sender != client) revert NotJobClient();

        // checks all passed. mark this jobId as reviewed so it can't happen again
        reviewed[jobId] = true;

        // store the review against the freelancer's address
        reviews[freelancer].push(Review({
            jobId: jobId,
            client: client,
            freelancer: freelancer,
            rating: rating,
            comment: comment,
            timestamp: block.timestamp     // when the block this tx is in was mined
        }));

        // bump the running rating total so the average calc stays cheap
        ratingSum[freelancer] += rating;

        // tell the world (and anyone listening on the frontend)
        emit ReviewSubmitted(jobId, freelancer, client, rating);
    }

    // ---------------------------------------------------------------------
    // Endorsements
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // endorseSkill
    // ---------------------------------------------------------------------
    // lets a whitelisted verifier (uni, certification body, whoever) vouch
    // for a specific skill on a freelancer's profile. two checks before we
    // let it through - is the caller actually a verifier AND is the target
    // actually a freelancer. both checks go via the Registry contract.
    // ---------------------------------------------------------------------
    function endorseSkill(address freelancer, string calldata skill) external {
        // is the caller a verifier? this is a cross-contract call to Registry
        if (!registry.isVerifier(msg.sender)) revert NotVerifier();

        // and is the person they're endorsing actually a freelancer? again
        // a cross-contract call. wouldn't make sense to endorse a client's
        // skills for example.
        if (!registry.isFreelancer(freelancer)) revert TargetNotFreelancer();

        // and the skill name can't be empty
        if (bytes(skill).length == 0) revert EmptySkill();

        // checks passed - record the endorsement
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
    // these are the functions a platform like a future Upwork would actually
    // call to display freelancer info. they're all read-only (view) so they
    // cost nothing to call.

    // ---------------------------------------------------------------------
    // getReputation
    // ---------------------------------------------------------------------
    // gives back the summary stats for a freelancer - how many reviews,
    // their average rating, and how many endorsements. this is the headline
    // "show a freelancer's score" call.
    //
    // note the average is returned multiplied by 100 because solidity has
    // no floats - so a 4.25 average gets returned as 425, and the frontend
    // divides by 100 to display it. it's called "fixed point arithmetic"
    // and it's the standard way to do this kind of thing.
    // ---------------------------------------------------------------------
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

        // if they have no reviews we obviously can't divide by zero,
        // so return 0 in that case
        averageRatingX100 = reviewCount == 0
            ? 0
            : (ratingSum[freelancer] * 100) / reviewCount;
    }

    // ---------------------------------------------------------------------
    // getReview
    // ---------------------------------------------------------------------
    // returns the details of a single review by its index in the freelancer's
    // reviews array. used by the frontend to render the list of reviews
    // one at a time.
    // ---------------------------------------------------------------------
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
        // 'storage' here is more efficient than 'memory' since we're just reading
        Review storage r = reviews[freelancer][index];
        return (r.jobId, r.client, r.rating, r.comment, r.timestamp);
    }

    // same idea but for endorsements
    function getEndorsement(address freelancer, uint256 index)
        external
        view
        returns (address verifier, string memory skill, uint256 timestamp)
    {
        Endorsement storage e = endorsements[freelancer][index];
        return (e.verifier, e.skill, e.timestamp);
    }

    // little helper - the frontend uses this to know how many reviews to loop
    // through when fetching them all
    function getReviewCount(address freelancer) external view returns (uint256) {
        return reviews[freelancer].length;
    }

    // same but for endorsements
    function getEndorsementCount(address freelancer) external view returns (uint256) {
        return endorsements[freelancer].length;
    }
}