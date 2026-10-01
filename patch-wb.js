import fs from 'fs';
let s = fs.readFileSync('src/whiteboard/WhiteboardView.jsx','utf8');
const reps = [
  ['notify("Đã tạo mindmap");','notify("Đã tạo mindmap"); playWb("success");'],
  ['notify("Đã thêm mẫu");','notify("Đã thêm mẫu"); playWb("open");'],
  ['notify("Đã thêm nhánh con");','notify("Đã thêm nhánh con"); playWb("open");'],
  ['notify("Đã gộp nhóm");','notify("Đã gộp nhóm"); playWb("success");'],
  ['notify("Đã tách nhóm");','notify("Đã tách nhóm"); playWb("success");'],
  ['notify("Đã xóa khối");','notify("Đã xóa khối"); playWb("close");'],
  ['notify("Đã xóa đường nối");','notify("Đã xóa đường nối"); playWb("close");'],
  ['notify("Đã sao chép");','notify("Đã sao chép"); playWb("click");'],
  ['notify("Đã dán");','notify("Đã dán"); playWb("open");'],
  ['notify("Đã căn chỉnh");','notify("Đã căn chỉnh"); playWb("click");'],
  ['notify("Đã phân bố đều");','notify("Đã phân bố đều"); playWb("click");'],
  ['notify("Đã thêm ảnh");','notify("Đã thêm ảnh"); playWb("success");'],
  ['notify("Đã xuất file");','notify("Đã xuất file"); playWb("success");'],
  ['notify("Đã vừa màn hình");','notify("Đã vừa màn hình"); playWb("click");'],
];
for (const [a,b] of reps) s = s.split(a).join(b);
s = s.replace('notify("Đã nhân bản bảng");', 'notify("Đã nhân bản bảng"); playWb("open");');
s = s.replace('notify("Đã xóa bảng");', 'notify("Đã xóa bảng"); playWb("close");');
s = s.replace('notify(`Đã mở “${b.name}”`);', 'notify(`Đã mở “${b.name}”`); playWb("open");');
s = s.replaceAll('notify("Đã thêm");', 'notify("Đã thêm"); playWb("open");');
s = s.replace('notify("Sơ đồ mẫu — không phải kết quả AI");', 'notify("Sơ đồ mẫu — không phải kết quả AI"); playWb("notification");');
s = s.replace('notify("AI đã tạo sơ đồ");', 'notify("AI đã tạo sơ đồ"); playWb("aiComplete");');
fs.writeFileSync('src/whiteboard/WhiteboardView.jsx', s);
console.log('patched');
