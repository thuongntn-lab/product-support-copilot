# HƯỚNG DẪN TEAM — CUSTOMALL UPLOAD COPILOT MVP1

## 1. Mục tiêu

Product Support Copilot giúp team kiểm tra và upload clipart nhanh hơn, giảm
các lỗi thường gặp trước khi đưa file lên Customall:

- File hệ thống như `Thumbs.db`.
- Ảnh sai định dạng, ảnh hỏng hoặc vượt giới hạn.
- Trùng nội dung ảnh.
- Trùng tên và số thứ tự.
- Thiếu số trong chuỗi.
- Tên chưa đủ ba chữ số.
- Sai cấu trúc folder.

Extension kiểm tra toàn bộ folder, cho xem trước tên Output và chuyển trực tiếp
file sang Customall. Không cần tạo hoặc tải ZIP xuống máy.

---

## 2. Chuẩn bị

1. Cài extension **Product Support Copilot** trên Chrome.
2. Mở `chrome://extensions` và kiểm tra extension đang bật.
3. Đăng nhập Customall.
4. Mở trang:
   `https://app.customall.io/cliparts`

Nếu extension vừa được cập nhật, bấm **Reload** tại `chrome://extensions`, sau
đó reload lại trang Customall.

---

## 3. Quy trình sử dụng chuẩn

### Bước 1 — Chọn folder

1. Mở extension.
2. Chọn tab **MVP1 · Cliparts**.
3. Bấm **Chọn folder clipart**.
4. Chọn folder lớn ngoài cùng.

Extension hỗ trợ một folder lớn có nhiều folder con và giữ nguyên cấu trúc khi
upload.

Ví dụ:

```text
Animals/
├── Dogs/
│   ├── Skin 001.png
│   └── Skin 002.png
└── Cats/
    ├── Skin 001.png
    └── Skin 002.png
```

Không nên để một folder vừa chứa file ảnh trực tiếp, vừa chứa folder con.

### Bước 2 — Đọc kết quả kiểm tra

Extension hiển thị:

- **Files:** tổng số ảnh đã đọc.
- **Valid:** số ảnh không có lỗi nghiêm trọng.
- **Warnings:** số cảnh báo cần kiểm tra.
- **Errors:** số lỗi bắt buộc phải sửa.

Ý nghĩa trạng thái:

- **Ready:** file có thể upload.
- **Warning:** vẫn có thể upload nhưng cần xem lại.
- **Error:** extension chặn upload cho đến khi lỗi được sửa.

Bấm vào:

- Cột **File** để xem đầy đủ tên gốc.
- Cột **Output** để xem đầy đủ tên sau chỉnh sửa.
- Badge **Warning/Error** để xem đúng nguyên nhân của file.

### Bước 3 — Kiểm tra số thứ tự

Tên hợp lệ:

```text
Skin 001.png
Skin 002.png
Skin 003.png
```

Extension luôn kiểm tra chuỗi số, dù có bật chuẩn hóa tên hay không:

- `Skin 005` rồi tới `Skin 007` → cảnh báo thiếu `006`.
- Hai file cùng nhóm đều là `Skin 002` → Error.
- File không có số ở cuối → Warning.

Tên giống phần chữ nhưng khác số là hợp lệ, ví dụ `A 001`, `A 002`, `A 003`.

### Bước 4 — Chuẩn hóa tên

Khi bật **Tự chuẩn hóa tên**, số ở cuối được chuyển thành tối thiểu ba chữ số:

```text
Skin 1.png   → Skin 001.png
Skin 12.png  → Skin 012.png
Skin 001.png → Skin 001.png
```

Luôn kiểm tra cột **Output** trước khi upload.

### Bước 5 — Replace/Edit tên hàng loạt

Mở phần **Replace / edit tên hàng loạt** khi cần sửa cùng một nội dung trong
nhiều tên.

Ví dụ:

```text
Tìm:       Schnoodle
Thay bằng: Skin
```

Kết quả:

```text
Schnoodle 005.png → Skin 005.png
Schnoodle 007.png → Skin 007.png
```

Lưu ý:

- Replace không phân biệt chữ hoa và chữ thường.
- Để trống ô **Thay bằng** nếu muốn xóa nội dung tìm thấy.
- Có thể áp dụng nhiều lần liên tiếp.
- Bấm **Hoàn tác** để xóa toàn bộ batch edit.
- Extension không thay đổi đuôi file.
- Nếu replace tạo tên trùng hoặc tên không hợp lệ, extension báo Error và chặn
  upload.

### Bước 6 — Upload

