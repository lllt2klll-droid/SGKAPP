// ── Mission Registry ── Professional + Academic gamification
export const DIFFICULTY = {
  easy:   { id: 'easy',   label: 'Cơ bản',    icon: '🌱', xp: 10,  color: 'var(--success)' },
  normal: { id: 'normal', label: 'Tiêu chuẩn',icon: '📘', xp: 20,  color: 'var(--primary)' },
  hard:   { id: 'hard',   label: 'Nâng cao',  icon: '🔥', xp: 40,  color: 'var(--warning)' },
  expert: { id: 'expert', label: 'Chuyên sâu',icon: '🧠', xp: 75,  color: 'var(--secondary)' },
  master: { id: 'master', label: 'Chuyên gia',icon: '🏆', xp: 150, color: 'var(--danger)' },
};

export const MISSION_TYPES = {
  READING:     { id:'reading',     label:'Đọc sách',      icon:'📖', category:'reading',  event:'PAGE_READ' },
  BOOK_OPENED: { id:'book_opened', label:'Mở sách',       icon:'📚', category:'reading',  event:'BOOK_OPENED' },
  BOOKMARK:    { id:'bookmark',    label:'Đánh dấu',      icon:'🔖', category:'note',     event:'BOOKMARK_CREATED' },
  VOCABULARY:  { id:'vocabulary',  label:'Từ vựng',       icon:'📝', category:'note',     event:'VOCAB_CREATED' },
  NOTE:        { id:'note',        label:'Ghi chú',       icon:'🗒️', category:'note',     event:'NOTE_CREATED' },
  // P2 • "Khái niệm" gộp vào "Từ vựng" — nhiệm vụ research bám event VOCAB_CREATED (thêm từ/khái niệm vào sổ tay)
  RESEARCH:    { id:'research',    label:'Nghiên cứu',    icon:'🔎', category:'research', event:'VOCAB_CREATED' },
  EVIDENCE:    { id:'evidence',    label:'Bằng chứng',    icon:'📌', category:'research', event:'EVIDENCE_CREATED' },
  REFERENCE:   { id:'reference',   label:'Tham khảo',     icon:'📑', category:'research', event:'REFERENCE_CREATED' },
  CLIP:        { id:'clip',        label:'Trích đoạn',    icon:'✂️', category:'research', event:'CLIP_CREATED' },
  IDEA:        { id:'idea',        label:'Ý tưởng',       icon:'💡', category:'teaching', event:'IDEA_CREATED' },
  LESSON_PLAN: { id:'lesson_plan', label:'Giáo án',       icon:'📄', category:'teaching', event:'LESSON_PLAN_CREATED' },
  QUESTION:    { id:'question',    label:'Câu hỏi',       icon:'❓', category:'teaching', event:'QUESTION_CREATED' },
  WORKSHEET:   { id:'worksheet',   label:'Phiếu học tập', icon:'📋', category:'teaching', event:'WORKSHEET_CREATED' },
  ACTIVITY:    { id:'activity',    label:'Hoạt động',     icon:'🧩', category:'teaching', event:'ACTIVITY_CREATED' },
  TASK:        { id:'task',        label:'Nhiệm vụ',      icon:'✅', category:'note',     event:'TASK_COMPLETED' },
  REVIEW:      { id:'review',      label:'Ôn tập',        icon:'🔁', category:'research', event:'REVIEW_DONE' },
};

// ── Deep-link: mỗi loại nhiệm vụ mở đúng view tương ứng trong app ──
// Single source cho MissionsView / MissionWidget / Dashboard.
export const MISSION_NAV = {
  reading: 'library',
  book_opened: 'library',
  bookmark: 'marks',
  vocabulary: 'vocab',
  note: 'library',
  research: 'vocab',
  evidence: 'collections',
  reference: 'references',
  clip: 'collections',
  idea: 'ideas',
  lesson_plan: 'lessonplans',
  question: 'questionbank',
  worksheet: 'worksheets',
  activity: 'activities',
  task: 'tasks',
  review: 'search',
};
export function missionTargetView(type){
  return MISSION_NAV[type] || 'tasks';
}

