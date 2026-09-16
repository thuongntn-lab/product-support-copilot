# MVP2 · Artwork

MVP2 hỗ trợ tạo và kiểm tra Artwork trên Customall. Tool không tự bấm Save hoặc Push để người dùng còn bước kiểm tra cuối.

## Tạo artwork

1. Mở PS Copilot và chọn `MVP2 · Artwork`.
2. Nhập `Artwork title`, `Category` và `Product base`. Nếu Product base giống Category thì có thể để trống.
3. Bấm `Mở & điền Add new artwork`.
4. Tool mở trang Artworks, điền Title, chọn Category, chọn `Printarea size`, chọn Product base và giữ format PNG. Customall tự lấy Width/Height.
5. Kiểm tra lại form trên Customall rồi tự bấm `Save`.

## Kiểm tra artwork

1. Mở một Artwork editor trên Customall.
2. Trong MVP2, bấm `Kiểm tra`.
3. Tool đếm template và layer, đồng thời cảnh báo:
   - Chưa có template hoặc layer.
   - Layer trùng tên.
   - Layer còn tên mặc định như `Text #1` hoặc `Image #1`.

## Lưu ý

- Tool chỉ điền các phần cố định và kiểm tra cấu trúc.
- Vị trí, kích thước và thứ tự layer vẫn cần PS kiểm tra theo thiết kế.
- Tool không tự Save artwork, thay thumbnail hay Push campaign trong phiên bản này.

## Transform nhiều layer

1. Mở Artwork editor và chọn `MVP2 · Artwork`.
2. Bấm `Quét layer`, sau đó tick các layer cần chỉnh.
3. Nhập một hoặc nhiều trường `X`, `Y`, `Width`, `Height`, `Rotate`, `Skew`.
4. Bấm `Apply cho layer đã chọn`.
5. Ô để trống giữ nguyên giá trị hiện tại của từng layer. Tool không tự bấm Save.

## Replace Label nhiều layer

1. Tick các layer cần đổi Label.
2. Nhập `Tìm` và `Thay bằng`, rồi bấm `Replace Label đã chọn`.
3. Nếu để trống `Tìm`, toàn bộ Label của mỗi layer sẽ được đặt thành nội dung `Thay bằng`.
4. Layer không hỗ trợ Label sẽ được bỏ qua và báo trong kết quả.
