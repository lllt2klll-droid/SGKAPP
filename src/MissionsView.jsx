import React, { useEffect, useState, useMemo } from "react";
import {
  Target,
  Flame,
  Star,
  Trophy,
  Check,
  Award,
  Calendar,
  ListChecks,
  Filter,
  Zap,
} from "lucide-react";
import {
  getAllMissions,
  getMissionsByDate,
  todayStr,
  addDaysStr,
  getStreak,
  getXpState,
  levelForXp,
  getAchievements,
  completeMission,
  ensureTodayMissions,
  getWeeklyProgress,
  getMonthlyChallenge,
} from "./missionStore.js";
import { ACHIEVEMENTS, DIFFICULTY, CATEGORIES, missionTargetView } from "./missionRegistry.js";
import { loadSettings, subscribeSettings } from "./settingsStore.js";
import { appEvents, AppEvents } from "./core/appEvents.js";
import TasksView from "./TasksView.jsx";

function Tab({ active, onClick, children }) {
  return (
    <button className={`seg-tab ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

// Hub "Nhiệm vụ": daily missions (gamification) + việc cần làm (sgk_tasks) đồng bộ toàn app.
// Route `tasks` render hub này; TasksView độc lập còn dùng embedded bên trong tab Hôm nay.
export default function MissionsView({ books = [], initialTab = "today" }) {
  const [tab, setTab] = useState(initialTab); // today|tasks|history|goals|achievements
  const [filterCat, setFilterCat] = useState("all");
  const [weekMode, setWeekMode] = useState(false);
  const [missions, setMissions] = useState(() => getAllMissions());
  const [streak, setStreak] = useState(() => getStreak());
  const [xpState, setXpState] = useState(() => getXpState());
  const [ach, setAch] = useState(() => getAchievements());
  const [settings, setSettings] = useState(() => loadSettings());
  const [focusMode, setFocusMode] = useState(false);
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  const booksRef = React.useRef(books);
  booksRef.current = books;

  const refresh = React.useCallback(() => {
    try { ensureTodayMissions({ settings: settingsRef.current, books: booksRef.current }); } catch {}
    setMissions(getAllMissions());
    setStreak(getStreak());
    setXpState(getXpState());
    setAch(getAchievements());
  }, []);
  useEffect(() => {
    refresh();
    // Đồng bộ toàn app qua bus duy nhất (missions + data + settings); không dùng window lẻ, không polling
    const offM = appEvents.on(AppEvents.MISSIONS_UPDATED, () => refresh());
    const offD = appEvents.on(AppEvents.DATA_UPDATED, (detail) => {
      const dom = detail?.domain || detail?.source || "";
      if (!detail || dom === "" || /mission|task|idea|personalDB|storage|cross-tab|settings/i.test(String(dom))) refresh();
    });
    const offS = subscribeSettings((next) => { setSettings(next); });
    // Cho phép nơi khác mở thẳng tab việc cần làm: emit NAVIGATE {view:'tasks', tab:'tasks'}
    const offN = appEvents.on(AppEvents.NAVIGATE, (detail) => {
      if (detail?.view === "tasks" && detail?.tab) setTab(detail.tab);
    });
    return () => { try { offM(); } catch {} try { offD(); } catch {} try { offS(); } catch {} try { offN(); } catch {} };
  }, [refresh]);
  // refresh lại khi books/settings đổi (không re-subscribe để tránh loop)
  useEffect(() => { refresh(); }, [books, settings, refresh]);

  const goMissionTarget = (type) => {
    // appEvents.emit đã tự dispatch window event (marked) cho listener legacy —
    // không dispatch tay thêm để tránh App.closeBook chạy 2 lần.
    try { appEvents.emit(AppEvents.NAVIGATE, { view: missionTargetView(type) }); } catch {}
  };

  const todayMissions = useMemo(
    () =>
      missions.filter(
        (m) =>
          m.date === todayStr() &&
          (filterCat === "all" ||
            m.category === filterCat ||
            (filterCat === "bonus" && m.isBonus)),
      ),
    [missions, filterCat],
  );
  const historyGrouped = useMemo(() => {
    const byDate = {};
    missions.forEach((m) => {
      if (!byDate[m.date]) byDate[m.date] = [];
      byDate[m.date].push(m);
    });
    return Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30);
  }, [missions]);
  const weekly = useMemo(() => getWeeklyProgress(), [missions]);
  const monthly = useMemo(() => getMonthlyChallenge(), [missions]);
  const levelInfo = levelForXp(xpState.totalXp || 0);

  return (
    <div className="missions-view">
      <div className="page-header">
        <div className="page-title">
          <Target size={22} /> <h1>Nhiệm vụ</h1>
        </div>
        <div className="page-actions">
          <button
            className={`btn btn-ghost btn-sm ${focusMode ? "active" : ""}`}
            onClick={() => setFocusMode((v) => !v)}
            title="Chế độ tập trung"
          >
            <Zap size={14} /> Tập trung
          </button>
        </div>
      </div>

      {!focusMode && (
        <div className="missions-stats-row">
          <div className="stat-compact-card">
            <Flame size={18} color="var(--warning)" />
            <div className="stat-compact-value">{streak.currentStreak}</div>
            <div className="stat-compact-label">Streak</div>
            <div className="stat-compact-sub">
              dài nhất {streak.longestStreak}
            </div>
          </div>
          <div className="stat-compact-card">
            <Star size={18} color="var(--warning)" />
            <div className="stat-compact-value">{xpState.totalXp}</div>
            <div className="stat-compact-label">XP</div>
            <div className="stat-compact-sub">
              Level {levelInfo.current.level}
            </div>
          </div>
          <div className="stat-compact-card">
            <Trophy size={18} color="var(--primary)" />
            <div className="stat-compact-value">{levelInfo.current.level}</div>
            <div className="stat-compact-label">{levelInfo.current.title}</div>
            <div className="stat-compact-sub">
              {levelInfo.xpIntoLevel}/{levelInfo.xpNeeded} XP
            </div>
          </div>
          <div className="stat-compact-card">
            <ListChecks size={18} color="var(--success)" />
            <div className="stat-compact-value">
              {missions.filter((m) => m.completed).length}/{missions.length}
            </div>
            <div className="stat-compact-label">Hoàn thành</div>
          </div>
        </div>
      )}

      {!focusMode && (
        <div className="seg-tabs" style={{ margin: "1rem 0" }}>
          <Tab active={tab === "today"} onClick={() => setTab("today")}>
            Hôm nay
          </Tab>
          <Tab active={tab === "tasks"} onClick={() => setTab("tasks")}>
            Việc cần làm
          </Tab>
          <Tab active={tab === "history"} onClick={() => setTab("history")}>
            Lịch sử
          </Tab>
          <Tab active={tab === "goals"} onClick={() => setTab("goals")}>
            Mục tiêu
          </Tab>
          <Tab
            active={tab === "achievements"}
            onClick={() => setTab("achievements")}
          >
            Thành tựu
          </Tab>
        </div>
      )}

      {focusMode ? (
        <div className="focus-mode">
          <h3>🎯 Chế độ tập trung — Chỉ nhiệm vụ hôm nay</h3>
          <MissionList
            missions={getMissionsByDate(todayStr())}
            onComplete={(id) => {
              completeMission(id);
              refresh();
            }}
            onOpen={goMissionTarget}
          />
          <div className="focus-timer-note">
            Tập trung 25 phút · Hoàn thành từng nhiệm vụ
          </div>
        </div>
      ) : (
        <>
          {tab === "today" && (
            <div>
              <div className="missions-filter-row">
                <Filter size={14} />
                {Object.values(CATEGORIES).map((c) => (
                  <button
                    key={c.id}
                    className={`filter-btn ${filterCat === c.id ? "active" : ""}`}
                    onClick={() => setFilterCat(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <MissionList
                missions={todayMissions}
                onComplete={(id) => {
                  completeMission(id);
                  refresh();
                }}
                onOpen={goMissionTarget}
              />
              {todayMissions.length === 0 && (
                <div className="dash-empty">Không có nhiệm vụ phù hợp.</div>
              )}
              <div
                style={{
                  marginTop: "1.5rem",
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: "1rem",
                }}
              >
                <TasksView embedded />
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: "0.6rem" }}
                  onClick={() => setTab("tasks")}
                >
                  Mở rộng việc cần làm →
                </button>
              </div>
            </div>
          )}
          {tab === "tasks" && <TasksView />}
          {tab === "history" && (
            <div className="missions-history">
              <div className="missions-history-tabs">
                <button
                  className={`filter-btn ${!weekMode ? "active" : ""}`}
                  onClick={() => setWeekMode(false)}
                >
                  Ngày
                </button>
                <button
                  className={`filter-btn ${weekMode ? "active" : ""}`}
                  onClick={() => setWeekMode(true)}
                >
                  Tuần
                </button>
              </div>
              {historyGrouped.map(([date, list]) => (
                <div key={date} className="history-day-card">
                  <div className="history-day-head">
                    <Calendar size={14} /> {date}{" "}
                    <span className="history-day-count">
                      {list.filter((m) => m.completed).length}/{list.length}
                    </span>
                  </div>
                  <ul className="mission-widget-list">
                    {list.map((m) => (
                      <li
                        key={m.id}
                        className={`mission-item ${m.completed ? "completed" : ""}`}
                      >
                        {m.completed ? "✓" : "○"} {m.title}{" "}
                        <span className="mission-item-xp">+{m.xp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {historyGrouped.length === 0 && (
                <div className="dash-empty">Chưa có lịch sử.</div>
              )}
            </div>
          )}
          {tab === "goals" && (
            <div className="missions-goals">
              {!weekly && !monthly && (
                <div className="dash-empty">Mục tiêu tuần/tháng đang tắt trong Cài đặt → Nhiệm vụ.</div>
              )}
              {weekly && (
              <div className="goal-card">
                <h3>
                  🎯 Mục tiêu tuần ({weekly.start} →{" "}
                  {addDaysStr(weekly.start, 6)})
                </h3>
                <div className="goal-bars">
                  <div className="activity-bar-compact">
                    <span className="activity-bar-label">Nhiệm vụ</span>
                    <div className="activity-bar-track">
                      <div
                        className="activity-bar-fill"
                        style={{
                          width:
                            (weekly.done / Math.max(1, weekly.total)) * 100 +
                            "%",
                          background: "var(--primary)",
                        }}
                      />
                    </div>
                    <span className="activity-bar-value">
                      {weekly.done}/{weekly.total}
                    </span>
                  </div>
                  <div className="activity-bar-compact">
                    <span className="activity-bar-label">Trang đọc</span>
                    <div className="activity-bar-track">
                      <div
                        className="activity-bar-fill"
                        style={{
                          width:
                            Math.min(100, (weekly.pagesThisWeek / 50) * 100) +
                            "%",
                          background: "var(--success)",
                        }}
                      />
                    </div>
                    <span className="activity-bar-value">
                      {weekly.pagesThisWeek}/50
                    </span>
                  </div>
                </div>
              </div>
              )}
              {monthly && (
              <div className="goal-card">
                <h3>🏆 Thử thách tháng {monthly.month}</h3>
                <p>
                  {monthly.title} — {monthly.pagesThisMonth}/{monthly.target}{" "}
                  trang
                </p>
                <div className="mission-progress-bar">
                  <div
                    className="mission-progress-fill"
                    style={{
                      width:
                        Math.min(
                          100,
                          (monthly.pagesThisMonth / monthly.target) * 100,
                        ) + "%",
                    }}
                  />
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Ý tưởng tháng: {monthly.ideasThisMonth} · Nhiệm vụ tháng:{" "}
                  {monthly.doneCount}/{monthly.total}
                </p>
              </div>
              )}
              <div className="goal-card">
                <h3>📊 Tuần này</h3>
                <p>
                  Nhiệm vụ: {weekly ? `${weekly.done}/${weekly.total}` : "—"}
                </p>
                <p>Trang: {weekly ? weekly.pagesThisWeek : "—"}</p>
                <p>Ý tưởng: {weekly ? weekly.ideasThisWeek : "—"}</p>
                <p>Streak: {streak.currentStreak} ngày</p>
              </div>
            </div>
          )}
          {tab === "achievements" && (
            <div className="achievements-grid">
              {ACHIEVEMENTS.map((a) => {
                const unlocked = !!ach.unlocked[a.id];
                return (
                  <div
                    key={a.id}
                    className={`achievement-card ${unlocked ? "unlocked" : ""}`}
                  >
                    <div className="achievement-icon">{a.icon}</div>
                    <div className="achievement-title">{a.title}</div>
                    <div className="achievement-desc">{a.desc}</div>
                    {unlocked && (
                      <div className="achievement-unlocked">
                        ✓{" "}
                        {new Date(ach.unlocked[a.id]).toLocaleDateString(
                          "vi-VN",
                        )}
                      </div>
                    )}
                    {!unlocked && (
                      <div className="achievement-locked">Chưa mở khóa</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MissionList({ missions, onComplete, onOpen }) {
  if (!missions.length) return null;
  return (
    <ul className="mission-list">
      {missions.map((m) => {
        const pct = Math.round((m.progress / m.target) * 100);
        const diff = DIFFICULTY[m.difficulty] || DIFFICULTY.normal;
        return (
          <li
            key={m.id}
            className={`mission-card ${m.completed ? "completed" : ""}`}
          >
            <div className="mission-card-head">
              <span className="mission-card-icon">{diff.icon}</span>
              <span className="mission-card-title">{m.title}</span>
              {m.isBonus && <span className="mission-card-bonus">THƯỞNG</span>}
              <span className="mission-card-xp">+{m.xp} XP</span>
            </div>
            <div className="mission-card-desc">
              {m.description} · {diff.label}
            </div>
            <div className="mission-card-progress">
              <div className="mission-progress-bar small">
                <div
                  className="mission-progress-fill"
                  style={{ width: pct + "%" }}
                />
              </div>
              <span>
                {m.progress}/{m.target} — {pct}%
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {onOpen && !m.completed && (
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => onOpen(m.type)}
                  title="Mở đúng khu vực để làm nhiệm vụ này"
                >
                  Mở khu vực →
                </button>
              )}
              {!m.completed && (
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => onComplete(m.id)}
                >
                  <Check size={12} /> Hoàn thành
                </button>
              )}
            </div>
            {m.completed && (
              <span className="mission-card-done">
                <Award size={12} /> Hoàn thành{" "}
                {m.completedAt
                  ? new Date(m.completedAt).toLocaleTimeString("vi-VN")
                  : ""}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
