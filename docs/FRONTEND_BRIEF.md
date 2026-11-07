# Brief for whoever builds the frontend (and their Claude)

Context: we're a 4-person team at the thinc! Munich hackathon (Taktile claims triage case). This repo contains our finished Python backend. The website is built separately in Lovable.

## The architecture we've decided on

* The Python backend in this repo makes **all** decisions. A deterministic rules engine applies the written policy (`policies/v1.json`, later `v2.json`). No LLM is in the decision path, and that is deliberate.
* The backend is deployed on Render (free tier) and gets a public URL. Lovable calls it over REST.
* The Lovable site is **only a frontend**. It has no decision logic and no database of its own. It displays what the API returns and sends user actions to it. Do not add Supabase or a second copy of the rules.
* The design is the frontend builder's call. Don't copy the test site in `canoe/static`; that is only a rough demo UI.

## API base URL

`https://canoe-rc49.onrender.com` (no trailing slash; all endpoints start with `/api`). Check it at `/api/health`. No token is needed. It is a free Render instance, so it sleeps when idle and the first call can take 30 to 60 seconds. Keep this URL in one config constant so it is easy to change.

## Read first

1. `docs/API.md`: every endpoint, request fields and response shape.
2. `canoe/api.py` and `canoe/store.py` if you need exact details.
3. `README.md` for what the system does.

## Rules the frontend must follow (they affect judging)

1. Never compute or change a recommendation in the frontend. Only display it.
2. Send "not known" answers as an empty string `""`, never `"False"`. A blank means the fact is absent and leads to request_information. `"False"` could wrongly lead to routine_processing.
3. Closed claims are read-only (the API returns `editable: false`).
4. A reviewer override must send the reason and the reviewer's name. The backend stores them with the policy version.
5. Show the policy version and rule id next to every recommendation.
6. Never present a blank or guessed value as a confirmed fact. Show blanks as "absent".

## Views needed

A claim form (plus a batch CSV upload), a reviewer dashboard, a policy owner page, and a business view (claim history, policy impact, error rates). Claimants should see friendly messages, not rule ids. Full rule details belong on the reviewer and business views.

## Running the backend

* Locally: `python -m canoe.api` (opens on http://localhost:8000, nothing to install).
* Deployed: the Render URL replaces localhost. Keep the API base URL in one config constant or environment variable so it is easy to switch.
* Free Render servers fall asleep when idle; the first request can take 30 to 60 seconds. Open `/api/health` a few minutes before a demo.
* If `CANOE_API_TOKEN` is set on the server, every call needs the header `Authorization: Bearer <token>`.

## Saturday: policy v2

When v2 is announced, publish it on the Policy changes page (or edit `policies/v2.json`) and **commit `policies/v2.json` to the repo**. The judges run the batch script from the repo, so that file must be in GitHub.
