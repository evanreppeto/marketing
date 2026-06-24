import type { CreativeTemplate } from "../types";

/** Minimal: solid brand-primary side panel with the headline; photo fills the rest. */
export const templateMinimal: CreativeTemplate = ({ brand, copy, dims, backgroundDataUrl, logoDataUrl }) => {
  const u = dims.width / 1080;
  const panelW = dims.width * 0.5;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: dims.width,
        height: dims.height,
        backgroundColor: brand.primary,
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
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: panelW,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          paddingTop: 64 * u,
          paddingBottom: 64 * u,
          paddingLeft: 64 * u,
          paddingRight: 64 * u,
          backgroundColor: brand.primary,
        }}
      >
        {logoDataUrl ? (
          <img src={logoDataUrl} style={{ width: 300 * u, height: 64 * u, objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: brand.light, fontFamily: "Heading", fontSize: 38 * u }}>{brand.displayName}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {copy.kicker ? (
            <div
              style={{
                display: "flex",
                color: brand.accent,
                fontFamily: "Heading",
                fontSize: 24 * u,
                letterSpacing: 3 * u,
                textTransform: "uppercase",
                marginBottom: 18 * u,
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
              fontSize: 64 * u,
              lineHeight: 1.1,
            }}
          >
            {copy.headline}
          </div>
          <div style={{ display: "flex", width: 64 * u, height: 4 * u, backgroundColor: brand.accent, marginTop: 28 * u, marginBottom: 28 * u }} />
          {copy.ctaLabel ? (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                backgroundColor: brand.accent,
                color: brand.primary,
                fontFamily: "Heading",
                fontSize: 28 * u,
                paddingTop: 18 * u,
                paddingBottom: 18 * u,
                paddingLeft: 30 * u,
                paddingRight: 30 * u,
                borderRadius: 10 * u,
              }}
            >
              {copy.ctaLabel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
