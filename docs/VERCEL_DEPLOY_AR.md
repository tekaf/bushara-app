# Vercel لا ينشر تلقائياً — الحل

## الوضع الحالي

| المكان | آخر commit |
|--------|------------|
| **GitHub** `main` | `4c45acb` (إصلاح ورشة بدون Chromium) |
| **Vercel Production** (عندك) | `bce8c7e` فقط — **قديم** |

الكود مرفوع على GitHub لكن **Vercel لا يستقبل webhooks** من GitHub، لذلك لا يظهر أي deployment جديد بعد `bce8c7e`.

---

## الحل السريع (5 دقائق) — نشر يدوي لآخر commit

1. افتح [vercel.com](https://vercel.com) → مشروع **bushara-app**
2. تبويب **Deployments**
3. أعلى اليمين: **Create Deployment** (أو **Deploy**)
4. اختر:
   - **Branch:** `main`
   - **Commit:** الأحدث — يجب أن يظهر `4c45acb` أو `fix(workshop): stop Chromium on Vercel regenerate-preview`
5. فعّل **Use existing Build Cache** (اختياري) → **Deploy**
6. انتظر حتى **Ready** → تأكد أن Production يعرض commit **`4c45acb`** وليس `bce8c7e`

> **تنبيه:** زر **Redeploy** على deployment قديم يعيد بناء **نفس** commit القديم فقط. لا يكفي — استخدم **Create Deployment** من فرع `main`.

---

## إصلاح النشر التلقائي (للمستقبل)

### 1) داخل Vercel

**Settings → Git**

- **Connected Git Repository** = `tekaf/bushara-app`
- **Production Branch** = `main`
- **Deploy Hooks** / Auto-deploy = مفعّل

إن كان "Not connected" أو repo مختلف:

- **Disconnect** ثم **Connect Git Repository** → اختر `tekaf/bushara-app` → `main`

### 2) داخل GitHub

`github.com/tekaf/bushara-app` → **Settings → Webhooks**

- يجب وجود webhook لـ `api.vercel.com`
- افتحه → **Recent Deliveries** — إن كانت **failed** (أحمر):
  - أعد ربط Git من Vercel (الخطوة 1)
  - أو سجّل دخول GitHub من Vercel مرة أخرى (Account Settings على vercel.com)

### 3) تحقق بعد الإصلاح

ادفع commit تجريبي:

```bash
git commit --allow-empty -m "chore: test Vercel webhook"
git push origin main
```

خلال 1–2 دقيقة يجب أن يظهر deployment جديد في Vercel.

---

## بعد نشر `4c45acb`

1. ورشة التأكد → **Ctrl+Shift+R**
2. **حفظ** → Network → `regenerate-preview` مع **`imageBase64`** في الـ body
3. الرد يحتوي **`deployTag`** — لا خطأ `libnss3` / `browserType.launch`

---

## بديل: Vercel CLI (من جهازك)

```bash
npx vercel login
npx vercel link
npx vercel --prod
```

يحتاج ربط المشروع مرة واحدة بحساب Vercel.
