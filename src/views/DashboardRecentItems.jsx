import { BookOpen, ChevronRight, Clock, FileText, Play } from "lucide-react";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { relTime, subjectHue, subjectInitials, withPrefix } from "./dashboardPresentation.js";

export default function DashboardRecentItems({
  continueBooks,
  lessonPlans,
  recentPlans,
  onNavigate,
}) {
  return (
    <div className="db-duo">
      {continueBooks.length > 0 && (
        <section className="db-sec">
          <div className="db-sec-head">
            <h2 className="db-sec-title">
              <BookOpen size={16} /> Đang đọc{" "}
              <span className="db-count">{continueBooks.length}</span>
            </h2>
            <button className="db-sec-all" onClick={() => onNavigate("library")}>
              Xem tất cả <ChevronRight size={13} />
            </button>
          </div>
          <div className="db-rows">
            {continueBooks.slice(0, 3).map(
              ({ book, lastPdf, lastPage, totalPages, progress, at }) => {
                const hue = subjectHue(book.subject);
                const openBook = () =>
                  appEvents.emit(AppEvents.OPEN_SOURCE, {
                    filename: book.filename,
                    page: lastPdf || 1,
                  });
                return (
                  <div
                    key={book.filename}
                    className="db-row"
                    style={{ "--h": String(hue) }}
                    role="button"
                    tabIndex={0}
                    title={`Đọc tiếp “${book.title}” từ trang ${lastPage}`}
                    onClick={openBook}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openBook();
                      }
                    }}
                  >
                    <span className="db-cover" aria-hidden="true">
                      <span className="db-cover-t">
                        {subjectInitials(
                          book.subject ||
                            (book.grade ? `Lớp ${book.grade}` : book.title),
                        )}
                      </span>
                      <i
                        className="db-cover-fill"
                        style={{ height: `${progress}%` }}
                      />
                    </span>
                    <span className="db-row-main">
                      <span className="db-row-line">
                        <span className="db-item-t">{book.title}</span>
                        <span
                          className={
                            progress >= 100 ? "db-pct is-done" : "db-pct"
                          }
                        >
                          {progress}%
                        </span>
                      </span>
                      <span className="db-chips">
                        {book.subject && (
                          <span className="db-chip db-chip--sub">
                            {book.subject}
                          </span>
                        )}
                        {book.grade && (
                          <span className="db-chip">
                            {withPrefix(book.grade, "Lớp")}
                          </span>
                        )}
                        {at ? (
                          <span className="db-meta">
                            <Clock size={11} /> {relTime(at)}
                          </span>
                        ) : null}
                      </span>
                      <span className="db-progress">
                        <span className="db-bar">
                          <i style={{ width: `${progress}%` }} />
                        </span>
                        <span className="db-progress-n">
                          {totalPages
                            ? `Trang ${lastPage}/${totalPages}`
                            : `Trang ${lastPage}`}
                        </span>
                      </span>
                    </span>
                    <span className="db-go" aria-hidden="true">
                      <Play size={13} fill="currentColor" />
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </section>
      )}

      {recentPlans.length > 0 && (
        <section className="db-sec">
          <div className="db-sec-head">
            <h2 className="db-sec-title">
              <FileText size={16} /> Giáo án gần đây{" "}
              <span className="db-count">{lessonPlans.length}</span>
            </h2>
            <button
              className="db-sec-all"
              onClick={() => onNavigate("lessonplans")}
            >
              Xem tất cả <ChevronRight size={13} />
            </button>
          </div>
          <div className="db-rows">
            {recentPlans.map((plan) => {
              const subject = String(plan.monHoc || plan.subject || "").trim();
              const grade = String(plan.lop || plan.grade || "").trim();
              const week = String(plan.tuan || "").trim();
              const timestamp = Number(plan.updatedAt) || Number(plan.createdAt) || 0;
              const openPlan = () =>
                onNavigate("lessonplans", { planId: plan.id });
              return (
                <div
                  key={plan.id}
                  className="db-row"
                  style={{ "--h": String(subjectHue(subject)) }}
                  role="button"
                  tabIndex={0}
                  title={`Mở giáo án: ${String(plan.title || "").trim() || subject || "Giáo án"}`}
                  onClick={openPlan}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPlan();
                    }
                  }}
                >
                  <span className="db-doc" aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <span className="db-row-main">
                    <span className="db-row-line">
                      <span className="db-item-t">
                        {String(plan.title || "").trim() ||
                          [subject, grade && withPrefix(grade, "Lớp")]
                            .filter(Boolean)
                            .join(" — ") ||
                          "Giáo án chưa đặt tên"}
                      </span>
                      {timestamp ? (
                        <span className="db-meta">
                          <Clock size={11} /> {relTime(timestamp)}
                        </span>
                      ) : null}
                    </span>
                    <span className="db-chips">
                      {subject && (
                        <span className="db-chip db-chip--sub">{subject}</span>
                      )}
                      {grade && (
                        <span className="db-chip">
                          {withPrefix(grade, "Lớp")}
                        </span>
                      )}
                      {week && (
                        <span className="db-chip">{withPrefix(week, "Tuần")}</span>
                      )}
                      {plan.soTiet && (
                        <span className="db-chip">
                          {withPrefix(plan.soTiet, "Tiết")}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="db-go" aria-hidden="true">
                    <ChevronRight size={15} />
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
