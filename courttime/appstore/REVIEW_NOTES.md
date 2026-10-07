# App Review Notes

What to enter in **App Store Connect → App Review Information**. Run `npm run seed:review` shortly before submitting so the demo club's bookings are in the future.

## Sign-in required

| Field | Value |
|---|---|
| User name | `appreview@courttimeapp.com` |
| Password | `CourtTimeReview1!` |

## Contact information

Fill in your own name, phone number and `reidbissell@courttimeapp.com`.

## Notes

Paste everything in the block below into the **Notes** field (limit 4,000 characters; this is about 2,900).

```
CourtTime is a court-booking app for members of tennis, pickleball and swim/tennis clubs. Each club runs its own courts and members; a person uses the app as a member of their club.

DEMO ACCOUNT
The account above is a member of "CourtTime Demo Club", a fictional club created for review. It has courts, upcoming bookings, other (fictional) members, a message conversation, bulletin posts and hitting-partner posts. No real member data is visible. A brand-new account has no club until a club admin approves it, which is why a demo account is provided.

WHAT TO TRY
- Book tab: tap an empty slot on the court calendar and confirm to make a booking. Cancel it from Home or More > My Reservations.
- Messages tab: open the conversation with Jordan Ellis and send a message.
- More > Community: hitting-partner posts and the club bulletin board, including signing up for the Saturday clinic.

PAYMENTS (Guideline 3.1.3(e))
Nothing digital is sold in the app and there is no in-app purchase. Where a club charges for something, it is a real-world good or service consumed outside the app: court time, guest fees, clinics and lessons, ball-machine rental, pro-shop items and club dues. Those are paid by card through Stripe Checkout, and the money goes to the club. The demo club's courts are free, so no payment screen appears during a booking there.
If a club locks a member's account for unpaid dues, the app shows a "Pay Now to Restore Access" screen. That is the member settling a debt to their club for club membership, not a purchase that unlocks app features.
CourtTime's own subscription for clubs is sold to club organisations on our website. It cannot be purchased, renewed or managed in the iOS app.

USER-GENERATED CONTENT (Guideline 1.2)
Members can message each other and post to their club's boards.
- Report: tap the flag icon on any other member's message or post, or in the header of a conversation. Reports are reviewed within 24 hours and offending content is removed.
- Block: the same flag icon offers "Block". Blocked members' messages and posts are hidden and neither person can message the other. Manage the list at Profile > Blocked members.
- Filter: messages, posts and group names containing slurs or strong profanity are rejected when submitted.
- Terms: creating an account requires agreeing to the Terms of Service, which prohibit harassment and objectionable content.
- Contact: Profile > Help & Support, or reidbissell@courttimeapp.com.

ACCOUNT DELETION (Guideline 5.1.1(v))
Profile tab > scroll to the bottom > Delete Account. It asks for confirmation twice and then deletes the account immediately. Deleting the demo account is fine; tell us and we will recreate it.

PRIVACY
Privacy Policy and Terms of Service are linked on the sign-in screen, the sign-up screen and under Profile > Legal & Support. The app does not track users and contains no advertising or analytics SDKs.

PERMISSIONS
Photos: only when a member chooses a profile picture. Calendar and Reminders: only when a member taps "Calendar" on a booking to add it to their calendar. Notifications: optional booking reminders and messages; the app works fully without them.
```

## Before pasting

- Sign in with the demo account in the build you are submitting and walk through "What to try".
- If any club-facing claim above stops being true (for example, a digital item is added, or the subscription becomes purchasable in the app), change this text in the same commit.
