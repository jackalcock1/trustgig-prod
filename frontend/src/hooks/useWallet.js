// ---------------------------------------------------------------------
// src/hooks/useWallet.js
// ---------------------------------------------------------------------
// this is a "custom hook" that wraps up all the MetaMask connection
// logic in one place. any component that needs to know who's connected
// (or wants to ask them to connect) just calls useWallet() and gets back
// the current account address, an ethers signer, a connect button
// handler, and so on.
//
// quick refresher on hooks: in React, a "hook" is just a function that
// starts with "use" and uses React's built-in hooks (useState,
// useEffect) inside it. by putting all the MetaMask stuff in one hook,
// we don't have to repeat the same code in every component that needs
// wallet info.
//
// the tricky bits this hook handles:
//   - asking MetaMask to connect (only when the user clicks the button)
//   - keeping track of who's currently connected
//   - getting a fresh signer object when the user switches accounts
//   - reacting to network changes (e.g. they switch from Ganache to
//     mainnet by mistake)
//   - cleaning up event listeners properly when the component unmounts
// ---------------------------------------------------------------------

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CHAIN_ID } from "../contracts";

export function useWallet() {
  // ---------------------------------------------------------------------
  // State variables
  // ---------------------------------------------------------------------
  // each useState gives us a value plus a setter function. React re-renders
  // any component using this hook whenever one of these changes.

  // the wallet address of whoever's currently connected. null while we're
  // not connected yet - the UI shows the Connect button in that case.
  const [account, setAccount] = useState(null);

  // ethers signer - this is what we pass to getContracts() to make
  // contracts that can send transactions. it's kind of like a "logged-in
  // session" object for the current account.
  const [signer, setSigner] = useState(null);

  // the chain ID MetaMask is currently on. lets us warn if they're on the
  // wrong network (e.g. accidentally pointed at mainnet instead of Ganache).
  const [chainId, setChainId] = useState(null);

  // true while the MetaMask popup is open. used to disable the Connect
  // button so people don't click it five times in a row.
  const [isConnecting, setIsConnecting] = useState(false);

  // any error message we want to show in the UI - e.g. if MetaMask isn't
  // installed, or the user rejected the connection prompt.
  const [errorMessage, setErrorMessage] = useState(null);

  // ---------------------------------------------------------------------
  // connectWallet
  // ---------------------------------------------------------------------
  // this is the function the Connect Wallet button calls. it pops up the
  // MetaMask "do you want to connect?" prompt and, if the user approves,
  // grabs their account + signer + network info and stuffs it all into
  // state.
  // ---------------------------------------------------------------------
  async function connectWallet() {
    // first check that MetaMask is actually installed. when the extension
    // is installed, it injects a `window.ethereum` object into the page.
    // if it's not there, we can't do anything.
    if (typeof window.ethereum === "undefined") {
      setErrorMessage("MetaMask is not installed. Please install it to use this app.");
      return;
    }

    // flip the loading flag and clear any old error before we start
    setIsConnecting(true);
    setErrorMessage(null);

    try {
      // wrap MetaMask's raw window.ethereum in ethers' BrowserProvider.
      // this lets us use the nice ethers API instead of raw JSON-RPC.
      const provider = new ethers.BrowserProvider(window.ethereum);

      // this is the bit that actually shows the MetaMask popup asking
      // the user to connect. it resolves with an array of approved
      // account addresses. usually just one (whichever they had selected).
      const accounts = await provider.send("eth_requestAccounts", []);

      // grab a signer for the connected account. this is what lets us
      // send transactions later.
      const newSigner = await provider.getSigner();

      // check what network they're on. network.chainId comes back as a
      // BigInt for some reason so we cast it to a regular Number.
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);

      // stash everything we just grabbed into state. React will trigger
      // a re-render and the UI will update accordingly.
      setAccount(accounts[0]);
      setSigner(newSigner);
      setChainId(currentChainId);

      // if they connected but they're on the wrong network, warn them.
      // we don't block - they can fix it in MetaMask without disconnecting.
      if (currentChainId !== CHAIN_ID) {
        setErrorMessage(
          "Wrong network. Please switch MetaMask to the Ganache network (chain ID " + CHAIN_ID + ")."
        );
      }
    } catch (err) {
      // most common error here is the user clicking "Reject" on the
      // MetaMask popup. ethers also throws if MetaMask is locked.
      // either way we log it and show a generic message.
      console.error("Failed to connect wallet:", err);
      setErrorMessage("Failed to connect wallet. " + (err.message || ""));
    } finally {
      // always reset the loading flag even if something blew up
      setIsConnecting(false);
    }
  }

  // ---------------------------------------------------------------------
  // useEffect: MetaMask event listeners
  // ---------------------------------------------------------------------
  // this useEffect runs once when the component first mounts. it sets up
  // listeners for two things MetaMask can do at any time:
  //   1. user switches to a different account in the MetaMask popup
  //   2. user switches to a different network
  //
  // without these listeners the app would still show the old account/network
  // info until the user manually refreshed, which would be rubbish UX.
  // ---------------------------------------------------------------------
  useEffect(() => {
    // if MetaMask isn't installed there's nothing to listen to
    if (typeof window.ethereum === "undefined") {
      return;
    }

    // -------------------------------------------------------------------
    // handleAccountsChanged
    // -------------------------------------------------------------------
    // MetaMask calls this whenever the user picks a different account in
    // their extension (or disconnects everything). the new account list
    // gets passed in as an array of addresses.
    // -------------------------------------------------------------------
    function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        // they disconnected all accounts - clear our state so the UI
        // goes back to showing the Connect button
        setAccount(null);
        setSigner(null);
      } else {
        // they switched to a different account - update the address and
        // grab a fresh signer for the new account. signers are tied to a
        // specific account so the old one wouldn't work anymore.
        setAccount(accounts[0]);
        const provider = new ethers.BrowserProvider(window.ethereum);
        provider.getSigner().then(function (newSigner) {
          setSigner(newSigner);
        });
      }
    }

    // -------------------------------------------------------------------
    // handleChainChanged
    // -------------------------------------------------------------------
    // called when the user switches network in MetaMask. we update our
    // tracked chain ID and warn if they're on the wrong one.
    // -------------------------------------------------------------------
    function handleChainChanged(newChainIdHex) {
      // MetaMask passes the chain ID as a hex string like "0x539".
      // parseInt with base 16 turns it into a regular number we can compare.
      const newChainId = parseInt(newChainIdHex, 16);
      setChainId(newChainId);

      // show or clear the wrong-network warning depending on where they are
      if (newChainId !== CHAIN_ID) {
        setErrorMessage(
          "Wrong network. Please switch MetaMask to the Ganache network (chain ID " + CHAIN_ID + ")."
        );
      } else {
        setErrorMessage(null);
      }
    }

    // register the listeners with MetaMask
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // -------------------------------------------------------------------
    // cleanup
    // -------------------------------------------------------------------
    // React calls this when the component using the hook unmounts. we
    // remove the listeners we registered above so they don't keep firing
    // on a dead component (which would cause memory leaks and probably
    // some weird bugs).
    // -------------------------------------------------------------------
    return function cleanup() {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []); // empty dependency array means this useEffect runs ONCE on mount

  // ---------------------------------------------------------------------
  // Return value
  // ---------------------------------------------------------------------
  // this is what whoever calls useWallet() gets back. we wrap everything
  // up in a plain object so consumers can destructure just the bits they
  // need, e.g. const { account, signer } = useWallet().
  // ---------------------------------------------------------------------
  return {
    account: account,
    signer: signer,
    chainId: chainId,
    isConnecting: isConnecting,
    errorMessage: errorMessage,
    connectWallet: connectWallet,

    // little derived value - true when we're on the right chain. lets
    // components check this without having to import CHAIN_ID themselves.
    isCorrectNetwork: chainId === CHAIN_ID,
  };
}