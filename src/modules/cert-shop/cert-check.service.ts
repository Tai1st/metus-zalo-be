import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Đọc gói chứng chỉ bằng Python chuẩn + openssl có sẵn trên server; mật khẩu chỉ truyền qua biến môi trường (không lên dòng lệnh).
const PY_CHECK = `
import sys, os, json, zipfile, subprocess, plistlib, datetime, re
zpath, d = sys.argv[1], sys.argv[2]
pw = os.environ.get("CERT_PW", "")

def out(o):
    print(json.dumps(o)); sys.exit(0)  # ASCII an toàn với mọi bảng mã của tiến trình

try:
    z = zipfile.ZipFile(zpath)
    infos = [i for i in z.infolist() if not i.is_dir() and "__macosx" not in i.filename.lower()]
    if len(infos) > 50: out({"error": "Gói chứng chỉ có quá nhiều file"})
    pick = {}
    for i in infos:
        low = i.filename.lower()
        for ext, name in ((".p12", "cert.p12"), (".mobileprovision", "prov.mobileprovision")):
            if low.endswith(ext) and name not in pick: pick[name] = i
    if "cert.p12" not in pick: out({"error": "Không thấy file .p12 trong gói"})
    for name, i in pick.items():
        if i.file_size > 2 * 1024**2: out({"error": "File chứng chỉ quá lớn"})
        open(os.path.join(d, name), "wb").write(z.read(i))
except zipfile.BadZipFile:
    out({"error": "Không phải file .zip hợp lệ"})

def run(args):
    return subprocess.run(args, capture_output=True, timeout=15, env={**os.environ, "CERT_PW": pw})

pem = None
for extra in ([], ["-legacy"]):   # p12 cũ mã hóa RC2 cần -legacy với OpenSSL 3
    r = run(["openssl", "pkcs12", "-in", os.path.join(d, "cert.p12"), "-nokeys", "-clcerts", "-passin", "env:CERT_PW"] + extra)
    if r.returncode == 0 and b"BEGIN CERTIFICATE" in r.stdout:
        pem = r.stdout; break
if pem is None:
    out({"error": "Mật khẩu chứng chỉ sai hoặc file .p12 không hợp lệ"})
pem = pem[pem.index(b"-----BEGIN CERTIFICATE-----"): pem.index(b"-----END CERTIFICATE-----") + 25] + b"\\n"
pempath = os.path.join(d, "leaf.pem"); open(pempath, "wb").write(pem)

x = run(["openssl", "x509", "-in", pempath, "-noout", "-subject", "-serial", "-startdate", "-enddate", "-nameopt", "RFC2253,utf8"]).stdout.decode("utf-8", "replace")
def field(label):
    m = re.search(r"^" + label + r"=(.*)$", x, re.M); return m.group(1).strip() if m else ""
subj = field("subject")
def part(k):
    m = re.search(r"(?:^|,)" + k + r"=([^,]*)", subj); return m.group(1) if m else ""
def parse_date(s):
    return datetime.datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=datetime.timezone.utc)
now = datetime.datetime.now(datetime.timezone.utc)
nb, na = parse_date(field("notBefore")), parse_date(field("notAfter"))
cn = part("CN")
kind = "Distribution" if re.search(r"distribution", cn, re.I) else ("Development" if re.search(r"develop", cn, re.I) else "")
cert = {"commonName": cn, "organization": part("O"), "teamId": part("OU"), "country": part("C"), "type": kind,
        "serial": field("serial"), "notBefore": nb.isoformat(), "notAfter": na.isoformat(),
        "expired": now > na, "notYetValid": now < nb, "daysLeft": (na - now).days}

profile = None
pp = os.path.join(d, "prov.mobileprovision")
if os.path.exists(pp):
    plist = os.path.join(d, "prov.plist")
    r = run(["openssl", "smime", "-verify", "-noverify", "-inform", "DER", "-in", pp, "-out", plist])
    if r.returncode == 0:
        p = plistlib.loads(open(plist, "rb").read())
        ex = p.get("ExpirationDate")
        if ex is not None and ex.tzinfo is None: ex = ex.replace(tzinfo=datetime.timezone.utc)
        ents = p.get("Entitlements", {}) or {}
        # Chứng chỉ trong .p12 có nằm trong hồ sơ không (nếu không thì ký xong sẽ không cài được)
        der = subprocess.run(["openssl", "x509", "-in", pempath, "-outform", "DER"], capture_output=True).stdout
        profile = {"name": p.get("Name", ""), "teamName": p.get("TeamName", ""), "appId": ents.get("application-identifier", ""),
                   "created": p["CreationDate"].isoformat() if p.get("CreationDate") else "",
                   "expires": ex.isoformat() if ex else "", "expired": bool(ex and now > ex), "daysLeft": (ex - now).days if ex else None,
                   "allDevices": bool(p.get("ProvisionsAllDevices")), "devices": len(p.get("ProvisionedDevices", []) or []),
                   "matchesCert": der in [bytes(c) for c in (p.get("DeveloperCertificates") or [])]}
    else:
        profile = {"error": "Không đọc được file .mobileprovision"}
out({"certificate": cert, "profile": profile})
`;

@Injectable()
export class CertCheckService {
  constructor(private readonly config: ConfigService) {}

  private get python() {
    return this.config.get<string>('CERT_PYTHON') || 'python3';
  }

  /**
   * Đọc thông tin chứng chỉ từ gói .zip (base64) và mật khẩu .p12. Không lưu gì: thư mục tạm bị xóa ngay,
   * mật khẩu chỉ nằm trong biến môi trường của tiến trình con.
   */
  async check(zipBase64: string, password: string) {
    const zip = Buffer.from(zipBase64, 'base64');
    if (zip.length < 22 || zip.length > 1024 * 1024) throw new BadRequestException('Gói chứng chỉ phải là file .zip dưới 1MB');
    if (zip.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') throw new BadRequestException('Gói chứng chỉ phải là file .zip');

    const dir = await mkdtemp(join(tmpdir(), 'certcheck-'));
    try {
      const zpath = join(dir, 'in.zip');
      await writeFile(zpath, zip, { mode: 0o600 });
      const stdout = await new Promise<string>((resolve, reject) =>
        execFile(
          this.python,
          ['-I', '-c', PY_CHECK, zpath, dir],
          { timeout: 30_000, maxBuffer: 1024 * 1024, env: { ...process.env, CERT_PW: password } },
          (err, out) => (err ? reject(new BadRequestException('Không kiểm tra được chứng chỉ')) : resolve(out)),
        ),
      );
      const r = JSON.parse(stdout);
      if (r.error) throw new BadRequestException(r.error);
      return r as { certificate: Record<string, unknown>; profile: Record<string, unknown> | null };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
