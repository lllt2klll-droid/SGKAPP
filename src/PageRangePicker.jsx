// ─── Page range picker (shared by chat / quiz / lesson tabs) ────────────────
import React from "react";
import { X } from "lucide-react";

export default function PageRangePicker({
  from,
  to,
  setFrom,
  setTo,
  total,
  currentBookPage,
}) {
  return (
    <div
      className="book-page-range"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.32rem",
        flexWrap: "wrap",
        padding: "0.38rem 0.5rem",
        border: "1px solid rgba(226,232,240,0.9)",
        borderRadius: 10,
        background: "linear-gradient(180deg, var(--surface) 0%, var(--surface-soft) 100%)",
        boxShadow: "0 1px 6px rgba(15,23,42,0.04)",
      }}
    >
      <span style={{ fontSize:"0.68rem", fontWeight:750, color:"var(--text-muted)", letterSpacing:"-0.01em" }}>📄 Trang:</span>
      <input
        type="number"
        min={1}
        max={total || 1}
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        placeholder={String(currentBookPage)}
        aria-label="Trang bắt đầu"
        style={{
          width: 52,
          padding: "0.32rem 0.4rem",
          border: "1px solid rgba(226,232,240,0.95)",
          borderRadius: 8,
          fontFamily: "inherit",
          fontSize: "0.74rem",
          fontWeight: 700,
          outline: "none",
          color: "var(--text-dark)",
          background: "var(--surface)",
          boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
          textAlign: "center",
        }}
      />
      <span style={{ fontSize:"0.72rem", color:"var(--text-muted)", fontWeight:800 }}>→</span>
      <input
        type="number"
        min={1}
        max={total || 1}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder={String(currentBookPage)}
        aria-label="Trang kết thúc"
        style={{
          width: 52,
          padding: "0.32rem 0.4rem",
          border: "1px solid rgba(226,232,240,0.95)",
          borderRadius: 8,
          fontFamily: "inherit",
          fontSize: "0.74rem",
          fontWeight: 700,
          outline: "none",
          color: "var(--text-dark)",
          background: "var(--surface)",
          boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
          textAlign: "center",
        }}
      />
      {(from || to) && (
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
          title="Bỏ chọn, chỉ dùng trang hiện tại"
          aria-label="Bỏ chọn khoảng trang"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            padding: "0.15rem",
          }}
        >
          <X size={13} />
        </button>
      )}
      <button
        className="btn btn-secondary btn-xs"
        onClick={() => {
          setFrom(String(currentBookPage));
          setTo(String(currentBookPage));
        }}
        title="Đặt về trang hiện tại"
        style={{ borderRadius: 999, fontSize:"0.68rem", fontWeight:750, padding:"0.22rem 0.5rem", border:"1px solid rgba(226,232,240,0.9)", background:"var(--surface)", color:"var(--text-dark)" }}
      >
        Hiện tại
      </button>
      <span style={{ fontSize:"0.62rem", fontWeight:700, color:"var(--text-mid)", marginLeft:"auto", background:"var(--surface-soft)", border:"1px solid rgba(226,232,240,0.9)", padding:"1px 6px", borderRadius:999 }}>≤ 7 trang</span>
    </div>
  );
}
