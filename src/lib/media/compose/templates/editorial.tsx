import type { CreativeTemplate } from "../types";

/** Editorial: accent side-rail, kicker + headline up top on a dark band, logo + outline CTA at the foot. */
export const templateEditorial: CreativeTemplate = ({ brand, copy, dims, backgroundDataUrl, logoDataUrl }) => {
  const u = dims.width / 1080;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: dims.width,
        height: dims.height,
        backgroundColor: brand.dark,
        fontFamily: "Body",
        overflow: "hidden",
      }}
    >
      <img
        src={backgroundDataUrl}
        width={dims.width}
        height={dims.height}
        style={{ position: "absolute", top: 0, left: 0, width: dims.width, height: dims.height, objectFit: "cover" }}
      />
      {/* accent rail */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 16 * u, display: "flex", backgroundColor: brand.accent }} />
      {/* top band */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          paddingTop: 56 * u,
          paddingBottom: 64 * u,
          paddingLeft: 64 * u,
          paddingRight: 56 * u,
          background: `linear-gradient(180deg, ${brand.dark} 30%, rgba(15,17,21,0) 100%)`,
        }}
      >
        {copy.kicker ? (
          <div
            style={{
              display: "flex",
              color: brand.accent,
              fontFamily: "Heading",
              fontSize: 24 * u,
              letterSpacing: 3 * u,
              textTransform: "uppercase",
              marginBottom: 16 * u,
            }}
          >
            {copy.kicker}
          </div>
        ) : null}
        <div
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: brand.light,
            fontFamily: "Heading",
            fontSize: 70 * u,
            lineHeight: 1.06,
            letterSpacing: -1 * u,
          }}
        >
          {copy.headline}
        </div>
      </div>
      {/* bottom scrim */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: dims.height * 0.34,
          display: "flex",
          background: `linear-gradient(0deg, ${brand.dark} 8%, rgba(15,17,21,0) 100%)`,
        }}
      />
      {/* foot: logo + outline CTA */}
      <div
        style={{
          position: "absolute",
          left: 64 * u,
          right: 56 * u,
          bottom: 56 * u,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {logoDataUrl ? (
          <img src={logoDataUrl} style={{ width: 260 * u, height: 56 * u, objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: brand.light, fontFamily: "Heading", fontSize: 34 * u }}>{brand.displayName}</div>
        )}
        {copy.ctaLabel ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: brand.light,
              fontFamily: "Heading",
              fontSize: 28 * u,
              paddingTop: 16 * u,
              paddingBottom: 16 * u,
              paddingLeft: 28 * u,
              paddingRight: 28 * u,
              border: `${3 * u}px solid ${brand.light}`,
              borderRadius: 12 * u,
            }}
          >
            {copy.ctaLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
};