1. Đảm bảo **Errors = 0**.
2. Kiểm tra các Warning còn lại.
3. Mở sẵn trang `https://app.customall.io/cliparts`.
4. Bấm **Upload to Customall**.
5. Chờ Customall nhận và xử lý toàn bộ clipart.

Extension chuyển trực tiếp từng file cùng đường dẫn folder sang Customall,
không tạo ZIP.

---

## 4. Các rule đang áp dụng

| Rule | Kết quả |
|---|---|
| PNG, JPG, JPEG | Hợp lệ |
| File lớn hơn 32 MB | Warning |
| File lớn hơn 64 MB | Error |
| Ảnh lớn hơn 64 megapixel | Error |
| Ảnh hỏng hoặc không đọc được | Error |
| Trùng nội dung ảnh | Warning |
| Trùng nhóm và số thứ tự | Error |
| Thiếu số trong chuỗi | Warning |
| Không có số ở cuối tên | Warning |
| Tên Output trùng sau chỉnh sửa | Error |
| Folder vừa chứa file vừa chứa folder con | Error |
| `Thumbs.db`, `desktop.ini`, `.DS_Store` | Tự động bỏ qua |

---

## 5. Checklist trước khi bấm Upload

- [ ] Đã chọn đúng folder lớn ngoài cùng.
- [ ] Số lượng Files đúng với dự kiến.
- [ ] Errors bằng 0.
- [ ] Đã xem và xác nhận các Warning.
- [ ] Chuỗi số không bị thiếu ngoài chủ đích.
- [ ] Cột Output hiển thị đúng tên cần upload.
- [ ] Không có tên Output bị trùng.
- [ ] Đã mở và đăng nhập trang Customall Cliparts.

---

## 6. Xử lý sự cố nhanh

### Không thấy file hoặc số lượng file sai

- Chọn lại đúng folder ngoài cùng.
- Kiểm tra file có đúng PNG/JPG/JPEG không.
- `Thumbs.db` và các file hệ thống được tự động bỏ qua nên không tính vào Files.

### Warning không rõ nguyên nhân

Bấm trực tiếp badge **Warning** của dòng đó để xem chi tiết.

### Thiếu số nhưng không thấy cảnh báo

Reload extension, chọn lại folder và xác nhận đang sử dụng phiên bản mới nhất.

### Nút Upload bị khóa

Kiểm tra **Errors** và các dòng badge đỏ. Sửa lỗi trong folder gốc, sau đó chọn
lại folder để extension quét lại.

### Customall không nhận clipart

1. Xác nhận đang đăng nhập Customall.
2. Mở đúng trang `https://app.customall.io/cliparts`.
3. Reload trang Customall.
4. Reload extension.
5. Chọn lại folder và upload lại.

---

## 7. Kịch bản trình bày nhanh cho team

> Hôm nay team sẽ dùng Product Support Copilot để kiểm tra folder trước khi
> upload. Mình chỉ cần chọn folder lớn ngoài cùng, extension sẽ đọc toàn bộ
> folder con, bỏ qua file hệ thống và kiểm tra định dạng, dung lượng, ảnh hỏng,
> nội dung trùng, tên trùng và số thứ tự bị thiếu.
>
> Phần quan trọng nhất là phân biệt Warning và Error. Warning cần xem lại nhưng
> không chặn upload. Error là lỗi bắt buộc sửa. Team có thể bấm vào tên file để
> xem đầy đủ tên và bấm badge Warning hoặc Error để xem nguyên nhân.
>
> Nếu bật Tự chuẩn hóa tên, `Skin 1` sẽ được đổi thành `Skin 001`. Nếu cần đổi
> cùng một chữ trên nhiều file, dùng Replace/Edit tên hàng loạt và kiểm tra kết
> quả ở cột Output.
>
> Khi Errors bằng 0 và Output đã đúng, mở trang Customall Cliparts rồi bấm
> Upload to Customall. Extension sẽ chuyển trực tiếp file và cấu trúc folder,
> không cần tạo ZIP.

## 8. Demo đề xuất

Chuẩn bị một folder mẫu có:

- Một chuỗi `Skin 001`, `Skin 002`, `Skin 004` để demo cảnh báo thiếu `003`.
- Một file `Skin 5` để demo chuẩn hóa thành `Skin 005`.
- Một vài file chứa cùng từ khóa để demo Replace hàng loạt.
- Một `Thumbs.db` để demo tự động bỏ qua.

Thứ tự demo:

1. Chọn folder.
2. Giải thích bốn chỉ số.
3. Bấm tooltip File, Output và Warning.
4. Bật/tắt chuẩn hóa tên.
5. Replace hàng loạt.
6. Kiểm tra Errors bằng 0.
7. Upload sang Customall.
