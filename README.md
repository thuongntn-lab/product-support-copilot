# Product Support Copilot

Phiên bản `0.7.0` bổ sung `MVP2 · Artwork`: điền nhanh form tạo Artwork trên Customall và audit template/layer trước khi Save.

Chrome Extension Manifest V3 triển khai ba luồng nội bộ:

- **MVP1 — Smart Clipart Importer:** đọc folder, validate ảnh/cấu trúc, phát hiện duplicate, chuẩn hóa tên, truyền trực tiếp các file vào `Import from folder`, và xuất CSV report.
- **MVP3 — Shopify Mockup Ads:** nhận diện store/Product ID, đổi tên mockup theo Product ID, tải file đã chuẩn hóa xuống máy, mở Shopify Content → Files và highlight nút upload.
- **MVP4 — Lark Live Product Data:** dò Product Type trong hai Lark Sheet gốc và trả về Shipping Page/ETA Code cùng GMC Color/Material/Category tại thời điểm bấm.
- Khi điền Shopify: GMC Material/Color dùng single-line text, Shipping ETA dùng JSON, Shipping Page dùng Page reference picker, và Category dùng `Category breadcrumb`.
- Category và Shipping Page dùng picker nội bộ của Shopify: extension tự nhập/lọc, tự chọn đúng option tương ứng với Lark và tự Save sau khi xác minh.

## Cài thử

1. Mở `chrome://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn thư mục repository này.
5. Pin extension và bấm icon để mở Side Panel.

## Kiểm thử logic

```powershell
node tests/logic.test.mjs
```

Sau khi load unpacked, kiểm tra `Service worker` và Side Panel trong
`chrome://extensions` để xác nhận không có runtime error.

## MVP1

1. Chọn tab `MVP1 · Cliparts`.
2. Chọn folder bằng nút `Chọn folder clipart`.
3. Sửa các lỗi được báo.
4. Chọn có tự chuẩn hóa tên hay không. Thumbnail do Customall tự tạo.
5. Mở sẵn và đăng nhập Customall ở tab Cliparts.
6. Bấm `Upload to Customall`.
7. Extension sẽ chuyển trực tiếp các file ảnh sang `Import from folder`.

Extension giữ các clipart tạm trong IndexedDB nội bộ, chuyển trực tiếp sang
`Import from folder` rồi xóa bản tạm. Không tạo hoặc tải ZIP xuống máy.

Các tên cùng nhóm như `A 001`, `A 002`, `A 003` được xem là hợp lệ. Extension
luôn kiểm tra chuỗi số dù bật hay tắt `Tự chuẩn hóa tên`: chặn khi cùng folder
có cùng nhóm và cùng số thứ tự (ví dụ hai file đều là `A 002`), đồng thời cảnh
báo tên thiếu số ở cuối hoặc khoảng số bị thiếu. Duplicate nội dung cũng luôn
được kiểm tra.

Nếu bật `Tự chuẩn hóa tên`, extension giữ phần tên và chuẩn hóa số thứ tự ở
cuối thành tối thiểu ba chữ số: `skin 1.png` → `skin 001.png`,
`skin 12.png` → `skin 012.png`. Tên đã đủ ba chữ số được giữ nguyên.

Khối `Replace / edit tên hàng loạt` cho phép tìm và thay chữ trong toàn bộ tên
Output. Có thể áp dụng nhiều phép thay thế liên tiếp và hoàn tác toàn bộ. Việc
replace chỉ tác động phần tên, không đổi đuôi file; extension sẽ báo lỗi và chặn
upload nếu chỉnh sửa tạo ra tên Output không hợp lệ hoặc bị trùng.

Các rule đã triển khai:

- PNG/JPG/JPEG.
- Tối đa 64 MB và 64 megapixel.
- Cảnh báo trên 32 MB.
- Folder không được vừa chứa file trực tiếp vừa chứa folder con.
- Duplicate theo SHA-256.
- Tự bỏ qua `Thumbs.db`, `desktop.ini` và `.DS_Store`.

## MVP3

