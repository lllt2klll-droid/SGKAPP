HƯỚNG DẪN GẮN PLACEHOLDER VÀO FILE MẪU KHBD-mau.docx
================================================
File mẫu app đang dùng: public/templates/KHBD-mau.docx
(Copy từ: KHBD - mẫu/KTSP_MẪU KẾ HOẠCH BÀI DẠY.docx)

CÁCH GẮN (trong Word):
1. Mở KHBD-mau.docx bằng Word.
2. Tìm từng chỗ trống cần fill (VD: "Môn học: ..." hoặc "Năm học: 2024 - 2025").
3. Gõ placeholder (VD "ten_bai" nghĩa là gõ {{ten_bai}}) LIỀN MỘT MẠCH, không sửa chữ bên trong sau khi gõ,
   không bôi đậm 1 nửa placeholder (Word sẽ chẻ placeholder thành nhiều đoạn
   và engine phải gộp lại — vẫn chạy nhưng chậm hơn).
4. Lưu file, F5 lại app, bấm "Thêm KHBD (.docx)" để kiểm tra.

Ô ĐƠN (gõ vào chỗ trống tương ứng trong mẫu):
  Trang bìa:
    {{lop_cover}}     VD "2"  (dòng KẾ HOẠCH BÀI DẠY LỚP ..)
    {{mon_ten_bai}}   VD "TOÁN: Phép cộng trong phạm vi 10"
    {{sv}} {{mssv}} {{lop_sv}} {{gvhd}} {{nam_hoc}}
  Khối tiêu đề:
    {{mon_hoc}} {{lop}} {{tuan}} {{so_tiet}} {{ten_bai}}
    {{ho_ten}} {{mssv_tt}} {{lop_day}} {{thoi_gian}}
  Mục I:
    {{nl_dacthu_1}} {{nl_dacthu_2}} {{nl_dacthu_3}} {{lien_he}}
    {{nl_chung_1}} {{nl_chung_2}} {{nl_chung_3}}
    {{pham_chat_1}} {{pham_chat_2}} {{pham_chat_3}}
  Mục II:
    {{dd_gv}} {{dd_hs}}   (mỗi dòng tự thành 1 dòng "+ ..." trong Word)
  Mục IV + V:
    {{dieu_chinh}} {{phu_luc}}

KHỐI LẶP — Mục III (quan trọng):
  Mỗi phân khu A/B/C/D cần 1 KHỐI bọc sẵn trong mẫu:
    Gõ {{#HD_A}} ở ngay TRƯỚC đoạn mẫu của khu A,
    và {{/HD_A}} ở ngay SAU đoạn mẫu của khu A.
    Làm tương tự cho {{#HD_B}}...{{/HD_B}}, {{#HD_C}}...{{/HD_C}}, {{#HD_D}}...{{/HD_D}}.
  Bên TRONG khối, thay các chỗ trống mẫu bằng:
    {{hd_stt}} {{hd_ten}} {{hd_phut}} {{hd_muctieu}}
    {{hd_ppdh}} {{hd_dddh}} {{hd_gv}} {{hd_hs}} {{hd_ketluan}}
  Khi xuất: khối được nhân bản theo số hoạt động thực tế của khu đó.
  Khu nào không có hoạt động → khối bị xóa (trống).
  (Tùy chọn nâng cao) Khối bước lồng trong khối HD:
    {{#BUOC}} ... {{buoc_stt}} {{buoc_gv}} {{buoc_hs}} ... {{/BUOC}}
  Nếu không gắn khối BUOC, {{hd_gv}}/{{hd_hs}} tự gộp các bước thành nhiều dòng.

ẢNH MINH HỌA (mới):
  Ảnh dán/kéo-thả trong từng bước CHỈ xuất hiện khi dùng chế độ dựng tự động
  (mẫu chưa gắn placeholder). Chế độ copy-mẫu-fill-chữ không nhúng được ảnh
  vì placeholder là text thuần — chữ vẫn ra đủ, ảnh bỏ qua.

KIỂM TRA NHANH:
  Mở DevTools Console và chạy:
    import("./khbd/templateEngine.js").then(m => m.inspectTemplate().then(console.log))
  Kết quả liệt kê mọi placeholder engine nhìn thấy trong mẫu.
  Chỗ nào trong form có dữ liệu mà file ra vẫn trống → placeholder đó chưa được gắn.
