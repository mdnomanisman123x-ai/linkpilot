# LINKPILOT (MVP v0.1)

Image Compressor, Video Compressor, Website Link Checker, Performance Check এবং Usage Dashboard।

> **গুরুত্বপূর্ণ:** এই কোড এখনো `npm install` / `npm run build` দিয়ে চালিয়ে পরীক্ষা করা হয়নি
> (যে পরিবেশে লেখা হয়েছে সেখানে ইন্টারনেট ছিল না)। প্রথম কাজ: নিচের "Local testing" করে build ঠিক আছে কি না দেখা।

## File structure

```
linkpilot/
├─ app/
│  ├─ layout.tsx            সাইটের কাঠামো, ফন্ট, থিম
│  ├─ globals.css           স্টাইল
│  ├─ page.tsx              হোমপেজ
│  ├─ image/page.tsx        Image Compressor (ব্রাউজারেই কাজ করে)
│  ├─ video/page.tsx        Video Compressor (FFmpeg.wasm, single-thread)
│  ├─ link-checker/page.tsx Link Checker UI
│  ├─ performance/page.tsx  Performance Check UI
│  ├─ dashboard/page.tsx    Usage ও Plans
│  └─ api/
│     ├─ link-check/route.ts  লিংক চেক (SSRF সুরক্ষাসহ)
│     └─ analyze/route.ts     পেজ সাইজ বিশ্লেষণ
├─ components/ (Nav, ThemeToggle, Dropzone)
├─ lib/ (ssrf, rateLimit, usage, format)
├─ package.json, tsconfig.json, next.config.mjs
├─ tailwind.config.ts, postcss.config.js, .gitignore
```

## Environment setup

1. Node.js 18.18+ (ভালো হয় 20 LTS) ইনস্টল করুন: https://nodejs.org
2. কোনো `.env` ফাইল লাগবে না — এই MVP-তে কোনো API key বা database নেই।

## Local testing

```bash
npm install
npm run typecheck     # TypeScript error আছে কি না
npm run build         # build ঠিক আছে কি না
npm run dev           # http://localhost:3000
```

Android ফোনে সরাসরি Node চালানো কঠিন। সহজ উপায়: GitHub-এ কোড তুলে **GitHub Codespaces** (browser-এ VS Code) থেকে
উপরের কমান্ড চালান, অথবা সরাসরি Vercel-এ deploy করে Vercel-এর build log দেখুন।

### Manual test checklist (ফোনে Chrome-এ)

- [ ] হোমপেজ খোলে, Dark/Light বাটন কাজ করে, মেনু স্ক্রল হয়
- [ ] Images: ২–৩টি ছবি দিন → Compress → আগে/পরে সাইজ ও % দেখায় → Download ও ZIP কাজ করে
- [ ] Images: একটি `.pdf` বা `.gif` দিন → পরিষ্কার error দেখায়
- [ ] Video: ছোট (১০–২০ MB) MP4 দিন → Progress চলে → Cancel কাজ করে → ফল ডাউনলোড হয়
- [ ] Video: `.avi` দিন → error দেখায়
- [ ] Links: `https://example.com` চেক করুন → ফল ও CSV/JSON ডাউনলোড
- [ ] Links: `http://localhost` বা `http://127.0.0.1` দিন → "not allowed" error আসতে হবে
- [ ] Performance: একটি আসল ওয়েবসাইট দিন → সাইজ ও পরামর্শ দেখায়
- [ ] Dashboard: ব্যবহারের পর সংখ্যা বাড়ে

## GitHub upload

1. github.com-এ নতুন repository (`linkpilot`) বানান।
2. Codespaces বা কম্পিউটার থাকলে:
   ```bash
   git init
   git add .
   git commit -m "LINKPILOT MVP"
   git branch -M main
   git remote add origin https://github.com/YOUR_NAME/linkpilot.git
   git push -u origin main
   ```
3. শুধু ফোন থাকলে: GitHub ওয়েবসাইটে Chrome-এর "Desktop site" চালু করে **Add file → Upload files**।
   ZIP আনজিপ করে ভেতরের সব ফাইল ও ফোল্ডার (`app`, `components`, `lib`, `public` সহ) আপলোড করুন। `.gitignore` ও
   `.env` কখনো আপলোড করবেন না (`.gitignore` আপলোড করা ঠিক আছে)।

