# 🎨 SketchSync v2 — رسم جماعي احترافي

تطبيق رسم تعاوني يعمل في الوقت الحقيقي عبر Socket.io — يشبه Magma Studio/Figma لكن خفيف وسريع.

---

## 🚀 تشغيل سريع

```bash
npm install
npm start
# افتح http://localhost:3000
```

للتطوير مع إعادة تشغيل تلقائي:
```bash
npm run dev
```

---

## ✨ ما الجديد في v2

| الميزة | v1 | v2 |
|--------|----|----|
| Real-time sync | BroadcastChannel فقط | Socket.io حقيقي |
| إرسال البيانات | نقطة بنقطة | Strokes كاملة (ضغط ~80%) |
| Canvas state للمستخدمين الجدد | ❌ | ✅ Snapshot + Replay |
| Undo / Redo | ❌ | ✅ (20 خطوة) |
| Auto Reconnect | ❌ | ✅ مع re-join تلقائي |
| Loading Screen | ❌ | ✅ |
| مؤشر الاتصال | بسيط | حالة تفصيلية |
| Preview للأشكال | على Canvas الرئيسي | Canvas منفصل (لا تداخل) |
| ألوان المستخدمين | عشوائية | ثابتة من السيرفر |
| دعم Mobile | جزئي | كامل (touch-action: none) |

---

## 🏗 هيكل المشروع

```
sketchsync-v2/
├── server.js          # Node.js + Socket.io backend
├── package.json
├── public/
│   └── index.html     # SPA كاملة (HTML + CSS + JS)
└── README.md
```

---

## 🔌 Socket.io Events

### Client → Server
| الحدث | البيانات | الوصف |
|-------|---------|-------|
| `join-room` | `{roomId, userId, name}` | الدخول لغرفة |
| `stroke` | `{tool, pts[], color, sz, op}` | خطوط القلم/الممحاة |
| `shape` | `{kind, x1,y1,x2,y2, color, sz, op}` | أشكال مكتملة |
| `fill` | `{x, y, color}` | تعبئة |
| `undo` | — | تراجع عن آخر خطوة |
| `clear` | — | مسح الكل |
| `cursor` | `{x, y}` | موقع المؤشر |
| `snapshot` | `{dataUrl}` | PNG للوح كل 50 خطوة |

### Server → Client
| الحدث | الوصف |
|-------|-------|
| `canvas-snapshot` | Snapshot + deltas للمستخدمين الجدد |
| `canvas-replay` | إعادة تشغيل جميع الـ strokes (undo/redo) |
| `room-users` | قائمة المستخدمين المتصلين |
| `user-joined` | مستخدم جديد |
| `user-left` | مستخدم غادر |
| `cursor` | موقع مؤشر مستخدم آخر |
| `clear` | مسح اللوحة |

---

## 🎮 اختصارات لوحة المفاتيح

| المفتاح | الأداة/الإجراء |
|---------|---------------|
| `P` | قلم |
| `E` | ممحاة |
| `L` | خط |
| `R` | مستطيل |
| `C` | دائرة |
| `F` | تعبئة |
| `[` / `]` | تصغير/تكبير الفرشاة |
| `Ctrl+Z` | تراجع |
| `Ctrl+Y` | إعادة |

---

## 🌐 النشر على الإنترنت

### Railway (الأسهل)
```bash
npm i -g @railway/cli
railway login && railway init && railway up
```

### Render
1. ارفع على GitHub
2. New Web Service → اختر الريبو
3. Build: `npm install` · Start: `npm start`
4. ✅ تلقائياً يدعم WebSockets

### Fly.io
```bash
fly launch && fly deploy
```

### متغيرات البيئة
```env
PORT=3000          # رقم المنفذ (اختياري)
```

---

## ⚡ تحسينات الأداء

- **Stroke batching**: يرسل الـ stroke كاملاً عند رفع الإصبع بدل نقطة بنقطة → ~80% أقل من البيانات
- **Cursor throttle**: 40ms بين كل إرسال للمؤشر
- **Snapshot system**: PNG مضغوط (70% جودة) يُرسل للسيرفر كل 50 stroke — المستخدمون الجدد يحصلون عليه فوراً
- **Preview canvas**: الأشكال تُرسم على canvas مؤقت أثناء الرسم، الـ canvas الرئيسي يُحدَّث عند الانتهاء فقط
- **Max strokes buffer**: السيرفر يحتفظ بآخر 3000 stroke فقط ويقص الأقدم
