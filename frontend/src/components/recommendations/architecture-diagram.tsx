"use client";

import { Card, CardContent, Stack, Typography } from "@mui/material";

import type { ArchitectureRecommendation } from "@/lib/types";

function BoxNode({
  title,
  subtitle,
  x,
  y,
  width,
  height,
  fill
}: {
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="18" fill={fill} stroke="rgba(19, 32, 28, 0.12)" />
      <text x={x + 18} y={y + 34} fontSize="17" fontWeight="700" fill="#13201c">
        {title}
      </text>
      <text x={x + 18} y={y + 60} fontSize="13" fill="#586661">
        {subtitle}
      </text>
    </g>
  );
}

export function ArchitectureDiagram({
  recommendation
}: {
  recommendation: ArchitectureRecommendation;
}) {
  const [compute, database, storage] = recommendation.services;

  return (
    <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
      <CardContent>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Typography variant="h6">Architecture Outline</Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            A simplified view of the recommended service topology for {recommendation.provider.toUpperCase()}.
          </Typography>
        </Stack>
        <svg viewBox="0 0 920 360" width="100%" role="img" aria-label="Architecture diagram">
          <defs>
            <marker
              id="arrow"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill="#0c6b58" />
            </marker>
          </defs>

          <rect x="18" y="18" width="884" height="324" rx="28" fill="#f7faf6" stroke="rgba(19, 32, 28, 0.08)" />

          <BoxNode
            title="Users"
            subtitle="Business users and clients"
            x={46}
            y={132}
            width={180}
            height={92}
            fill="#e4f0ff"
          />
          <BoxNode
            title={compute?.name ?? "Compute tier"}
            subtitle={compute?.purpose ?? "Application layer"}
            x={320}
            y={62}
            width={260}
            height={92}
            fill="#d8efe7"
          />
          <BoxNode
            title={database?.name ?? "Database tier"}
            subtitle={database?.purpose ?? "Data layer"}
            x={320}
            y={204}
            width={260}
            height={92}
            fill="#fff1d6"
          />
          <BoxNode
            title={storage?.name ?? "Storage tier"}
            subtitle={storage?.purpose ?? "Object and backup storage"}
            x={672}
            y={132}
            width={200}
            height={92}
            fill="#f1e5fb"
          />

          <line x1="226" y1="178" x2="320" y2="108" stroke="#0c6b58" strokeWidth="4" markerEnd="url(#arrow)" />
          <line x1="226" y1="178" x2="320" y2="250" stroke="#0c6b58" strokeWidth="4" markerEnd="url(#arrow)" />
          <line x1="580" y1="108" x2="672" y2="178" stroke="#0c6b58" strokeWidth="4" markerEnd="url(#arrow)" />
          <line x1="580" y1="250" x2="672" y2="178" stroke="#0c6b58" strokeWidth="4" markerEnd="url(#arrow)" />
        </svg>
      </CardContent>
    </Card>
  );
}
