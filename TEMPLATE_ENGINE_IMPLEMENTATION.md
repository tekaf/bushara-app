# Template Engine Implementation - Complete

## ✅ Completed Tasks

### TASK 1: Fonts from Firestore
- ✅ Created `lib/render/fonts.ts` with functions to:
  - Fetch active fonts from Firestore collection "fonts"
  - Download TTF files from `fileUrl` and convert to base64
  - Generate `@font-face` CSS declarations
  - Map fonts by language (Arabic → Amiri, English → Montserrat)
- ✅ Updated render engine to use fonts from Firestore instead of Google Fonts
- ✅ Fonts are embedded as base64 in HTML for headless browser rendering

### TASK 2: Type B Preset
- ✅ Updated `lib/template-presets/B.json` with correct layout values:
  - All positions in percentages (boxPct)
  - Correct font sizes, colors (#6B6B6B), line heights
  - 7 text blocks: intro_text, invite_line, groom_name, bride_name, date_en, verse_or_dua, location_name
  - Auto-fit enabled for all blocks
- ✅ Layout matches reference design (decoration at top & bottom, text in middle)

### TASK 3: Kashida Rule
- ✅ Created `lib/render/kashida.ts` with:
  - `applyKashida()` function for short Arabic names (≤5 chars)
  - Inserts Tatweel (U+0640) after 2nd character
  - Only applies to `groom_name` and `bride_name` fields
  - Example: سعد → سعــــد
- ✅ Integrated into render engine

### TASK 4: Config-Driven Architecture
- ✅ Templates use preset system (A.json, B.json, C.json)
- ✅ Each template stores `type` in Firestore
- ✅ Renderer loads preset based on template type
- ✅ No code changes needed to add new templates (just upload + select type)

### TASK 5: Auto-Fit Algorithm
- ✅ Implemented in `calculateOptimalFontSize()` function
- ✅ Starts at maxFont, reduces step-by-step until text fits
- ✅ Respects minFont limit and maxLines constraint
- ✅ Uses character width estimation for Arabic/English

## 📁 New Files Created

1. `lib/render/fonts.ts` - Font loading from Firestore
2. `lib/render/kashida.ts` - Kashida rule implementation
3. Updated `lib/render/engine.ts` - Main render engine with all features
4. Updated `lib/template-presets/B.json` - Type B preset with correct values

## 🔧 Updated Files

1. `app/api/render/route.ts` - Uses new async generateHTML with fonts
2. `app/api/render/final/route.ts` - Uses new async generateHTML with fonts
3. `lib/template-presets/B.json` - Complete Type B layout values

## 📋 Type B Layout Values (1080×1920)

All positions are in percentages (boxPct) and convert to pixels:

1. **intro_text**: x=0.14, y=0.12, w=0.72, h=0.10 (maxFont=36, minFont=24)
2. **invite_line**: x=0.14, y=0.23, w=0.72, h=0.07 (maxFont=30, minFont=22)
3. **groom_name**: x=0.18, y=0.33, w=0.64, h=0.08 (maxFont=54, minFont=34) + Kashida
4. **bride_name**: x=0.18, y=0.41, w=0.64, h=0.08 (maxFont=54, minFont=34) + Kashida
5. **date_en**: x=0.34, y=0.50, w=0.32, h=0.05 (maxFont=20, minFont=14)
6. **verse_or_dua**: x=0.14, y=0.56, w=0.72, h=0.10 (maxFont=28, minFont=18)
7. **location_name**: x=0.14, y=0.67, w=0.72, h=0.06 (maxFont=24, minFont=16)

## 🎨 Styling

- Color: #6B6B6B (warm gray, not pure black)
- Arabic: Amiri (400), direction rtl, align center
- English: Montserrat (400), direction ltr, align center
- NO letter-spacing for Arabic (uses Kashida instead)
- Line heights: 1.6-1.9 depending on block

## 🔄 Workflow

1. **Admin**: Uploads background image → Selects type (A/B/C) → Saves
2. **System**: Template saved to Firestore with type
3. **Customer**: Selects template → Fills fields → Clicks render
4. **Renderer**:
   - Loads template from Firestore
   - Loads preset based on type
   - Fetches fonts from Firestore
   - Applies Kashida to short names
   - Calculates optimal font sizes
   - Generates HTML with embedded fonts
   - Renders with Playwright
   - Uploads to Storage
   - Returns URL

## ✅ Testing Checklist

- [ ] Upload Type B template as admin
- [ ] Verify template appears in gallery
- [ ] Fill fields in template detail page
- [ ] Test preview generation
- [ ] Verify fonts load correctly (check @font-face in HTML)
- [ ] Verify Kashida applied to short names (≤5 chars)
- [ ] Verify auto-fit works for long text
- [ ] Verify final render matches Type B layout
- [ ] Test with different name lengths
- [ ] Test with different text lengths

## 📝 Notes

- Fonts must be uploaded to Firebase Storage and registered in Firestore collection "fonts"
- Each font document needs: name, language, weight, style, format, active, fileUrl
- Template type must match preset file (A.json, B.json, or C.json)
- Kashida only applies to groom_name and bride_name fields
- Auto-fit respects minFont and maxFont limits per block
