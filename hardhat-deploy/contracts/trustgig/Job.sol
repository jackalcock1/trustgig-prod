// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Registry.sol";

// ---------------------------------------------------------------------
// Job.sol
// ---------------------------------------------------------------------
// this contract is in charge of the actual gig itself - tracking what
// stage a job is at and making sure stuff happens in the right order.
//
// every job follows the same path: open (created by the client) ->
// accepted (a freelancer's taken it on) -> completed (freelancer says
// they're done) -> confirmed (client agrees it's done). you can't skip
// stages and you can't go backwards. the contract enforces all of that.
//
// once a job hits 'confirmed' it unlocks review eligibility over in the
// Reputation contract. that's the connection point between this contract
// and that one.
//
// btw this contract doesn't actually handle ETH or payments at all - the
// 'payment' field is just a number stored on chain for reference. in a
// real v2 we'd add escrow but it was out of scope for this assignment.
// ---------------------------------------------------------------------

contract Job {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    // the five possible states a job can be in. None is the default value
    // for an uninitialised mapping entry - we use that to detect when
    // someone asks about a jobId that doesn't exist.
    enum Status { None, Open, Accepted, Completed, Confirmed }

    // everything we store about a job
    struct JobRecord {
        address client;         // whoever posted the job
        address freelancer;     // stays as the zero address until someone accepts
        string description;
        uint256 payment;        // tracked off-chain; recorded for reference only
        Status status;
        uint256 createdAt;
        uint256 confirmedAt;    // stays 0 until the job actually gets confirmed
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    // immutable reference to the Registry contract. this gets wired up at
    // deploy time and can never change - so this Job contract is permanently
    // bound to one specific Registry. nice and trustless.
    Registry public immutable registry;

    // counter for handing out unique job IDs. starts at 1 (not 0) because
    // 0 would clash with the default values from mappings - easier to spot
    // "this job doesn't exist" if all real jobs have a non-zero ID.
    uint256 public nextJobId = 1;

    // all the jobs we've ever stored, keyed by their ID
    mapping(uint256 => JobRecord) private jobs;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    // one event per lifecycle transition - lets the frontend track every
    // step a job goes through. all three "address" fields are indexed so
    // the frontend can filter logs by jobId, by client, or by freelancer.

    event JobCreated(uint256 indexed jobId, address indexed client, uint256 payment);
    event JobAccepted(uint256 indexed jobId, address indexed freelancer);
    event JobCompleted(uint256 indexed jobId, address indexed freelancer);
    event JobConfirmed(uint256 indexed jobId, address indexed client);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    // custom errors for everything that can go wrong. cheaper than require
    // strings and the frontend can show a meaningful message based on which
    // one fired.
    //
    // WrongStatus is the cool one - it actually takes parameters so when
    // it reverts you find out BOTH the expected status AND what the actual
    // status was. dead useful for debugging in Remix.

    error NotRegisteredClient();
    error NotRegisteredFreelancer();
    error JobDoesNotExist();
    error WrongStatus(Status expected, Status actual);
    error NotJobClient();
    error NotJobFreelancer();
    error EmptyDescription();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    // takes the address of the already-deployed Registry contract. we have
    // to deploy Registry first, then pass its address into this constructor.
    constructor(address registryAddress) {
        registry = Registry(registryAddress);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // createJob
    // ---------------------------------------------------------------------
    // called by a client to post a new gig. we check they're actually
    // registered as a client first (cross-contract call to Registry),
    // then create the JobRecord with status Open and return the new ID
    // so the frontend knows what number this job got.
    // ---------------------------------------------------------------------
    function createJob(string calldata description, uint256 payment)
        external
        returns (uint256 jobId)
    {
        // cross-contract call: ask Registry whether the caller's a client.
        // if not, we bail out with a custom error.
        if (!registry.isClient(msg.sender)) revert NotRegisteredClient();

        // basic input check - empty descriptions aren't useful
        if (bytes(description).length == 0) revert EmptyDescription();

        // grab the next ID and bump the counter for next time. the ++ is
        // post-increment so we use the current value first, THEN add one.
        jobId = nextJobId++;

        // store the new job
        jobs[jobId] = JobRecord({
            client: msg.sender,
            freelancer: address(0),        // no freelancer yet
            description: description,
            payment: payment,
            status: Status.Open,
            createdAt: block.timestamp,
            confirmedAt: 0                  // not confirmed yet either
        });

        emit JobCreated(jobId, msg.sender, payment);
    }

    // ---------------------------------------------------------------------
    // acceptJob
    // ---------------------------------------------------------------------
    // called by a freelancer to take on an open job. we check they're a
    // registered freelancer (cross-contract call to Registry), make sure
    // the job exists and is still open, then assign them to it.
    // ---------------------------------------------------------------------
    function acceptJob(uint256 jobId) external {
        // cross-contract role check
        if (!registry.isFreelancer(msg.sender)) revert NotRegisteredFreelancer();

        // grab the job record (or revert if it doesn't exist)
        JobRecord storage j = _getJob(jobId);

        // make sure the job is in the right state - can only accept jobs
        // that are still open
        if (j.status != Status.Open) revert WrongStatus(Status.Open, j.status);

        // assign the freelancer and bump the status forward
        j.freelancer = msg.sender;
        j.status = Status.Accepted;

        emit JobAccepted(jobId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // completeJob
    // ---------------------------------------------------------------------
    // freelancer marks the work as done. note we don't need to ask Registry
    // here because being assigned to the job is enough - if you're the
    // freelancer on the record, you must be a freelancer (Registry already
    // checked that when you accepted it).
    // ---------------------------------------------------------------------
    function completeJob(uint256 jobId) external {
        JobRecord storage j = _getJob(jobId);

        // job has to be in Accepted state - can't complete one that hasn't
        // been picked up yet, or that's already done
        if (j.status != Status.Accepted) revert WrongStatus(Status.Accepted, j.status);

        // and only the freelancer assigned to this job can mark it complete.
        // not the client, not some other random freelancer.
        if (msg.sender != j.freelancer) revert NotJobFreelancer();

        j.status = Status.Completed;

        emit JobCompleted(jobId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // confirmCompletion
    // ---------------------------------------------------------------------
    // the most important transition in the lifecycle - this is what unlocks
    // the ability to leave a review. client confirms the freelancer actually
    // delivered, and we record the timestamp for that confirmation.
    // ---------------------------------------------------------------------
    function confirmCompletion(uint256 jobId) external {
        JobRecord storage j = _getJob(jobId);

        // job has to have been marked complete by the freelancer first
        if (j.status != Status.Completed) revert WrongStatus(Status.Completed, j.status);

        // only the client on this specific job can confirm. someone else's
        // client can't confirm your job.
        if (msg.sender != j.client) revert NotJobClient();

        j.status = Status.Confirmed;
        j.confirmedAt = block.timestamp;        // record when this happened

        emit JobConfirmed(jobId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views (called by Reputation contract and read clients)
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // getJob
    // ---------------------------------------------------------------------
    // returns everything we know about a job in one call. mostly used by
    // the frontend to display job cards. returns a bunch of named values
    // which makes it easier to read on the JS side compared to a struct.
    // ---------------------------------------------------------------------
    function getJob(uint256 jobId)
        external
        view
        returns (
            address client,
            address freelancer,
            string memory description,
            uint256 payment,
            Status status,
            uint256 createdAt,
            uint256 confirmedAt
        )
    {
        JobRecord storage j = _getJob(jobId);
        return (
            j.client,
            j.freelancer,
            j.description,
            j.payment,
            j.status,
            j.createdAt,
            j.confirmedAt
        );
    }

    // ---------------------------------------------------------------------
    // isConfirmed
    // ---------------------------------------------------------------------
    // quick yes/no check used by the Reputation contract to decide whether
    // a review is allowed. it's a lightweight version of getJob for when
    // you only care about whether the job's been confirmed.
    // ---------------------------------------------------------------------
    function isConfirmed(uint256 jobId) external view returns (bool) {
        return jobs[jobId].status == Status.Confirmed;
    }

    // ---------------------------------------------------------------------
    // getParties
    // ---------------------------------------------------------------------
    // returns just the client and freelancer for a given job. this is the
    // function Reputation calls when someone tries to leave a review - it
    // uses this to (a) check the reviewer is the actual client, and (b)
    // pull the right freelancer to attach the review to.
    //
    // it's the safety bit that stops a reviewer lying about who the
    // freelancer was. they don't get to pass that in - we look it up here.
    // ---------------------------------------------------------------------
    function getParties(uint256 jobId)
        external
        view
        returns (address client, address freelancer)
    {
        JobRecord storage j = _getJob(jobId);
        return (j.client, j.freelancer);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // _getJob
    // ---------------------------------------------------------------------
    // internal helper - grabs a job by ID and reverts if it doesn't exist.
    // we use this everywhere instead of just reading from the mapping
    // directly, so we always get the "job doesn't exist" check for free.
    //
    // how does it know whether a job exists? mappings in solidity always
    // "exist" technically - asking for jobs[999] when there's no job 999
    // gives you back a default-zeroed JobRecord. so we check if the status
    // is None (the default enum value). if it is, the job was never
    // created.
    // ---------------------------------------------------------------------
    function _getJob(uint256 jobId) private view returns (JobRecord storage) {
        JobRecord storage j = jobs[jobId];
        if (j.status == Status.None) revert JobDoesNotExist();
        return j;
    }
}