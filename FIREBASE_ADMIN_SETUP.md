# إعداد Firebase Admin SDK

## المشكلة
ورشة التأكد والعمليات الإدارية تحتاج **Firebase Admin SDK** على الخادم (Vercel / local).

---

## الطريقة الموصى بها لـ Vercel (الأسهل)

من ملف JSON الذي حمّلته من Firebase Console، أضف **3 متغيرات** في Vercel → Settings → Environment Variables:

| المتغير | القيمة |
|---------|--------|
| `FIREBASE_ADMIN_PROJECT_ID` | `bushara-2df7e` (من `project_id`) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | من `client_email` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | من `private_key` كاملًا (مع BEGIN/END) |

**مهم لـ `FIREBASE_ADMIN_PRIVATE_KEY`:**
- الصق المفتاح كما هو من JSON (يمكن سطر واحد مع `\n`)
- أو الصقه متعدد الأسطر في محرر Vercel

ثم **Redeploy** المشروع.

---

## طريقة بديلة: Base64 (موصى بها إذا فشل JSON)

### 1) حوّل ملف JSON إلى Base64

**PowerShell (Windows):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

**Mac/Linux:**
```bash
base64 -i service-account.json | tr -d '\n'
```

### 2) أضف في Vercel

```
FIREBASE_SERVICE_ACCOUNT_BASE64=<الناتج بدون أسطر فارغة>
```

---

## طريقة محلية: `.env.local`

### خيار A — JSON سطر واحد

```env
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"bushara-2df7e",...}
```

### خيار B — المتغيرات المنفصلة

```env
FIREBASE_ADMIN_PROJECT_ID=bushara-2df7e
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@bushara-2df7e.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### خيار C — ملف JSON

```env
FIREBASE_SERVICE_ACCOUNT_PATH=C:\path\to\service-account.json
```

---

## التحقق

```bash
npm run check:firebase-admin
```

أو بعد تسجيل الدخول كأدمن:

`GET /api/admin/system/firebase-status`

يجب أن يظهر: `configured: true`

---

## الحصول على الملف من Firebase

1. [Firebase Console](https://console.firebase.google.com/) → مشروع **bushara-2df7e**
2. ⚙️ Project Settings → **Service accounts**
3. **Generate new private key** → حمّل JSON

---

## ملاحظات

- لا ترفع `.env.local` أو ملف JSON إلى Git
- بعد أي تعديل على المتغيرات في Vercel: **Redeploy إلزامي**
- `FIREBASE_SERVICE_ACCOUNT_KEY` كسطر JSON طويل قد ينكسر على بعض لوحات Vercel — استخدم الطريقة المنفصلة أو Base64