export const CATEGORIES = {
  all:      { id:'all',      label:'Tất cả' },
  reading:  { id:'reading',  label:'Đọc sách' },
  research: { id:'research', label:'Nghiên cứu' },
  note:     { id:'note',     label:'Ghi chú' },
  teaching: { id:'teaching', label:'Soạn dạy' },
  bonus:    { id:'bonus',    label:'Thưởng' },
};

// XP helpers
export const XP_BY_DIFFICULTY = { easy:10, normal:20, hard:40, expert:75, master:150 };

// Level thresholds — ~10 levels, smooth curve
export const LEVELS = [
  { level:1, title:'Người mới',          minXp:0 },
  { level:2, title:'Người đọc',          minXp:100 },
  { level:3, title:'Người nghiên cứu',   minXp:300 },
  { level:4, title:'Người soạn dạy',     minXp:600 },
  { level:5, title:'Nhà giáo trẻ',       minXp:1000 },
  { level:6, title:'Nhà giáo chủ động',  minXp:1600 },
  { level:7, title:'Nhà giáo chuyên sâu',minXp:2400 },
  { level:8, title:'Nhà giáo sáng tạo',  minXp:3500 },
  { level:9, title:'Nhà giáo cốt cán',   minXp:4800 },
  { level:10,title:'Nhà giáo dẫn dắt',   minXp:6500 },
  { level:11,title:'Chuyên gia sư phạm', minXp:8500 },
  { level:12,title:'Bậc thầy',           minXp:11000 },
];

export function levelForXp(xp){
  let cur = LEVELS[0];
  let next = null;
  for(let i=0;i<LEVELS.length;i++){
    if(xp >= LEVELS[i].minXp) cur = LEVELS[i];
    else { next = LEVELS[i]; break; }
  }
  if(!next && cur.level < LEVELS.length) next = LEVELS[cur.level];
  // if beyond max, next is null
  const nextMin = next ? next.minXp : cur.minXp;
  const prevMin = cur.minXp;
  const range = (nextMin - prevMin) || 1;
  const progress = next ? Math.min(1, Math.max(0, (xp - prevMin)/range)) : 1;
  return { current: cur, next, progress, xpIntoLevel: xp - prevMin, xpNeeded: range };
}

// Achievement definitions
export const ACHIEVEMENTS = [
  { id:'first_read',      icon:'📖', title:'Khởi đầu đọc sách', desc:'Đọc cuốn sách đầu tiên',           check:(s)=> s.totalPagesRead >= 1 },
  { id:'streak_7',        icon:'🔥', title:'Chuỗi 7 ngày',      desc:'Duy trì 7 ngày liên tiếp',         check:(s)=> s.longestStreak >= 7 },
  { id:'streak_30',       icon:'🏅', title:'Kiên trì 30 ngày',  desc:'Duy trì 30 ngày liên tiếp',        check:(s)=> s.longestStreak >= 30 },
  { id:'bookworm_100',    icon:'📚', title:'Mọt sách 100',      desc:'Đọc 100 trang',                    check:(s)=> s.totalPagesRead >= 100 },
  { id:'bookworm_500',    icon:'📚', title:'Mọt sách 500',      desc:'Đọc 500 trang',                    check:(s)=> s.totalPagesRead >= 500 },
  { id:'researcher_25',   icon:'🔎', title:'Nhà nghiên cứu',    desc:'Tạo 25 evidence',                  check:(s)=> s.totalEvidence >= 25 },
  { id:'idea_20',         icon:'💡', title:'Cỗ máy ý tưởng',    desc:'Tạo 20 ý tưởng',                   check:(s)=> s.totalIdeas >= 20 },
  { id:'lesson_10',       icon:'📝', title:'Chuyên gia soạn bài',desc:'Tạo 10 KHBD',                      check:(s)=> s.totalLessonPlans >= 10 },
  { id:'consistent_30',   icon:'🏆', title:'Giáo viên kiên trì',desc:'Hoàn thành 30 ngày nhiệm vụ',      check:(s)=> s.totalDaysCompleted >= 30 },
  { id:'vocab_50',        icon:'📝', title:'Từ vựng phong phú',desc:'Lưu 50 từ mới',                     check:(s)=> s.totalVocab >= 50 },
  { id:'bookmark_20',     icon:'🔖', title:'Đánh dấu tỉ mỉ',   desc:'Đánh dấu 20 trang',                check:(s)=> s.totalBookmarks >= 20 },
  { id:'question_50',     icon:'❓', title:'Ngân hàng câu hỏi', desc:'Tạo 50 câu hỏi',                   check:(s)=> s.totalQuestions >= 50 },
  { id:'first_idea',      icon:'💡', title:'Ý tưởng đầu tiên',  desc:'Tạo ý tưởng đầu tiên',             check:(s)=> s.totalIdeas >= 1 },
  { id:'level_5',         icon:'⭐', title:'Thăng cấp 5',       desc:'Đạt Level 5',                      check:(s)=> s.level >= 5 },
];

