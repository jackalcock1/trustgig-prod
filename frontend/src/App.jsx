// This is the main App component - the top of our component tree.
// It handles connecting to MetaMask, figuring out what role the connected
// wallet has, and deciding which UI sections to show.

import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import { getContracts, getRoleLabel, ROLE_NONE } from "./contracts";
import RegistrationPanel from "./components/RegistrationPanel";

import "./App.css";

function App() {
  // Get all the wallet stuff from our custom hook
  const wallet = useWallet();

  // The role of the currently connected account (number from the enum in Registry.sol)
  // null while we haven't checked yet, or while waiting for the result
  const [currentRole, setCurrentRole] = useState(null);

  // Loading flag for the initial role check
  const [isCheckingRole, setIsCheckingRole] = useState(false);

  // Whenever the user's account changes, we need to look up what role they have
  // by calling Registry.getRole(theirAddress).
  useEffect(() => {
    // If they haven't connected, or they're on the wrong network, skip the check
    if (wallet.account === null || wallet.signer === null) {
      setCurrentRole(null);
      return;
    }

    if (wallet.isCorrectNetwork === false) {
      setCurrentRole(null);
      return;
    }

    // We use an async function inside useEffect because useEffect itself
    // can't be async directly (React quirk)
    async function fetchRole() {
      setIsCheckingRole(true);

      try {
        const contracts = getContracts(wallet.signer);
        const roleNumber = await contracts.registry.getRole(wallet.account);

        // The contract returns a BigInt, we convert to a regular Number
        // since we know roles are small integers
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
  }, [wallet.account, wallet.signer, wallet.isCorrectNetwork]);

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

        {wallet.account !== null && wallet.isCorrectNetwork === true && (
          <div className="role-sections">
            {/* If they aren't registered yet, show the registration panel */}
              {currentRole === ROLE_NONE && (
                <RegistrationPanel
                  signer={wallet.signer}
                  onRegistrationSuccess={function () {
                    // After successful registration, re-fetch the role.
                    // We do this by just resetting the state - the useEffect that watches
                    // wallet.account will pick it up.
                    setCurrentRole(null);
                    // Touch the state so the effect re-runs - bit of a hack but it works
                    // TODO: clean this up later
                    setTimeout(function () {
                      // Force re-fetch by faking an account change
                      if (wallet.account !== null && wallet.signer !== null) {
                        // Re-trigger the role fetch
                        window.location.reload();
                      }
                    }, 1000);
                  }}
                />
              )}

            {/* If they're already registered, we'll show role-specific actions */}
            {currentRole !== null && currentRole !== ROLE_NONE && (
              <div className="panel">
                <h2>Welcome back, {getRoleLabel(currentRole)}</h2>
                <p><em>(Role-specific actions coming next)</em></p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;