# دليل Template Engine - نظام التصاميم

## ✅ ما تم إنجازه

### 1. Template Presets (A/B/C)
- ✅ Type A: Minimal design
- ✅ Type B: Top decoration (safe area top)
- ✅ Type C: Bottom decoration (safe area bottom)
- الملفات: `lib/template-presets/A.json`, `B.json`, `C.json`

### 2. Firebase Collections
- ✅ `templates` - التصاميم
- ✅ `fonts` - الخطوط (جاهز للاستخدام لاحقاً)
- ✅ `renders` - سجلات التصيير

### 3. Admin UI
- ✅ `/admin/templates` - رفع التصاميم
- ✅ Password protection: `admin123`
- ✅ Upload background image
- ✅ Choose template type (A/B/C)
- ✅ Auto-generate thumbnail

### 4. Client UI
- ✅ `/templates` - معرض التصاميم
- ✅ `/templates/[id]` - صفحة التصميم مع النموذج
- ✅ Preview & Generate Final buttons

### 5. Rendering API
- ✅ `/api/render` - Preview rendering
- ✅ `/api/render/final` - Final rendering
- ✅ Uses Playwright + @sparticuz/chromium
- ✅ Generates PNG output
- ✅ Uploads to Firebase Storage

---

## 🚀 خطوات التجربة

### الخطوة 1: تثبيت الاعتماديات

```bash
npm install
```

### الخطوة 2: رفع تصميم (Admin)

1. افتح الموقع: `http://localhost:3000/admin/templates`
2. أدخل كلمة المرور: `admin123`
3. املأ النموذج:
   - **Template Name**: مثال "تصميم أنيق"
   - **Template Type**: اختر A أو B أو C
   - **Background Image**: ارفع صورة خلفية (يفضل 1080x1920)
4. انقر "Publish Template"

### الخطوة 3: عرض التصاميم (Client)

1. افتح: `http://localhost:3000/templates`
2. ستظهر جميع التصاميم المنشورة
3. انقر على أي تصميم

### الخطوة 4: إنشاء دعوة

1. في صفحة التصميم، املأ الحقول:
   - اسم العريس (عربي)
   - اسم العروس (عربي)
   - اسم العريس (إنجليزي) - اختياري
   - اسم العروس (إنجليزي) - اختياري
   - التاريخ
   - المكان
2. انقر "معاينة" لرؤية Preview
3. انقر "إنشاء نهائي" لإنشاء الصورة النهائية
4. حمّل الصورة

---

## 📁 البنية

```
lib/
  template-presets/
    A.json          # Preset Type A
    B.json          # Preset Type B
    C.json          # Preset Type C
    types.ts        # TypeScript types
    loader.ts       # Load presets

  render/
    engine.ts       # HTML generation

app/
  (admin)/
    admin/
      templates/
        page.tsx    # Admin upload page

  (public)/
    templates/
      page.tsx      # Gallery
      [id]/
        page.tsx    # Template detail + form

  api/
    render/
      route.ts      # Preview API
      final/
        route.ts    # Final render API
```

## ⚙️ الإعدادات

### Environment Variables
تأكد من وجود:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### Firebase Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /templates/{templateId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /outputs/{renderId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## 🎨 Customization

### تعديل Presets
عدّل الملفات في `lib/template-presets/`:
- `boxPct`: موضع النص (x, y, w, h كنسب 0-1)
- `font`: الخط والحجم
- `color`: لون النص
- `align`: المحاذاة

### إضافة حقول جديدة
1. أضف textBlock جديد في Preset
2. أضف field في `RenderFields` interface
3. أضف input في `/templates/[id]/page.tsx`

---

## 📝 ملاحظات

- **Rendering**: يستخدم Playwright + Chromium (serverless-compatible)
- **Fonts**: حالياً يستخدم Google Fonts (Cairo + Cormorant Garamond)
- **Output**: PNG format (1080x1920)
- **Storage**: Firebase Storage للملفات

---

## 🔧 Troubleshooting

### Rendering لا يعمل؟
- تأكد من تثبيت `playwright-core` و `@sparticuz/chromium`
- تحقق من Firebase Storage permissions
- راجع console logs في Vercel

### الصور لا تظهر؟
- تحقق من Firebase Storage rules
- تأكد من رفع الصور بشكل صحيح
- تحقق من URLs في Firestore

---

**جاهز للاستخدام! 🎉**

