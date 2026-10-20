// ── Bộ sưu tập trích đoạn nghiên cứu (gom theo chủ đề) ─────────────
import React, { useMemo, useState, useEffect } from "react";
import {
  Scissors,
  Plus,
  Trash2,
  FileText,
  Download,
  BookOpen,
  Pencil,
  Check,
  X,
  Eye,
  Lightbulb,
} from "lucide-react";
import DataTable from "./DataTable";
import {
  getCollections,
  getClips,
  addCollection,
  deleteCollection,
  renameCollection,
  updateClip,
  deleteClip,
  moveClip,
  formatRef,
  getRefForBook,
  chapterAt,
} from "./researchDB";
import { createIdea } from "./personalDB";
import { exportWord, exportTxt, escapeHtml, nl2br } from "./exportDoc";
import SampleButton from "./SampleButton";
import { fillSampleClips } from "./sampleData";

export default function CollectionsView({ books, onOpenBook, onNavigate }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => { try { setTick(t=>t+1); } catch (e) { console.warn("[CollectionsView] tick failed", e); } }; window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [selId, setSelId] = useState(null);

  // Chuẩn hoá page trích dẫn về PDF page để mở đúng trang sách được trích
  const getClipPdfPage = (clip, book) => {
    const raw = Number(clip.page) || 1;
    if (clip.pdfPage) return Math.max(1, Number(clip.pdfPage) || 1);
    if (!book) return raw;
    // Ưu tiên tra mục lục: nếu chapter trùng với TOC item có page == raw → raw là PDF; nếu page == raw+1 → raw là bookPage
    if (clip.chapter) {
      try {
        const tb = findTocBook(book);
        if (tb && Array.isArray(tb.items)) {
          const hit = tb.items.find((it) => {
            const t = String(it.title || "").trim();
            const c = String(clip.chapter || "").trim();
            return t && c && (t === c || c.includes(t) || t.includes(c));
          });
          if (hit) {
            const tocPdf = Number(hit.pdfPage ?? hit.page);
            if (tocPdf === raw) return raw; // đã là PDF
            if (tocPdf === raw + 1) return raw + 1; // raw là bookPage → chuyển PDF
          }
        }
      } catch (e) { console.warn("[CollectionsView] findTocBook failed", e); }
      // Fallback chapterAt check
      try {
        const chAtRaw = chapterAt(book, raw);
        const chAtMinus1 = chapterAt(book, Math.max(1, raw - 1));
        if (chAtRaw === clip.chapter && chAtMinus1 !== clip.chapter) return raw + 1;
        if (chAtMinus1 === clip.chapter && chAtRaw !== clip.chapter) return raw;
      } catch (e) { console.warn("[CollectionsView] chapterAt failed", e); }
    }
    // Không có chapter hoặc không tra được → giữ nguyên raw (coi là PDF) để không phá clip scan đúng
    return raw;
  };
  const getClipBookPage = (clip, book) => {
    const pdf = getClipPdfPage(clip, book);
    return Math.max(1, pdf - 1);
  };
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingClip, setEditingClip] = useState(null);
  const [editText, setEditText] = useState("");
  const [editingColl, setEditingColl] = useState(null);
  const [collName, setCollName] = useState("");
  const [collDesc, setCollDesc] = useState("");
  const [expanded, setExpanded] = useState({});

  const collections = getCollections();
  const [clips, setClips] = useState([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  const byFile = useMemo(
    () => new Map(books.map((b) => [b.filename, b])),
    [books],
  );

  const selected = collections.find((c) => c.id === selId) || null;
  const selClips = useMemo(
    () =>
      selected
        ? clips
            .filter((c) => c.collId === selected.id)
            .sort((a, b) => b.at - a.at)
        : [],
    [selected, clips],
  );

  const loadClips = async () => {
    setClipsLoading(true);

    try {
      const result = await getClips();
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.error('Failed to load clips:', err);
      return [];
    } finally {
      setClipsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const result = await getClips();
        if (cancelled) return;
        setClips(Array.isArray(result) ? result : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load clips:', err);
        setClips([]);
      } finally {
        if (!cancelled) {
          setClipsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const createColl = () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const c = addCollection(name, newDesc);
      setSelId(c.id);
      setCreating(false);
      setNewName("");
      setNewDesc("");
    } catch (err) {
      console.error('Failed to create collection:', err);
      alert('Không thể tạo bộ sưu tập: bộ nhớ đầy. Hãy xóa bớt dữ liệu hoặc thử lại.');
    }
  };

  const exportCollWord = () => {
    if (!selected) return;
    const blocks = selClips.map((c) => {
      const book = byFile.get(c.file);
      const ref = book ? getRefForBook(book) : null;
      const cite = ref ? formatRef(ref) : c.bookTitle || c.file;
      const bp = getClipBookPage(c, book);
      return `<h2>${escapeHtml(c.chapter || "Trích đoạn")} (tr. ${bp})</h2><blockquote>${nl2br(c.text)}</blockquote><small>Nguồn: ${escapeHtml(cite)}</small>`;
    });
    exportWord(
      `Bộ sưu tập — ${selected.name}`,
      `<h1>Bộ sưu tập: ${escapeHtml(selected.name)}</h1><div class="meta">${selected.desc ? nl2br(selected.desc) : `${selClips.length} trích đoạn`} • Xuất ${new Date().toLocaleString("vi-VN")}</div>` +
        blocks.join("<hr>"),
    );
  };

  const exportCollTxt = () => {
    if (!selected) return;
    const lines = [
      `BỘ SƯU TẬP: ${selected.name}`,
      selected.desc ? `Mô tả: ${selected.desc}` : "",
      `Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
      "",
    ];
    selClips.forEach((c) => {
      const book = byFile.get(c.file);
      const ref = book ? getRefForBook(book) : null;
      const bp = getClipBookPage(c, book);
      lines.push(
        `◾ [${c.chapter || "Trích đoạn"} — tr. ${bp}]`,
      );
      lines.push(c.text.replace(/\n/g, "\n  "));
      if (c.grade)
        lines.push(
          `  Nguồn: ${c.bookTitle} (Lớp ${c.grade})${ref ? ` — ${formatRef(ref)}` : ""}`,
        );
      lines.push("");
    });
    exportTxt(`Bộ sưu tập - ${selected.name}`, lines.join("\n"));
  };

  // ── Enriched collections for DataTable: count, first book, updated ──
  const collectionsData = useMemo(() => {
    return collections.map((c) => {
      const cnt = clips.filter((cl) => cl.collId === c.id).length;
      const first = clips.find((cl) => cl.collId === c.id);
      return {
        ...c,
        _count: cnt,
        _book: first ? first.bookTitle || first.file : "—",
        _updated: c.at ? new Date(c.at).toLocaleDateString("vi-VN") : "—",
      };
    });
  }, [collections, clips]);

  const collectionColumns = useMemo(
    () => [
      {
        key: "name",
        label: "Bộ sưu tập",
        sortable: true,
        render: (v, row) => (
          <div className="ui-s-39fbdf">
            <div style={{ fontWeight: 750, lineHeight: 1.3 }}>{row.name}</div>
            {row.desc ? (
              <div className="panel-hint ui-s-12fecf"
                title={row.desc}
              >
                {row.desc}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: "_count",
        label: "Số trích đoạn",
        width: "118px",
        align: "center",
        sortable: true,
        render: (v) => <span className="sn-count">{v}</span>,
      },
      {
        key: "_book",
        label: "Sách",
        width: "160px",
        hideOnMobile: true,
        render: (v) => (
          <span className="cell-clamp ui-s-b14270"
            title={v}
          >
            {v}
          </span>
        ),
      },
      {
        key: "_updated",
        label: "Cập nhật",
        width: "110px",
        hideOnMobile: true,
        render: (v) => <span className="ui-s-38c683">{v}</span>,
      },
      {
        key: "_actions",
        label: "Thao tác",
        width: "130px",
        align: "right",
        render: (_, row) => (
          <span className="data-table-actions">
            <button
              className="btn btn-secondary btn-xs"
              title="Xem trích đoạn"
              aria-label="Xem trích đoạn"
              onClick={(e) => {
                e.stopPropagation();
                setSelId(row.id);
              }}
            >
              <Eye size={12} />
            </button>
            <button
              className="btn btn-secondary btn-xs"
              title="Sửa tên / mô tả"
              aria-label="Sửa"
              onClick={(e) => {
                e.stopPropagation();
                setSelId(row.id);
                setEditingColl(row.id);
                setCollName(row.name);
                setCollDesc(row.desc || "");
              }}
            >
              <Pencil size={12} />
            </button>
            <button
              className="btn btn-secondary btn-xs danger"
              title="Xóa bộ sưu tập"
              aria-label="Xóa"
              onClick={async (e) => {
                e.stopPropagation();
                if (confirm(`Xóa bộ sưu tập "${row.name}" và mọi trích đoạn trong đó?`)) {
                  try {
                    await deleteCollection(row.id);
                    if (selId === row.id) setSelId(null);
                    await loadClips();
                    refresh();
                  } catch (err) {
                    console.error('Failed to delete collection:', err);
                    alert('Không thể xóa bộ sưu tập. Hãy thử lại.');
                  }
                }
              }}
            >
              <Trash2 size={12} />
            </button>
          </span>
        ),
      },
    ],
    [selId],
  );

  const clipColumns = useMemo(
    () => [
      {
        key: "page",
        label: "Trang",
        width: "88px",
        align: "center",
        sortable: true,
        render: (v, row) => {
          const book = byFile.get(row.file);
          const bp = getClipBookPage(row, book);
          return (
            <span className="gl-chip" title={row.chapter || ""}>
              tr. {bp}
            </span>
          );
        },
      },
      {
        key: "bookTitle",
        label: "Sách",
        width: "160px",
        hideOnMobile: false,
        render: (v, row) => (
          <span className="cell-clamp ui-s-b14270"
            title={`${v || row.file}${row.grade ? ` • Lớp ${row.grade}` : ""}`}
          >
            {v || row.file}
            {row.grade ? ` • L${row.grade}` : ""}
          </span>
        ),
      },
      {
        key: "text",
        label: "Trích đoạn",
        render: (v, row) => {
          if (editingClip === row.id) {
            return (
              <div className="ui-s-d00c81">
                <textarea
                  className="form-control"
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                />
                <div className="ui-s-d97675">
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={async () => {
                      updateClip(row.id, { text: editText.trim() });
                      setEditingClip(null);
                      await loadClips();
                      refresh();
                    }}
                  >
                    <Check size={13} /> Lưu
                  </button>
                  <button className="btn btn-secondary btn-xs" onClick={() => setEditingClip(null)}>
                    Hủy
                  </button>
                  <select className="sort-select ui-s-6b0b0a"
                    value={row.collId}
                    onChange={async (e) => {
                      moveClip(row.id, e.target.value);
                      await loadClips();
                      refresh();
                    }}
                    title="Chuyển sang bộ sưu tập khác"
                  >
                    {collections.map((co) => (
                      <option key={co.id} value={co.id}>
                        {co.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          }
          const isLong = (v || "").length > 120;
          const isExpanded = !!expanded[row.id];
          return (
            <div className="ui-s-c5cf47">
              <span
                className={isExpanded ? "" : "cell-clamp"}
                style={{ whiteSpace: isExpanded ? "pre-wrap" : undefined, fontSize: "0.84rem", lineHeight: 1.5 }}
                title={v}
              >
                “{v}”
              </span>
              {isLong && (
                <button className="btn-link-reset ui-s-3cc46e"
                  onClick={() => setExpanded((s) => ({ ...s, [row.id]: !s[row.id] }))}
                >
                  {isExpanded ? "Thu gọn" : "Xem thêm"}
                </button>
              )}
            </div>
          );
        },
      },
      {
        key: "chapter",
        label: "Tag",
        width: "130px",
        hideOnMobile: true,
        render: (v) =>
          v ? (
            <span className="tag-pill tag-pill-muted ui-s-c7de57" title={v}>
              {v.slice(0, 28)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        key: "_note",
        label: "Ghi chú",
        width: "120px",
        hideOnMobile: true,
        render: (_, row) => {
          const note = row.grade ? `Lớp ${row.grade}` : "";
          const subj = row.subject || "";
          const txt = [note, subj].filter(Boolean).join(" • ");
          return txt ? (
            <span className="ui-s-7b48d3">{txt}</span>
          ) : (
            <span className="text-muted">—</span>
          );
        },
      },
      {
        key: "_actions",
        label: "Thao tác",
        width: "190px",
        align: "right",
        render: (_, row) => {
          const book = byFile.get(row.file);
          const pdfPage = getClipPdfPage(row, book);
          const bpForTitle = getClipBookPage(row, book);
          return (
            <span className="data-table-actions">
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => book && onOpenBook(book, pdfPage)}
                title={`Mở trang ${bpForTitle} (PDF ${pdfPage})`}
                aria-label="Mở trang sách"
              >
                <BookOpen size={12} />
              </button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  try {
                    const idea = createIdea({
                      title: `Ý tưởng từ ${row.chapter || "trích đoạn"} — tr. ${bpForTitle}`,
                      description: row.text,
                      subject: row.subject,
                      grade: row.grade,
                      sourceClipId: row.id,
                      sourceFile: row.file,
                    });
                    if (idea) alert(`Đã tạo ý tưởng: "${idea.title}" (xem trong Ý tưởng dạy học)`);
                  } catch (e) { console.warn("[CollectionsView] createIdea failed", e); }
                }}
                title="Tạo ý tưởng từ trích đoạn"
                aria-label="Tạo ý tưởng"
              >
                <Lightbulb size={12} />
              </button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  setEditingClip(editingClip === row.id ? null : row.id);
                  setEditText(row.text);
                }}
                title="Sửa trích đoạn"
                aria-label="Sửa"
              >
                <Pencil size={12} />
              </button>
              <button
                className="btn btn-secondary btn-xs danger"
                onClick={async () => {
                  if (confirm("Xóa trích đoạn này?")) {
                    await deleteClip(row.id);
                    await loadClips();
                    refresh();
                  }
                }}
                title="Xóa trích đoạn"
                aria-label="Xóa"
              >
                <Trash2 size={12} />
              </button>
            </span>
          );
        },
      },
    ],
    [byFile, collections, editingClip, editText, expanded, onOpenBook],
  );

  return (
    <div className="view-row">
      {/* Left: collections */}
      <div className="view-col view-col-260">
        <div className="panel-box">
          <h3 className="panel-title">
            <Scissors size={16} /> Bộ sưu tập{" "}
            <span className="sn-count">{collections.length}</span>
          </h3>
          {!creating ? (
            <button className="btn btn-primary ui-s-5e63e6"
              onClick={() => setCreating(true)}
            >
              <Plus size={15} /> Bộ sưu tập mới
            </button>
          ) : (
            <div className="coll-create">
              <input
                className="form-control"
                placeholder="Tên chủ đề nghiên cứu…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <input
                className="form-control"
                placeholder="Mô tả ngắn (không bắt buộc)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <div className="ui-s-4ebffd">
                <button
                  className="btn btn-primary btn-xs"
                  onClick={createColl}
                  disabled={!newName.trim()}
                >
                  <Check size={13} /> Tạo
                </button>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setNewDesc("");
                  }}
                >
                  <X size={13} /> Hủy
                </button>
              </div>
            </div>
          )}

          <SampleButton
            label="Tự động làm: bộ sưu tập + trích đoạn mẫu"
            className="ui-s-5e63e6"
            disabled={!books.length}
            onRun={async () => {
              const r = await fillSampleClips(books);
              await loadClips();
              refresh();
              alert(
                `Đã tạo ${r.collCount} bộ sưu tập mẫu và ${r.added} trích đoạn mẫu.`,
              );
            }}
          />
          {/* Collections DataTable */}
          {collections.length ? (
            <DataTable
              columns={collectionColumns}
              data={collectionsData}
              keyField="id"
              onRowClick={(row) => setSelId(row.id)}
              emptyText="Chưa có bộ sưu tập nào"
              emptyHint='Tạo một chủ đề (VD: "Phép cộng lớp 1", "Từ chỉ hoạt động") rồi lưu trích đoạn từ trong sách.'
            />
          ) : (
            <p className="panel-hint">
              Chưa có bộ sưu tập nào. Tạo một chủ đề (VD: "Phép cộng lớp 1",
              "Từ chỉ hoạt động") rồi lưu trích đoạn từ trong sách.
            </p>
          )}
        </div>
      </div>

      {/* Right: clips of the selected collection */}
      <div className="view-col view-col-rest">
        {!selected ? (
          <div className="dash-empty">
            <Scissors size={44} />
            <p>
              Chọn một bộ sưu tập để xem các trích đoạn đã lưu.
              <br />
              Trong sách: bôi đen đoạn văn rồi bấm{" "}
              <strong>"Lưu trích đoạn"</strong> hoặc dùng nút trên thanh công
              cụ.
            </p>
          </div>
        ) : (
          <div className="panel-box">
            <div className="coll-head">
              {editingColl === selected.id ? (
                <div
                  className="ui-s-d18978"
                >
                  <input
                    className="form-control"
                    value={collName}
                    onChange={(e) => setCollName(e.target.value)}
                    placeholder="Tên chủ đề"
                  />
                  <input
                    className="form-control"
                    value={collDesc}
                    onChange={(e) => setCollDesc(e.target.value)}
                    placeholder="Mô tả ngắn"
                  />
                  <div className="ui-s-4ebffd">
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => {
                        try {
                          renameCollection(selected.id, collName, collDesc);
                          setEditingColl(null);
                          refresh();
                        } catch (err) {
                          console.error('Failed to rename collection:', err);
                          alert('Không thể đổi tên bộ sưu tập: bộ nhớ đầy. Hãy thử lại.');
                        }
                      }}
                    >
                      <Check size={13} /> Lưu
                    </button>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => setEditingColl(null)}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="ui-s-39fbdf">
                    <h3 className="ui-s-624a7d">{selected.name}</h3>
                    {selected.desc && (
                      <p className="panel-hint ui-s-1b24d7"
                      >
                        {selected.desc}
                      </p>
                    )}
                  </div>
                  <div
                    className="ui-s-706249"
                  >
                    <span className="sn-count">
                      {selClips.length} trích đoạn
                    </span>
                    <button
                      className="btn btn-secondary btn-xs"
                      title="Sửa tên / mô tả"
                      onClick={() => {
                        setEditingColl(selected.id);
                        setCollName(selected.name);
                        setCollDesc(selected.desc || "");
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={exportCollTxt}
                      disabled={!selClips.length}
                      title="Xuất TXT"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={exportCollWord}
                      disabled={!selClips.length}
                      title="Xuất Word"
                    >
                      <FileText size={12} />
                    </button>
                    <button
                      className="btn btn-secondary btn-xs danger"
                      onClick={async () => {
                        if (
                          confirm(
                            `Xóa bộ sưu tập "${selected.name}" và mọi trích đoạn trong đó?`,
                          )
                        ) {
                          await deleteCollection(selected.id);
                          setSelId(null);
                          await loadClips();
                          refresh();
                        }
                      }}
                      title="Xóa bộ sưu tập"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Clips DataTable */}
            {clipsLoading ? (
              <p className="panel-hint mt-md">
                <span className="spinner spinner-sm" /> Đang tải trích đoạn…
              </p>
            ) : selClips.length ? (
              <div className="mt-md">
                <DataTable
                  columns={clipColumns}
                  data={selClips}
                  keyField="id"
                  emptyText="Bộ sưu tập trống"
                  emptyHint="Thêm trích đoạn từ trong sách."
                />
              </div>
            ) : (
              <p className="panel-hint mt-md">
                Bộ sưu tập trống — thêm trích đoạn từ trong sách.
              </p>
            )}
            {onNavigate && (
              <div className="panel-box mt-md" style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:12, opacity:0.7 }}>Liên kết nhanh:</span>
                <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("vocab")}>Từ vựng</button>
                <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("references")}>Tài liệu tham khảo</button>
                <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("search")}>Tìm kiếm</button>
                <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("lessonplans")}>Giáo án</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}