# metus-zalo-be

Backend **NestJS 11 + MongoDB** cho Metus Zalo. Phạm vi hiện tại: **đăng nhập** (tên đăng nhập + mật khẩu, JWT)
và **gói cước** (Personal / Business, chu kỳ 3–6–12 tháng, gói mua thêm tài khoản nhân sự, đăng ký gói).

```
Trình duyệt ──cookie httpOnly──▶ Next (metus-zalo, :3000) ──JWT──▶ metus-zalo-be (:4100) ──▶ MongoDB
```

Trình duyệt **không** gọi thẳng backend. Server Next gọi backend (đăng nhập, xác nhận phiên, lấy bảng giá) và giữ
JWT trong cookie `mz_session` (httpOnly, SameSite=lax). Cổng backend nên được chặn khỏi mạng ngoài (xem "Vận hành").

## Chạy nhanh

```bash
cp .env.example .env         # điền JWT_SECRET (>= 32 ký tự) và MONGODB_URI
npm install
npm run create-admin -- --username admin     # tạo quản trị viên đầu tiên (mật khẩu nhập ẩn)
npm run start:dev            # http://localhost:4100/api   (Swagger: /api/docs, chỉ khi không phải production)
```

Yêu cầu: Node 20+, MongoDB đang chạy. Lần đầu khởi động, backend tự nạp 2 gói và 3 gói mua thêm mặc định
nếu collection còn trống.

## Biến môi trường

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `MONGODB_URI` | có | — | Ví dụ `mongodb://127.0.0.1:27017/metus-zalo` (dùng database riêng) |
| `JWT_SECRET` | có | — | Chuỗi ngẫu nhiên >= 32 ký tự; thiếu hoặc ngắn thì backend không khởi động |
| `JWT_EXPIRES_IN` | không | `7d` | Thời hạn token |
| `PORT` | không | `4000` (`.env.example` để `4100`) | Cổng lắng nghe; Next gọi qua `ZALO_BE_URL` |
| `CORS_ORIGINS` | không | `http://localhost:3000` | Danh sách origin, ngăn cách bằng dấu phẩy |
| `ALLOW_REGISTRATION` | không | tắt | `true` mới cho `POST /auth/register` (giao diện chưa có form đăng ký) |
| `TRUST_PROXY_HOPS` | không | `1` | Số tầng proxy tin cậy để đọc IP thật từ `X-Forwarded-For` |
| `NODE_ENV` | không | — | `production` sẽ **tắt Swagger** (bật lại bằng `ENABLE_DOCS=true`) |

Không có biến nào chứa mật khẩu quản trị. Tài khoản được tạo bằng lệnh bên dưới.

## Lệnh quản trị tài khoản

Mật khẩu nhập ẩn khi chạy, đọc từ stdin khi chạy tự động, hoặc `--generate-password` (in đúng một lần).
Mật khẩu tối thiểu 12 ký tự, có cả chữ và số.

```bash
# quản trị viên
npm run create-admin -- --username admin [--name "Tên hiển thị"] [--promote]
npm run create-admin -- --disable ten_dang_nhap        # khoá tài khoản (không khoá được admin hoạt động cuối cùng)

# người dùng + gói đã kích hoạt (cấp tay sau khi khách thanh toán, hoặc demo)
npm run create-user -- --username khach01 --plan personal --months 12 --generate-password
npm run create-user -- --username khach02 --plan business --months 12 --addon staff-3
```

Chạy lại `create-admin` với cùng `--username` để đặt lại mật khẩu. Tên đăng nhập: 3–32 ký tự gồm chữ, số, `.`, `_`, `-`,
không phân biệt hoa thường.

## API (tiền tố `/api`)

| Method | Đường dẫn | Ai gọi được | Ghi chú |
|---|---|---|---|
| POST | `/auth/login` | công khai | `{ username, password }` → `{ accessToken, user }`. Giới hạn 10 lần/phút theo IP người truy cập |
| POST | `/auth/register` | công khai | Mặc định **403**. 5 lần/phút |
| GET | `/auth/me` | đã đăng nhập | Không bị giới hạn tốc độ (Next gọi để xác nhận phiên) |
| GET | `/health` | công khai | 200 khi MongoDB sẵn sàng, 503 nếu không |
| GET | `/plans`, `/plans/:id` | công khai | Chỉ gói đang bán |
| GET / POST / PATCH / DELETE | `/plans/admin/all`, `/plans`, `/plans/:id` | admin | `DELETE` = ngừng bán, khách cũ giữ nguyên |
| GET | `/addons` | công khai | Gói mua thêm +1 / +3 / +5 tài khoản nhân sự |
| GET / POST / PATCH / DELETE | `/addons/admin/all`, `/addons`, `/addons/:id` | admin | |
| POST | `/subscriptions` | đã đăng nhập | `{ planId, months, addonId? }` → đăng ký `pending`. **Giá do server tính**, không nhận từ client |
| GET | `/subscriptions/me`, `/subscriptions/me/current` | đã đăng nhập | `current` → `{ subscription \| null }`; đăng ký quá hạn tự chuyển `expired` |
| PATCH | `/subscriptions/me/:id/cancel` | chủ đăng ký | |
| GET | `/subscriptions` | admin | Tối đa 500 bản mới nhất, kèm tên đăng nhập |
| PATCH | `/subscriptions/:id/activate` | admin | Xác nhận thanh toán → `active`, hết hạn sau đúng N tháng (theo lịch). **409** nếu vừa có kích hoạt song song |