## Vercel deployment

1. https://vercel.com এ GitHub দিয়ে লগইন → **Add New → Project** → `linkpilot` repo নির্বাচন।
2. Framework: Next.js (নিজে থেকেই ধরবে)। কোনো environment variable লাগবে না → **Deploy**।
3. Link Checker ও Performance API ৬০ সেকেন্ড পর্যন্ত চলতে দেওয়া আছে। Vercel-এর Hobby plan-এ এই সীমা প্রযোজ্য না হলে
   `maxDuration` কমিয়ে নিন (দুটি `route.ts` ফাইলে)।

## নিরাপত্তা — যা করা হয়েছে

- ছবি ও ভিডিও কখনো সার্ভারে যায় না; সব কাজ ব্রাউজারে।
- ছবি: ফাইল টাইপ ও সাইজ (২৫ MB) যাচাই, তারপর ব্রাউজার ডিকোড করে — ভাঙা/ভুয়া ফাইল বাতিল হয়।
- ভিডিও: ফরম্যাট যাচাই; সীমা ফোনে ১০০ MB, ডেস্কটপে ৩০০ MB।
- Link Checker / Performance: SSRF সুরক্ষা — শুধু http/https, শুধু পোর্ট 80/443, localhost ও private/reserved IP ব্লক,
  প্রতিটি redirect আবার যাচাই, response সাইজ সীমা, timeout, per-IP rate limit।

## Known limitations (সৎ তালিকা)

- **Sign up / Login তৈরি হয়নি।** এর জন্য Supabase লাগবে। Dashboard-এর usage সীমা শুধু ওই ব্রাউজারে সংরক্ষিত (সহজেই এড়ানো যায়)।
- **Starter/Pro plan কেনা যায় না** — payment gateway নেই, তাই বাটন বন্ধ রাখা হয়েছে (ভুয়া সফল payment দেখানো হয় না)।
- **Video:** প্রথমবার ~৩০ MB ffmpeg ইঞ্জিন ইন্টারনেট (unpkg CDN) থেকে নামে। ফোনে ধীর। FFmpeg.wasm Next.js-এ কিছু
  ডিভাইস/ব্রাউজারে সমস্যা করতে পারে — এটি আসল ফোনে অবশ্যই পরীক্ষা করুন।
- **AVIF আউটপুট** সব ব্রাউজারে হয় না; না হলে পরিষ্কার error আসে (AVIF ইনপুট ঠিক আছে যদি ব্রাউজার পড়তে পারে)।
- **Link Checker:** একবারে সর্বোচ্চ ৬০টি লিংক; শুধু একটি পেজের লিংক (পুরো সাইট crawl নয়); JavaScript দিয়ে তৈরি লিংক দেখা যায় না।
- **Performance:** এটি আকার-ভিত্তিক অডিট; Lighthouse-এর মতো আসল স্পিড টেস্ট নয়। CSS/JS দিয়ে লোড হওয়া ছবি গোনা হয় না।
- Rate limit সার্ভারলেস ইনস্ট্যান্সের মেমোরিতে থাকে — মোটামুটি সুরক্ষা, পূর্ণ নয়।
- DNS-rebinding-এর মতো উন্নত SSRF আক্রমণ থেকে পূর্ণ সুরক্ষা নেই (হোস্ট যাচাইয়ের পর fetch হয়)। বাণিজ্যিকভাবে চালানোর আগে আরও কঠোর করুন।

## পরবর্তী পরিকল্পনা

1. Supabase দিয়ে Sign up / Login ও সার্ভার-ভিত্তিক usage limit।
2. Stripe বা স্থানীয় gateway (bKash/SSLCommerz) যুক্ত করে আসল Starter/Pro plan।
3. পুরো সাইট crawl ও নির্ধারিত সময়ে লিংক চেক + ইমেইল রিপোর্ট।
4. Lighthouse/PageSpeed API দিয়ে আসল পারফরম্যান্স স্কোর।
5. ভিডিওর জন্য multi-thread FFmpeg (প্রয়োজনীয় header সহ) ও WebCodecs।
