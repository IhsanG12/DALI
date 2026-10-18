# Tether

**Helping families separated by a hurricane evacuation find each other, run by shelter volunteers, built for bad connections and for people who can't afford to be found by the wrong person.**

**Live app:** https://dashing-yeot-662880.netlify.app
**Try it in two minutes:** see [Try a match yourself](#try-a-match-yourself).

<p>
  <img src="docs/screenshots/2-add-person.png" width="210" alt="Registering a person, with privacy choices">
  <img src="docs/screenshots/4-match-request.png" width="210" alt="A match waiting for the found person's answer">
  <img src="docs/screenshots/5-connected.png" width="210" alt="Both sides agreed: only the other shelter's id is revealed">
</p>

---

## Overview

Most people in this scenario have no phone and no ID, so an app they use themselves wouldn't reach them. The people who *can* use an app are the shelter volunteers. Tether is a tool for those volunteers:

1. A volunteer **registers** each person: name (or a description), rough age, home neighborhood, who they're looking for, and where they are in the shelter. It takes about 30 seconds, and only the name is required.
2. Records are **saved on the device first** and sent whenever the shelter's connection comes back.
3. The server **matches** who people are looking for against everyone registered, even with misspellings ("Mohammed" and "Muhammad") and rough ages.
4. When there's a match, the volunteer at the found person's shelter **asks them privately** whether they want to connect. Nothing is shared until they say yes, and even then **no location is ever shared**: each shelter only learns the other's id so staff can arrange a supervised reunion.

Every person also gets a privacy choice: **normal**, **protect name** (our own server can't read it), or **keep hidden** (nobody can search for them, but they can still search for others).

---

## A night at Lincoln High: the walkthrough

It's 2 a.m. at the Lincoln High School gym. Ana is volunteering with a laptop that gets Wi-Fi every so often. A line of worried people is waiting.

**Setting up.** When the shelter opened, Ana scanned the QR code on the shelter's card ([screenshot](docs/screenshots/1-setup.png)). The card holds Lincoln High's join code, which proves it's a real, pre-registered shelter, and the region's network phrase, which never leaves shelter devices (more on that below). She picked a PIN. Tether locks itself after five minutes so a laptop left on a table doesn't show who's here.

**Mohammed.** First in line is Mohammed, 41. His daughter Lina, 9, was at school when the buses left. He has no phone and no ID, and he hesitates to give his name because he's undocumented. Ana asks the privacy question from Tether's guide and he chooses **Protect name**. She types what he tells her, notes he's on *Gym, Row C, Cot 12*, and saves. It takes about thirty seconds, and the cursor jumps back to the name field for the next person.

**Maria.** Next is Maria, 34. She is looking for her son Leo, 7. Quietly, she says she left an abusive husband. Ana ticks **Keep hidden**: nobody can search for Maria, but Maria can still search for Leo.

**No connection.** The Wi-Fi is down. Ana keeps going, and the badge at the top says *3 to send*. At 2:40 the connection comes back for a few minutes, everything sends on its own, and the badge turns to *All sent* ([screenshot](docs/screenshots/3-people-here.png)).

**Across town at St. Mary's Parish Hall,** Ben registered Lina hours ago with her class. She's looking for her dad, and Ben spelled it the way she said it: *Muhammad*. When St. Mary's next connects, its **Matches** tab shows two requests ([screenshot](docs/screenshots/4-match-request.png)):

- *"Mohammed Haddad (name protected) is looking for Lina Haddad, who they say is their daughter."* Our server matched them without ever reading Mohammed's name. Only Ben's device can unscramble it.
- *"Someone who asked to stay hidden is looking for Leo Garcia, who they say is their son."* That's Maria. Nothing about her is shown, because nothing about her ever left Lincoln High.

Both kids are under 18, so Tether tells Ben a **staff member** makes the decision, not the child alone. Ben reads the script on the card to Lina privately, his supervisor agrees, and he taps **Yes, connect**.

**Connected.** Now, and only now, each shelter sees the other's id ([screenshot](docs/screenshots/5-connected.png)). Not a location, not the shelter's name. Ben hands the id to his coordinator, who calls Lincoln High's coordinator and sets up a supervised reunion at a neutral place.

**What Carlos sees.** Suppose Maria's husband Carlos shows up at another shelter looking for Maria and Leo. His search for Maria finds nothing, because she's hidden. His search for Leo reaches St. Mary's, and if staff say no, Carlos still just sees *"waiting"*. He can't even tell that Leo is registered.

---

## Who it's for

| Who | What they need | How Tether serves them |
|---|---|---|
| **Shelter volunteers** (the actual users) | Not technical, exhausted, constantly interrupted. Something that works the first time, offline, at 2 a.m. | One short form, only the name required, saves instantly with no connection, a script for every match, and a built-in [guide](docs/screenshots/6-guide.png). |
| **Evacuees** (served through volunteers) | To find family without a phone or ID, and without putting themselves at risk. | Someone else does the typing. They choose what's shared, and nothing is shared without their yes. |
| **Shelter coordinators / staff** | To make the final call on reunions, especially for children. | Matches involving children are marked as staff decisions. Connected matches give them the other shelter's id, which is all they need to coordinate. |

---

## Immigrants and people afraid of being identified

This was the hardest group to design for, and the one I focused on most after feedback during DALI help hours. An undocumented person may not want *anyone*, including the people running Tether, to have their name in a database.

So **Protect name** means the name is scrambled **on the shelter device, before it's ever sent**. Here's what each party can see:

| | Shelter volunteer (their shelter) | Tether's server and database (us) | Volunteer at a matched shelter |
|---|---|---|---|
| **Normal** | Everything | Name, age, neighborhood, who they're looking for | Name and claim, after a match |
| **Protect name** | Everything | **Age, plus relationship words** like "daughter". Name, neighborhood and the names they're searching for are unreadable | Name and claim, after a match |
| **Keep hidden** | Everything | **Nothing about them.** Only scrambled fingerprints of who *they* are looking for (plus relationship and rough age) | Only "someone who asked to stay hidden" |

Where someone is sleeping in the shelter never leaves the device, for anyone.

**How the server matches names it can't read.** Every shelter device in the region shares a secret *network phrase*, printed on the shelter cards and inside their QR codes. The phrase **never goes to the server**: the device turns it into two keys locally.
- One key **scrambles** protected details (AES-GCM encryption), so only another shelter device can read them.
- The other makes **fingerprints**: short keyed hashes of the first name, last name, how each one sounds (Soundex, so *Mohammed* and *Muhammad* match), and the first three letters. The server can see that two fingerprints are the same, but it can't turn a fingerprint back into a name, and without the key it can't even test guesses.

I checked the actual database after a test run: Mohammed's row has no name, no neighborhood and no readable searches. It holds only scrambled text and fingerprints.

**What this doesn't protect** (I'd rather say it than have a reviewer find it):
- If Lina's volunteer types "Muhammad Haddad" into *her* search and **her** record isn't protected, that search name is stored readably. Someone else can reveal your name by searching for you. A fix would be to scramble every search, at some cost to matching typos.
- The network phrase is one secret for the whole region. If it leaks, protected names could be read by whoever has the database. In real life it would be rotated each season and printed only on the physical shelter cards.
- Fingerprints only work on names written in the Latin alphabet. Names in Arabic, Chinese and other scripts would need a transliteration step I didn't build.

---

## When the connection drops (or is gone for hours)

My assumption: **every shelter has at least one device (a laptop or a staff phone) that gets a connection now and then.** Individuals mostly have no phone, but shelters aren't completely cut off for days.

What happens with no connection:
- **Everything still works on the device.** The app itself loads offline (it's a Progressive Web App with a service worker), and records save to the browser's own database (IndexedDB).
- **Records wait in an Outbox** and send on their own: every 30 seconds, and immediately when the browser reports the connection is back. The badge always shows what's waiting, so volunteers can trust that things went through.
- **Sending is safe to repeat.** Each record has an id made on the device, so a half-finished send that's retried never creates duplicates.
- **Small batches, oldest first.** On a weak connection, 20 records at a time get through more reliably, and whoever has waited longest goes first.
- **Matches are saved on the device too,** so a volunteer can still see who to talk to after the signal drops again.

What needs a connection: **setting up a device the first time** (to check the join code), **receiving new matches**, and **sending an answer** to a match. If a shelter is completely offline for days, Tether keeps registering people but can't match them until it reconnects. For that case I'd look at carrying records out physically (for example, a signed QR code a driver scans at a supply hub), which I sketched but chose not to build.

---

## The full picture: what I built, and how the rest would work

**What I built (this repo):** the volunteer-facing core, from registration and offline sync to matching, consent, privacy, shelter verification, and the guide. I chose this slice because every other part of the system depends on getting people's records in safely, and on matches never putting anyone in danger. If that core is wrong, nothing else matters.

**How the rest would work:**
- **Before hurricane season (setup).** Emergency management registers every designated shelter, prints each one a card with its join code and QR, and sets the region's network phrase. *I assumed this happened. The app comes preloaded with eight shelters.* Coordinators can add shelters later through an admin endpoint protected by a secret key.
- **People not in shelters** (hotels, relatives' homes). A phone hotline whose operators use the same app as a "virtual shelter," so anyone with any phone can register or search.
- **Institutions** (schools, nursing homes, other agencies moving people). They could upload rosters directly as records from their own "shelter," so a child moved with their school or an elderly parent moved by a different agency shows up without anyone having to register them by hand.
- **Paper records.** Many shelters will start on clipboards. The form mirrors a paper intake sheet, so volunteers can type them in later. Photographing sheets and reading them automatically would be a natural next step.
- **Reunions.** Tether stops at "both sides agreed; here's the other shelter's id." The actual reunion, including checking that someone is who they say they are, happens in person with staff, which is where it belongs when nobody has ID.

---

## Edge cases I designed for

- **No ID, so nobody can prove who they are.** Tether never treats a claim as proof. The found side is told *"someone is looking for you and says you are their daughter,"* reunions happen in person with staff, and children always get a staff decision.
- **An abuser searching for someone who's hiding.** Hidden people aren't in the searchable data at all. A "no" looks exactly like "still waiting" to the searcher, so he can't tell whether the person exists.
- **A fake shelter.** I pointed this out myself while testing the design: someone could invent a shelter, register a fake "mother," and learn where the kids are from the match. So devices can only join with a pre-registered shelter's join code, shelter ids are random (`S-7Q4K`), and no id is revealed until the found person agrees.
- **Children say yes to anyone claiming to be their parent.** A yes never reveals a location; it only lets staff arrange a supervised meeting. And a child's own search is never counted as consent.
- **Two people looking for each other.** Each shelter sees the pair once, and the pair only connects when both directions are yes.
- **Misspelled and shortened names, guessed ages.** Fuzzy matching on readable names (edit distance, "Leo" vs "Leonardo"), sound-alike fingerprints for protected names, and age tolerance that grows with age. It's better to suggest a few too many, because a human always confirms.
- **The same person registered twice.** The form shows "Already registered here?" as you type a name.
- **A device that changes hands or gets lost.** PIN lock with growing delays after wrong guesses. Each device has its own revocable token, and the server only stores hashes of secrets.
- **Volunteers asked "Is my wife here?"** The in-app guide tells them to never confirm or deny, and gives them the words to use.

---

## Technical choices

| | Choice | Why |
|---|---|---|
| Frontend | **React + Vite, as a Progressive Web App** | Works on whatever device a shelter has (laptop or phone) with nothing to install, and still opens offline. React and Node are what DALI uses. |
| On-device storage | **IndexedDB (via Dexie)** | A real database inside the browser, so records survive closing the tab or losing power. |
| Backend | **Node.js + Express** | Small and readable. The whole API is one file, with comments. |
| Database | **PostgreSQL on Neon** | Relational data (cards, searches, matches) with constraints that make retries safe. Neon's free tier doesn't expire, unlike Render's 30-day free database. |
| Crypto | **Web Crypto (PBKDF2, HMAC-SHA-256, AES-GCM)** | Built into every browser, so no extra library to trust. |
| Hosting | **Netlify** (frontend), **Render** (backend) | Free. Render's free server sleeps when idle, so **the first request can take up to a minute**. |

**The biggest tradeoff: privacy vs. findability.** Every protection costs some matches. A hidden mother can't be found by her own kids, only the other way around. A protected name can only be matched by fingerprints, which catch "Mohammed/Muhammad" but miss typos a human would catch. I chose to let each person decide, and made the safe choices easy to pick, because a missed match can be fixed later but a wrong reveal can't be undone.

A second tradeoff: **volunteers, not evacuees, use the app.** That means it reaches people with no phone, but everything runs through a stretched-thin human. That's why the form has only one required field and everything else is designed to take seconds.

---

## What I don't know, and what I'd do next

I've never worked in disaster response, so a lot of this is reasoning, not experience. Things I'd want to learn or build:

- **How reunification really works today.** Organizations like the Red Cross and child-protection agencies already run reunification processes, especially for children. I'd want to talk to them before deciding what Tether should do versus hand off.
- **Real volunteers.** My only user testing was walking people through it during DALI help hours. I'd want to watch real volunteers use it during a drill.
- **Languages.** The interface is English only, and many evacuees won't speak English. Translation, and the non-Latin-name problem above, are the biggest gaps for immigrant families.
- **Legal questions.** Who can consent for a child, and what if a parent has a custody order? Tether flags children for staff, but the rules are a legal question I can't answer.
- **A safety flag.** A hidden person could leave a note like *"don't reunite my children with this person without review,"* which would hold any matching request from that person. I designed it but didn't build it.
- **Encrypting records on the device itself.** The PIN locks the screen, but the saved records aren't encrypted with it yet. Someone with technical skills and the device could still read them.
- **Rotating secrets, and more scale.** Join codes and the network phrase are fixed for the demo. Matching compares new records against everything, which is fine for thousands of people but would need indexing for a region of 400,000.

---

## Try a match yourself

1. Open the app. Under **"Reviewing Tether? Use a demo shelter,"** pick **Lincoln High School Gym**, choose any PIN, and set up.
2. Open the app again in a **private/incognito window** (it acts as a second device) and pick **St. Mary's Parish Hall**.
3. At Lincoln High, add *Mohammed Haddad, 41*, looking for *Lina Haddad, daughter, 9*, and tick **Protect name**.
4. At St. Mary's, add *Lina Haddad, 9*, looking for *Muhammad Haddad, father*.
5. Tap the badge at the top (or **Outbox → Send now**) in each window, then open **Matches** at St. Mary's.

The free server sleeps when idle, so give the first request up to a minute.

<details>
<summary>All preloaded shelters</summary>

Network phrase for the demo region: `harbor lantern cedar sparrow`

| Shelter | Join code |
|---|---|
| Lincoln High School Gym | `LINCOLN-2041` |
| St. Mary's Parish Hall | `STMARY-7713` |
| Bayview Community Center | `BAYVIEW-3390` |
| County Fairgrounds Expo Hall | `FAIRGROUNDS-5126` |
| Westfield Middle School | `WESTFIELD-8854` |
| Harbor Heights Recreation Center | `HARBOR-4407` |
| Grace Baptist Church | `GRACE-6618` |
| Riverside Elementary School | `RIVERSIDE-2275` |

In a real deployment these would be random and only printed on the shelter cards, never published.
</details>

---

## How I used AI

I used Claude throughout, as a collaborator I argued with, not a code generator I trusted. I came in knowing only C, so Claude wrote most of the JavaScript, and I made it explain each piece before we moved on. The design decisions that matter most came from pushing back on its first answers. For example, I caught that revealing shelter ids would let an abuser locate children, and that consent alone doesn't protect a child. The full log of what I asked, what I changed, and what the AI got wrong is in **[AI_NOTES.md](AI_NOTES.md)**.

---

## Running it locally

```bash
# backend
cd server
cp .env.example .env   # paste a Postgres connection string into DATABASE_URL
npm install
npm run dev            # http://localhost:3001

# frontend (second terminal)
cd client
npm install
npm run dev            # http://localhost:5173
```

Optional server settings: `ADMIN_KEY` (lets coordinators create shelters with `POST /api/admin/shelters`) and `PRELOAD_SHELTERS=off`.
