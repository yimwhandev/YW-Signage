# 📺 Digital Signage System v2

ระบบ Digital Signage ที่ใช้ Next.js + Google Sheets + YouTube สำหรับ deploy บน Vercel

---

## 🏗 โครงสร้างระบบ

```
/admin    → หน้า Admin หลังบ้าน (จัดการคิว, เพิ่ม/ลบ, Schedule, Emergency, Analytics)
/display  → หน้า TV จอแสดงผล (เปิดในทีวี fullscreen)
/api/*    → API routes (Next.js serverless)
```

---

## 📊 Google Sheet — ต้องสร้าง 4 Tabs

เปิด Spreadsheet แล้วสร้าง Tab (Sheet) ให้ครบ 4 อัน โดยชื่อ Tab **ต้องตรงทุกตัวอักษร** (case-sensitive)

---

### Tab 1: `Videos`

ใส่ Header แถวที่ 1 คอลัมน์ A–M:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| id | title | type | youtubeUrl | youtubeId | contentUrl | duration | order | active | scheduledStart | scheduledEnd | addedAt | playlistId |

**คำอธิบายแต่ละคอลัมน์:**
- `id` — รหัสเฉพาะ (ระบบสร้างให้อัตโนมัติ)
- `title` — ชื่อคอนเทนต์
- `type` — ประเภท: `youtube` / `image` / `video` / `webpage`
- `youtubeUrl` — URL YouTube (ถ้าเป็น YouTube)
- `youtubeId` — Video ID ของ YouTube เช่น `dQw4w9WgXcQ`
- `contentUrl` — URL รูปภาพ / MP4 / เว็บไซต์ (ถ้าไม่ใช่ YouTube)
- `duration` — ระยะเวลาแสดง (วินาที) เช่น `60`
- `order` — ลำดับในคิว เช่น `1`, `2`, `3`
- `active` — เปิด/ปิด: `TRUE` หรือ `FALSE`
- `scheduledStart` — วันเวลาเริ่ม เช่น `2024-12-01T08:00:00` (เว้นว่างได้)
- `scheduledEnd` — วันเวลาหยุด เช่น `2024-12-31T20:00:00` (เว้นว่างได้)
- `addedAt` — วันที่เพิ่ม (ระบบสร้างให้อัตโนมัติ)
- `playlistId` — รหัส Playlist ที่สังกัด (เว้นว่างได้)

---

### Tab 2: `Emergency`

ใส่ Header แถวที่ 1 คอลัมน์ A–H:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| id | title | message | bgColor | textColor | active | createdAt | expiresAt |

**คำอธิบายแต่ละคอลัมน์:**
- `id` — รหัสเฉพาะ (ระบบสร้างให้)
- `title` — หัวข้อประกาศ เช่น `ประกาศด่วน`
- `message` — ข้อความที่วิ่งบนจอ
- `bgColor` — สีพื้นหลัง HEX เช่น `#dc2626`
- `textColor` — สีตัวอักษร HEX เช่น `#ffffff`
- `active` — `TRUE` หรือ `FALSE`
- `createdAt` — วันเวลาที่สร้าง (ISO format)
- `expiresAt` — วันเวลาหมดอายุ (ISO format) เว้นว่างได้

---

### Tab 3: `Playlists`

ใส่ Header แถวที่ 1 คอลัมน์ A–E:

| A | B | C | D | E |
|---|---|---|---|---|
| id | name | color | scheduledStart | scheduledEnd |

**คำอธิบายแต่ละคอลัมน์:**
- `id` — รหัสเฉพาะ (ระบบสร้างให้)
- `name` — ชื่อ Playlist เช่น `คิวเช้า`, `วันหยุด`
- `color` — สีประจำกลุ่ม HEX เช่น `#6c63ff`
- `scheduledStart` — เวลาเริ่มใช้ (เว้นว่างได้)
- `scheduledEnd` — เวลาหยุดใช้ (เว้นว่างได้)

---

### Tab 4: `Analytics`

ใส่ Header แถวที่ 1 คอลัมน์ A–E:

| A | B | C | D | E |
|---|---|---|---|---|
| date | itemId | title | plays | totalSeconds |

**คำอธิบายแต่ละคอลัมน์:**
- `date` — วันที่ รูปแบบ `YYYY-MM-DD` เช่น `2024-12-25`
- `itemId` — รหัสคอนเทนต์ที่เล่น
- `title` — ชื่อคอนเทนต์
- `plays` — จำนวนครั้งที่เล่นในวันนั้น
- `totalSeconds` — เวลารวมที่แสดง (วินาที)

> ข้อมูลใน Tab นี้ระบบจะเขียนให้อัตโนมัติทุกครั้งที่ TV เล่นคอนเทนต์

---

## 🔐 ตั้งค่า Google Sheets API

### ขั้นตอนที่ 1 — Publish Tab `Videos` เป็น CSV (สำหรับ TV Display)

