// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Registry.sol";

/// @title TrustGig Job
/// @notice Manages the lifecycle of a gig: created -> accepted -> completed -> confirmed.
///         Confirmation unlocks review eligibility in the Reputation contract.
contract Job {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Status { None, Open, Accepted, Completed, Confirmed }

    struct JobRecord {
        address client;
        address freelancer;     // zero until accepted
        string description;
        uint256 payment;        // tracked off-chain; recorded for reference only
        Status status;
        uint256 createdAt;
        uint256 confirmedAt;    // 0 until confirmed
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    Registry public immutable registry;

    uint256 public nextJobId = 1;
    mapping(uint256 => JobRecord) private jobs;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event JobCreated(uint256 indexed jobId, address indexed client, uint256 payment);
    event JobAccepted(uint256 indexed jobId, address indexed freelancer);
    event JobCompleted(uint256 indexed jobId, address indexed freelancer);
    event JobConfirmed(uint256 indexed jobId, address indexed client);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

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

    constructor(address registryAddress) {
        registry = Registry(registryAddress);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice A registered client posts a new job.
    function createJob(string calldata description, uint256 payment)
        external
        returns (uint256 jobId)
    {
        if (!registry.isClient(msg.sender)) revert NotRegisteredClient();
        if (bytes(description).length == 0) revert EmptyDescription();

        jobId = nextJobId++;
        jobs[jobId] = JobRecord({
            client: msg.sender,
            freelancer: address(0),
            description: description,
            payment: payment,
            status: Status.Open,
            createdAt: block.timestamp,
            confirmedAt: 0
        });

        emit JobCreated(jobId, msg.sender, payment);
    }

    /// @notice A registered freelancer accepts an open job.
    function acceptJob(uint256 jobId) external {
        if (!registry.isFreelancer(msg.sender)) revert NotRegisteredFreelancer();

        JobRecord storage j = _getJob(jobId);
        if (j.status != Status.Open) revert WrongStatus(Status.Open, j.status);

        j.freelancer = msg.sender;
        j.status = Status.Accepted;

        emit JobAccepted(jobId, msg.sender);
    }

    /// @notice The assigned freelancer marks the job as complete.
    function completeJob(uint256 jobId) external {
        JobRecord storage j = _getJob(jobId);
        if (j.status != Status.Accepted) revert WrongStatus(Status.Accepted, j.status);
        if (msg.sender != j.freelancer) revert NotJobFreelancer();

        j.status = Status.Completed;

        emit JobCompleted(jobId, msg.sender);
    }

    /// @notice The client confirms delivery, unlocking review eligibility.
    function confirmCompletion(uint256 jobId) external {
        JobRecord storage j = _getJob(jobId);
        if (j.status != Status.Completed) revert WrongStatus(Status.Completed, j.status);
        if (msg.sender != j.client) revert NotJobClient();

        j.status = Status.Confirmed;
        j.confirmedAt = block.timestamp;

        emit JobConfirmed(jobId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views (called by Reputation contract and read clients)
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

    /// @notice Lightweight check used by the Reputation contract to gate reviews.
    function isConfirmed(uint256 jobId) external view returns (bool) {
        return jobs[jobId].status == Status.Confirmed;
    }

    /// @notice Returns (client, freelancer) for a confirmed job. Used by Reputation
    ///         to validate that the reviewer is the job's client and to attribute
    ///         the review to the correct freelancer.
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

    function _getJob(uint256 jobId) private view returns (JobRecord storage) {
        JobRecord storage j = jobs[jobId];
        if (j.status == Status.None) revert JobDoesNotExist();
        return j;
    }
}