// Mission templates — used by generator. Each entry defines a mission variety.
export const MISSION_TEMPLATES = [
  // READING
  { type:'reading', difficulty:'easy',   title:'Đọc 3 trang SGK',      desc:'Mở sách và đọc 3 trang',                target:3,  xp:10, category:'reading',  event:'PAGE_READ', requiresBook:true },
  { type:'reading', difficulty:'normal', title:'Đọc 10 trang SGK',     desc:'Đọc 10 trang liên tiếp',                target:10, xp:20, category:'reading',  event:'PAGE_READ', requiresBook:true },
  { type:'reading', difficulty:'hard',   title:'Đọc 20 trang SGK',     desc:'Đọc sâu 20 trang',                      target:20, xp:40, category:'reading',  event:'PAGE_READ', requiresBook:true },
  { type:'reading', difficulty:'expert', title:'Hoàn thành 1 mục SGK', desc:'Đọc trọn 1 mục/chương',                target:15, xp:60, category:'reading',  event:'PAGE_READ', requiresBook:true },
  // BOOK_OPENED
  { type:'book_opened', difficulty:'easy', title:'Mở một cuốn sách',   desc:'Mở sách chưa đọc hôm nay',              target:1, xp:5, category:'reading', event:'BOOK_OPENED', requiresBook:true },
  // BOOKMARK
  { type:'bookmark', difficulty:'easy',   title:'Đánh dấu 1 nội dung', desc:'Lưu trang quan trọng',                  target:1, xp:10, category:'note', event:'BOOKMARK_CREATED', requiresBook:true },
  { type:'bookmark', difficulty:'normal', title:'Đánh dấu 3 nội dung', desc:'Đánh dấu 3 trang hữu ích',              target:3, xp:20, category:'note', event:'BOOKMARK_CREATED', requiresBook:true },
  // VOCAB
  { type:'vocabulary', difficulty:'easy',   title:'Lưu 1 từ mới',       desc:'Lưu từ/cụm từ mới',                    target:1, xp:10, category:'note', event:'VOCAB_CREATED', requiresBook:true },
  { type:'vocabulary', difficulty:'normal', title:'Lưu 2 từ mới',       desc:'Mở rộng vốn từ',                        target:2, xp:15, category:'note', event:'VOCAB_CREATED', requiresBook:true },
  { type:'vocabulary', difficulty:'hard',   title:'Lưu 5 từ mới',       desc:'Sưu tập 5 từ mới',                      target:5, xp:35, category:'note', event:'VOCAB_CREATED', requiresBook:true },
  // NOTE / RESEARCH
  { type:'research', difficulty:'normal', title:'Tìm hiểu 1 khái niệm',desc:'Thêm 1 khái niệm/thuật ngữ vào sổ tay',   target:1, xp:20, category:'research', event:'VOCAB_CREATED', requiresBook:true },
  { type:'research', difficulty:'hard',   title:'Tìm hiểu 3 khái niệm',desc:'Nghiên cứu 3 khái niệm qua từ vựng',    target:3, xp:40, category:'research', event:'VOCAB_CREATED', requiresBook:true },
  { type:'evidence', difficulty:'normal', title:'Lưu 1 evidence',      desc:'Trích 1 bằng chứng từ SGK',             target:1, xp:20, category:'research', event:'EVIDENCE_CREATED', requiresBook:true },
  { type:'evidence', difficulty:'hard',   title:'Lưu 3 evidence',      desc:'Sưu tập 3 evidence',                    target:3, xp:40, category:'research', event:'EVIDENCE_CREATED', requiresBook:true },
  { type:'clip',     difficulty:'normal', title:'Lưu 1 trích đoạn',    desc:'Lưu đoạn trích vào bộ sưu tập',        target:1, xp:15, category:'research', event:'CLIP_CREATED', requiresBook:true },
  // IDEA
  { type:'idea', difficulty:'normal', title:'Tạo 1 ý tưởng dạy học', desc:'Ghi ý tưởng mới',                        target:1, xp:20, category:'teaching', event:'IDEA_CREATED' },
  { type:'idea', difficulty:'hard',   title:'Tạo 2 ý tưởng',         desc:'Sáng tạo 2 ý tưởng',                    target:2, xp:40, category:'teaching', event:'IDEA_CREATED' },
  // NOTE — ghi chú trang sách (BookReader + teacher notes)
  { type:'note', difficulty:'easy',   title:'Ghi 1 ghi chú',         desc:'Ghi chú nhanh trên trang sách',         target:1, xp:10, category:'note', event:'NOTE_CREATED' },
  { type:'note', difficulty:'normal', title:'Ghi 2 ghi chú',         desc:'Lưu 2 ghi chú dạy học',                 target:2, xp:20, category:'note', event:'NOTE_CREATED' },
  // REFERENCE — thư mục tham khảo
  { type:'reference', difficulty:'normal', title:'Lưu 1 tham khảo', desc:'Thêm tài liệu vào thư mục tham khảo',    target:1, xp:20, category:'research', event:'REFERENCE_CREATED' },
  // REVIEW — ôn tập / quiz
  { type:'review', difficulty:'easy',   title:'Ôn tập 1 lượt',       desc:'Làm 1 bài ôn tập/quiz',                 target:1, xp:10, category:'research', event:'REVIEW_DONE' },
  { type:'review', difficulty:'normal', title:'Ôn tập 2 lượt',       desc:'Hoàn thành 2 lượt ôn tập',              target:2, xp:20, category:'research', event:'REVIEW_DONE' },
  // LESSON PLAN
  { type:'lesson_plan', difficulty:'normal', title:'Mở/chỉnh một KHBD', desc:'Xem hoặc chỉnh giáo án',              target:1, xp:20, category:'teaching', event:'LESSON_PLAN_EDITED' },
  { type:'lesson_plan', difficulty:'hard',   title:'Tạo 1 KHBD mới',    desc:'Soạn 1 kế hoạch bài dạy',             target:1, xp:45, category:'teaching', event:'LESSON_PLAN_CREATED' },
  // QUESTION
  { type:'question', difficulty:'normal', title:'Tạo 3 câu hỏi',       desc:'Soạn 3 câu hỏi cho bài học',           target:3, xp:20, category:'teaching', event:'QUESTION_CREATED' },
  { type:'question', difficulty:'hard',   title:'Tạo 5 câu hỏi',       desc:'Soạn 5 câu hỏi',                       target:5, xp:40, category:'teaching', event:'QUESTION_CREATED' },
  // ACTIVITY / WORKSHEET
  { type:'activity', difficulty:'normal', title:'Lưu 1 hoạt động',    desc:'Lưu hoạt động dạy học',                target:1, xp:20, category:'teaching', event:'ACTIVITY_CREATED' },
  { type:'worksheet', difficulty:'normal', title:'Tạo 1 phiếu học tập',desc:'Tạo phiếu cho học sinh',               target:1, xp:25, category:'teaching', event:'WORKSHEET_CREATED' },
  // TASK
  { type:'task', difficulty:'easy', title:'Hoàn thành 1 task',        desc:'Tick 1 nhiệm vụ cá nhân',               target:1, xp:10, category:'note', event:'TASK_COMPLETED' },
  // MASTER composite — nhiệm vụ hiếm, điểm cao: đọc sâu 1 phiên (tính theo trang đọc)
  { type:'reading', difficulty:'master', title:'Nghiên cứu sâu 1 bài học', desc:'Đọc sâu 25 trang trong ngày', target:25, xp:150, category:'teaching', event:'MASTER_FLOW', isMaster:true, requiresBook:true },
];
