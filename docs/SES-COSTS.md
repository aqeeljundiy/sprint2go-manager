# Amazon SES: what Boosted sending costs us

Answer to Aqeel's question (15 Oct 2026). Figures from third-party summaries of AWS pricing; check the official AWS
SES pricing page before setting prices.

## Today

sprint2go sends mail from its own server (direct, DKIM-signed). SES is the optional "Boosted" route
(`ws.mailRoute = 'boosted'`, `mailCredits` counts what's left). Nobody is on it yet.

## What SES charges (2026)

| Plan | Per 1,000 emails | Fixed per month |
|---|---|---|
| À la carte (still available) | $0.10 | none |
| Essentials (new default since 21 Jul 2026) | $0.16 | none |
| Pro | $0.22 | $105 per account per region |
| Enterprise | $0.23 | $500 per account per region |

- Billed per recipient: one email to 3 people is 3.
- Attachments: data out, about $0.12 per GB.
- A dedicated IP: about $24.95 a month each. Not needed at our size (shared SES IPs have good reputation).
- Choose à la carte when opening the account: the cheapest at our volumes, and switching is allowed any time.

## What that means per customer

A busy person sends about 50 emails a working day, so about 1,100 a month.

| Company | Emails a month | SES cost (à la carte) |
|---|---|---|
| 5 people | 5,500 | $0.55 |
| 20 people | 22,000 | $2.20 |
| 100 people | 110,000 | $11.00 |

So SES is cheap for us. The real costs are elsewhere: support time when mail bounces, and keeping the sending reputation
clean (one spammy customer can hurt everyone on shared SES IPs, so sending limits and bounce/complaint handling matter
more than the price).

## Suggestion

- Free plan: no Boosted sending (own server only), so a free account can never damage SES reputation.
- Paid plans: Boosted included up to about 2,000 emails per person per month (costs us about $0.20 per person).
  Above that, top-ups at Rp 15.000 per 10,000 emails (costs us $1.00), or simply a fair-use cap.
- Turn Boosted on per company after its domain passes SPF and DKIM, and pause it automatically when bounces pass 5% or
  complaints pass 0.1% (Amazon's own limits for suspending an account).

Sources: dev.to, cloudburn.io, usecarly.com, costbench.com summaries of AWS SES pricing (October 2026).
