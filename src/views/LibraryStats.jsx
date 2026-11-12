import React from "react";
import { BookOpen, BookOpenCheck, BookmarkCheck, Pencil } from "lucide-react";

export default function LibraryStats({ books, booksAll, history, totalBookmarks, vocabCount }) {
  const items = [
    { icon: <BookOpen size={18} />, value: booksAll ? booksAll.length : books.length, label: "Sách trong thư viện", sub: "các môn học" },
    { icon: <BookmarkCheck size={18} />, value: totalBookmarks ?? 0, label: "Trang đã đánh dấu", sub: "để xem lại" },
    { icon: <BookOpenCheck size={18} />, value: history ? history.length : 0, label: "Sách đang đọc", sub: "đọc gần đây" },
    { icon: <Pencil size={18} />, value: vocabCount ?? 0, label: "Từ vựng đã lưu", sub: "đang ôn tập" },
  ];

  return (
    <section className="libx-stats" aria-label="Thống kê nhanh">
      {items.map((item) => (
        <div key={item.label} className="libx-stat">
          <span className="libx-stat-ic" aria-hidden="true">{item.icon}</span>
          <span className="libx-stat-copy">
            <span className="libx-stat-val">{item.value}</span>
            <span className="libx-stat-label">{item.label}</span>
            <span className="libx-stat-sub">{item.sub}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
