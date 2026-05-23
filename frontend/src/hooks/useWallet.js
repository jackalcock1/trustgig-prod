// This is a custom React hook for managing the MetaMask connection.
// "Custom hook" just means a function that uses React's built-in hooks
// (like useState and useEffect) and returns some state we can use in components.
//
// The idea is that any component in our app can call useWallet() and get
// back the current account, signer, etc. without having to deal with
// MetaMask's quirks directly.

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CHAIN_ID } from "../contracts";

export function useWallet() {
  // The user's currently selected account address (e.g. "0x123...")
  // null means they haven't connected yet
  const [account, setAccount] = useState(null);

  // The ethers.js "signer" object - this is what we use to send transactions
  // null until they connect
  const [signer, setSigner] = useState(null);

  // The chain ID MetaMask is currently on. We use this to check they're on
  // Ganache (chain ID 1337) and not e.g. Ethereum mainnet by accident.
  const [chainId, setChainId] = useState(null);

  // A flag for showing a loading spinner while the connection is happening
  const [isConnecting, setIsConnecting] = useState(false);

  // Any error message we want to show to the user (e.g. "no MetaMask installed")
  const [errorMessage, setErrorMessage] = useState(null);

  // This function actually triggers the MetaMask popup asking the user to connect.
  // It only runs when the user clicks the "Connect Wallet" button.
  async function connectWallet() {
    // First check if MetaMask is even installed. If it is, window.ethereum
    // will be defined by the extension when the page loads.
    if (typeof window.ethereum === "undefined") {
      setErrorMessage("MetaMask is not installed. Please install it to use this app.");
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);

    try {
      // ethers.BrowserProvider wraps window.ethereum (MetaMask) so we can
      // use ethers.js methods instead of raw RPC calls
      const provider = new ethers.BrowserProvider(window.ethereum);

      // This is what actually pops up the MetaMask "Connect" prompt.
      // It returns an array of accounts the user approved.
      const accounts = await provider.send("eth_requestAccounts", []);

      // Get the signer for the first (currently selected) account
      const newSigner = await provider.getSigner();

      // Get the network info so we can check the chain ID
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);

      setAccount(accounts[0]);
      setSigner(newSigner);
      setChainId(currentChainId);

      // Warn if they're on the wrong network. We don't block them, just show
      // a message - they can switch in MetaMask.
      if (currentChainId !== CHAIN_ID) {
        setErrorMessage(
          "Wrong network. Please switch MetaMask to the Ganache network (chain ID " + CHAIN_ID + ")."
        );
      }
    } catch (err) {
      // The most common error here is the user clicking "Reject" on the MetaMask popup
      console.error("Failed to connect wallet:", err);
      setErrorMessage("Failed to connect wallet. " + (err.message || ""));
    } finally {
      setIsConnecting(false);
    }
  }

  // This useEffect runs once when the component first mounts. It sets up
  // listeners so that if the user changes accounts or networks in MetaMask,
  // our app updates accordingly.
  useEffect(() => {
    if (typeof window.ethereum === "undefined") {
      return;
    }

    // Called by MetaMask when the user switches accounts in the extension
    function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        // User disconnected all accounts
        setAccount(null);
        setSigner(null);
      } else {
        setAccount(accounts[0]);
        // We need to get a new signer for the new account
        const provider = new ethers.BrowserProvider(window.ethereum);
        provider.getSigner().then(function (newSigner) {
          setSigner(newSigner);
        });
      }
    }

    // Called by MetaMask when the user switches networks
    function handleChainChanged(newChainIdHex) {
      // MetaMask gives us the chain ID as a hex string like "0x539"
      // We convert to a regular number for easier comparison
      const newChainId = parseInt(newChainIdHex, 16);
      setChainId(newChainId);

      if (newChainId !== CHAIN_ID) {
        setErrorMessage(
          "Wrong network. Please switch MetaMask to the Ganache network (chain ID " + CHAIN_ID + ")."
        );
      } else {
        setErrorMessage(null);
      }
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // Cleanup function - React calls this when the component unmounts.
    // We remove the listeners so they don't keep firing on a dead component.
    return function cleanup() {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []); // empty dependency array = only run once on mount

  // Everything the hook gives back to whoever calls it
  return {
    account: account,
    signer: signer,
    chainId: chainId,
    isConnecting: isConnecting,
    errorMessage: errorMessage,
    connectWallet: connectWallet,
    isCorrectNetwork: chainId === CHAIN_ID,
  };
}