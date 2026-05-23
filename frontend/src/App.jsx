// This is the main App component - the top of our component tree.
// It handles connecting to MetaMask, figuring out what role the connected
// wallet has, and deciding which UI sections to show.

import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import {
  getContracts,
  getRoleLabel,
  ROLE_NONE,
  ROLE_FREELANCER,
  ROLE_CLIENT,
  ROLE_VERIFIER,
} from "./contracts";

import RegistrationPanel from "./components/RegistrationPanel";
import BrowseJobsView from "./components/BrowseJobsView";
import MyJobsView from "./components/MyJobsView";
import EndorseSkillPanel from "./components/EndorseSkillPanel";
import ReputationLookup from "./components/ReputationLookup";

import "./App.css";

function App() {
  // Get all the wallet stuff from our custom hook
  const wallet = useWallet();

  // The role of the currently connected account
  const [currentRole, setCurrentRole] = useState(null);

  // Loading flag for the initial role check
  const [isCheckingRole, setIsCheckingRole] = useState(false);

  // A counter we bump whenever we want child components to re-fetch their data.
  // Components that need to refresh after a transaction take this as a prop
  // and use it in their useEffect dependency arrays.
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Which tab is currently active in the main view.
  // We're using a simple string state instead of react-router because the
  // app is small enough that we don't need real routing.
  const [activeTab, setActiveTab] = useState("browse");

  // Function we can pass down to child components so they can trigger a
  // global refresh after they do a transaction
  function triggerRefresh() {
    setRefreshCounter(refreshCounter + 1);
  }

  // Whenever the user's account changes (or we manually trigger a refresh),
  // re-look up their role
  useEffect(() => {
    if (wallet.account === null || wallet.signer === null) {
      setCurrentRole(null);
      return;
    }

    if (wallet.isCorrectNetwork === false) {
      setCurrentRole(null);
      return;
    }

    async function fetchRole() {
      setIsCheckingRole(true);

      try {
        const contracts = getContracts(wallet.signer);
        const roleNumber = await contracts.registry.getRole(wallet.account);
        const roleAsNumber = Number(roleNumber);
        setCurrentRole(roleAsNumber);
      } catch (err) {
        console.error("Failed to fetch role:", err);
        setCurrentRole(null);
      } finally {
        setIsCheckingRole(false);
      }
    }

    fetchRole();
  }, [wallet.account, wallet.signer, wallet.isCorrectNetwork, refreshCounter]);

  // ----- Render helpers -----

  // Decide which tabs to show based on the connected user's role.
  // Everyone gets "browse" and "lookup", but role-specific tabs only appear
  // for users with that role.
  function renderTabs() {
    const tabs = [];

    tabs.push({ id: "browse", label: "Browse Jobs" });

    if (currentRole === ROLE_FREELANCER || currentRole === ROLE_CLIENT) {
      tabs.push({ id: "myjobs", label: "My Jobs" });
    }

    if (currentRole === ROLE_VERIFIER) {
      tabs.push({ id: "endorse", label: "Endorse Skills" });
    }

    tabs.push({ id: "lookup", label: "Look Up Reputation" });

    return (
      <div className="tab-bar">
        {tabs.map(function (tab) {
          return (
            <button
              key={tab.id}
              onClick={function () {
                setActiveTab(tab.id);
              }}
              className={activeTab === tab.id ? "tab tab-active" : "tab"}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Decide which main view to show based on the active tab
  function renderActiveView() {
    if (activeTab === "browse") {
      return (
        <BrowseJobsView
          signer={wallet.signer}
          account={wallet.account}
          currentRole={currentRole}
          refreshCounter={refreshCounter}
          onActionComplete={triggerRefresh}
        />
      );
    } else if (activeTab === "myjobs") {
      return (
        <MyJobsView
          signer={wallet.signer}
          account={wallet.account}
          currentRole={currentRole}
          refreshCounter={refreshCounter}
          onActionComplete={triggerRefresh}
        />
      );
    } else if (activeTab === "endorse") {
      return (
        <EndorseSkillPanel
          signer={wallet.signer}
          onActionComplete={triggerRefresh}
        />
      );
    } else if (activeTab === "lookup") {
      return <ReputationLookup signer={wallet.signer} />;
    }

    return null;
  }

  // ----- Render -----

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>TrustGig</h1>
        <p className="tagline">Portable freelancer reputation on the blockchain</p>

        <div className="wallet-section">
          {wallet.account === null ? (
            <button
              onClick={wallet.connectWallet}
              disabled={wallet.isConnecting}
              className="connect-button"
            >
              {wallet.isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : (
            <div className="wallet-info">
              <p>
                <strong>Connected:</strong> {wallet.account}
              </p>
              <p>
                <strong>Role:</strong>{" "}
                {isCheckingRole
                  ? "Checking..."
                  : currentRole === null
                  ? "Unknown"
                  : getRoleLabel(currentRole)}
              </p>
            </div>
          )}

          {wallet.errorMessage !== null && (
            <p className="error-message">{wallet.errorMessage}</p>
          )}
        </div>
      </header>

      <main className="app-main">
        {wallet.account === null && (
          <div className="welcome-message">
            <h2>Welcome</h2>
            <p>
              TrustGig is a decentralised reputation system for freelancers and
              the platforms they work on. Your reviews and skill endorsements
              live on the blockchain, not on any single platform - so you can
              take your reputation with you anywhere.
            </p>
            <p>Connect your MetaMask wallet to get started.</p>
          </div>
        )}

        {wallet.account !== null && wallet.isCorrectNetwork === false && (
          <div className="wrong-network-warning">
            <p>
              You're connected, but on the wrong network. Please switch
              MetaMask to the Ganache network (chain ID 1337) to use this app.
            </p>
          </div>
        )}

        {wallet.account !== null &&
          wallet.isCorrectNetwork === true &&
          currentRole === ROLE_NONE && (
            <RegistrationPanel
              signer={wallet.signer}
              onRegistrationSuccess={triggerRefresh}
            />
          )}

        {wallet.account !== null &&
          wallet.isCorrectNetwork === true &&
          currentRole !== null &&
          currentRole !== ROLE_NONE && (
            <>
              {renderTabs()}
              {renderActiveView()}
            </>
          )}
      </main>
    </div>
  );
}

export default App;