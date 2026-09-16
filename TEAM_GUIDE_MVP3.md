# HƯỚNG DẪN TEAM — SHOPIFY MOCKUP ADS MVP3

## Mục tiêu

MVP3 giúp giảm thao tác khi đưa mockup ads lên Shopify:

- Tự nhận diện Shopify store handle và Product ID.
- Đổi tên mockup theo Product ID.
- Mở đúng Shopify Content → Files.
- Upload trực tiếp, không cần tải file đã đổi tên xuống máy.
- Lưu lịch sử các lần gửi file.

## Cách sử dụng

1. Mở một Product trong Shopify Admin.
2. Mở extension và chọn tab **MVP3 · Mockup Ads**.
3. Bấm nút refresh tại **Current Context**.
4. Kiểm tra lại **Shopify store handle** và **Product ID**.
5. Bấm **Chọn PNG/JPG mockup ads**.
6. Kiểm tra tên mới hiển thị bên cạnh tên gốc.
7. Bấm **Upload trực tiếp lên Shopify**.
8. Chờ extension mở Shopify Content → Files và gửi file.

## Quy tắc đổi tên

Một mockup:

```text
MK-Ads.jpg → 10430345740610.jpg
```

Nhiều mockup:

```text
MK-Ads-Front.jpg → 10430345740610-01.jpg
MK-Ads-Back.jpg  → 10430345740610-02.jpg
```

## Lưu ý về file trùng tên

Nếu Shopify Files đã có file cùng tên, Shopify không ghi đè file cũ. Shopify sẽ
tự thêm hậu tố vào tên file mới:

```text
10430345740610.jpg
→ 10430345740610_255287c....jpg
```

Vì vậy, trước khi upload cần kiểm tra file cùng Product ID đã tồn tại hay chưa.
Bản v0.3.0 chưa tự động xóa hoặc replace file cũ để tránh ghi đè nhầm dữ liệu.

## Xử lý sự cố

### Không tự nhận Product ID

- Mở đúng trang Product trong Shopify Admin.
- Bấm refresh trong Current Context.
- Nếu vẫn không nhận, nhập Product ID thủ công.

### Không mở được Shopify Files

- Kiểm tra store handle.
- Đảm bảo đang đăng nhập đúng Shopify store.
- Reload extension và Shopify Admin rồi thử lại.

### Báo không tìm thấy Upload files

1. Mở Shopify Content → Files.
2. Reload trang.
3. Bấm lại **Upload trực tiếp lên Shopify**.

### Shopify thêm chuỗi ký tự vào tên

Shopify Files đã có file cùng tên. Xác nhận file cũ trước khi xóa hoặc replace,
sau đó upload lại nếu cần giữ đúng tên Product ID.

## Checklist

- [ ] Đang đăng nhập đúng Shopify store.
- [ ] Store handle chính xác.
- [ ] Product ID chính xác.
- [ ] Tên mới hiển thị đúng trong extension.
- [ ] Đã kiểm tra file cùng Product ID trên Shopify Files.
- [ ] Đã nhận thông báo gửi file thành công.