Lỗi trả theo chuẩn Nest (`{ statusCode, message, error }`), thông báo bằng tiếng Việt. Body chỉ nhận đúng các trường đã
khai báo (trường lạ → 400).

## Mô hình dữ liệu (MongoDB)

| Collection | Trường chính | Ràng buộc do database đảm bảo |
|---|---|---|
| `users` | `username`, `passwordHash` (bcrypt, cost 12, không bao giờ trả ra), `fullName`, `role` (`user`/`admin`), `isActive` | `username` duy nhất |
| `plans` | `code`, `name`, `tagline`, `prices[{months, price}]`, `features[]`, `maxUsers`, `isPopular`, `isActive` | `code` duy nhất |
| `addons` | `code`, `seats`, `prices[]`, `requiresPlanCode` (mặc định `business`) | `code` duy nhất |
| `subscriptions` | `userId`, `planId`, `addonId`, `snapshot` (gói + giá + chu kỳ tại thời điểm mua), `status` (`pending`/`active`/`expired`/`cancelled`), `startedAt`, `expiresAt` | mỗi khách tối đa **một** đăng ký `active`; mỗi lựa chọn giống hệt tối đa **một** `pending` |

Giá là số nguyên VND. `snapshot` giữ nguyên giá đã mua dù sau này gói bị sửa.

Backend **dừng khi khởi động** nếu không dựng được các chỉ mục duy nhất trên (ví dụ dữ liệu cũ đang vi phạm), để không
âm thầm mất đảm bảo dữ liệu.

## Bảo mật đã có

- Mật khẩu băm bcrypt; so sánh giả khi tên không tồn tại để không lộ tài khoản nào có thật; thông báo lỗi đăng nhập chung.
- Giới hạn tốc độ theo IP thật của người truy cập (Next chuyển tiếp `X-Forwarded-For`), nên một kẻ thử sai không khóa được người khác.
- JWT kiểm tra lại người dùng mỗi lần: tài khoản bị khóa hoặc xóa mất hiệu lực ngay ở backend (Next cache xác nhận phiên 30 giây).
- Phân quyền theo vai trò (`admin`) bằng guard toàn cục; route công khai phải khai báo rõ `@Public()`.
- Giá, chu kỳ, gói mua thêm đều được kiểm tra và tính ở server.
- Đăng ký công khai tắt mặc định; không có tài khoản hay mật khẩu mặc định.

## Đã kiểm chứng

Đã chạy thật với MongoDB 8 và server Next: đăng nhập / đăng xuất / cookie giả, phân quyền admin, tính giá gói + gói mua thêm,
hết hạn đăng ký, chống đua lệnh (12 yêu cầu song song, kích hoạt song song), giới hạn tốc độ theo từng người truy cập.
**Các kịch bản này chưa được lưu thành bộ kiểm thử tự động trong repo** — xem "Việc còn lại".

## Vận hành

- Đặt `NODE_ENV=production` khi chạy thật (tắt Swagger).
- **Chặn cổng backend khỏi Internet**; chỉ máy chạy Next được truy cập. Backend tin `X-Forwarded-For` nên client gọi thẳng vào có thể giả IP để né giới hạn tốc độ.
- Bộ đếm giới hạn tốc độ nằm trong bộ nhớ: mất khi khởi động lại và không dùng chung giữa nhiều bản chạy (cần Redis nếu mở rộng).
- Dùng `GET /api/health` cho kiểm tra sức khỏe / load balancer.
- Sao lưu MongoDB (`users`, `subscriptions`) theo lịch — repo chưa có script sao lưu.

## Việc còn lại

Xếp theo mức ưu tiên cho bản thương mại:

1. **Tách dữ liệu theo khách hàng.** Dữ liệu tài khoản Zalo bên Next vẫn nằm trong SQLite dùng chung, chưa gắn với người dùng:
   ai đăng nhập cũng thấy (và xuất được cookie của) mọi tài khoản Zalo. Cần mô hình công ty / người dùng và kiểm tra quyền sở hữu.
2. **Áp dụng giới hạn của gói.** `maxUsers` mới chỉ được lưu, chưa nơi nào kiểm tra; chưa có tính năng tạo tài khoản nhân sự cho gói Business.
3. **Thanh toán và ghi vết.** Kích hoạt đang làm tay, chưa ghi ai kích hoạt lúc nào, chưa có hóa đơn. Hết hạn chỉ được xét khi chính khách gọi API, chưa có tác vụ định kỳ.
4. **Tính năng tài khoản:** đổi / quên mật khẩu, 2FA cho admin, refresh token và vô hiệu hóa token khi đăng xuất (token hiện sống 7 ngày).
5. **Bộ kiểm thử tự động** (Jest + MongoDB thật hoặc `mongodb-memory-server`) cho các kịch bản ở mục "Đã kiểm chứng".
6. Giá 3 và 6 tháng đang là số suy ra từ giá 12 tháng trên trang chủ — cần xác nhận rồi sửa qua API admin.
7. `src/group/*` là dịch vụ Zalo nội bộ (`/internal/*`, khóa `INTERNAL_KEY`) do một tiến trình khác viết; **chưa** được đưa vào `AppModule`,
   nên route lấy thành viên theo link bên Next chưa dùng được.
