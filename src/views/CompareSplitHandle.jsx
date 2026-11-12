import React from "react";

export default function CompareSplitHandle({ ratio, onDragStart, onReset, setRatio }) {
  const onKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setRatio((current) => Math.max(25, current - 2));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setRatio((current) => Math.min(75, current + 2));
    } else if (event.key === "Home") {
      event.preventDefault();
      onReset();
    }
  };
  return (
    <div
      className="cmp-split-resizer-v2"
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="Kéo để đổi tỉ lệ 2 bên, double-click để cân bằng 50/50"
      role="separator"
      aria-orientation="vertical"
      aria-label="Điều chỉnh tỉ lệ 2 bên"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={ratio}
      tabIndex={0}
    >
      <span className="grip" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}
