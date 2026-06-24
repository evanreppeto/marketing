import type { CreativeTemplate } from "../types";

/** Bold: charcoal scrim, logo top-left, big headline + accent CTA pill on a bottom scrim. */
export const templateBold: CreativeTemplate = ({ brand, copy, dims, backgroundDataUrl, logoDataUrl }) => {
  const u = dims.width / 1080; // scale unit so 16:9 (1920w) scales up proportionally

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
      {/* background photo */}
      <img
        src={backgroundDataUrl}
        width={dims.width}
        height={dims.height}
        style={{ position: "absolute", top: 0, left: 0, width: dims.width, height: dims.height, objectFit: "cover" }}
      />
      {/* bottom scrim for legibility */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: dims.height * 0.62,
          display: "flex",
          background: `linear-gradient(0deg, ${brand.dark} 6%, rgba(15,17,21,0.55) 48%, rgba(15,17,21,0) 100%)`,
        }}
      />
      {/* logo or short-mark chip */}
      {logoDataUrl ? (
        <img
          src={logoDataUrl}
          style={{ position: "absolute", top: 56 * u, left: 56 * u, height: 72 * u, objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 56 * u,
            left: 56 * u,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 72 * u,
            paddingLeft: 22 * u,
            paddingRight: 22 * u,
            backgroundColor: brand.accent,
            color: brand.light,
            fontFamily: "Heading",
            fontSize: 34 * u,
            borderRadius: 14 * u,
          }}
        >
          {brand.shortMark}
        </div>
      )}
      {/* copy block */}
      <div
        style={{
          position: "absolute",
          left: 56 * u,
          right: 56 * u,
          bottom: 56 * u,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        {copy.kicker ? (
          <div
            style={{
              display: "flex",
              color: brand.accent,
              fontFamily: "Heading",
              fontSize: 26 * u,
              letterSpacing: 2 * u,
              textTransform: "uppercase",
              marginBottom: 18 * u,
            }}
          >
            {copy.kicker}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            color: brand.light,
            fontFamily: "Heading",
            fontSize: 78 * u,
            lineHeight: 1.05,
            letterSpacing: -1 * u,
            marginBottom: copy.ctaLabel ? 32 * u : 0,
          }}
        >
          {copy.headline}
        </div>
        {copy.ctaLabel ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: brand.accent,
              color: brand.light,
              fontFamily: "Heading",
              fontSize: 30 * u,
              paddingTop: 20 * u,
              paddingBottom: 20 * u,
              paddingLeft: 34 * u,
              paddingRight: 34 * u,
              borderRadius: 16 * u,
            }}
          >
            {copy.ctaLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
};
