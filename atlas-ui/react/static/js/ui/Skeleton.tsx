// ui/Skeleton.tsx — static placeholder while a read is in flight.
// Deliberately not animated: the P4 motion budget counts looping animations and a
// loading box is not a reason to spend one.

import React from "react";

export interface SkeletonProps {
  rows?: number;
  height?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ rows = 3, height = 18 }) => (
  <div aria-hidden style={{ display: "grid", gap: "var(--atlas-2)", width: "100%" }}>
    {Array.from({ length: rows }, (_, index) => (
      <div
        key={index}
        style={{
          height,
          borderRadius: 0,
          background: index % 2 === 0 ? "var(--atlas-plate-2)" : "var(--atlas-plate)",
          border: "1px solid var(--atlas-line)",
        }}
      />
    ))}
  </div>
);

export default Skeleton;
