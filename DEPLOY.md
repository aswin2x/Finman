# Putting Finman on your phones

Written for: Aswin, setting this up once for himself and Salini.

Two Android phones, a database that stays free, and a server that both phones
reach from anywhere. About 40 minutes end to end, most of it waiting for the
app build.

You will do four things:

1. Put the code on GitHub
2. Create the database (Neon, free)
3. Deploy the server (Render, free)
4. Build the app and install it on both phones

---

## Before you start

Create free accounts on these, all with the same email:

- github.com
- neon.com
- render.com
- expo.dev

---

## 1. Put the code on GitHub

Render deploys from a repository, so the code has to be there first.

On github.com, create a new **private** repository called `finman`. Do not add
a README or a licence, the repo already has them.

Then, from the project folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/finman.git
git branch -M main
git push -u origin main
```

Private matters. The repo carries no passwords, because those live in Render's
settings, but there is no reason to publish your household's ledger code.

---

## 2. Create the database

On neon.com, create a project called `finman`. Region Singapore or Mumbai,
whichever is offered, since you are in India.

Once it exists, open **Connection string** and copy it. It looks like:

```
postgresql://finman_owner:SOMEPASSWORD@ep-cool-name-123.ap-southeast-1.aws.neon.tech/finman?sslmode=require
```

Keep that on your clipboard for the next step. The app rewrites the prefix
itself, so paste it exactly as Neon gives it to you.

Neon's free tier gives half a gigabyte and does not expire. Your ledger will
use a few megabytes even after years, so this stays free indefinitely.

---

## 3. Deploy the server

On render.com, choose **New > Blueprint** and pick your `finman` repository.
Render reads `render.yaml` and sets almost everything up.

It will ask you for three values:

| Setting | What to enter |
| --- | --- |
| `DATABASE_URL` | The Neon connection string from step 2 |
| `USER_ONE_PASSWORD` | A real password for you |
| `USER_TWO_PASSWORD` | A real password for Salini |

Pick proper passwords. The server refuses to start if you leave the example
ones in place, and it refuses a weak signing key, because this is reachable
from the internet and it holds your money.

Deploy. The first build takes about five minutes. When it finishes, Render
shows an address like:

```
https://finman-api.onrender.com
```

Open `https://finman-api.onrender.com/health` in a browser. You should see:

```json
{"status":"ok","environment":"production","currency":"INR"}
```

If you see that, the database is connected, the tables exist and both accounts
have been created.

**One thing to know about the free plan.** The server sleeps after 15 minutes
of no use. The next person to open the app waits 30 to 60 seconds while it
wakes, then everything is instant again. If that becomes annoying, Render's
$7 a month plan removes it entirely and nothing else changes.

---

## 4. Build the app

Back in the project, point the app at your server. Open `mobile/eas.json` and
replace the address under `EXPO_PUBLIC_API_URL` with the one Render gave you.

Then:

```bash
cd mobile
npx eas login          # your expo.dev account
npx eas build:configure
npx eas build --platform android --profile apk
```

The build runs on Expo's servers and takes 10 to 15 minutes. It ends with a
download link for `finman.apk`.

Commit the address change so the next build uses it too:

```bash
git add mobile/eas.json && git commit -m "Point the app at the deployed API" && git push
```

---

## 5. Install on both phones

Send the APK to both phones however you like, WhatsApp or Google Drive.

On each phone, open the file and tap install. Android will warn about
installing outside the Play Store; allow it for the app you are installing
from. This is normal for an app that is not published to the store.

Then log in:

- You: `aswin` and the password you set in step 3
- Salini: `salini` and her password

Both of you now see the same shared household. Anything either of you marks
as personal stays private to whoever recorded it.

---

## Afterwards

**Changing the app.** Make the change, then `npx eas build --platform android
--profile apk` and reinstall on both phones.

**Changing the server.** Push to GitHub. Render redeploys on its own. Your
data is untouched; migrations only add what is missing.

**Changing a password.** In the app, under Settings. That signs out every
other session, which is what you want if you are changing it for a reason.

**Backups.** Neon keeps its own, and you can export everything from the app
at any time under Settings, as CSV or Excel. Worth doing occasionally.

**Watching costs.** Neon and Render both stay free at this usage. Neither can
silently start charging you; both require you to choose a paid plan. The only
reason you would pay is the $7 to stop the server sleeping.

---

## If something goes wrong

**The app says it cannot reach the server.** Open the `/health` address in a
phone browser. If it hangs for a minute then loads, the server was asleep and
is fine now. If it never loads, check Render's dashboard for a failed deploy.

**Render says the deploy failed.** Open the logs. If the last line mentions an
unsafe configuration, one of the three values in step 3 is missing or still an
example. The message names which.

**Login is rejected.** The passwords are the ones you typed into Render, not
the `aswin1234` from development.

If one is lost, set the new value in Render's environment settings, then open
the service's **Shell** tab and run:

```bash
python -m app.seed --reset-passwords
```

A redeploy on its own will not do it. The normal boot deliberately leaves
existing passwords alone, so that a deploy never undoes a password either of
you changed in the app. The command above is the deliberate override, and it
signs out every existing session.

**You want to start the data over.** In Neon, drop the database and create it
again, then redeploy on Render. The tables and both accounts rebuild empty.
