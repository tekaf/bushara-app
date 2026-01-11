# إعداد قواعد Firebase Storage

## المشكلة
عند رفع ملفات (صور أو PDF) إلى Firebase Storage، يظهر خطأ:
```
Firebase Storage: User does not have permission to access
```

## الحل

### الخطوة 1: نشر قواعد Storage في Firebase Console

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. اختر مشروعك (bushara-2df7e)
3. اذهب إلى **Storage** في القائمة الجانبية
4. انقر على تبويب **Rules**
5. انسخ المحتوى من ملف `storage.rules` في المشروع
6. الصق القواعد في Firebase Console
7. انقر على **Publish** (نشر)

### القواعد المطلوبة:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Templates - Allow public read and write for admin templates
    match /templates/{templateId}/{allPaths=**} {
      // Allow anyone to read templates (public templates)
      allow read: if true;
      
      // Allow write for authenticated users or via admin password (for now, allow write)
      // In production, you should restrict this to admin users only
      allow write: if true;
    }
    
    // User uploads - Allow users to manage their own files
    match /users/{userId}/{allPaths=**} {
      // Users can read/write their own files
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Default: deny all other access
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### ملاحظة أمنية
القواعد الحالية تسمح للجميع بالرفع في مجلد `templates/`. هذا مناسب للتطوير، لكن في الإنتاج يجب تقييد الوصول إلى المستخدمين المخولين فقط.

بعد نشر القواعد، جرب رفع الملف مرة أخرى.
