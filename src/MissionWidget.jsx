import React, { useEffect, useState } from 'react';
import { Target, Flame, Star, Trophy, ChevronRight, CheckCircle2 } from 'lucide-react';
import { getTodayMissions, getStreak, getXpState, levelForXp, ensureTodayMissions, todayStr } from './missionStore';
import { loadSettings, subscribeSettings } from './settingsStore';
import { appEvents, AppEvents } from './core/appEvents.js';

export default function MissionWidget({ books = [], onViewMissions }){
  const [missions, setMissions] = useState(()=> getTodayMissions());
  const [streak, setStreak] = useState(()=> getStreak());
  const [xpState, setXpState] = useState(()=> getXpState());
  const [settings, setSettings] = useState(()=> loadSettings());
  const booksRef = React.useRef(books);
  booksRef.current = books;
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;

  const refresh = React.useCallback(()=>{
    try { ensureTodayMissions({ settings: settingsRef.current, books: booksRef.current }); } catch {}
    setMissions(getTodayMissions());
    setStreak(getStreak());
    setXpState(getXpState());
  }, []);
  useEffect(()=>{
    refresh();
    // Đồng bộ realtime qua bus duy nhất — không polling interval nữa
    const offM = appEvents.on(AppEvents.MISSIONS_UPDATED, () => refresh());
    const offD = appEvents.on(AppEvents.DATA_UPDATED, (detail) => {
      const dom = detail?.domain || detail?.source || "";
      if (!detail || dom === "" || /mission|task|idea|personalDB|storage|cross-tab|settings/i.test(String(dom))) refresh();
    });
    const offS = subscribeSettings((next) => { setSettings(next); });
    return ()=>{ try{ offM(); }catch{} try{ offD(); }catch{} try{ offS(); }catch{} };
  },[refresh]);
  useEffect(()=>{ refresh(); }, [books, refresh]);

  if(settings.missions && settings.missions.enabled===false) return null;
  if(settings.missions && settings.missions.showCardOnDashboard===false) return null;

  const total = missions.length;
  const done = missions.filter(m=> m.completed).length;
  const pct = total? Math.round(done/total*100):0;
  const levelInfo = levelForXp(xpState.totalXp||0);

  const handleView = () => {
    // Mở hub Nhiệm vụ đúng tab Hôm nay (route `tasks` = MissionsView).
    // Chỉ gọi onViewMissions (Dashboard đã kèm tab) hoặc emit 1 lần —
    // appEvents.emit tự dispatch window event nên không dispatch tay thêm.
    if (onViewMissions) { onViewMissions(); return; }
    try { appEvents.emit(AppEvents.NAVIGATE, { view: 'tasks', tab: 'today' }); } catch {}
  };

  return (
    <div className="mission-widget" role="region" aria-label="Nhiệm vụ hôm nay">
      <div className="mission-widget-header">
        <div className="mission-widget-title">
          <Target size={18} />
          <span>NHIỆM VỤ HÔM NAY</span>
          <span className="mission-widget-date">{todayStr()}</span>
        </div>
        <div className="mission-widget-meta">
          {streak.currentStreak>0 && settings.missions.streakEnabled!==false && (
            <span className="mission-badge streak"><Flame size={14}/> {streak.currentStreak} ngày</span>
          )}
          {settings.missions.xpEnabled!==false && (
            <span className="mission-badge xp"><Star size={14}/> {xpState.totalXp} XP</span>
          )}
        </div>
      </div>

      {total===0 ? (
        <div className="mission-widget-empty">Chưa có nhiệm vụ hôm nay. Hãy mở app để tạo mới.</div>
      ):(
        <>
          <div className="mission-widget-progress">
            <div className="mission-progress-bar"><div className="mission-progress-fill" style={{width: pct+'%'}}/></div>
            <span className="mission-progress-text">{done} / {total} hoàn thành — {pct}%</span>
          </div>
          <ul className="mission-widget-list">
            {missions.map(m=>(
              <li key={m.id} className={`mission-item ${m.completed?'completed':''} ${m.isBonus?'bonus':''}`}>
                <span className="mission-item-check">{m.completed? <CheckCircle2 size={16} color="var(--success)"/> : <span className="mission-item-dot"/>}</span>
                <span className="mission-item-title">{m.title}</span>
                <span className="mission-item-xp">+{m.xp} XP</span>
                {!m.completed && <span className="mission-item-progress">{m.progress}/{m.target}</span>}
                {m.isBonus && <span className="mission-item-bonus">THƯỞNG</span>}
              </li>
            ))}
          </ul>
          {settings.missions.xpEnabled!==false && (
            <div className="mission-widget-level">
              <span className="mission-level-label"><Trophy size={14}/> Level {levelInfo.current.level} — {levelInfo.current.title}</span>
              <div className="mission-level-bar"><div className="mission-level-fill" style={{width: (levelInfo.progress*100)+'%'}}/></div>
              <span className="mission-level-text">{levelInfo.xpIntoLevel} / {levelInfo.xpNeeded} XP</span>
            </div>
          )}
        </>
      )}
      <button className="btn btn-secondary btn-sm mission-widget-cta" onClick={handleView}>
        Xem nhiệm vụ <ChevronRight size={14}/>
      </button>
    </div>
  );
}
