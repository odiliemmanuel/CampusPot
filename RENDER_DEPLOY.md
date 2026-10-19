# Render API deployment

The Render Blueprint in `render.yaml` sets `autoDeployTrigger: commit`, so the
`campuspot-api` service deploys whenever a new commit reaches its linked branch.
The service must be connected to this repository with `main` selected as its
deploy branch.

If a push does not start a deployment, check **Settings → Build & Deploy →
Branch** in Render and confirm it is set to `main` with auto-deploy enabled.
Then use **Manual Deploy → Deploy latest commit** once to bring the service
back in sync with this Blueprint. See [Render's auto-deploy documentation](https://render.com/docs/deploys).
