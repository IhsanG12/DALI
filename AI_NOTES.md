# How I used AI

A running log of how I worked with AI tools on this project.

## Day 1
- Talked through the problem with Claude before writing any code. Started from my own idea (shelters transmit information through some signal, since individuals have no phones). Claude explained that revealing a match's location could help an abuser find someone, which led to the consent-first design.
- Used Claude to scaffold the React frontend and Express backend and get a "hello world" deployed end to end.

## Day 1 (continued): intake form and offline sending
- I decided the form fields like name, age etc. I pushed back on Claude's suggested three-option "Can family find them?" question, since the volunteer asks in person when a match comes in anyway. We replaced it with a single "Keep hidden" checkbox: a hidden person's own details never leave the shelter but they can still search for others. 
- Claude built the form, the on-device storage and the outbox. Every record is saved on the device first and sent automatically every 30 seconds or when the connection returns.
- I caught a bug while testing the program. A blank age was being saved as 0 on the server. Fixed so unknown stays unknown.

## Day 2: naming and a browser bug
- Renamed the app to **Tether**. I thought it was a more unique name then "Reunite" which was my first thought and it's meaning( a line that keeps a separated family connected) stood out. 
- I noticed the header kept squashing and restoring in my Chrome. Claude first suspected the layout and fixed a real sideways-overflow problem on very narrow screens, but that wasn't it. Comparing my screenshots, it turned out a Chrome extension was squashing the pinned header (it looked normal in Incognito). We stopped pinning the header so no reviewer's extensions can break it.

## Day 2: matching, consent and the threat model
- Before building matching, I walked through a hard scenario with Claude: a mother hides from an abusive husband, both search for the kids, the kids search for both. I pushed on two holes Claude's first design missed:
  1. **Shelter ids leak location.** Claude had planned to tell the searching side "possible match at Shelter 9." I pointed out a husband could invent a shelter, register a fake "mother", and learn where the kids are from that. Fix: devices can only join with a coordinator-issued join code, shelter ids are random (S-7Q4K), and no id is revealed until the found person agrees.
  2. **Consent alone doesn't protect children.** A child told "your dad is looking for you" will say yes. So a yes never reveals a location; it only lets staff arrange a supervised reunion, and every match involving a child is marked for a staff decision.
- Claude also suggested a bigger "safety flag" system; I chose the simpler rules above for the build and kept the rest for the README.
- Claude wrote the matching score (fuzzy first names, age tolerance, "looking for each other" bonus) and an automated two-shelter browser test. The test caught a wording bug: the relationship ("son") describes the person being searched for, so the script had to say "they say you are their son", not "someone who says they are your son".
- Testing the demo myself, I noticed each shelter showed the same pair twice when two people were looking for each other (one "needs an answer", one "waiting"). Fixed so each shelter only sees the item it has to act on. While fixing it, the automated test showed a mutual parent/child pair being marked "connected" before the child's shelter had decided; now a pair only connects once both directions are yes, and a child's own search never counts as consent.

## Day 4 (final day): feedback from help hours, privacy for immigrants
- Help-hours feedback: focus more on immigrants, and on the idea that even we, the people running the server, shouldn't be able to see their names. I decided this should be a choice ("Protect name"), next to "Keep hidden", rather than forced on everyone.
- Claude proposed the approach: a shared "network phrase" printed on each shelter's card (and inside its QR code) never leaves shelter devices. Devices scramble protected names with it (AES-GCM) and send only "fingerprints" (keyed hashes of the name and how it sounds). The server can tell two fingerprints match but can't read the name. Verified in the database: a protected person's row has no name, neighborhood or readable searches.
- Replaced the two demo shelters with eight preloaded "real" shelters, matching my assumption that Tether was set up before hurricane season.
- Design pass: Claude proposed a calm "field tool" look instead of a dashboard (my call: keep it simple, make the flow smooth). Atkinson Hyperlegible (a font designed for legibility) bundled so it works offline, yellow used only for "needs attention" and green only for "sent/connected", and a small tether mark (two points joined by a line) that also shows up on connected matches. After saving someone, the form jumps back to the top with the cursor in Name, since the next person is usually waiting.
- Added a PIN lock (locks on open, after 5 minutes idle, or with the lock button) and an in-app volunteer guide.
- The header kept squashing in my normal Chrome even after it stopped being pinned. It never happened in Incognito, so it's an extension targeting generic page headers. We switched the top bar from a <header> with generic class names (.bar, .status) to a plain container with unique names (tt-top, tt-sync), so a reviewer with the same kind of extension won't see it either.
- Testing the live demo, I suddenly saw far too many matches. Claude checked the live server and found it wasn't a matching bug: every test anyone had run was still stored, and my repeated test people ("Ihsan" and "Can" registered several times) all matched each other. Since every reviewer shares the same demo shelters, the same pile-up would happen to them, so demo records are now erased after an hour.
- I asked for a way to remove people (duplicates, people who leave, anyone who asks to be taken out). Removal works offline like everything else: the person disappears from the device at once, and the removal is sent with the next connection, deleting their card, searches and matches on the server. A device can only remove people from its own shelter.
