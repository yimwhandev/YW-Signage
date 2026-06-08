# 📺 Digital Signage System

ระบบ Digital Signage ที่ใช้ Next.js + Google Sheets + YouTube สำหรับ deploy บน Vercel

---

## 🏗 โครงสร้างระบบ

```
/admin    → หน้า Admin หลังบ้าน (จัดการคิว, เพิ่ม/ลบ, Schedule)
/display  → หน้า TV จอแสดงผล (เปิดในทีวี fullscreen)
/api/*    → API routes (Next.js serverless)
```

---

## 🚀 วิธี Deploy (ทำครั้งเดียว)

### ขั้นตอนที่ 1 — สร้าง Google Sheet

1. เปิด [Google Sheets](https://sheets.google.com) สร้าง Spreadsheet ใหม่
2. เปลี่ยนชื่อ Sheet (Tab) เป็น **`Videos`**
3. ใส่ Header row แถว 1:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| id | title | youtubeUrl | youtubeId | duration | order | active | scheduledStart | scheduledEnd | addedAt |

4. **Publish as CSV** (สำหรับ Display page):
   - File → Share → Publish to web
   - Sheet: `Videos`, Format: `Comma-separated values (.csv)`
   - คัดลอก URL ที่ได้ → ใส่ใน `NEXT_PUBLIC_SHEET_CSV_URL` // https://docs.google.com/spreadsheets/d/e/2PACX-1vQv0EC8Uaa-p3DY1f-mSnk05nBjeY4B6LCTc5gQVlz2y86v_nJZwopigvlCmU1A6Bzr7vNWNjBhwmiw/pub?gid=0&single=true&output=csv

---

### ขั้นตอนที่ 2 — สร้าง Google Service Account (สำหรับ Admin เขียนข้อมูล)

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com)
2. สร้างโปรเจกต์ใหม่ หรือใช้โปรเจกต์เดิม
3. เปิดใช้งาน **Google Sheets API**:
   - APIs & Services → Enable APIs → ค้นหา "Google Sheets API" → Enable
4. สร้าง **Service Account**:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - ตั้งชื่อ เช่น `digital-signage-admin`  // digital-signage-admin@yw-signage.iam.gserviceaccount.com
5. สร้าง **Key** (JSON):
   - เลือก Service Account → Keys → Add Key → Create New Key → JSON
   - จะได้ไฟล์ JSON → เปิดไฟล์ คัดลอก:
     - `client_email` → ใส่ใน `GOOGLE_SERVICE_ACCOUNT_EMAIL`
     - `private_key` → ใส่ใน `GOOGLE_PRIVATE_KEY`
6. **แชร์ Google Sheet** ให้ Service Account:
   - เปิด Sheet → Share → วาง `client_email` → ให้สิทธิ์ **Editor**

---

### ขั้นตอนที่ 3 — Deploy บน Vercel

```bash
# 1. Push โค้ดขึ้น GitHub
git init
git add .
git commit -m "Initial commit: Digital Signage System"
git remote add origin https://github.com/YOUR_USERNAME/digital-signage.git
git push -u origin main

# 2. ไปที่ vercel.com → New Project → Import จาก GitHub
# 3. เพิ่ม Environment Variables ใน Vercel Dashboard:
```

| Variable | ค่า | หมายเหตุ |
|----------|-----|---------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `xxx@project.iam.gserviceaccount.com` | จาก JSON key |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` | จาก JSON key (รวม \n) |
| `GOOGLE_SHEET_ID` | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms` | ID จาก URL ของ Sheet |
| `NEXT_PUBLIC_SHEET_CSV_URL` | `https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=0` | Published CSV URL |
| `ADMIN_PASSWORD` | `your_secret_password` | รหัสผ่านเข้า Admin |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | URL ของแอปหลัง deploy |

---

## 📋 วิธีใช้งาน

### Admin (หลังบ้าน)
- เข้า `https://your-app.vercel.app/admin`
- ใส่รหัสผ่านที่ตั้งไว้
- **เพิ่มวิดีโอ**: กด "+ เพิ่มวิดีโอ" → วาง YouTube URL → กำหนดเวลา (ถ้าต้องการ)
- **เรียงคิว**: ลาก-วาง card เพื่อเรียงลำดับ
- **Preview**: กดปุ่ม ▶ เพื่อดูตัวอย่างก่อนส่งขึ้นจอ
- **เปิด/ปิด**: กดปุ่ม ⏸/▶ เพื่อเปิด-ปิดวิดีโอแต่ละตัว
- **Live Status**: ดูว่า TV กำลังเล่นวิดีโอไหนอยู่ (มุมบนขวา)

### TV Display (หน้าบ้าน)
- เปิด `https://your-app.vercel.app/display` ในทีวี
- กด F11 เพื่อ Fullscreen
- ระบบจะเล่นวิดีโอตามคิวอัตโนมัติ สลับทุก X วินาที (ตามที่กำหนด)
- รีเฟรช playlist ทุก 30 วินาที

---

## 🛠 การพัฒนาในเครื่อง

```bash
npm install
cp .env.example .env.local
# แก้ไขค่าใน .env.local
npm run dev
# เข้า http://localhost:3000
```

---

## ❓ FAQ

**Q: TV ไม่เล่นอัตโนมัติ?**  
A: YouTube ต้องการ user interaction ก่อน autoplay ครั้งแรก ให้คลิกที่หน้าจอ 1 ครั้ง

**Q: วิดีโอไม่อัปเดตใน TV?**  
A: Playlist รีเฟรชทุก 30 วินาที หรือรีโหลดหน้า display ด้วยตนเอง

**Q: Schedule ทำงานอย่างไร?**  
A: วิดีโอที่มี `scheduledStart`/`scheduledEnd` จะแสดงเฉพาะในช่วงเวลาที่กำหนด นอกจากนั้นจะถูกข้ามไป

