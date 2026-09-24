# Triển khai VPS — Metus Zalo

Runbook triển khai hạ tầng cho **Metus Zalo** (FE Next.js + BE NestJS + MongoDB) — công cụ quản lý đa tài khoản Zalo / nhắn tin — kèm auto-deploy khi push GitHub.

**Stack**: Ubuntu 24.04 · Node.js 20 LTS · MongoDB 8 · Nginx · PM2 · Certbot · GitHub Actions

Domain FE: `zalo.metus.vn`. Domain BE: `api-v3.metus.vn`.

---

## 1. Chuẩn bị VPS

Khuyến nghị ≥ 2 vCPU / 4GB RAM (Node + Mongo + Nginx chạy cùng lúc, cộng thêm mỗi tài khoản Zalo đang kết nối giữ 1 WebSocket sống). SSH bằng user có quyền sudo, không dùng root trực tiếp cho lâu dài.

### Cập nhật & công cụ cơ bản

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential
```

> **Lỗi thường gặp: `apt update`/`apt upgrade` báo `404 Not Found`**
>
> Nguyên nhân: VPS được cấu hình sẵn trỏ về mirror riêng của nhà cung cấp thay vì mirror chính thức Ubuntu — mirror đó có danh sách package bị lệch/lỗi thời.
>
> Cách xử lý — đổi lại mirror chính thức:
>
> ```bash
> sudo nano /etc/apt/sources.list.d/ubuntu.sources
> ```
>
> Thay toàn bộ nội dung file bằng đúng mirror chính thức cho Ubuntu 24.04 (noble):
>
> ```
> Types: deb
> URIs: http://archive.ubuntu.com/ubuntu
> Suites: noble noble-updates noble-backports
> Components: main restricted universe multiverse
> Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
>
> Types: deb
> URIs: http://security.ubuntu.com/ubuntu
> Suites: noble-security
> Components: main restricted universe multiverse
> Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
> ```
>
> Lưu lại rồi xoá cache và update lại:
>
> ```bash
> sudo apt clean
> sudo rm -rf /var/lib/apt/lists/*
> sudo apt update
> ```

### Node.js 20 LTS (qua NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
npm -v
```

### PM2 (process manager)

```bash
sudo npm install -g pm2
pm2 startup   # dán lệnh nó in ra để pm2 tự khởi động cùng VPS
```

### Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### Tường lửa

```bash
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"   # mở 80 + 443
sudo ufw enable
```

> Cổng BE (`4100`) và FE (`3000`) **không** mở ra ngoài — chỉ Nginx (80/443) chạm được internet, nó reverse-proxy vào localhost. Không cần thêm rule ufw cho 2 cổng này.

---

## 2. MongoDB tự cài trên VPS

```bash
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

### Tạo user quản trị + user riêng cho app

```bash
mongosh
```

```js
use admin
db.createUser({
  user: "root",
  pwd: "<mật khẩu mạnh, tự sinh>",
  roles: [{ role: "root", db: "admin" }]
})

use metus-zalo
db.createUser({
  user: "metuszalo",
  pwd: "<mật khẩu khác, tự sinh>",
  roles: [{ role: "readWrite", db: "metus-zalo" }]
})
exit
```

### Bật xác thực

```bash
sudo nano /etc/mongod.conf
# thêm/sửa:
# security:
#   authorization: enabled
# net:
#   bindIp: 127.0.0.1   (giữ nguyên — không đổi thành 0.0.0.0)
sudo systemctl restart mongod
```

> **Quan trọng**: `bindIp` phải giữ `127.0.0.1` — Mongo không bao giờ cần nghe từ internet vì BE chạy cùng VPS, gọi qua localhost. DB này chứa cả **cookie đăng nhập Zalo thật** của mọi tài khoản đang quản lý — lộ ra ngoài là mất toàn bộ phiên đăng nhập.

### Chuỗi kết nối dùng trong `.env` của BE

```
MONGODB_URI=mongodb://metuszalo:<mật khẩu>@127.0.0.1:27017/metus-zalo
```

---

## 3. Clone & deploy lần đầu (thủ công)

Lần đầu deploy làm tay để chắc chắn chạy được, các lần sau GitHub Actions tự làm (mục 6).

### Tạo Deploy Key cho VPS (làm 1 lần)

VPS cần quyền `git clone`/`git pull` 2 repo qua SSH — dùng Deploy Key riêng (chỉ đọc, giới hạn đúng 1 repo/key), an toàn hơn add key cá nhân vào tài khoản GitHub.

```bash
ssh-keygen -t ed25519 -C "vps-metus-zalo" -f ~/.ssh/id_ed25519_github -N ""
cat ~/.ssh/id_ed25519_github.pub   # copy dòng này

cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
```

Add public key vừa copy vào **cả 2 repo** trên GitHub — mỗi repo: *Settings → Deploy keys → Add deploy key*, dán key vào, đặt tên (vd `vps-metus-zalo`), **không tick "Allow write access"** (VPS chỉ cần đọc để pull).

Kiểm tra trước khi clone:

```bash
ssh -T git@github.com
# thấy dòng "Hi Tai1st/<repo>! You've successfully authenticated..." là đúng
```

### Backend

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone git@github.com:Tai1st/metus-zalo-be.git metus-zalo-be
cd metus-zalo-be
cp .env.example .env
nano .env
```

Điền các giá trị trong `.env`:

```
PORT=4100
MONGODB_URI=mongodb://metuszalo:<mật khẩu>@127.0.0.1:27017/metus-zalo
JWT_SECRET=<chuỗi ngẫu nhiên — node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
JWT_EXPIRES_IN=7d
CORS_ORIGINS=https://zalo.metus.vn
ALLOW_REGISTRATION=false
TRUST_PROXY_HOPS=1
NODE_ENV=production
INTERNAL_KEY=<chuỗi ngẫu nhiên khác, tự sinh tương tự — dùng chung với FE ở mục Frontend>
COOKIE_SECRET=<chuỗi ngẫu nhiên >= 32 ký tự, tự sinh — mã hoá cookie Zalo lưu trong Mongo>
```

```bash
npm ci
npm run build
pm2 start dist/main.js --name metus-zalo-api
pm2 save
```

Tạo tài khoản admin đầu tiên (mật khẩu nhập ẩn, không nằm trong `.env`/log):

```bash
npm run create-admin -- --username admin --name "Admin" --promote
```

### Frontend

```bash
cd /var/www
git clone git@github.com:Tai1st/metus-zalo-fe.git metus-zalo-fe
cd metus-zalo-fe
nano .env.local
```

```
ZALO_BE_URL=http://127.0.0.1:4100
ZALO_BE_KEY=<phải trùng y hệt INTERNAL_KEY đã đặt ở .env của BE>
```

```bash
# thư mục lưu file đính kèm (ảnh/video) khi tạo chiến dịch nhắn tin — không
# nằm trong git (.gitignore), phải tự tạo trước khi chạy lần đầu
mkdir -p data/attachments

npm ci
npm run build
pm2 start npm --name metus-zalo-web -- start
pm2 save
```

### Biến môi trường — tổng hợp

| Biến | Nơi dùng | Ghi chú |
|---|---|---|
| `MONGODB_URI` | BE | `mongodb://metuszalo:***@127.0.0.1:27017/metus-zalo` |
| `JWT_SECRET` | BE | chuỗi ngẫu nhiên dài, tự sinh 1 lần |
| `PORT` | BE | `4100` |
| `INTERNAL_KEY` | BE | chuỗi ngẫu nhiên — khoá để Next gọi `/api/internal/*` |
| `COOKIE_SECRET` | BE | mã hoá cookie đăng nhập Zalo lưu trong Mongo |
| `CORS_ORIGINS` | BE | domain thật của FE, vd `https://zalo.metus.vn` |
| `ZALO_BE_URL` | FE | `http://127.0.0.1:4100` |
| `ZALO_BE_KEY` | FE | **phải trùng `INTERNAL_KEY` của BE** |

> `INTERNAL_KEY` (BE) và `ZALO_BE_KEY` (FE) là **cùng một chuỗi** — Next server gửi kèm header `x-internal-key` khi gọi BE, BE so khớp với `INTERNAL_KEY` của chính nó. Đặt lệch nhau là mọi request Next → BE trả 401.

---

## 4. Gắn tên miền & Nginx

Metus Zalo dùng **2 domain** — FE (`zalo.metus.vn`) và BE (`api-v3.metus.vn`), mỗi cái 1 server block riêng trong Nginx, cùng trỏ về 2 tiến trình local khác nhau (`:3000` / `:4100`).

> FE vẫn gọi BE server-to-server qua `127.0.0.1:4100` (nội bộ, không qua Nginx/internet) — nhanh hơn và không phụ thuộc DNS. Domain `api-v3.metus.vn` chỉ để gọi BE trực tiếp khi cần (test bằng curl/Postman, xem Swagger nếu bật `ENABLE_DOCS=true`) — trình duyệt của người dùng cuối vẫn không bao giờ chạm domain này trong luồng dùng bình thường.

### DNS — tại nhà cung cấp domain

| Loại | Giá trị |
|---|---|
| A record | `zalo → <IP VPS>` |
| A record | `api-v3 → <IP VPS>` |

### Nginx — FE

```bash
sudo nano /etc/nginx/sites-available/metus-zalo-fe
```

```nginx
server {
    listen 80;
    server_name zalo.metus.vn;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Nginx — BE

```bash
sudo nano /etc/nginx/sites-available/metus-zalo-be
```

```nginx
server {
    listen 80;
    server_name api-v3.metus.vn;

    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/metus-zalo-fe /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/metus-zalo-be /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> `TRUST_PROXY_HOPS=1` trong `.env` của BE đã đúng cho cả 2 đường vào (Nginx → FE → BE nội bộ, và Nginx → BE trực tiếp) — chỉ có đúng 1 tầng proxy phía trước trong cả hai trường hợp.

---

## 5. SSL

Domain thường (không wildcard) — dùng thử thách HTTP-01 tiêu chuẩn của Certbot, không cần plugin DNS riêng. Xin chứng chỉ cho cả 2 domain (gộp 1 lệnh, hoặc chạy riêng từng cái):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d zalo.metus.vn -d api-v3.metus.vn
```

Certbot tự sửa 2 file Nginx ở mục 4 để thêm block `listen 443 ssl` + redirect HTTP→HTTPS cho từng domain, và tự cài cron gia hạn. Xác nhận auto-gia hạn hoạt động:

```bash
sudo certbot renew --dry-run
```

---

## 6. Auto-deploy khi push GitHub

Mỗi lần push nhánh `main`, GitHub Actions tự SSH vào VPS, `git pull`, build, và restart PM2 — không cần đăng nhập VPS thủ công nữa.

### Tạo SSH key riêng cho việc deploy

```bash
# chạy trên VPS, tạo keypair KHÔNG passphrase, chỉ dùng để deploy
ssh-keygen -t ed25519 -f ~/.ssh/metus_zalo_deploy -N ""
cat ~/.ssh/metus_zalo_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/metus_zalo_deploy   # copy private key, dán vào GitHub Secrets
```

### Thêm Secrets — trên GitHub, làm cho **cả 2 repo** (metus-zalo-fe, metus-zalo-be)

*Settings → Secrets and variables → Actions → New repository secret*

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP hoặc domain VPS |
| `VPS_USER` | user SSH (không dùng root) |
| `VPS_SSH_KEY` | toàn bộ nội dung `metus_zalo_deploy` (private key) |

### Workflow

Tạo file `.github/workflows/deploy.yml` ở **mỗi repo**.

**`metus-zalo-be/.github/workflows/deploy.yml`**:

```yaml
name: Deploy BE

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /var/www/metus-zalo-be
            cp -r dist dist.backup 2>/dev/null || true
            git pull origin main
            npm ci
            npm run build || (mv dist.backup dist && pm2 restart metus-zalo-api && exit 1)
            pm2 reload metus-zalo-api
            pm2 save
            echo "✅ Deploy BE completed successfully!"
```

**`metus-zalo-fe/.github/workflows/deploy.yml`**:

```yaml
name: Deploy FE

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /var/www/metus-zalo-fe
            cp -r .next .next.backup 2>/dev/null || true
            git pull origin main
            npm ci
            npm run build || (mv .next.backup .next && pm2 restart metus-zalo-web && exit 1)
            pm2 reload metus-zalo-web
            pm2 save
            echo "✅ Deploy FE completed successfully!"
```

> `git pull` không đụng tới `data/attachments` (không nằm trong git) nên file đính kèm đã upload qua các đợt deploy không bị mất. Nếu build lỗi, script tự phục hồi bản build trước đó rồi restart bằng bản cũ — không để site sập vì 1 lần deploy hỏng.
>
> Lần đầu SSH từ Actions vào VPS có thể fail vì host key chưa được biết — action `appleboy/ssh-action` tự xử lý việc này, nhưng nếu vẫn lỗi `host key verification failed`, thêm SSH fingerprint của VPS vào `known_hosts` trên chính VPS trước.

Commit và push file workflow này lên mỗi repo (từ máy local) — từ lần push kế tiếp trở đi, mọi thay đổi vào nhánh `main` sẽ tự động lên VPS.

---

## 7. Đưa dữ liệu từ local lên VPS

Chỉ cần cho **lần đầu tiên** đưa hệ thống lên production, khi máy local đã có sẵn tài khoản Zalo đăng nhập / chiến dịch / lịch trình muốn giữ lại. Dùng `mongodump`/`mongorestore` chuẩn.

### Cài Database Tools (nếu máy local chưa có)

```powershell
# Windows — PowerShell
winget install MongoDB.DatabaseTools
```

```bash
# VPS — Ubuntu
sudo apt install -y mongodb-database-tools
```

### Bước 1 — Dump từ máy local

```bash
mongodump --uri="mongodb://127.0.0.1:27017/metus-zalo" --out="./mongo-dump"
```

### Bước 2 — Chuyển thư mục dump lên VPS

```bash
tar -czf mongo-dump.tar.gz -C mongo-dump .
scp mongo-dump.tar.gz <user>@<VPS_HOST>:/tmp/
```

```bash
mkdir -p /tmp/mongo-dump
tar -xzf /tmp/mongo-dump.tar.gz -C /tmp/mongo-dump
```

### Bước 3 — Restore vào MongoDB trên VPS

```bash
mongorestore \
  --uri="mongodb://metuszalo:<mật khẩu>@127.0.0.1:27017/metus-zalo" \
  --drop \
  /tmp/mongo-dump
```

- `--drop`: xoá sạch collection trùng tên trước khi restore. **Bỏ cờ này** nếu VPS đã có dữ liệu thật khác muốn giữ lại.
- Restore xong, xoá file tạm: `rm -rf /tmp/mongo-dump /tmp/mongo-dump.tar.gz`

### Bước 4 — Đưa file đính kèm (nếu có)

`data/attachments` không nằm trong Mongo — copy riêng qua `scp`/`rsync` nếu local đã có ảnh/video dùng trong chiến dịch:

```bash
rsync -avz ./data/attachments/ <user>@<VPS_HOST>:/var/www/metus-zalo-fe/data/attachments/
```

### Bước 5 — Xác minh

```bash
mongosh "mongodb://metuszalo:<mật khẩu>@127.0.0.1:27017/metus-zalo"
```

```js
db.zalo_accounts.countDocuments()
db.campaigns.countDocuments()
```

So khớp số lượng với dữ liệu local trước khi dump — nếu khớp, khởi động lại cả 2 tiến trình để nạp lại kết nối:

```bash
pm2 restart metus-zalo-api metus-zalo-web
```

Mở domain thật, thử đăng nhập admin và kiểm tra danh sách tài khoản Zalo hiện đúng trạng thái kết nối (tài khoản sẽ cần đăng nhập lại bằng QR nếu cookie cũ đã hết hạn — bình thường, không phải lỗi restore).

---

## 8. Việc nên làm ngay sau khi lên production

- [ ] **Backup MongoDB tự động** — cron job `mongodump` hằng ngày, đẩy ra nơi khác VPS (S3/Backblaze). DB này chứa cookie đăng nhập thật của mọi tài khoản Zalo đang quản lý — mất là phải đăng nhập lại toàn bộ bằng QR.
- [ ] **`pm2 save` + `pm2 startup`** đã chạy đúng — test bằng `sudo reboot` rồi kiểm tra `pm2 list` tự khởi động lại (đặc biệt quan trọng ở đây: mất kết nối tài khoản Zalo do VPS reboot mà không tự hồi phục = mất luôn các luồng nhắn tin đang chạy).
- [ ] **Giới hạn SSH** — tắt đăng nhập bằng mật khẩu (`PasswordAuthentication no`), chỉ cho SSH key.
- [ ] **Theo dõi log** — `pm2 logs metus-zalo-api` / `pm2 logs metus-zalo-web`, cân nhắc `pm2 install pm2-logrotate` để log không phình ổ đĩa (log kết nối Zalo khá dày khi nhiều tài khoản hoạt động cùng lúc).
- [ ] **Đổi mật khẩu admin mặc định** ngay sau khi tạo bằng `create-admin` ở mục 3, nếu đặt tạm lúc đầu.
