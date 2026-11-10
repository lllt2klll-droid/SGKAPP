import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArchiveRestore,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  CloudOff,
  Download,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  Menu,
  MonitorDown,
  NotebookPen,
  Palette,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import release from "../version.json";
import "./landing.css";

const APP_URL = `${import.meta.env.BASE_URL}?app=1`;
const INSTALLER_URL = release.downloadUrl;
const LIGHT_PREVIEW_URL = `${import.meta.env.BASE_URL}landing-dashboard-light.png`;
const DARK_PREVIEW_URL = `${import.meta.env.BASE_URL}landing-dashboard-dark.png`;
const WHITEBOARD_PREVIEW_URL = `${import.meta.env.BASE_URL}landing-whiteboard-light.png`;

const features = [
  {
    icon: Library,
    title: "Thư viện sách của riêng thầy cô",
    text: "Quản lý học liệu theo lớp, môn học và bộ sách. Thêm sách PDF của mình, tìm nhanh và tiếp tục đọc đúng trang.",
    tone: "blue",
  },
  {
    icon: BookOpen,
    title: "Đọc sách, ghi chú thuận tiện",
    text: "Đánh dấu trang, ghi chú, lưu từ vựng và tra cứu nội dung ngay trong lúc đọc.",
    tone: "violet",
  },
  {
    icon: NotebookPen,
    title: "Chuẩn bị bài dạy",
    text: "Tạo và quản lý kế hoạch bài dạy, hoạt động lớp học, phiếu học tập và tài liệu Word.",
    tone: "orange",
  },
  {
    icon: BookMarked,
    title: "Ngân hàng câu hỏi",
    text: "Lưu câu hỏi theo chủ đề, biên tập nội dung và chọn câu hỏi để sử dụng trong bài dạy.",
    tone: "green",
  },
  {
    icon: Palette,
    title: "Bảng trắng và sơ đồ",
    text: "Phác thảo ý tưởng, tổ chức kiến thức trực quan và lưu bảng làm việc trên thiết bị.",
    tone: "pink",
  },
  {
    icon: ScanLine,
    title: "Công cụ đọc và khai thác tài liệu",
    text: "Quét vùng trang, lưu trích đoạn và dùng các tiện ích hỗ trợ làm việc với học liệu.",
    tone: "cyan",
  },
  {
    icon: Search,
    title: "Tìm kiếm và nghiên cứu",
    text: "Tìm nhanh trong học liệu, so sánh nội dung, quản lý tài liệu tham khảo và xem thống kê.",
    tone: "blue",
  },
  {
    icon: ListChecks,
    title: "Công việc và ý tưởng",
    text: "Ghi lại nhiệm vụ, ý tưởng và hoạt động cần theo dõi trong quá trình chuẩn bị bài.",
    tone: "orange",
  },
  {
    icon: ArchiveRestore,
    title: "Sao lưu và khôi phục",
    text: "Xuất bản sao lưu dữ liệu cá nhân và khôi phục khi cần chuyển sang thiết bị khác.",
    tone: "green",
  },
];

const faqs = [
  {
    question: "Tôi có cần tạo tài khoản không?",
    answer: "Không. Ứng dụng hiện không yêu cầu tài khoản. Dữ liệu cá nhân được lưu trên thiết bị hoặc trình duyệt đang sử dụng.",
  },
  {
    question: "Dữ liệu sách và ghi chú được lưu ở đâu?",
    answer: "Sách được lưu trong thư mục thư viện của máy chạy ứng dụng; cài đặt, tiến độ đọc và dữ liệu cá nhân được lưu trong hồ sơ ứng dụng hoặc trình duyệt. Ứng dụng không tự đồng bộ lên cloud. Hãy xuất bản sao lưu trước khi đổi máy hoặc xóa dữ liệu trình duyệt.",
  },
  {
    question: "Có thể sử dụng khi không có Internet không?",
    answer: "Ứng dụng desktop và một số nội dung đã tải có thể sử dụng cục bộ. Tải sách, kiểm tra bản cập nhật, nội dung web và các tính năng AI cần kết nối Internet.",
  },
  {
    question: "Tính năng AI có sẵn ngay sau khi cài không?",
    answer: "Các tính năng AI cần cấu hình API key tương ứng và có thể gửi yêu cầu đến nhà cung cấp AI. Thầy cô nên xem lại nội dung trước khi chia sẻ và không gửi dữ liệu nhạy cảm của học sinh.",
  },
  {
    question: "Nên cài bản Windows hay cài từ trình duyệt?",
    answer: "Bản Windows là ứng dụng desktop độc lập. Trình duyệt tương thích có thể cho phép cài ứng dụng web từ menu cài đặt; lựa chọn này phụ thuộc vào thiết bị và trình duyệt.",
  },
];

