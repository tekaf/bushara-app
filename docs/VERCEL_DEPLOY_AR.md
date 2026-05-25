# ربط Vercel بـ GitHub (مهم)

إذا رفعت على GitHub ولا يظهر نشر جديد في Vercel:

1. [vercel.com](https://vercel.com) → مشروع **bushara-app**
2. **Settings** → **Git**
3. تأكد: Repository = `tekaf/bushara-app` و Branch = `main`
4. **Deployments** → **Redeploy** → اختر **main** وآخر commit

بعد النشر افتح ورشة التأكد وتحقق من Network عند الحفظ:
- يجب أن يرسل `regenerate-preview` مع `imageBase64`
- الرد يحتوي `deployTag` وليس خطأ `libnss3`

Commit المطلوب للإصلاح: `fix(workshop): disable Chromium on regenerate-preview for Vercel`
