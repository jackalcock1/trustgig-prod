// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ---------------------------------------------------------------------
// Registry.sol
// ---------------------------------------------------------------------
// this is the "who's who" contract for TrustGig. anyone using the system
// (freelancers, clients, verifiers) has to be registered in here first
// before they can do anything else.
//
// the other two contracts (Job and Reputation) basically use this as their
// source of truth - whenever someone tries to do something, those contracts
// ask Registry "is this person actually a registered X?" before letting
// them through.
//
// roles work on a one-per-wallet basis. you can't be both a freelancer
// AND a client on the same wallet (would need a separate wallet for that).
// kept it simple, mainly to prevent dodgy stuff like reviewing yourself.
// ---------------------------------------------------------------------

contract Registry {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    // the four possible roles. None is the default for any wallet that hasn't
    // registered yet (mappings in solidity default to zero values, and None=0).
    enum Role { None, Freelancer, Client, Verifier }

    // freelancer profile - name plus a list of skills they say they have
    struct Freelancer {
        string name;
        string[] skills;
        bool exists;        // flag so we can tell "registered but empty" from "never registered"
    }

    // clients are simpler, just need a name (company or person)
    struct Client {
        string name;
        bool exists;
    }

    // verifiers are trusted orgs like a uni or AWS - they get a name too
    struct Verifier {
        string name;       // e.g. "QUT", "AWS Certification"
        bool exists;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    // whoever deploys the contract becomes the owner forever. immutable means
    // it gets set once in the constructor and can never change. cheaper gas
    // than a regular storage variable too.
    address public immutable owner;

    // all the data we store. private so other contracts can't read it directly -
    // they have to use the getter functions below, which is cleaner.
    mapping(address => Role) private roles;
    mapping(address => Freelancer) private freelancers;
    mapping(address => Client) private clients;
    mapping(address => Verifier) private verifiers;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    // events get logged on-chain whenever state changes. they're how the
    // frontend (or anyone watching) knows something happened. the 'indexed'
    // keyword means you can filter logs by that field, which is handy.

    event FreelancerRegistered(address indexed wallet, string name);
    event ClientRegistered(address indexed wallet, string name);
    event VerifierApproved(address indexed wallet, string name);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    // we use custom errors instead of require() with string messages. they're
    // cheaper in terms of gas (just a 4-byte selector vs the whole string)
    // and they show up nicely in the frontend so we can react to specific
    // failure cases.

    error NotOwner();
    error AlreadyRegistered();
    error EmptyName();
    error ZeroAddress();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------
    // modifiers are reusable bits of logic that run before a function. they're
    // basically guards - if the check fails the whole function reverts.

    // only lets the contract owner call the function this is on. used for
    // approveVerifier since whitelisting verifiers is an admin thing.
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;   // this is where the actual function body runs
    }

    // makes sure the given wallet doesn't already have a role - prevents
    // someone from registering twice or switching roles. takes the wallet
    // as a parameter so we can check msg.sender OR another address (for
    // approveVerifier we check the wallet being approved, not the caller).
    modifier notRegistered(address wallet) {
        if (roles[wallet] != Role.None) revert AlreadyRegistered();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    // runs once when the contract is deployed. just records who deployed it
    // so we know who the owner is forever.
    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // registerFreelancer
    // ---------------------------------------------------------------------
    // anyone can call this to sign up as a freelancer. they pass their name
    // and a list of skills. the notRegistered modifier blocks them if they
    // already have any role on this wallet.
    // ---------------------------------------------------------------------
    function registerFreelancer(string calldata name, string[] calldata skills)
        external
        notRegistered(msg.sender)
    {
        // can't register with no name - we check the byte length because
        // strings in solidity are basically byte arrays
        if (bytes(name).length == 0) revert EmptyName();

        // store the profile data against the caller's address
        freelancers[msg.sender] = Freelancer({
            name: name,
            skills: skills,
            exists: true
        });

        // also set their role so future role checks work
        roles[msg.sender] = Role.Freelancer;

        // tell the world this happened (frontend listens for this)
        emit FreelancerRegistered(msg.sender, name);
    }

    // ---------------------------------------------------------------------
    // registerClient
    // ---------------------------------------------------------------------
    // same idea as freelancer but for clients. simpler since they don't have
    // skills - just a name (usually a company or person).
    // ---------------------------------------------------------------------
    function registerClient(string calldata name)
        external
        notRegistered(msg.sender)
    {
        if (bytes(name).length == 0) revert EmptyName();

        clients[msg.sender] = Client({ name: name, exists: true });
        roles[msg.sender] = Role.Client;

        emit ClientRegistered(msg.sender, name);
    }

    // ---------------------------------------------------------------------
    // approveVerifier
    // ---------------------------------------------------------------------
    // verifiers can't just self-register like the other roles - that would
    // make endorsements meaningless (anyone could call themselves a uni).
    // instead, the contract owner has to approve each verifier individually.
    // this is the one centralisation point in the system, and it's intentional.
    // ---------------------------------------------------------------------
    function approveVerifier(address wallet, string calldata name)
        external
        onlyOwner                  // only the deployer can do this
        notRegistered(wallet)      // can't approve someone who's already got a role
    {
        // belt and braces - shouldn't happen but worth checking
        if (wallet == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();

        verifiers[wallet] = Verifier({ name: name, exists: true });
        roles[wallet] = Role.Verifier;

        emit VerifierApproved(wallet, name);
    }

    // ---------------------------------------------------------------------
    // Role checks (called by Job and Reputation contracts)
    // ---------------------------------------------------------------------
    // these are the functions Job and Reputation call to check whether a
    // given wallet has a specific role. they're how the other contracts
    // enforce access control without having to store their own copy of roles.

    function isFreelancer(address wallet) external view returns (bool) {
        return roles[wallet] == Role.Freelancer;
    }

    function isClient(address wallet) external view returns (bool) {
        return roles[wallet] == Role.Client;
    }

    function isVerifier(address wallet) external view returns (bool) {
        return roles[wallet] == Role.Verifier;
    }

    // returns the role as the enum value. mostly used by the frontend to
    // figure out which tabs/buttons to show after a user connects.
    function getRole(address wallet) external view returns (Role) {
        return roles[wallet];
    }

    // ---------------------------------------------------------------------
    // Profile getters
    // ---------------------------------------------------------------------
    // these let the frontend pull the actual profile info (name, skills etc)
    // for display purposes. we keep the underlying mappings private and
    // expose just what's needed.

    // returns a freelancer's name AND skills in one call. uses 'storage' for
    // efficiency - we're not copying the struct to memory, just reading from it.
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