# How I used AI

A running log of how I worked with AI tools on this project: what I asked, what I kept, what I changed, and what it got wrong.

## Day 1
- Talked through the problem with Claude before writing any code. Started from my own idea (shelters transmit information through some signal, since individuals have no phones). Claude pushed back that revealing a match's location could help an abuser find someone, which led to the consent-first design.
- Used Claude to scaffold the React frontend and Express backend and get a "hello world" deployed end to end.

## Day 1 (continued): intake form and offline sending
- Decided the form fields myself. I pushed back on Claude's suggested three-option "Can family find them?" question, since the volunteer asks in person when a match comes in anyway. We replaced it with a single "Keep hidden" checkbox: a hidden person's own details never leave the shelter, but they can still search for others.
- Claude built the form, the on-device storage and the outbox. Every record is saved on the device first and sent automatically every 30 seconds or when the connection returns.
- Testing caught a bug: a blank age was being saved as 0 on the server. Fixed so unknown stays unknown.
