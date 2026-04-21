"use client";

import type { ReactNode } from "react";

import { IconButton, Stack, Tooltip, Typography } from "@mui/material";

export type GlossyTransportVariant = "play" | "stop" | "utility";
export type GlossyTransportSize = "regular" | "compact";

const transportVariantStyles: Record<GlossyTransportVariant, { background: string; hoverBackground: string }> = {
  play: {
    background: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.2) 18%, transparent 26%), linear-gradient(180deg, #39cf6b 0%, #159742 100%)",
    hoverBackground: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.24) 18%, transparent 26%), linear-gradient(180deg, #49dd78 0%, #13843a 100%)"
  },
  stop: {
    background: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.2) 18%, transparent 26%), linear-gradient(180deg, #ff5757 0%, #c91f2f 100%)",
    hoverBackground: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.24) 18%, transparent 26%), linear-gradient(180deg, #ff6f6f 0%, #b71628 100%)"
  },
  utility: {
    background: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.2) 18%, transparent 26%), linear-gradient(180deg, #6a88ff 0%, #3450d6 100%)",
    hoverBackground: "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.24) 18%, transparent 26%), linear-gradient(180deg, #7b96ff 0%, #2d46bd 100%)"
  }
};

function buildTransportButtonSx(variant: GlossyTransportVariant, size: GlossyTransportSize) {
  const palette = transportVariantStyles[variant];
  const dimension = size === "compact" ? 48 : 62;
  const iconSize = size === "compact" ? 24 : 32;
  const ringInset = size === "compact" ? 2.5 : 3;
  return {
    position: "relative",
    width: dimension,
    height: dimension,
    border: "2px solid rgba(224, 232, 243, 0.96)",
    background: palette.background,
    color: "#fff",
    boxShadow: "0 10px 20px rgba(15, 23, 42, 0.18), inset 0 2px 0 rgba(255,255,255,0.92), inset 0 -10px 16px rgba(0,0,0,0.18)",
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
    "&::before": {
      content: '""',
      position: "absolute",
      inset: ringInset,
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.44)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.38)"
    },
    "&::after": {
      content: '""',
      position: "absolute",
      left: "18%",
      right: "18%",
      top: "12%",
      height: "28%",
      borderRadius: 999,
      background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0))",
      pointerEvents: "none"
    },
    "& .MuiSvgIcon-root": {
      fontSize: iconSize,
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.22))"
    },
    "&:hover": {
      transform: "translateY(-1px)",
      background: palette.hoverBackground,
      boxShadow: "0 14px 24px rgba(15, 23, 42, 0.2), inset 0 2px 0 rgba(255,255,255,0.94), inset 0 -10px 16px rgba(0,0,0,0.16)"
    },
    "&.Mui-disabled": {
      color: "rgba(255,255,255,0.74)",
      opacity: 0.72,
      filter: "grayscale(0.16)",
      boxShadow: "0 8px 16px rgba(15, 23, 42, 0.12), inset 0 2px 0 rgba(255,255,255,0.72), inset 0 -8px 14px rgba(0,0,0,0.12)"
    }
  };
}

type GlossyTransportButtonProps = {
  title: string;
  label: string;
  variant: GlossyTransportVariant;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: GlossyTransportSize;
};

export function GlossyTransportButton({
  title,
  label,
  variant,
  icon,
  onClick,
  disabled = false,
  size = "regular"
}: GlossyTransportButtonProps) {
  return (
    <Stack alignItems="center" spacing={size === "compact" ? 0.35 : 0.55}>
      <Tooltip title={title}>
        <span>
          <IconButton aria-label={title} onClick={onClick} disabled={disabled} sx={buildTransportButtonSx(variant, size)}>
            {icon}
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        variant="caption"
        sx={{
          fontSize: size === "compact" ? "0.63rem" : undefined,
          fontWeight: 800,
          letterSpacing: size === "compact" ? "0.05em" : "0.06em",
          textTransform: "uppercase",
          color: disabled ? "rgba(79, 98, 122, 0.58)" : "#48617f"
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}