1. เปิด Spreadsheet → **File → Share → Publish to web**
2. เลือก: Sheet = `Videos`, Format = `Comma-separated values (.csv)`
3. กด **Publish** → คัดลอก URL ที่ได้
4. ใส่ใน Environment Variable: `NEXT_PUBLIC_SHEET_CSV_URL`

### ขั้นตอนที่ 2 — สร้าง Service Account (สำหรับ Admin เขียน/อ่าน)

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services → Enable APIs** → ค้นหา `Google Sheets API` → Enable
3. **Credentials → Create Credentials → Service Account**
   - ตั้งชื่อ เช่น `digital-signage-admin` → Create
4. เลือก Service Account ที่สร้าง → **Keys → Add Key → JSON**
   - บันทึกไฟล์ JSON ไว้ → เปิดไฟล์คัดลอก:
     - `client_email` → ใส่ใน `GOOGLE_SERVICE_ACCOUNT_EMAIL`
     - `private_key` → ใส่ใน `GOOGLE_PRIVATE_KEY` (รวม `-----BEGIN...-----END-----`)
5. **แชร์ Spreadsheet** → Share → วาง `client_email` → สิทธิ์ **Editor**

---

## 🚀 Deploy บน Vercel

### Environment Variables ที่ต้องตั้งใน Vercel Dashboard

ไปที่ Project Settings → Environment Variables → เพิ่มทีละตัว:

| ชื่อ Variable | ค่าที่ต้องใส่ | หมายเหตุ |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `xxx@project.iam.gserviceaccount.com` | จากไฟล์ JSON key |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n` | จากไฟล์ JSON key (**ต้องใส่ทั้ง BEGIN และ END**) |
| `GOOGLE_SHEET_ID` | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms` | คัดลอกจาก URL ของ Sheet: `docs.google.com/spreadsheets/d/`**[ตรงนี้]**`/edit` |
| `NEXT_PUBLIC_SHEET_CSV_URL` | `https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=0` | URL จากขั้นตอน Publish to web |
| `ADMIN_PASSWORD` | `รหัสผ่านที่ต้องการ` | ใช้ตอน Login หน้า Admin |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | URL ของแอปหลัง Deploy |

### Push โค้ดขึ้น GitHub

```powershell
git add .
git commit -m "v2: Emergency, Multi-content, Analytics, Playlists"
git push
```

Vercel จะ Deploy ให้อัตโนมัติทุกครั้งที่ Push ครับ

---

## 📋 วิธีใช้งาน

### Admin (หลังบ้าน) — `/admin`
| ฟีเจอร์ | วิธีใช้ |
|---|---|
| เพิ่มคอนเทนต์ | กด **+ เพิ่มคอนเทนต์** → วาง URL (YouTube / รูป / MP4 / เว็บ) |
| เรียงคิว | **ลาก-วาง** card เพื่อเรียงลำดับ |
| เปิด/ปิดคอนเทนต์ | กดปุ่ม **⏸/▶** บน card |
| Preview | กดปุ่ม **▶** เพื่อดูก่อนส่งขึ้นจอ |
| Emergency | ไปแท็บ **🚨 Emergency** → กรอกข้อความ → กด ส่งประกาศ |
| Analytics | ไปแท็บ **📊 Analytics** → ดูกราฟและ Top คอนเทนต์ |
| Playlist | ไปแท็บ **📋 Playlists** → สร้างกลุ่ม → กำหนดให้คอนเทนต์ตอนเพิ่ม |

### TV Display (หน้าบ้าน) — `/display`
- เปิด URL นี้ในทีวี → กด **F11** เพื่อ Fullscreen
- เล่นวิดีโอตามคิวอัตโนมัติ พร้อม countdown และ progress bar
- รีเฟรช Playlist ทุก **30 วินาที** โดยอัตโนมัติ
- ตรวจ Emergency ทุก **15 วินาที** — ถ้ามีจะขึ้นทันที

---

## ❓ FAQ

**Q: ทำไม TV ไม่ autoplay?**
Browser ต้องการ user interaction ก่อน click ที่หน้าจอ 1 ครั้ง แล้วจะเล่นอัตโนมัติต่อไป

**Q: Sheet ไม่อัปเดตใน TV?**
TV โหลด CSV ใหม่ทุก 30 วินาที หรือรีโหลดหน้า `/display` ด้วยตนเอง

**Q: GOOGLE_PRIVATE_KEY ใส่ยังไง?**
คัดลอกค่า `private_key` จากไฟล์ JSON ทั้งบรรทัด รวม `-----BEGIN PRIVATE KEY-----` และ `-----END PRIVATE KEY-----` ใส่ใน Vercel แบบ multiline ได้เลย

**Q: Schedule ทำงานอย่างไร?**
คอนเทนต์ที่มี `scheduledStart`/`scheduledEnd` จะแสดงเฉพาะในช่วงเวลานั้น นอกจากนั้นถูกข้ามไปอัตโนมัติ

**Q: Emergency หมดอายุเองได้ไหม?**
ได้ครับ ตั้ง "หมดอายุใน X นาที" ตอนสร้าง พอถึงเวลา TV จะกลับมาเล่นคิวปกติเอง