1. Mở product Shopify rồi bấm refresh context để lấy store handle và Product ID.
2. Xác nhận store handle và Product ID.
3. Chọn mockup ads; extension hiển thị trước tên theo Product ID.
4. Bấm `Upload trực tiếp lên Shopify`.
5. Extension tự mở hoặc chuyển tới Shopify Content → Files, đưa các mockup đã
   đổi tên vào ô upload và lưu lịch sử. Không cần download file trung gian.

## MVP4

1. Mở product trong Shopify và chọn tab `MVP4 · Lark Data`.
2. Bấm nút refresh để nhận diện Product Type, hoặc nhập Product Type thủ công.
3. Bấm `Đọc Lark & điền Shopify`.
4. Extension điền đúng bốn metafield Shopify:
   - Shipping ETA → `custom.shipping_eta`
   - Shipping Page → `custom.shipping_page`
   - GMC Material → `custom.gmc_material`
   - GMC Color → `custom.custom_gmc_color`
5. Kiểm tra lại rồi bấm Save trên Shopify.
6. Shopify Category được điền từ cột `Category breadcrumb` của bảng Product Category 2026; Category ID vẫn có nút Copy khi cần.

MVP4 dò chính xác theo Product Type. Nếu tìm thấy trong bảng ETA, extension lấy nguyên
`Code` và `Shipping Page` trên cùng dòng đó. Nếu không tìm thấy, extension lấy nguyên
`Code` và `Shipping Page` của dòng `Others (Sản phẩm đi từ TQ)`. Giá trị `Code` được
giữ nguyên JSON, gồm cả nhánh `US` và `Other`, để điền vào `custom.shipping_eta`.
Bảng GMC dò độc lập và không dùng fallback ETA. Ô nào đang trống trong nguồn được
trả về trống. Extension không tự bấm Save để người dùng kiểm tra trước khi lưu.

Shipping ETA và GMC có thể dùng hai khóa tra cứu khác nhau:

- Shopify `Clothing`: Shipping ETA dùng một trong 8 tag `Classic-T-Shirt`,
  `Classic-Women-T-Shirt`,
  `Inside Neck Print T-shirt`, `Classic-Long-Sleeve`, `Standard-Sweatshirt`,
  `Classic-Hoodie`, `Premium-T-Shirt`, `Youth T-shirt`; GMC vẫn dùng `Clothing`.
- Shopify `Mug`: Shipping ETA dùng dòng Lark `White mug / Black mug`; GMC dùng `Mug`.
- Shopify `Tumbler`: Shipping ETA dùng `Tumbler 20oz`; GMC dùng `Tumbler`.

Chỉ trường hợp `Clothing` yêu cầu đúng một Tag mapping. Nếu thiếu hoặc có nhiều Tag
Clothing hợp lệ cùng lúc, extension dừng trước khi đọc/điền dữ liệu.

Nếu các metafield chưa hiển thị trên trang Product, extension sẽ thử mở khu vực
Metafields/View all rồi mới điền. Sau khi cập nhật extension, cần reload tab Shopify để
content script mới được nạp. Extension quét cả frame chính và các iframe Shopify
(`admin.shopify.com`/`myshopify.com`) để tìm đúng bốn metafield.

Trước khi dùng, mở `Cấu hình kết nối`, nhập URL HTTPS của Lark Lookup API và API key
do quản trị viên cung cấp, rồi bấm `Lưu & kiểm tra`. Secret của Lark app chỉ được đặt ở
backend, không được chép vào extension. Xem `TEAM_GUIDE_MVP4.md` và `server/README.md`.

## Giới hạn hiện tại

- File được giữ trong bộ nhớ của Side Panel; đóng panel sẽ cần chọn lại.
- Customall/Shopify có thể thay đổi URL hoặc DOM. Nếu upload trực tiếp không
  hoạt động, reload trang đích rồi thử lại.
- MVP3 điều khiển giao diện Shopify đang đăng nhập, chưa gọi Shopify Admin API
  và không lưu access token.
- MVP4 cần một Lark Lookup API nội bộ đang chạy. Bản extension không chứa Lark App
  Secret và không thể tự đọc sheet cho cả team nếu backend chưa được cấp quyền/triển khai.
