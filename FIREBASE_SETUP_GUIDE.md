# A Strik Out Co — Firebase backend setup guide

This adds, on top of your static site:

1. **A database (Firestore)** for every request submitted through either form.
2. **An admin dashboard** (`admin.html`) — list, filter, update status, and
   **export everything to CSV** (opens fine in Excel/Google Sheets).
3. **AI project delivery** — mark a *student* project done and it drafts a
   software list, a comparison table, and an install guide with Claude, then
   emails the whole package (plus a video link you paste in) automatically.
4. **A chat widget** on every page — answers pricing/process questions, and
   can look up a visitor's own request status by email.
5. **Automatic emails** on submission — a confirmation to the visitor, a
   notification to you.

Runs on **Firebase** (Firestore + Auth + Cloud Functions) and **Resend**
(email). Note up front: Cloud Functions require adding a billing card to
your Firebase project (the "Blaze" plan) even though actual usage stays
within the free tier at this scale — Google requires it because functions
can make outbound internet calls (to Anthropic and Resend, in this case).

---

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it (e.g. "ASO"), you can skip Google Analytics, click **Create**.
3. Once created, click the **web icon (`</>`)** on the project overview page
   to register a web app. Give it any nickname, skip Firebase Hosting (you
   already have a host), click **Register app**.
4. You'll see a `firebaseConfig` object — copy the values into
   `assets/firebase-config.js`:
   ```js
   window.ASO_FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```
   These values are fine to expose publicly — Firebase security comes from
   the Firestore rules (step 2) and Auth, not from hiding this config.

## 2. Turn on Firestore and apply the security rules

1. In the left sidebar: **Build → Firestore Database → Create database**.
   Choose a region close to you, start in **production mode**.
2. Go to the **Rules** tab, delete what's there, paste in the contents of
   `firestore.rules` from this project, and click **Publish**.
   - This locks it down so visitors can only *submit* a request — they can
     never read anyone's data. Only a signed-in admin (step 3) can read,
     update, or delete.

## 3. Create your admin login

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Go to the **Users** tab → **Add user** → enter the email and password
   you want to sign into `admin.html` with → **Add user**.
   - There's no public sign-up page — only accounts you create here can log in.

## 4. Set up Resend (for real email sending)

1. Go to [resend.com](https://resend.com) → sign up (free: 3,000 emails/month).
2. **API Keys → Create API key** — copy it, save it somewhere private.
3. **Domains → Add domain** and verify it if you own one, so you can send
   from `hello@yourdomain.com`. Otherwise Resend's shared test domain works
   for trying things out.

## 5. Get an Anthropic API key

Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys**
→ **Create Key**. Copy it and save it somewhere private. This is billed
separately from Claude.ai — pay-as-you-go, and very cheap at this scale (a
chat reply or a delivered package costs a fraction of a cent to a few cents).

## 6. Deploy the Cloud Functions

You'll need the [Firebase CLI](https://firebase.google.com/docs/cli) and Node.js.

In a terminal, inside your project folder (the one containing `functions/`):

```bash
npm install -g firebase-tools      # one-time install (or use npx firebase ... instead)
firebase login
firebase use --add                  # pick your project, give it an alias like "default"
```

**Enable the Blaze plan**: in the Firebase console, click "Upgrade" in the
bottom-left, and add a billing account. This is required to deploy Cloud
Functions — you're not charged unless you exceed the generous free tier.

Install the function's dependencies and set your secrets:

```bash
cd functions
npm install
cd ..

firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_FROM
firebase functions:secrets:set ADMIN_EMAIL
```

Each command will prompt you to paste the value — paste it into the
terminal when asked (for `RESEND_FROM`, paste something like
`A Strik Out Co <hello@yourdomain.com>`; for `ADMIN_EMAIL`, paste
`astrikout@gmail.com`).

Deploy everything:

```bash
firebase deploy --only functions
```

When it finishes, it prints a URL for each function, like:
```
✔  functions[chat(us-central1)]: https://us-central1-your-project.cloudfunctions.net/chat
```
Copy the common prefix (everything before `/chat`) into
`assets/firebase-config.js`:
```js
window.ASO_FUNCTIONS_BASE = "https://us-central1-your-project.cloudfunctions.net";
```

## 7. Test it

1. Submit the request form on `college-projects.html` — check
   **Firestore Database → Data** for a new document in `requests`, and
   check your inbox (and `ADMIN_EMAIL`) for the confirmation emails.
2. Open `admin.html`, sign in with your step-3 account. The request should
   appear, and the stat cards should update.
3. Click the request, change its status, then try **⬇ Export CSV** — a
   `.csv` file downloads that opens directly in Excel or Google Sheets.
4. On a *student* request, use **Deliver this project**: paste a video URL
   and click **Generate & send package**. Within ~20–40 seconds the student
   should get an email with the AI-generated guide.
5. Click the chat bubble on any page, ask a pricing question, then ask
   "what's the status of my request?" including the email you used above.

## 8. Deploy the site itself

Upload everything except the `functions/` folder (that's only for the
Firebase CLI, not your web host) to wherever you host the site — Netlify,
Vercel, GitHub Pages, cPanel, etc. Don't link `admin.html` from your
navigation; reach it by typing the URL directly.

---

## Notes

- **Confirmation emails are best-effort**, same as before — they fire right
  after the Firestore write succeeds. The request itself is always saved
  even if the browser closes before the email call finishes.
- **The AI-drafted guide/table are a strong first draft**, not guaranteed
  perfect — skim them before a student needs to demo, especially for
  uncommon tool combinations.
- **CSV export** respects whatever filter tab is active (e.g. "Student
  projects" exports just those) — use the "All" tab to export everything.
- **Costs at this scale:** Firestore, Auth and Cloud Functions all stay
  comfortably within Firebase's free tier for a few hundred requests a
  month (the Blaze plan just means *billing is enabled*, not that you'll be
  billed). Resend's free tier covers the email volume too. The only real
  pay-as-you-go cost is Anthropic API usage, which is small at this volume.
