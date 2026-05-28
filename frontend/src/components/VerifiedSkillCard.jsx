// shows a single skill endorsement as a card, with the verifier's logo,
// branded top border, name, and the skill that was endorsed.
//
// if we don't have display info for the verifier in our lookup table
// (e.g. the assessors approve a new verifier on the spot during the
// demo), we fall back to a generic card with no logo and a default
// border colour. so it still looks reasonable.

import { getVerifierInfo } from "../contracts";

function VerifiedSkillCard(props) {
  const { skill, verifierAddress, timestamp } = props;

  // grab the display info from the lookup table, or null if we don't know
  // this verifier
  const verifierInfo = getVerifierInfo(verifierAddress);

  // format the timestamp into something readable
  const date = new Date(timestamp * 1000);
  const formattedDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // shorten the address for the fallback display
  function shortenAddress(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // use the verifier's brand colour for the top border if we know them,
  // otherwise fall back to our default blue
  const topBorderColour = verifierInfo ? verifierInfo.brandColour : "#093BFF";

  return (
    <div
      className="verified-skill-card"
      style={{ borderTopColor: topBorderColour }}
    >
      <div className="verified-skill-card-top">
        {verifierInfo ? (
          <img
            src={verifierInfo.logo}
            alt={verifierInfo.fullName}
            className="verified-skill-logo"
          />
        ) : (
          // generic placeholder when we don't have a logo for this verifier.
          // uses the first letter of the address as a stand-in.
          <div className="verified-skill-logo-fallback">
            {verifierAddress ? verifierAddress.slice(2, 3).toUpperCase() : "?"}
          </div>
        )}
        <div className="verified-skill-card-headings">
          <h4 className="verified-skill-name">{skill}</h4>
          <p className="verified-skill-verifier-short">
            {verifierInfo ? verifierInfo.shortName : shortenAddress(verifierAddress)}
          </p>
        </div>
      </div>

      {verifierInfo && (
        <p className="verified-skill-description">{verifierInfo.fullName}</p>
      )}

      {verifierInfo && (
        <p className="verified-skill-blurb">{verifierInfo.description}</p>
      )}

      <p className="verified-skill-meta">Endorsed {formattedDate}</p>
    </div>
  );
}

export default VerifiedSkillCard;