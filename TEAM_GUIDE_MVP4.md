# HƯỚNG DẪN TEAM — MVP4 LARK LIVE PRODUCT DATA

## Mục đích

Giảm thao tác dò Shipping ETA/Page và GMC Color/Material khi cập nhật product Shopify.
Extension luôn lấy dữ liệu mới tại thời điểm bấm từ hai Lark Sheet dùng chung.

## Cách dùng

1. Mở product cần xử lý trong Shopify Admin.
2. Mở Product Support Copilot và chọn `MVP4 · Lark Data`.
3. Kiểm tra ô `Product Type`.
   - Có thể bấm nút refresh để extension đọc từ trang Shopify.
   - Nếu Shopify chưa hiển thị Product Type trong trang hiện tại, nhập thủ công.
4. Bấm `Đọc Lark & điền Shopify`.
5. Extension tự điền đúng các metafield:
   - Shipping ETA: `custom.shipping_eta`
   - Shipping Page: `custom.shipping_page`
   - GMC Material: `custom.gmc_material`
   - GMC Color: `custom.custom_gmc_color`
6. Kiểm tra các field đã điền rồi bấm Save trên Shopify.
7. Shopify Category được điền tự động từ `Category breadcrumb`; Category ID vẫn có thể Copy riêng khi cần.
8. Kiểu dữ liệu Shopify: GMC Material/Color là single-line text, Shipping ETA là JSON, Shipping Page là Page reference.
9. Extension tự chọn Category và Shipping Page tương ứng với Lark, rồi tự Save sau khi xác nhận đủ; nếu thiếu trường thì không Save.

## Quy tắc dữ liệu

- Dò theo `Product Type`.
- Không tự đoán hoặc lấy Product Type gần giống.
- Nếu bảng ETA có Product Type, lấy `Code` và `Shipping Page` trên đúng cùng dòng.
- Nếu bảng ETA không có Product Type, lấy `Code` và `Shipping Page` của dòng
  `Others (Sản phẩm đi từ TQ)`.
- `custom.shipping_eta` nhận nguyên JSON trong `Code`, gồm cả `US` và `Other`;
  không tách riêng nhánh `country: "Other"`.
- Bảng GMC không có fallback.
- Không kế thừa dữ liệu từ dòng trên hoặc dòng khác.
- Ô trống trong sheet gốc sẽ được điền trống.
- Một ô Product Type có nhiều dòng vẫn được dò theo từng tên trong ô.
- Nếu có nhiều dòng trùng Product Type nhưng giá trị khác nhau, extension báo dữ liệu
  mâu thuẫn và không tự điền.
- Extension không tự bấm Save để người dùng kiểm tra trước.

## Product Type cần đọc thêm Tag

- Shopify `Clothing`: Shipping ETA chọn đúng một trong các tag `Classic-T-Shirt`,
  `Classic-Women-T-Shirt`, `Inside Neck Print T-shirt`, `Classic-Long-Sleeve`,
  `Standard-Sweatshirt`, `Classic-Hoodie`, `Premium-T-Shirt`, `Youth T-shirt`.
  GMC vẫn dò bằng Shopify Product Type `Clothing`.
- Shopify `Mug`: Shipping ETA dùng dòng Lark `White mug / Black mug`; GMC dùng
  Shopify Product Type `Mug`. Không dùng Tag.
- Shopify `Tumbler`: Shipping ETA dùng Lark `Tumbler 20oz`; GMC dùng Shopify
  Product Type `Tumbler`. Không dùng Tag.

Chỉ Shopify `Clothing` cần đọc Tag. Nếu Clothing thiếu tag mapping hoặc có nhiều tag
mapping cùng lúc, extension sẽ không điền dữ liệu và yêu cầu kiểm tra lại Tags.

Nếu extension báo không tìm thấy metafield, reload trang Shopify sau khi cập nhật
extension rồi thử lại. Bản mới sẽ tự tìm nút View all/Manage trong khu vực Metafields.
- Kết quả có thời điểm đọc và revision của mỗi workbook để đối chiếu.

## Cấu hình một lần

Quản trị viên cung cấp:

- URL HTTPS của Lark Lookup API.
- API key nội bộ.

Trong tab MVP4, mở `Cấu hình kết nối`, nhập hai giá trị trên và bấm
`Lưu & kiểm tra`. Chrome sẽ hỏi quyền truy cập đúng domain API ở lần đầu.

Không nhập Lark App Secret vào extension hoặc gửi secret qua chat.

## Khi không có kết quả

1. Kiểm tra Product Type có đúng chính tả như sheet không.
2. Bấm lại `Get latest from Lark`.
3. Nếu báo lỗi kết nối, mở `Cấu hình kết nối` và bấm `Lưu & kiểm tra`.
4. Nếu báo thiếu quyền Lark, gửi cho quản trị viên để kiểm tra backend/app permission.
