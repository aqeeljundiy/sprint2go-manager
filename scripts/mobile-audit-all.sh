#!/bin/sh
# Crawls every app, three at a time.
export MSYS_NO_PATHCONV=1
printf '%s\n' /home /mail /chat /tasks /projects /teams /tables /calendar /notes /drive /meet /vault /settings | xargs -P 3 -I{} node scripts/mobile-audit.mjs {} audit/mobile 45
