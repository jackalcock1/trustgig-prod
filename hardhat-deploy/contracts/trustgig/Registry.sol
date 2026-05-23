// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustGig Registry
/// @notice Onboards and tracks all participants (Freelancers, Clients, Verifiers).
///         Job and Reputation contracts call into this contract to gate access by role.
contract Registry {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Role { None, Freelancer, Client, Verifier }

    struct Freelancer {
        string name;
        string[] skills;
        bool exists;
    }

    struct Client {
        string name;
        bool exists;
    }

    struct Verifier {
        string name;       // e.g. "QUT", "AWS Certification"
        bool exists;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    address public immutable owner;

    mapping(address => Role) private roles;
    mapping(address => Freelancer) private freelancers;
    mapping(address => Client) private clients;
    mapping(address => Verifier) private verifiers;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event FreelancerRegistered(address indexed wallet, string name);
    event ClientRegistered(address indexed wallet, string name);
    event VerifierApproved(address indexed wallet, string name);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOwner();
    error AlreadyRegistered();
    error EmptyName();
    error ZeroAddress();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier notRegistered(address wallet) {
        if (roles[wallet] != Role.None) revert AlreadyRegistered();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    /// @notice Self-registration as a freelancer.
    function registerFreelancer(string calldata name, string[] calldata skills)
        external
        notRegistered(msg.sender)
    {
        if (bytes(name).length == 0) revert EmptyName();

        freelancers[msg.sender] = Freelancer({
            name: name,
            skills: skills,
            exists: true
        });
        roles[msg.sender] = Role.Freelancer;

        emit FreelancerRegistered(msg.sender, name);
    }

    /// @notice Self-registration as a client.
    function registerClient(string calldata name)
        external
        notRegistered(msg.sender)
    {
        if (bytes(name).length == 0) revert EmptyName();

        clients[msg.sender] = Client({ name: name, exists: true });
        roles[msg.sender] = Role.Client;

        emit ClientRegistered(msg.sender, name);
    }

    /// @notice Owner-only: whitelist a skill verifier (e.g. a university).
    function approveVerifier(address wallet, string calldata name)
        external
        onlyOwner
        notRegistered(wallet)
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();

        verifiers[wallet] = Verifier({ name: name, exists: true });
        roles[wallet] = Role.Verifier;

        emit VerifierApproved(wallet, name);
    }

    // ---------------------------------------------------------------------
    // Role checks (called by Job and Reputation contracts)
    // ---------------------------------------------------------------------

    function isFreelancer(address wallet) external view returns (bool) {
        return roles[wallet] == Role.Freelancer;
    }

    function isClient(address wallet) external view returns (bool) {
        return roles[wallet] == Role.Client;
    }

    function isVerifier(address wallet) external view returns (bool) {
        return roles[wallet] == Role.Verifier;
    }

    function getRole(address wallet) external view returns (Role) {
        return roles[wallet];
    }

    // ---------------------------------------------------------------------
    // Profile getters
    // ---------------------------------------------------------------------

    function getFreelancer(address wallet)
        external
        view
        returns (string memory name, string[] memory skills)
    {
        Freelancer storage f = freelancers[wallet];
        return (f.name, f.skills);
    }

    function getClient(address wallet) external view returns (string memory) {
        return clients[wallet].name;
    }

    function getVerifier(address wallet) external view returns (string memory) {
        return verifiers[wallet].name;
    }
}