function getInstallInstructions() {
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) {
    return "Trên iPhone/iPad: mở menu Chia sẻ trong Safari, chọn “Thêm vào màn hình chính”.";
  }
  if (/android/i.test(ua)) {
    return "Trên Android: mở menu ⋮ của Chrome rồi chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.";
  }
  return "Trên máy tính: mở menu cài đặt của Chrome hoặc Edge và chọn “Cài đặt trang web dưới dạng ứng dụng”.";
}

export default function LandingPage() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallMessage("Ứng dụng đã được cài đặt trên thiết bị này.");
    };
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    const targets = [...document.querySelectorAll("[data-reveal]")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("site-reveal", "is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;
        target.classList.add("is-visible");
        currentObserver.unobserve(target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -32px 0px" });

    targets.forEach((target) => {
      target.classList.add("site-reveal");
      observer.observe(target);
    });

    return () => observer.disconnect();
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallMessage(getInstallInstructions());
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallMessage(
      choice.outcome === "accepted"
        ? "Đang cài ứng dụng. Thầy cô có thể mở ứng dụng từ màn hình chính hoặc menu ứng dụng."
        : "Thầy cô có thể cài ứng dụng bất cứ lúc nào từ menu của trình duyệt.",
    );
    setInstallPrompt(null);
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site">
      <a className="site-skip" href="#site-content">Bỏ qua đến nội dung chính</a>
      <header className="site-header">
        <a className="site-brand" href="#top" aria-label="Hành trang Tiểu học — đầu trang">
          <span className="site-brand-mark"><GraduationCap size={23} strokeWidth={2.2} /></span>
          <span><strong>Hành trang Tiểu học</strong><small>KHÔNG GIAN LÀM VIỆC GIÁO VIÊN</small></span>
        </a>
        <button
          className="site-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav className={`site-nav${menuOpen ? " is-open" : ""}`} aria-label="Điều hướng chính">
          <a href="#features" onClick={closeMenu}>Tính năng</a>
          <a href="#how-it-works" onClick={closeMenu}>Bắt đầu</a>
          <a href="#privacy" onClick={closeMenu}>Dữ liệu & riêng tư</a>
          <a href="#faq" onClick={closeMenu}>Câu hỏi thường gặp</a>
          <a className="site-nav-cta" href={APP_URL} onClick={closeMenu}>Mở ứng dụng <ArrowRight size={16} /></a>
        </nav>
      </header>

      <main id="site-content">
        <section className="site-hero" id="top">
          <div className="site-hero-copy" data-reveal="up">
            <div className="site-eyebrow"><Sparkles size={15} /> DÀNH CHO GIÁO VIÊN TIỂU HỌC</div>
            <h1>Mọi điều thầy cô cần để <span>chuẩn bị một ngày dạy học</span></h1>
            <p className="site-hero-lead">
              Đọc học liệu, soạn bài, lưu ý tưởng và tổ chức công việc trong một không gian làm việc gọn gàng — được thiết kế cho thầy cô.
            </p>
            <div className="site-hero-actions">
              <a className="site-button site-button-primary" href={APP_URL}>
                <LayoutDashboard size={18} /> Dùng ứng dụng web
              </a>
              <a className="site-button site-button-secondary" href="#install">
                <Download size={18} /> Cài đặt ứng dụng
              </a>
            </div>
            <div className="site-hero-notes">
              <span><Check size={15} /> Không cần tạo tài khoản</span>
              <span><CloudOff size={15} /> Dữ liệu cá nhân lưu trên thiết bị</span>
            </div>
          </div>

          <div className="site-preview" data-reveal="right" aria-label="Ảnh chụp ứng dụng ở giao diện sáng và tối">
            <figure className="site-preview-window site-preview-light">
              <img src={LIGHT_PREVIEW_URL} alt="Ảnh chụp thực tế trang Tổng quan ở giao diện sáng" fetchPriority="high" />
              <figcaption className="site-preview-badge site-preview-badge-light"><i /> Giao diện sáng</figcaption>
            </figure>
            <figure className="site-preview-window site-preview-dark">
              <img src={DARK_PREVIEW_URL} alt="Ảnh chụp thực tế trang Tổng quan ở giao diện tối" loading="lazy" />
              <figcaption className="site-preview-badge site-preview-badge-dark"><i /> Giao diện tối</figcaption>
            </figure>
            <div className="site-preview-float"><span><ShieldCheck size={16} /></span><div><b>Ảnh chụp thực tế</b><small>Hai giao diện có sẵn trong ứng dụng</small></div></div>
            <div className="site-preview-orb site-preview-orb-one" />
            <div className="site-preview-orb site-preview-orb-two" />
          </div>
          <a className="site-scroll-cue" href="#features"><ArrowDown size={16} /> Khám phá không gian làm việc</a>
        </section>

        <section className="site-section site-features" id="features">
          <div className="site-section-heading" data-reveal="up">
            <span className="site-eyebrow">MỘT NƠI, NHIỀU CÔNG CỤ</span>
            <h2>Tập trung vào điều quan trọng: <span>việc dạy và học</span></h2>
            <p>Từ lúc mở sách đến khi hoàn thiện bài dạy, các công cụ quen thuộc được sắp xếp trong cùng một không gian.</p>
          </div>
          <div className="site-feature-grid">
            {features.map(({ icon: Icon, title, text, tone }) => (
              <article className="site-feature-card" data-reveal="up" key={title}>
                <span className={`site-feature-icon tone-${tone}`}><Icon size={21} strokeWidth={1.9} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-showcase" aria-labelledby="site-showcase-title">
          <div className="site-showcase-inner">
            <div className="site-showcase-copy" data-reveal="left">
              <span className="site-eyebrow">MỘT KHÔNG GIAN, NHIỀU CÁCH LÀM VIỆC</span>
              <h2 id="site-showcase-title">Phác thảo và kết nối ý tưởng trên bảng trắng</h2>
              <p>Tạo sơ đồ tư duy, sắp xếp mục tiêu bài học và phát triển ý tưởng ngay trong không gian làm việc của thầy cô.</p>
              <div className="site-showcase-points">
                <span><Check size={16} /> Sơ đồ và ghi chú trên cùng một bảng</span>
                <span><Check size={16} /> Tùy chỉnh màu sắc, nét vẽ và bố cục</span>
              </div>
              <a className="site-text-link" href={`${APP_URL}#/whiteboard`}>Khám phá bảng trắng <ArrowRight size={17} /></a>
            </div>
            <figure className="site-showcase-image" data-reveal="right">
              <img src={WHITEBOARD_PREVIEW_URL} alt="Ảnh chụp thực tế bảng trắng với sơ đồ tư duy bài học" loading="lazy" />
              <figcaption><span /> Ảnh chụp thực tế · Bảng trắng</figcaption>
            </figure>
          </div>
        </section>

        <section className="site-workflow" id="how-it-works">
          <div className="site-workflow-copy" data-reveal="left">
            <span className="site-eyebrow">BẮT ĐẦU THẬT ĐƠN GIẢN</span>
            <h2>Không cần thay đổi cách làm việc của thầy cô</h2>
            <p>Mở ứng dụng, thêm học liệu của mình và chọn công cụ phù hợp với công việc hôm nay.</p>
            <a className="site-text-link" href={APP_URL}>Khám phá ứng dụng <ArrowRight size={17} /></a>
          </div>
          <ol className="site-steps" data-reveal="right">
            <li><span>01</span><div><b>Mở trên web hoặc cài ứng dụng</b><p>Dùng ngay trên trình duyệt hoặc cài bản web lên thiết bị. Người dùng Windows có thể tải ứng dụng desktop.</p></div></li>
            <li><span>02</span><div><b>Thêm sách và tài liệu của thầy cô</b><p>Đưa học liệu vào thư viện cá nhân; ứng dụng không tự cung cấp hay tải sẵn sách có bản quyền.</p></div></li>
            <li><span>03</span><div><b>Làm việc và sao lưu định kỳ</b><p>Đọc, ghi chú, soạn bài — rồi xuất bản sao lưu để giữ dữ liệu an toàn khi đổi máy.</p></div></li>
          </ol>
        </section>

        <section className="site-privacy" id="privacy">
          <div className="site-privacy-icon" data-reveal="up"><ShieldCheck size={25} /></div>
          <div className="site-privacy-copy" data-reveal="up">
            <span className="site-eyebrow">RIÊNG TƯ THEO THIẾT KẾ</span>
            <h2>Dữ liệu của thầy cô, thầy cô kiểm soát</h2>
            <p>Ứng dụng không yêu cầu tài khoản và không tự đồng bộ dữ liệu lên cloud. Thư viện và dữ liệu cá nhân được lưu cục bộ trên máy hoặc trình duyệt đang dùng.</p>
            <div className="site-privacy-points">
              <span><Check size={15} /> Có công cụ xuất và khôi phục bản sao lưu</span>
              <span><Check size={15} /> Có thể dùng nhiều tính năng khi ngoại tuyến</span>
              <span><Check size={15} /> AI và nội dung trực tuyến cần Internet; AI cần API key</span>
            </div>
          </div>
          <div className="site-privacy-card" data-reveal="up"><CloudOff size={20} /><b>Không tự đồng bộ cloud</b><span>Hãy tự sao lưu trước khi đổi thiết bị hoặc xóa dữ liệu trình duyệt.</span></div>
        </section>

        <section className="site-install" id="install">
          <div className="site-install-heading" data-reveal="up">
            <span className="site-eyebrow">DÙNG THEO CÁCH CỦA THẦY CÔ</span>
            <h2>Mở ngay hôm nay, cài đặt khi sẵn sàng</h2>
            <p>Chọn cách phù hợp với thiết bị. Bản desktop Windows và cài đặt từ trình duyệt là hai lựa chọn riêng.</p>
          </div>
          <div className="site-install-grid">
            <article className="site-install-card site-install-web" data-reveal="up">
              <span className="site-install-icon"><MonitorDown size={22} /></span>
              <span className="site-install-tag">CÀI TỪ TRÌNH DUYỆT</span>
              <h3>Cài ứng dụng web</h3>
              <p>Thêm ứng dụng vào màn hình chính hoặc menu ứng dụng để mở nhanh như một app.</p>
              <button className="site-button site-button-primary" type="button" onClick={installApp} disabled={installed}>
                {installed ? <><Check size={17} /> Đã cài trên thiết bị</> : <><Download size={17} /> Cài đặt trên thiết bị</>}
              </button>
              <p className="site-install-message" aria-live="polite">{installMessage}</p>
              <small>Khả năng cài đặt phụ thuộc trình duyệt và thiết bị.</small>
            </article>
            <article className="site-install-card site-install-windows" data-reveal="up">
              <span className="site-install-icon"><Download size={22} /></span>
              <span className="site-install-tag">DÀNH CHO WINDOWS</span>
              <h3>Ứng dụng desktop</h3>
              <p>Tải trang phát hành để chọn bộ cài Windows hoặc bản portable mới nhất.</p>
              <a className="site-button site-button-dark" href={INSTALLER_URL} target="_blank" rel="noreferrer">
                <MonitorDown size={17} /> Tải ứng dụng Windows <ArrowRight size={16} />
              </a>
              <small>Phiên bản trong gói hiện tại: {release.version}. Kiểm tra ghi chú và yêu cầu trước khi cài.</small>
            </article>
          </div>
          <div className="site-install-note"><CircleHelp size={17} /><span>Không thấy tùy chọn cài đặt web? Dùng menu cài đặt của trình duyệt để thêm trang vào màn hình chính hoặc cài như ứng dụng.</span><ChevronDown size={16} /></div>
        </section>

        <section className="site-faq" id="faq">
          <div className="site-section-heading" data-reveal="up">
            <span className="site-eyebrow">GIẢI ĐÁP TRƯỚC KHI BẮT ĐẦU</span>
            <h2>Câu hỏi thường gặp</h2>
          </div>
          <div className="site-faq-list" data-reveal="up">
            {faqs.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question}<ChevronDown size={18} /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="site-final-cta" data-reveal="up">
          <span className="site-final-icon"><GraduationCap size={25} /></span>
          <h2>Sẵn sàng chuẩn bị bài dạy?</h2>
          <p>Mở không gian làm việc và bắt đầu với học liệu của thầy cô.</p>
          <a className="site-button site-button-white" href={APP_URL}>Mở ứng dụng web <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer className="site-footer">
        <a className="site-brand site-brand-footer" href="#top">
          <span className="site-brand-mark"><GraduationCap size={20} /></span>
          <span><strong>Hành trang Tiểu học</strong><small>Không gian làm việc dành cho giáo viên</small></span>
        </a>
        <div className="site-footer-links">
          <a href="#features">Tính năng</a>
          <a href="#privacy">Quyền riêng tư</a>
          <a href="#faq">Trợ giúp</a>
          <a href={INSTALLER_URL} target="_blank" rel="noreferrer">Bản phát hành <ArrowRight size={13} /></a>
        </div>
        <div className="site-footer-bottom">
          <span>© 2026 Nguyễn Tuấn. Bản quyền thuộc về tác giả.</span>
          <span>Phiên bản {release.version} · Dành cho giáo viên tiểu học</span>
        </div>
      </footer>
    </div>
  );
}
