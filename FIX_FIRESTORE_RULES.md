# إصلاح مشكلة Firestore Permissions

## المشكلة:
خطأ: "Missing or insufficient permissions" عند محاولة حفظ التصميم في Firestore.

## الحل:

### 1. اذهب إلى Firebase Console
- افتح: https://console.firebase.google.com/
- اختر مشروعك

### 2. انسخ قواعد Firestore
- افتح ملف `firestore.rules` في المشروع
- انسخ **كل المحتوى**

### 3. انشر القواعد في Firebase
- اذهب إلى: **Firestore Database** → **Rules**
- الصق القواعد التي نسختها
- اضغط **"Publish"**

### 4. تأكد من القواعد التالية موجودة:

```javascript
// Templates - public read, authenticated write
match /templates/{templateId} {
  // Allow public read (for viewing templates)
  allow read: if true;
  
  // Allow authenticated users to create/update/delete templates
  allow write: if isAuthenticated();
}
```

### 5. تحقق من تسجيل الدخول
- تأكد أنك مسجل دخول بحساب Firebase
- افتح Console المتصفح (F12) وتحقق من الـ logs:
  - يجب أن ترى: `📤 [CLIENT] User auth state:` مع `uid` و `email`

### 6. جرّب مرة أخرى
- بعد نشر القواعد، انتظر 10-20 ثانية
- جرّب رفع تصميم مرة أخرى

---

## إذا استمرت المشكلة:

1. **تحقق من Console المتصفح:**
   - افتح F12 → Console
   - ابحث عن: `❌ [CLIENT] Firestore error:`
   - أرسل لي الكود والرسالة

2. **تحقق من Firebase Console:**
   - اذهب إلى Firestore Database → Rules
   - تأكد أن القواعد منشورة (يجب أن ترى "Published" في الأعلى)

3. **تحقق من Authentication:**
   - اذهب إلى Authentication → Users
   - تأكد أن حسابك موجود ومفعّل
