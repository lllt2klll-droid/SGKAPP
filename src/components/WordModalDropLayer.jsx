import { useFileDrag } from "./fileDropzoneUtils.js";

export default function WordModalDropLayer({
  children,
  onDocx,
  onImage,
  onError,
}) {
  const { dragActive, bind } = useFileDrag({
    accept: ".docx,image/*,.png,.jpg,.jpeg,.gif,.webp",
    multiple: false,
    onFiles: (files) => {
      const file = Array.isArray(files) ? files[0] : files;
      if (!file) return;
      const name = (file.name || "").toLowerCase();
      if (name.endsWith(".docx")) onDocx?.(file);
      else if (
        (file.type || "").startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp)$/.test(name)
      ) {
        onImage?.(file);
      } else {
        onError?.(
          `Kéo thả hỗ trợ .docx và ảnh. File "${file.name}" chưa hỗ trợ ở đây.`,
        );
      }
    },
    onError,
  });

  return (
    <div
      {...bind}
      style={{ position: "relative" }}
      title="Mẹo: kéo thả file .docx hoặc ảnh vào đây để nhập nhanh"
    >
      {dragActive && (
        <div className="global-drag-overlay" aria-hidden="true">
          <span>Thả .docx để nhập Word • Thả ảnh để chèn</span>
        </div>
      )}
      {children}
    </div>
  );
}
